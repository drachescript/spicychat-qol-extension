// Opt-in Chat Index, launched from chat-list tools in its own readable window.
// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const INDEX_KEY = "dsQolChatIndexV1";
  const FAVORITES_KEY = "dsQolFavoriteConversationsV1";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PAGE_SIZE = 48;
  const CHECKPOINT_PAGES = 10;
  let snapshot = null;
  let indexActive = false;
  let indexDirty = false;
  let pendingPages = 0;
  let importRank = 0;
  let importRunAt = 0;
  let lastLoadPromise = null;
  let flushChain = Promise.resolve();
  let chatFavorites = null;
  let availability = null;
  let filter = "all";
  let searchText = "";
  let limit = PAGE_SIZE;
  let viewOpen = false;
  let viewMode = "standalone";
  let host = null;
  let pendingRenderTimer = null;
  let renderDueAt = 0;
  let routeCheckQueued = false;

  const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
  const normalizeId = value => clean(value).toLowerCase();
  const goodId = value => UUID.test(value);
  const asImage = value => {
    const image = clean(value);
    if (/^https:\/\/(?:cdn\.nd-api\.com|cms\.cdn\.nd-api\.com|spicychat\.ai|www\.spicychat\.ai)\//i.test(image)) return image;
    if (/^\/?avatars\//i.test(image)) return `https://cdn.nd-api.com/${image.replace(/^\/+/, "")}`;
    return "";
  };
  const newIndex = () => ({ version: 1, entries: {}, lastFullScanAt: 0, lastRefreshAt: 0, lastScanOutcome: "never", updatedAt: 0 });

  function normalizeIndex(value) {
    if (!value || typeof value !== "object" || value.version !== 1 || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) return newIndex();
    return {
      version: 1,
      entries: value.entries,
      lastFullScanAt: Math.max(0, Number(value.lastFullScanAt) || 0),
      lastRefreshAt: Math.max(0, Number(value.lastRefreshAt) || 0),
      lastScanOutcome: clean(value.lastScanOutcome || "unknown"),
      updatedAt: Math.max(0, Number(value.updatedAt) || 0)
    };
  }

  async function loadIndex() {
    if (snapshot) return snapshot;
    if (lastLoadPromise) return lastLoadPromise;
    lastLoadPromise = DS.storageGet([INDEX_KEY]).then(data => {
      // Import capture and opening the panel may run concurrently. Do not
      // replace an in-memory index that has already begun receiving rows.
      if (!snapshot) snapshot = normalizeIndex(data?.[INDEX_KEY]);
      return snapshot;
    }).finally(() => { lastLoadPromise = null; });
    return lastLoadPromise;
  }

  async function loadFavorites() {
    if (chatFavorites) return chatFavorites;
    const stored = await DS.storageGet([FAVORITES_KEY]);
    const ids = Array.isArray(stored?.[FAVORITES_KEY]) ? stored[FAVORITES_KEY] : [];
    chatFavorites = new Set(ids.map(normalizeId).filter(goodId));
    return chatFavorites;
  }

  async function flushIndex() {
    if (!indexDirty || !snapshot) return flushChain;
    indexDirty = false;
    pendingPages = 0;
    snapshot.updatedAt = Date.now();
    // Serialize writes and take an immutable snapshot before yielding. A later
    // checkpoint must not be overwritten by an older asynchronous write.
    const data = JSON.parse(JSON.stringify(snapshot));
    flushChain = flushChain.catch(() => {}).then(async () => {
      const ok = await DS.storageSet({ [INDEX_KEY]: data });
      if (ok === false) { indexDirty = true; throw new Error("Could not save the chat index"); }
    });
    return flushChain;
  }

  async function notifyUpdate() {
    if (!viewOpen) return;
    scheduleRender(1500);
  }

  // These hooks attach to the existing Load all chats API importer. They NEVER
  // issue duplicate conversation API requests and never mount native chat cards.
  DS.chatIndexImportStart = async function chatIndexImportStart() {
    if (!isEnabled()) return;
    await loadIndex();
    indexActive = true;
    pendingPages = 0;
    importRank = 0;
    importRunAt = Math.max(Date.now(), Number(snapshot.updatedAt || 0) + 1);
    snapshot.lastScanOutcome = "running";
    indexDirty = true;
    notifyUpdate();
  };

  DS.chatIndexCaptureRows = async function chatIndexCaptureRows(rows) {
    if (!indexActive) return;
    if (!isEnabled()) {
      // Preserve buffered pages, then stop any extra indexing if the user
      // disables the feature while an existing Load all import is running.
      await DS.chatIndexImportFinish?.({ complete: false, full: false });
      return;
    }
    await loadIndex();
    const now = Date.now();
    for (const row of Array.isArray(rows) ? rows : []) {
      const character = row?.character && typeof row.character === "object" ? row.character : {};
      const botId = normalizeId(row?.character_id || character.id || "");
      const conversationId = normalizeId(row?.id || "");
      if (!goodId(botId) || !goodId(conversationId)) continue;
      if (DS.isBlockedForOpenedHistory?.(botId, { id: botId, name: clean(character.name) })) continue;
      const prior = snapshot.entries[conversationId] || {};
      const rowRank = importRank++;
      const originalRank = Number(prior.indexRunAt || 0) === importRunAt
        ? Number(prior.indexRank || 0) : rowRank;
      const count = Number(row?.num_messages ?? row?.message_count);
      const image = asImage(character.avatar_url || character.avatar || character.image || "");
      snapshot.entries[conversationId] = {
        botId,
        conversationId,
        name: clean(character.name).slice(0, 180) || prior.name || botId,
        image: image || prior.image || "",
        messageCount: Number.isFinite(count) && count >= 0 ? Math.max(Math.floor(count), Number(prior.messageCount || 0)) : Number(prior.messageCount || 0),
        firstIndexedAt: Number(prior.firstIndexedAt || now),
        lastIndexedAt: now,
        indexRunAt: importRunAt,
        indexRank: originalRank
      };
    }
    indexDirty = true;
    pendingPages++;
    if (pendingPages >= CHECKPOINT_PAGES) await flushIndex();
    notifyUpdate();
  };

  DS.chatIndexImportFinish = async function chatIndexImportFinish({ complete = false, full = false } = {}) {
    if (!indexActive) return;
    indexActive = false;
    if (!snapshot) return;
    snapshot.lastScanOutcome = complete ? "complete" : "incomplete";
    if (complete) {
      if (full) snapshot.lastFullScanAt = Date.now();
      snapshot.lastRefreshAt = Date.now();
    }
    indexDirty = true;
    try { await flushIndex(); }
    catch (error) {
      snapshot.lastScanOutcome = "save-failed";
      console.warn("[SpicyChat QoL] Chat index checkpoint failed", error);
    }
    notifyUpdate();
  };

  async function loadAvailability() {
    try {
      // This large Bot Status dataset is read only when the index is opened or
      // the user requests a refresh, never during ordinary DOM updates.
      const stored = await DS.storageGet([DS.BOT_AVAILABILITY_KEY || "botAvailability"]);
      availability = stored?.[DS.BOT_AVAILABILITY_KEY || "botAvailability"]?.meta || {};
    } catch { availability = {}; }
    return availability;
  }

  function statusFor(entry) {
    const record = availability?.[entry.botId];
    if (record?.status === "unavailable") return "unavailable";
    if (record?.status === "restricted") return "restricted";
    if (record?.status === "available") return "available";
    return "unknown";
  }

  function isRoute() {
    return /^\/(?:[a-z]{2}\/)?chats?\/?$/i.test(String(location.pathname || ""));
  }
  function isEnabled() {
    return DS.state?.settings?.enabled === true
      && DS.state?.settings?.enableChatIndex === true
      && !DS.isQolPausedForTab?.();
  }
  function uiRoot() { return host; }
  const el = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content != null) node.textContent = String(content);
    return node;
  };
  const button = (text, fn, title) => {
    const node = el("button", "ds-qol-ci-button", text);
    node.type = "button";
    if (title) node.title = title;
    node.addEventListener("click", fn);
    return node;
  };

  function toolbarHost() {
    return document.querySelector('[data-testid="ChatsListToolbar"]')
      || document.querySelector('[data-testid="ChatsSortDropdown"]')?.parentElement
      || null;
  }

  function createHost(toolbar) {
    host = el("div", "ds-qol-ci");
    host.id = "ds-qol-chat-index";
    host.dataset.dsQolOwned = "1";
    const launch = button("Chat index", () => setOpen(!viewOpen, "standalone"), "Open the saved Chat Index");
    launch.classList.add("ds-qol-ci-launch");
    launch.setAttribute("aria-controls", "ds-qol-ci-panel");
    host.append(launch);
    toolbar.append(host);
    return host;
  }

  function ensureHost() {
    if (!document.body) return;
    const toolbar = isRoute() && isEnabled() ? toolbarHost() : null;
    if (!toolbar) {
      if (viewOpen) void setOpen(false);
      host?.remove(); host = null;
      return;
    }
    if (!host?.isConnected || host.parentElement !== toolbar) {
      if (viewOpen) void setOpen(false);
      host?.remove(); host = null;
      createHost(toolbar);
    }
  }

  function scheduleHostCheck() {
    if (routeCheckQueued) return;
    routeCheckQueued = true;
    queueMicrotask(() => { routeCheckQueued = false; ensureHost(); });
  }

  async function setOpen(next, mode = viewMode) {
    const previousRoot = uiRoot();
    previousRoot?.querySelector("#ds-qol-ci-panel")?.remove();
    previousRoot?.querySelector(".ds-qol-ci-backdrop")?.remove();
    viewOpen = !!next;
    if (!viewOpen) {
      host?.querySelector(".ds-qol-ci-launch")?.setAttribute("aria-expanded", "false");
      return;
    }
    viewMode = mode;
    const root = uiRoot();
    const target = root;
    if (!target?.isConnected || !isEnabled() || !isRoute()) { viewOpen = false; return; }
    root.querySelector(".ds-qol-ci-launch")?.setAttribute("aria-expanded", "true");
    const backdrop = el("div", "ds-qol-ci-backdrop");
    backdrop.addEventListener("click", () => setOpen(false));
    target.append(backdrop);
    const panel = el("section", "ds-qol-ci-panel");
    panel.id = "ds-qol-ci-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat index");
    const heading = el("div", "ds-qol-ci-heading");
    heading.append(el("strong", "", "Chat index"), button("Close ×", () => setOpen(false), "Close chat index"));
    panel.append(heading, el("p", "ds-qol-ci-hint", "Saved chats · local favorites don't change SpicyChat favorites."));
    const actions = el("div", "ds-qol-ci-actions");
    actions.append(
      button("Refresh index", async () => { await runScan(false); }, "Refresh recent chats or make the first complete index"),
      button("Full rescan", async () => { await runScan(true); }, "Reread available history; old index entries are retained"),
      button("Stop", () => DS.stopLoadAllChats?.(), "Stop the current API import")
    );
    panel.append(actions);
    const status = el("p", "ds-qol-ci-status", "Loading saved index…"); status.id = "ds-qol-ci-status";
    panel.append(status);
    const controls = el("div", "ds-qol-ci-filters");
    const search = el("input"); search.type = "search"; search.placeholder = "Search bot or ID";
    search.value = searchText; search.setAttribute("aria-label", "Search imported chats");
    search.addEventListener("input", () => { searchText = search.value.toLowerCase().trim(); limit = PAGE_SIZE; scheduleRender(); });
    const select = el("select"); select.setAttribute("aria-label", "Filter chats");
    for (const [value, label] of [["all", "All chats"], ["favorite", "Favorite chats"], ["unavailable", "Confirmed unavailable"], ["restricted", "Private / restricted"], ["unknown", "Not checked"], ["available", "Available"]]) {
      const option = el("option", "", label); option.value = value; select.append(option);
    }
    select.value = filter;
    select.addEventListener("change", () => { filter = select.value; limit = PAGE_SIZE; scheduleRender(); });
    controls.append(search, select);
    panel.append(controls);
    const results = el("div", "ds-qol-ci-results"); results.id = "ds-qol-ci-results"; panel.append(results);
    const footer = el("div", "ds-qol-ci-footer");
    footer.append(button("Refresh bot statuses", async () => { await loadAvailability(); scheduleRender(); }, "Reread existing Bot Status results"),
      button("Open Bot Status", () => DS.openOptionsTarget?.("saved", { search: "Bot Status Center" }), "Run a separate, manual unknown-bot check in Settings > Saved > Bot Status"));
    panel.append(footer, el("p", "ds-qol-ci-hint", "Unknown = not checked or inconclusive. Missing conversations are not treated as deleted."));
    target.querySelector("#ds-qol-ci-panel")?.remove();
    target.append(panel);
    await Promise.all([loadIndex(), loadFavorites(), loadAvailability()]);
    if (viewOpen) scheduleRender();
  }

  // The launcher lives beside the native /chats toolbar, independent of Mini Panel.
  DS.toggleChatIndexPanel = async function toggleChatIndexPanel() {
    if (!isRoute() || !isEnabled() || !host?.isConnected) return false;
    await setOpen(!viewOpen, "standalone");
    return true;
  };

  async function runScan(full) {
    if (DS.state?.loadAllChats?.running) return;
    const data = await loadIndex();
    const forceFullRescan = !!full || !data.lastFullScanAt;
    await DS.startLoadAllChats?.(true, { forceFullRescan });
    scheduleRender();
  }

  async function toggleChatFavorite(conversationId) {
    const saved = await loadFavorites();
    if (saved.has(conversationId)) saved.delete(conversationId);
    else saved.add(conversationId);
    const ok = await DS.storageSet({ [FAVORITES_KEY]: [...saved] });
    if (ok === false) {
      // Reload the confirmed saved set before showing a success state.
      chatFavorites = null;
      await loadFavorites();
    }
    scheduleRender();
  }

  async function toggleBotFavorite(entry) {
    const source = DS.state.favoriteBots || { ids: [], meta: {} };
    const ids = Array.isArray(source.ids) ? [...source.ids] : [];
    const meta = source.meta && typeof source.meta === "object" ? { ...source.meta } : {};
    const favorite = ids.includes(entry.botId);
    if (favorite) {
      const index = ids.indexOf(entry.botId);
      if (index >= 0) ids.splice(index, 1);
      delete meta[entry.botId];
    } else {
      ids.push(entry.botId);
      meta[entry.botId] = {
        ...(meta[entry.botId] || {}), id: entry.botId,
        name: entry.name, image: entry.image,
        chatUrl: `https://spicychat.ai/chat/${entry.botId}/${entry.conversationId}`,
        profileUrl: `https://spicychat.ai/chatbot/${entry.botId}`,
        savedAt: Date.now()
      };
    }
    await DS.saveFavoriteBots?.({ ids, meta });
    scheduleRender();
  }

  function render() {
    const rootNode = uiRoot();
    if (!viewOpen || !rootNode?.isConnected || !snapshot || !isEnabled()) return;
    const state = DS.state?.loadAllChats;
    const count = Object.keys(snapshot.entries).length;
    const status = rootNode.querySelector("#ds-qol-ci-status");
    if (status) {
      const scanning = !!state?.running && state.mode === "api";
      const last = snapshot.lastFullScanAt ? new Date(snapshot.lastFullScanAt).toLocaleString() : "not completed";
      status.textContent = `${count.toLocaleString()} indexed chats · full scan: ${last}${scanning ? ` · scanning page ${Number(state.apiPages || 0) + 1}` : ""}${!scanning && snapshot.lastScanOutcome === "incomplete" ? " · last scan incomplete" : ""}${snapshot.lastScanOutcome === "save-failed" ? " · save failed" : ""}`;
    }
    const root = rootNode.querySelector("#ds-qol-ci-results");
    if (!root) return;
    const entries = Object.values(snapshot.entries).filter(entry => {
      if (!goodId(entry?.conversationId) || !goodId(entry?.botId)) return false;
      if (filter === "favorite" && !chatFavorites?.has(entry.conversationId)) return false;
      if (!["all", "favorite"].includes(filter) && statusFor(entry) !== filter) return false;
      if (searchText && !`${entry.name} ${entry.botId} ${entry.conversationId}`.toLowerCase().includes(searchText)) return false;
      return true;
    });
    // Conversation API returns latest first: retain its rank across pages.
    // Old rows remain visible after incomplete/limited scans, but sort last.
    entries.sort((a, b) =>
      Number(b.indexRunAt || 0) - Number(a.indexRunAt || 0) ||
      Number(a.indexRank ?? 9999999) - Number(b.indexRank ?? 9999999) ||
      a.name.localeCompare(b.name)
    );
    root.replaceChildren();
    const line = el("p", "ds-qol-ci-count", `Showing ${Math.min(limit, entries.length).toLocaleString()} of ${entries.length.toLocaleString()} matches`);
    root.append(line);
    for (const entry of entries.slice(0, limit)) {
      const row = el("article", "ds-qol-ci-entry");
      if (entry.image) {
        const img = el("img"); img.src = entry.image; img.alt = ""; img.loading = "lazy"; row.append(img);
      }
      const body = el("div", "ds-qol-ci-body");
      const title = el("a", "ds-qol-ci-title", entry.name || entry.botId);
      title.href = `${location.origin}/chat/${entry.botId}/${entry.conversationId}`;
      title.title = "Open this conversation";
      const stateName = statusFor(entry);
      const details = el("span", "ds-qol-ci-meta", `${Number(entry.messageCount || 0).toLocaleString()} messages · ${stateName === "unavailable" ? "confirmed unavailable" : stateName === "unknown" ? "not checked" : stateName}`);
      const act = el("div", "ds-qol-ci-entry-actions");
      act.append(
        button(chatFavorites?.has(entry.conversationId) ? "★ Chat" : "☆ Chat", () => toggleChatFavorite(entry.conversationId), "Save this exact chat locally in QoL"),
        button(DS.state.favoriteBotIdSet?.has(entry.botId) ? "♥ Bot" : "♡ Bot", () => toggleBotFavorite(entry), "Add or remove bot from local QoL Favorites")
      );
      body.append(title, details, act); row.append(body); root.append(row);
    }
    if (entries.length > limit) {
      const more = button("Show more", () => { limit += PAGE_SIZE; scheduleRender(); });
      more.classList.add("ds-qol-ci-more"); root.append(more);
    }
    if (!entries.length) root.append(el("p", "ds-qol-ci-empty", count ? "No matches for this filter." : "No chats indexed yet. Press Refresh index for an initial full scan."));
  }

  function scheduleRender(delay = 120) {
    const due = Date.now() + delay;
    if (pendingRenderTimer && renderDueAt <= due) return;
    if (pendingRenderTimer) clearTimeout(pendingRenderTimer);
    renderDueAt = due;
    pendingRenderTimer = setTimeout(() => {
      pendingRenderTimer = null;
      renderDueAt = 0;
      render();
    }, delay);
  }

  // Use the existing SPA route cleanup hook to remove the launcher on navigation.
  const previousRouteReset = DS.resetChatListLoaderForRoute;
  DS.resetChatListLoaderForRoute = function resetChatIndexForRoute(...args) {
    const result = previousRouteReset?.apply(this, args);
    if (indexActive) void DS.chatIndexImportFinish?.({ complete: false, full: false });
    if (viewOpen) void setOpen(false);
    scheduleHostCheck();
    return result;
  };

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !viewOpen) return;
      if (changes[FAVORITES_KEY] && !indexActive) {
        chatFavorites = null;
        void loadFavorites().then(() => scheduleRender());
      }
      if (changes[INDEX_KEY] && !indexActive && changes[INDEX_KEY].newValue) {
        snapshot = normalizeIndex(changes[INDEX_KEY].newValue);
        scheduleRender();
      }
    });
  } catch {}

  // Reuse existing page updates, with no chat-card observers or polling.
  const previousUpdateQuickPanel = DS.updateQuickPanel;
  DS.updateQuickPanel = function updateQuickPanelWithChatIndex(...args) {
    const result = previousUpdateQuickPanel?.apply(this, args);

    scheduleHostCheck();
    return result;
  };
  const originalApplyChatListTools = DS.applyChatListTools;
  DS.applyChatListTools = function applyChatIndexToolbar(...args) {
    const result = originalApplyChatListTools?.apply(this, args);
    scheduleHostCheck();
    return result;
  };
  window.addEventListener("popstate", scheduleHostCheck);
  window.addEventListener("hashchange", scheduleHostCheck);
  document.addEventListener("DOMContentLoaded", scheduleHostCheck, { once: true });
  scheduleHostCheck();
})();
}

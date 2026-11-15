// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const KEY = "chatBookmarks";
  const MODAL_ID = "ds-chat-bookmarks-modal";
  const BUTTON_CLASS = "ds-message-bookmark-button";
  const MESSAGE_SELECTOR = "div[id^='message-']";
  const NAV_LIMIT = 80;
  const counters = () => DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
  function tally(name, count = 1) {
    const perf = counters();
    perf[name] = Number(perf[name] || 0) + count;
  }
  let lastManagerCount = -1;
  let lastManagerChat = "";
  let lastOrphanSweepChat = "";
  const traceActive = () => !!(DS.isDiagnosticTraceActive?.("normal") || settings().performanceDiagnostics);
  function traceStar(event, meta = {}) {
    if (DS.isDiagnosticTraceActive?.("normal")) DS.diagEvent?.("message-bookmarks", event, meta);
  }

  let store = {};
  let loaded = false;
  let loading = null;
  // Serialize this tab's bookmark saves. Re-read the shared storage before
  // writing so editing a different chat cannot overwrite a newer chat's marks.
  let saveQueue = Promise.resolve();
  const nav = { chatId: "", entries: [], index: -1, suppress: false };

  function settings() { return DS.state?.settings || {}; }
  function enabled() { return !!settings().enabled && !!settings().enableMessageBookmarks && !!DS.isSingleChatPage?.(); }
  function clean(value) { return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
  function chatId() {
    const m = location.pathname.match(/^\/chat\/[^/]+\/([^/?#]+)/i);
    if (m?.[1]) return String(m[1]).trim();
    // The first /chat/ segment identifies the bot, not the conversation.
    // Never store a fresh draft's bookmarks under that shared bot ID.
    const scope = DS.getCurrentChatScope?.();
    return scope?.persisted === false ? String(scope.key || "") : "";
  }
  function currentChatStore(create = false) {
    const id = chatId();
    if (!id) return null;
    if (create && (!store[id] || typeof store[id] !== "object")) store[id] = { entries: [] };
    const value = store[id];
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.entries)) value.entries = [];
    return value;
  }
  function readStoredBookmarks() {
    // A failed storage read must not be mistaken for an empty bookmark list.
    if (!chrome.storage?.local?.get) return Promise.reject(new Error("Bookmark storage is unavailable"));
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get([KEY], result => {
          const error = chrome.runtime?.lastError;
          if (error) return reject(new Error(error.message || "Bookmark storage read failed"));
          const raw = result?.[KEY];
          resolve(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
        });
      } catch (error) { reject(error); }
    });
  }
  async function ensureLoaded() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      store = await readStoredBookmarks();
      loaded = true;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function save(label = "Updated message bookmarks", before = null, scopeId = chatId()) {
    if (!scopeId) return false;
    const changedChat = JSON.parse(JSON.stringify(store[scopeId] || { entries: [] }));
    const work = async () => {
      let latest;
      try {
        latest = await readStoredBookmarks();
      } catch (error) {
        // Undo only this pending chat edit in memory. Do not replace any
        // bookmarks from another chat while the storage read is unavailable.
        if (before && Object.prototype.hasOwnProperty.call(before, scopeId)) store[scopeId] = before[scopeId];
        else if (before) delete store[scopeId];
        DS.setQuickStatus?.("Couldn't read saved bookmarks. No bookmarks were overwritten.");
        return false;
      }
      const after = { ...latest, [scopeId]: changedChat };
      let saved = false;
      try { saved = await DS.storageSet?.({ [KEY]: after }, { immediate: true }); } catch {}
      if (saved !== true) {
        store = latest;
        DS.setQuickStatus?.("Couldn't save the bookmark. Your existing bookmarks were kept.");
        return false;
      }
      store = after;
      // History is optional. A failed history entry must never undo a saved bookmark.
      if (before) try { await DS.recordLocalChange?.(label, { [KEY]: before }, { [KEY]: after }); } catch {}
      return true;
    };
    const pending = saveQueue.then(work, work);
    saveQueue = pending.catch(() => false);
    return pending;
  }
  async function promoteDraftBookmarks() {
    const scope = DS.getCurrentChatScope?.();
    const draft = String(scope?.draftKey || "");
    const target = String(scope?.conversationId || "");
    // Only hand off a draft that was actually open immediately before this
    // conversation was created. Never copy from an unrelated chat or bot ID.
    if (!scope?.persisted || !draft || !target || nav.chatId !== draft) return;
    const source = store[draft];
    if (!Array.isArray(source?.entries) || !source.entries.length) return;
    const current = store[target] || { entries: [] };
    const ids = new Set((current.entries || []).map(item => item.messageId));
    const added = source.entries.filter(item => item?.messageId && !ids.has(item.messageId));
    if (!added.length) return;
    const before = JSON.parse(JSON.stringify(store));
    store[target] = { ...current, entries: [...(current.entries || []), ...added] };
    // Retain the original draft record as a recovery copy; never delete data.
    await save("Kept new-chat bookmarks after chat creation", before, target);
  }
  function messageRoot(node) { return node?.closest?.(MESSAGE_SELECTOR) || null; }
  function role(root) { return root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']") ? "bot" : "user"; }
  function messageText(root) {
    if (typeof DS.getCachedMessageText === "function") return DS.getCachedMessageText(root);
    const host = root?.querySelector?.("div[class*='overflow-wrap']");
    const spans = host ? [...host.querySelectorAll("span.leading-6")].map(el => clean(el.textContent)).filter(Boolean) : [];
    if (spans.length) return spans.join("\n");
    const clone = root?.cloneNode?.(true);
    clone?.querySelectorAll?.("button,svg,.ds-message-quick-actions,.ds-message-bookmark-button").forEach(el => el.remove());
    return clean(clone?.textContent || "");
  }
  function entryForRoot(root) {
    const id = String(root?.id || "").trim();
    return currentChatStore(false)?.entries?.find(entry => entry?.messageId === id) || null;
  }
  function isBookmarked(root) { return !!entryForRoot(root); }

  function nearestMessageToViewportCenter() {
    const center = innerHeight / 2;
    let best = null;
    let bestDistance = Infinity;
    for (const root of document.querySelectorAll(MESSAGE_SELECTOR)) {
      const rect = root.getBoundingClientRect();
      if (!rect.height || rect.bottom < 0 || rect.top > innerHeight) continue;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - center);
      if (distance < bestDistance) { best = root; bestDistance = distance; }
    }
    return best;
  }
  function resetNavIfNeeded() {
    const id = chatId();
    if (nav.chatId === id) return;
    nav.chatId = id;
    lastManagerCount = -1;
    lastManagerChat = "";
    // A React route swap can leave buttons from a removed message outside
    // their original root in older builds. Remove only those orphans, once
    // per route, never by shifting a still-mounted message's controls.
    if (lastOrphanSweepChat !== id) {
      lastOrphanSweepChat = id;
      document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
        if (button.closest(MESSAGE_SELECTOR)) return;
        button.remove();
        tally("bookmarkStarOrphansRemoved");
      });
    }
    nav.entries = [];
    nav.index = -1;
    updateNavControls();
  }
  function findMessageById(id) { return id ? document.getElementById(id) : null; }
  function pushNavTarget(targetId, reason = "jump") {
    resetNavIfNeeded();
    if (nav.suppress || !targetId) return;
    const current = nearestMessageToViewportCenter()?.id || "";
    if (nav.index < nav.entries.length - 1) nav.entries.splice(nav.index + 1);
    const activeId = nav.index >= 0 ? nav.entries[nav.index]?.messageId : "";
    if (current && current !== activeId && current !== targetId) {
      nav.entries.push({ messageId: current, reason: "reading" });
      nav.index = nav.entries.length - 1;
    } else if (!nav.entries.length && current) {
      nav.entries.push({ messageId: current, reason: "reading" });
      nav.index = 0;
    }
    if (nav.entries.at(-1)?.messageId !== targetId) nav.entries.push({ messageId: targetId, reason });
    if (nav.entries.length > NAV_LIMIT) nav.entries.splice(0, nav.entries.length - NAV_LIMIT);
    nav.index = nav.entries.length - 1;
    updateNavControls();
  }
  function scrollToRoot(root, { record = true, reason = "jump" } = {}) {
    if (!root) return false;
    if (record) pushNavTarget(root.id, reason);
    try { root.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); }
    catch { root.scrollIntoView?.(); }
    root.classList.add("ds-chat-nav-target");
    setTimeout(() => root.classList.remove("ds-chat-nav-target"), 1400);
    return true;
  }
  function navigateHistory(delta) {
    resetNavIfNeeded();
    const next = nav.index + delta;
    if (next < 0 || next >= nav.entries.length) return false;
    const item = nav.entries[next];
    const root = findMessageById(item.messageId);
    if (!root) { DS.setQuickStatus?.("That chat location is not currently loaded."); return false; }
    nav.index = next;
    nav.suppress = true;
    scrollToRoot(root, { record: false, reason: item.reason });
    nav.suppress = false;
    updateNavControls();
    return true;
  }

  function loadedBookmarkRoots() {
    const ids = new Set((currentChatStore(false)?.entries || []).map(entry => String(entry?.messageId || "")).filter(Boolean));
    return [...document.querySelectorAll(MESSAGE_SELECTOR)].filter(root => ids.has(root.id));
  }

  function navigateBookmark(delta) {
    const roots = loadedBookmarkRoots();
    if (!roots.length) {
      DS.setQuickStatus?.("No bookmarked messages are currently loaded.");
      return false;
    }
    const current = nearestMessageToViewportCenter();
    let index = current ? roots.findIndex(root => root === current || root.contains(current)) : -1;
    if (index < 0 && current) {
      const all = [...document.querySelectorAll(MESSAGE_SELECTOR)];
      const currentIndex = all.indexOf(current);
      const bookmarkedIndices = roots.map(root => all.indexOf(root));
      if (delta > 0) index = bookmarkedIndices.findIndex(value => value > currentIndex) - 1;
      else {
        const before = bookmarkedIndices.map((value, i) => ({ value, i })).filter(item => item.value < currentIndex).at(-1);
        index = before ? before.i + 1 : 0;
      }
    }
    const next = Math.max(0, Math.min(roots.length - 1, index + delta));
    if (next === index && roots[index]) return false;
    const target = roots[next] || (delta > 0 ? roots[0] : roots.at(-1));
    if (!target) return false;
    scrollToRoot(target, { reason: "bookmark" });
    updateNavControls();
    return true;
  }

  function updateNavControls() {
    document.querySelectorAll(".ds-chat-nav-back").forEach(btn => { btn.disabled = nav.index <= 0; });
    document.querySelectorAll(".ds-chat-nav-forward").forEach(btn => { btn.disabled = nav.index < 0 || nav.index >= nav.entries.length - 1; });
    const roots = loadedBookmarkRoots();
    document.querySelectorAll(".ds-chat-bookmark-prev, .ds-chat-bookmark-next").forEach(btn => { btn.disabled = roots.length < 1; });
  }
  function ensureNavControls() {
    const searchTools = document.getElementById("ds-qol-current-chat-search-tools");
    if (!searchTools || searchTools.querySelector(".ds-chat-navigation-row")) return;
    const row = document.createElement("div");
    row.className = "ds-qol-row ds-chat-navigation-row";
    const back = document.createElement("button");
    back.type = "button"; back.className = "ds-chat-nav-back"; back.textContent = "← Back"; back.title = "Previous chat location";
    const forward = document.createElement("button");
    forward.type = "button"; forward.className = "ds-chat-nav-forward"; forward.textContent = "Forward →"; forward.title = "Next chat location";
    const previousBookmark = document.createElement("button");
    previousBookmark.type = "button"; previousBookmark.className = "ds-chat-bookmark-prev"; previousBookmark.textContent = "★ Prev"; previousBookmark.title = "Previous loaded bookmark";
    const nextBookmark = document.createElement("button");
    nextBookmark.type = "button"; nextBookmark.className = "ds-chat-bookmark-next"; nextBookmark.textContent = "Next ★"; nextBookmark.title = "Next loaded bookmark";
    back.addEventListener("click", () => navigateHistory(-1));
    forward.addEventListener("click", () => navigateHistory(1));
    previousBookmark.addEventListener("click", () => navigateBookmark(-1));
    nextBookmark.addEventListener("click", () => navigateBookmark(1));
    row.append(back, forward, previousBookmark, nextBookmark);
    searchTools.appendChild(row);
    updateNavControls();
  }

  function makeButton(root) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.title = isBookmarked(root) ? "Remove message bookmark" : "Bookmark message";
    button.setAttribute("aria-label", button.title);
    button.textContent = isBookmarked(root) ? "★" : "☆";
    button.addEventListener("click", async event => {
      event.preventDefault(); event.stopPropagation();
      // React may have replaced the node between click and storage loading.
      const current = document.getElementById(root.id);
      if (!current?.isConnected || current !== root || !button.isConnected ||
          button.closest(MESSAGE_SELECTOR) !== current) return;
      await toggle(current);
    });
    return button;
  }
  function placementTarget(root) {
    if (!root?.isConnected || DS.isMessageEditPending?.(root)) return null;
    // Never attach to a message ancestor or the page as a fallback. While
    // SpicyChat streams a new reply, its native dropdown often mounts AFTER
    // the message root. The old fallback inserted the star outside the bubble.
    const dropdown = root.querySelector("button[aria-label='message-dropdown']");
    if (!dropdown || dropdown.closest(MESSAGE_SELECTOR) !== root) return null;
    // The closest .relative can be the PAGE LAYOUT, not a message toolbar.
    // Never let a bookmark insertion leave its message boundary. V2 commonly
    // has no .relative wrapper inside the native header at all.
    const relative = dropdown.closest(".relative");
    const holder = relative && root.contains(relative) ? relative : dropdown.parentElement;
    const host = holder?.parentElement;
    if (!host || !root.contains(host) || !host.contains(dropdown) ||
        host.closest(MESSAGE_SELECTOR) !== root || !holder || holder.parentElement !== host) return null;
    return { host, before: holder };
  }
  function attachedToTarget(button, root, target) {
    return !!button?.isConnected && button.closest(MESSAGE_SELECTOR) === root &&
      button.parentElement === target.host;
  }
  async function toggle(root) {
    const expectedChat = chatId();
    try { await ensureLoaded(); } catch {
      DS.setQuickStatus?.("Couldn't load saved bookmarks. Try again without reloading this chat.");
      return;
    }
    const id = String(root?.id || "").trim();
    if (!id || !expectedChat || chatId() !== expectedChat || !root?.isConnected) return;
    const before = JSON.parse(JSON.stringify(store));
    const chat = currentChatStore(true);
    const index = chat.entries.findIndex(entry => entry?.messageId === id);
    if (index >= 0) {
      const removed = chat.entries.splice(index, 1)[0];
      if (!await save(`Removed message bookmark${removed?.note ? `: ${removed.note}` : ""}`, before, expectedChat)) return;
      DS.setQuickStatus?.("Message bookmark removed.");
    } else {
      chat.entries.push({
        id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        messageId: id,
        role: role(root),
        preview: messageText(root).slice(0, 220),
        note: "",
        createdAt: Date.now()
      });
      if (!await save("Bookmarked message", before, expectedChat)) return;
      DS.setQuickStatus?.("Message bookmarked.");
    }
    applyButtons();
    refreshBookmarkButtonStates();
    updateManagerButton();
    updateNavControls();
    DS.refreshChatSearch?.();
  }

  function refreshBookmarkButtonStates() {
    document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-bookmark-ready='1']`).forEach(root => {
      const button = root.querySelector(`.${BUTTON_CLASS}`);
      if (!button) { delete root.dataset.dsBookmarkReady; return; }
      const active = isBookmarked(root);
      button.textContent = active ? "★" : "☆";
      button.title = active ? "Remove message bookmark" : "Bookmark message";
      button.setAttribute("aria-label", button.title);
    });
  }

  function applyButtons(priorityRoots = null) {
    if (!enabled() || settings().messageBookmarkButtons === false) {
      document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(el => el.remove());
      document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-bookmark-ready]`).forEach(root => delete root.dataset.dsBookmarkReady);
      return;
    }
    const started = traceActive() ? performance.now() : 0;
    // The explicit dirty roots must be checked even if a previous toolbar
    // was marked ready: React can replace the native dropdown in-place.
    const roots = priorityRoots ? new Set(priorityRoots) :
      new Set(DS.getMessageEnhancerRoots?.({ readyAttribute: "data-ds-bookmark-ready", readyValue: "1", newest: 24, margin: 1400 })
        || document.querySelectorAll(`${MESSAGE_SELECTOR}:not([data-ds-bookmark-ready='1'])`));
    if (!priorityRoots) for (const root of DS.getCurrentMessageLaneRoots?.() || []) roots.add(root);
    let created = 0, repaired = 0, reused = 0, waiting = 0;
    for (const root of roots) {
      if (!root?.isConnected || !root.id?.startsWith("message-")) continue;
      // This is a cheap local check; there are no document-wide lookups or
      // layout measurements during the generation's message lane.
      const existing = [...root.querySelectorAll(`.${BUTTON_CLASS}`)];
      const target = placementTarget(root);
      if (!target) {
        for (const star of existing) { star.remove(); repaired++; }
        if (root.dataset.dsBookmarkReady) delete root.dataset.dsBookmarkReady;
        waiting++;
        continue;
      }
      const correct = existing.find(button => attachedToTarget(button, root, target));
      for (const star of existing) if (star !== correct) { star.remove(); repaired++; }
      if (correct) {
        if (root.dataset.dsBookmarkReady !== "1") root.dataset.dsBookmarkReady = "1";
        reused++;
        continue;
      }
      const button = makeButton(root);
      button.classList.add("ds-message-header-action");
      DS.markQolOwned?.(button, "message-bookmarks");
      target.host.insertBefore(button, target.before);
      root.dataset.dsBookmarkReady = "1";
      created++;
    }
    tally("bookmarkStarChecks", roots.size);
    if (created) tally("bookmarkStarsCreated", created);
    if (reused) tally("bookmarkStarsReused", reused);
    if (repaired) tally("bookmarkStarsRepaired", repaired);
    if (waiting) tally("bookmarkStarsWaitingForNativeToolbar", waiting);
    if (created || repaired) traceStar("star-reconciled", { created, repaired, reused, waiting });
    if (started) {
      const elapsed = performance.now() - started;
      const perf = counters();
      perf.bookmarkStarProcessingMs = Math.round((Number(perf.bookmarkStarProcessingMs || 0) + elapsed) * 10) / 10;
      perf.bookmarkStarSlowestMs = Math.max(Number(perf.bookmarkStarSlowestMs || 0), Math.round(elapsed * 10) / 10);
      if (elapsed > 24) traceStar("slow-star-pass", { durationMs: Math.round(elapsed), examined: roots.size });
    }
  }

  function bookmarkSummary(data = store, currentId = chatId()) {
    const groups = Object.entries(data || {}).filter(([, value]) => Array.isArray(value?.entries) && value.entries.length);
    return {
      total: groups.reduce((sum, [, value]) => sum + value.entries.length, 0),
      chats: groups.length,
      current: groups.find(([id]) => id === currentId)?.[1].entries.length || 0,
      other: groups.filter(([id]) => id !== currentId).length,
      drafts: groups.filter(([id]) => String(id).startsWith("draft:")).length
    };
  }
  function publishBookmarkSummary() {
    const summary = bookmarkSummary();
    const perf = counters();
    perf.bookmarkStoredTotal = summary.total;
    perf.bookmarkStoredChatCount = summary.chats;
    perf.bookmarkCurrentChatCount = chatId() ? summary.current : -1;
    perf.bookmarkOtherChatCount = summary.other;
  }

  function updateManagerButton() {
    publishBookmarkSummary();
    const count = currentChatStore(false)?.entries?.length || 0;
    const id = chatId();
    if (lastManagerChat === id && lastManagerCount === count) return;
    lastManagerChat = id; lastManagerCount = count;
    document.querySelectorAll(".ds-chat-bookmarks-manager-button").forEach(button => {
      button.textContent = `Bookmarks${count ? ` (${count})` : ""}`;
    });
  }
  function ensureManagerButton() {
    const header = document.querySelector('.ds-chat-title-actions-host') ||
      document.querySelector('a[aria-label="chatbot-profile"]')?.parentElement;
    if (header && !header.querySelector('.ds-chat-bookmarks-header-button')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ds-chat-bookmarks-header-button ds-chat-bookmarks-manager-button';
      button.title = 'Open saved message bookmarks';
      button.addEventListener('click', () => void openManager());
      header.append(button);
      lastManagerCount = -1;
    }
    const panel = document.getElementById("ds-qol-panel");
    const anchor = document.getElementById("ds-qol-context-keeper-row") || document.getElementById("ds-qol-current-chat-search-tools");
    if (!panel || !anchor || panel.querySelector(".ds-chat-bookmarks-row")) return;
    const row = document.createElement("div");
    row.className = "ds-qol-row ds-chat-bookmarks-row";
    const button = document.createElement("button");
    button.type = "button"; button.className = "ds-chat-bookmarks-manager-button"; button.addEventListener("click", openManager);
    row.appendChild(button);
    anchor.insertAdjacentElement("afterend", row);
    lastManagerCount = -1;
    updateManagerButton();
  }

  async function updateNote(entry) {
    const value = prompt("Bookmark note (optional):", entry.note || "");
    if (value == null) return;
    const before = JSON.parse(JSON.stringify(store));
    entry.note = clean(value).slice(0, 300);
    if (!await save("Updated message bookmark note", before)) return;
    openManager(true);
  }
  function closeManager() { document.getElementById(MODAL_ID)?.remove(); }
  async function openManager(refresh = false) {
    await ensureLoaded();
    if (refresh) closeManager();
    if (document.getElementById(MODAL_ID)) return;
    const overlay = document.createElement("div"); overlay.id = MODAL_ID; overlay.className = "ds-tool-modal-overlay";
    const dialog = document.createElement("div"); dialog.className = "ds-chat-bookmarks-modal";
    const head = document.createElement("div"); head.className = "ds-tool-modal-head";
    const title = document.createElement("h3"); title.textContent = "Message bookmarks";
    const close = document.createElement("button"); close.type = "button"; close.textContent = "×"; close.addEventListener("click", closeManager);
    head.append(title, close);
    const feedback = document.createElement("p");
    feedback.className = "ds-chat-bookmark-feedback";
    feedback.setAttribute("role", "status");
    feedback.hidden = true;
    const list = document.createElement("div"); list.className = "ds-tool-list";
    const summary = bookmarkSummary();
    const counts = document.createElement("p"); counts.className = "ds-chat-bookmark-feedback";
    counts.textContent = `${summary.total} saved across ${summary.chats} chat${summary.chats === 1 ? "" : "s"} · ${summary.current} in this chat`;
    const otherView = document.createElement("button"); otherView.type = "button";
    otherView.textContent = "Review saved bookmarks in other chats";
    otherView.addEventListener("click", () => void openBookmarkRecovery());
    const entries = [...(currentChatStore(false)?.entries || [])].sort((a,b) => (a.createdAt||0)-(b.createdAt||0));
    if (!entries.length) {
      const p = document.createElement("p"); p.className = "ds-tool-empty";
      p.textContent = "No bookmarked messages in this chat yet. Cloned chats have their own bookmarks; the original chat keeps its bookmarks separately.";
      list.appendChild(p);
    }
    for (const entry of entries) {
      const card = document.createElement("div"); card.className = "ds-tool-list-item ds-chat-bookmark-item";
      const meta = document.createElement("div"); meta.className = "ds-tool-list-main";
      const strong = document.createElement("strong"); strong.textContent = `${entry.role === "bot" ? "Bot" : "You"}${entry.note ? ` — ${entry.note}` : ""}`;
      const preview = document.createElement("p"); preview.textContent = entry.preview || entry.messageId;
      meta.append(strong, preview);
      const actions = document.createElement("div"); actions.className = "ds-tool-actions";
      const jump = document.createElement("button"); jump.type = "button"; jump.textContent = "Jump"; jump.addEventListener("click", () => {
        const root = findMessageById(entry.messageId);
        if (!root?.isConnected) {
          // Jump must work for older bookmarks even with the separate History
          // Navigator setting off. An explicit click opens a temporary,
          // read-only viewer without enabling background indexing.
          if (DS.openChatHistoryBookmark?.(entry) === true) { closeManager(); return; }
          feedback.textContent = 'This message is not currently loaded. The history reader is unavailable; reload the chat and try again.';
          feedback.hidden = false;
          return;
        }
        closeManager(); scrollToRoot(root, { reason: "bookmark" });
      });
      const note = document.createElement("button"); note.type = "button"; note.textContent = entry.note ? "Edit note" : "Add note"; note.addEventListener("click", () => updateNote(entry));
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", async () => {
        const before = JSON.parse(JSON.stringify(store));
        const chat = currentChatStore(true); chat.entries = chat.entries.filter(item => item.id !== entry.id);
        if (!await save("Removed message bookmark", before)) return;
        applyButtons(); refreshBookmarkButtonStates(); updateManagerButton(); openManager(true); DS.refreshChatSearch?.();
      });
      actions.append(jump, note, remove); card.append(meta, actions); list.appendChild(card);
    }
    dialog.append(head, counts, otherView, feedback, list); overlay.appendChild(dialog); document.body.appendChild(overlay);
    overlay.addEventListener("click", e => { if (e.target === overlay) closeManager(); });
  }

  // Read-only review of every locally stored bookmark group. No chat records
  // are deleted, merged, or reassigned; an unknown key isn't proof of data loss.
  async function openBookmarkRecovery() {
    const existing = document.getElementById("ds-chat-bookmarks-recovery");
    if (existing) { existing.remove(); return; }
    let latest;
    try { latest = await readStoredBookmarks(); } catch {
      DS.setQuickStatus?.("Couldn't read bookmark storage. No changes were made.");
      return;
    }
    const id = chatId();
    const groups = Object.entries(latest).filter(([, value]) => Array.isArray(value?.entries) && value.entries.length);
    const overlay = document.createElement("div"); overlay.id = "ds-chat-bookmarks-recovery";
    overlay.className = "ds-tool-modal-overlay";
    const dialog = document.createElement("div"); dialog.className = "ds-chat-bookmarks-modal";
    const head = document.createElement("div"); head.className = "ds-tool-modal-head";
    const title = document.createElement("h3"); title.textContent = "Saved bookmark recovery review";
    const close = document.createElement("button"); close.type = "button";
    close.textContent = "×"; close.addEventListener("click", () => overlay.remove());
    head.append(title, close);
    const info = document.createElement("p");
    info.textContent = `${bookmarkSummary(latest).total} saved bookmarks in ${groups.length} chat groups. This view never moves or deletes anything. An unmatched group may belong to another chat, a clone, or an older draft.`;
    const list = document.createElement("div"); list.className = "ds-tool-list";
    const copyScopeReport = document.createElement("button");
    copyScopeReport.type = "button";
    copyScopeReport.textContent = "Copy bookmark scope report";
    copyScopeReport.title = "Copy counts and shortened chat keys; never copies message text";
    copyScopeReport.addEventListener("click", async () => {
      const lines = [
        "SpicyChat QoL — bookmark scope review (read-only)",
        `Current route: ${/^\/chat\/[^/]+\/[^/]+/.test(location.pathname) ? "saved conversation" : "single chat / draft"}`,
        `Current scope: ${id ? "known" : "unavailable"}`,
        `Groups: ${groups.length} · bookmarks: ${bookmarkSummary(latest).total}`
      ];
      groups.forEach(([key, data], index) => {
        const entries = data.entries || [];
        const mounted = entries.filter(mark => !!mark?.messageId &&
          !!document.getElementById(String(mark.messageId))).length;
        const label = key === id ? "current" : key.startsWith("draft:") ? "draft" :
          key.startsWith("conversation:") ? "legacy conversation-key format" : "other";
        lines.push(`${index + 1}. ${label}; key suffix …${String(key).slice(-8)}; saved ${entries.length}; mounted IDs ${mounted}`);
      });
      lines.push("No bookmark text, full chat keys, or stored entries are included.");
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        DS.setQuickStatus?.("Copied read-only bookmark scope report.");
      } catch {
        DS.setQuickStatus?.("Could not copy bookmark scope report. No data was changed.");
      }
    });
    const sorted = groups.sort(([a], [b]) => (a === id ? -1 : b === id ? 1 : a.localeCompare(b)));
    for (const [index, [key, data]] of sorted.slice(0, 150).entries()) {
      const details = document.createElement("details"); details.className = "ds-tool-list-item";
      const heading = document.createElement("summary");
      const kind = key === id ? "Current chat" : key.startsWith("draft:") ? "Older unsaved chat" : "Other saved chat";
      heading.textContent = `${kind}${key === id ? "" : ` ${index + 1}`} — ${data.entries.length} bookmark${data.entries.length === 1 ? "" : "s"}`;
      details.append(heading);
      const note = document.createElement("p");
      note.textContent = key === id ? "These belong to your open conversation." :
        "Stored under a different conversation key. QoL cannot confirm whether that conversation is still available from this record alone.";
      details.append(note);
      for (const mark of data.entries.slice(0, 100)) {
        const row = document.createElement("p");
        const date = Number(mark.createdAt) ? new Date(Number(mark.createdAt)).toLocaleDateString() : "Unknown date";
        row.textContent = `${date} · ${mark.role === "user" ? "You" : "Bot"} · ${clean(mark.note || mark.preview || "Saved message").slice(0, 180)}`;
        details.append(row);
      }
      if (data.entries.length > 100) {
        const more = document.createElement("p"); more.textContent = `${data.entries.length - 100} additional bookmarks not displayed.`; details.append(more);
      }
      list.append(details);
    }
    if (groups.length > 150) {
      const note = document.createElement("p"); note.textContent = "Only the first 150 groups are displayed; no stored records were modified.";
      list.append(note);
    }
    dialog.append(head, info, copyScopeReport, list);
    overlay.append(dialog); document.body.append(overlay);
    overlay.addEventListener("click", event => { if (event.target === overlay) overlay.remove(); });
  }

  function removeAll() {
    document.getElementById("ds-chat-bookmarks-recovery")?.remove();
    document.querySelectorAll(`.${BUTTON_CLASS}, .ds-chat-bookmarks-row, .ds-chat-bookmarks-header-button, .ds-chat-navigation-row`).forEach(el => el.remove());
    DS.removeChatHistoryNavigator?.();
    lastManagerCount = -1;
    document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-bookmark-ready]`).forEach(root => delete root.dataset.dsBookmarkReady);
    closeManager();
  }

  DS.applyChatBookmarks = async function applyChatBookmarks() {
    if (!enabled()) {
      if (DS.state.chatBookmarksWasActive) removeAll();
      DS.state.chatBookmarksWasActive = false;
      return;
    }
    DS.state.chatBookmarksWasActive = true;
    try { await ensureLoaded(); } catch {
      DS.setQuickStatus?.("Couldn't read saved bookmarks. Existing bookmarks weren't changed.");
      return;
    }
    await promoteDraftBookmarks();
    resetNavIfNeeded(); ensureManagerButton(); ensureNavControls(); applyButtons(); updateManagerButton();
    DS.applyChatHistoryNavigator?.();
  };
  DS.removeChatBookmarks = function removeChatBookmarks() {
    if (!DS.state.chatBookmarksWasActive) return;
    removeAll();
    DS.state.chatBookmarksWasActive = false;
  };
  // The history reader reuses this existing bookmark store; navigation remains
  // per-chat, and saved message text is limited to the same short preview.
  DS.listChatBookmarks = async id => {
    await ensureLoaded();
    return (store[String(id || chatId())]?.entries || []).map(entry => ({ ...entry }));
  };
  DS.toggleHistoryMessageBookmark = async ({ messageId, role: messageRole, preview }) => {
    await ensureLoaded();
    const id = String(messageId || '');
    if (!/^message-[0-9a-f-]{36}$/i.test(id)) throw Error('Invalid message ID');
    const before = JSON.parse(JSON.stringify(store));
    const chat = currentChatStore(true);
    const at = chat.entries.findIndex(entry => entry?.messageId === id);
    if (at >= 0) chat.entries.splice(at, 1);
    else chat.entries.push({ id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      messageId: id, role: messageRole === 'user' ? 'user' : 'bot',
      preview: clean(preview).slice(0, 220), note: '', createdAt: Date.now() });
    if (!await save('Updated message bookmark', before)) throw new Error('Could not save the bookmark');
    refreshBookmarkButtonStates(); updateManagerButton(); updateNavControls();
    DS.refreshChatSearch?.();
    return at < 0;
  };
  // Called only for the native toolbar roots mounted this animation frame.
  // Never runs an extra observer or delays controls behind cosmetic chat work.
  DS.reconcileChatBookmarkStars = roots => {
    if (!enabled() || settings().messageBookmarkButtons === false) return;
    if (!Array.isArray(roots) || !roots.length) return;
    // Native controls must not vanish simply because the shared bookmark
    // storage (potentially large) has not finished loading. Render unloaded
    // stars immediately; refresh their saved/unsaved state after the read.
    applyButtons(roots);
    if (!loaded && !loading) {
      void ensureLoaded().then(() => {
        refreshBookmarkButtonStates();
        updateManagerButton();
      }).catch(() => {
        DS.setQuickStatus?.("Couldn't load bookmarks; the stars will retry when chat controls refresh.");
      });
    }
  };
  DS.openChatBookmarks = openManager;
  DS.openBookmarkRecovery = openBookmarkRecovery;
  DS.isChatMessageBookmarked = isBookmarked;
  DS.navigateChatTo = (root, options = {}) => scrollToRoot(root, { record: options.record !== false, reason: options.reason || "jump" });
  DS.chatNavigationBack = () => navigateHistory(-1);
  DS.chatNavigationForward = () => navigateHistory(1);
  DS.CHAT_BOOKMARKS_KEY = KEY;
  try {
    chrome.storage?.onChanged?.addListener(changes => {
      if (!changes?.[KEY]) return;
      store = changes[KEY].newValue && typeof changes[KEY].newValue === "object" ? changes[KEY].newValue : {};
      loaded = true;
      applyButtons();
      refreshBookmarkButtonStates();
      updateManagerButton();
      updateNavControls();
      DS.refreshChatSearch?.();
    });
  } catch {}
})();

}

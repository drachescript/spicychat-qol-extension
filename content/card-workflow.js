(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const ACTIONS_CLASS = "ds-card-workflow-actions";
  const TOOLBAR_ID = "ds-card-workflow-toolbar";
  const RECENT_MODAL_ID = "ds-recently-seen-modal";
  const COMPARE_MODAL_ID = "ds-bot-compare-modal";
  const selectedCompare = new Map();
  let lastTrackedRoute = "";

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const displayText = value => {
    const raw = clean(value);
    return typeof DS.normalizeTextForDisplay === "function" ? DS.normalizeTextForDisplay(raw) : raw;
  };

  function normalizeRecentStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const items = Array.isArray(source.entries) ? source.entries : [];
    const out = [];
    const seen = new Set();

    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const id = clean(raw.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name: clean(raw.name || id).slice(0, 140),
        creator: clean(raw.creator).slice(0, 140),
        image: clean(raw.image),
        chatUrl: clean(raw.chatUrl || `${location.origin}/chat/${id}`),
        profileUrl: clean(raw.profileUrl || `${location.origin}/chatbot/${id}`),
        lastSeenAt: Number(raw.lastSeenAt) || 0,
        seenCount: Math.max(1, Number(raw.seenCount) || 1)
      });
    }

    out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return { entries: out };
  }

  function recentStore() {
    DS.state.recentlySeenBots = normalizeRecentStore(DS.state.recentlySeenBots);
    return DS.state.recentlySeenBots;
  }

  async function saveRecentStore(next = recentStore()) {
    DS.state.recentlySeenBots = normalizeRecentStore(next);
    const limit = Math.max(10, Math.min(250, Number(DS.state.settings?.recentlySeenLimit || 100)));
    DS.state.recentlySeenBots.entries = DS.state.recentlySeenBots.entries.slice(0, limit);
    if (typeof DS.saveRecentlySeenBots === "function") {
      await DS.saveRecentlySeenBots(DS.state.recentlySeenBots);
    } else {
      await DS.storageSet?.({ [DS.RECENTLY_SEEN_BOTS_KEY || "recentlySeenBots"]: DS.state.recentlySeenBots });
    }
  }

  function botIdFromHref(href) {
    if (!href) return "";
    const chatId = DS.chatIdFromHref?.(href);
    if (chatId) return chatId;
    try {
      return new URL(href, location.origin).pathname.match(/^\/chatbot\/([^/?#]+)/i)?.[1] || "";
    } catch {
      return "";
    }
  }

  function creatorFrom(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    if (!anchor) return "";
    const text = clean(anchor.textContent);
    if (text) return text.startsWith("@") ? text : `@${text}`;
    try {
      const handle = new URL(anchor.href, location.origin).pathname.match(/^\/creator\/([^/?#]+)/i)?.[1] || "";
      return handle ? `@${decodeURIComponent(handle)}` : "";
    } catch {
      return "";
    }
  }

  function visibleCardSummary(card) {
    if (!card) return "";
    const clone = card.cloneNode(true);
    clone.querySelectorAll(
      `.${ACTIONS_CLASS}, .ds-bot-organizer-button, .ds-bot-local-meta, .ds-card-token-info, button, svg, img`
    ).forEach(el => el.remove());
    return clean(clone.textContent).slice(0, 900);
  }

  function snapshotFrom(card, anchor) {
    const id = botIdFromHref(anchor?.href || "");
    if (!id) return null;
    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};
    const org = DS.state.botOrganization?.meta?.[id] || {};
    return {
      id,
      name: clean(base.name || DS.getCardTitle?.(card) || id),
      creator: clean(base.creator || creatorFrom(card)),
      image: clean(base.image || DS.getCardImageUrl?.(card) || ""),
      chatUrl: clean(base.chatUrl || anchor?.href || `${location.origin}/chat/${id}`),
      profileUrl: clean(base.profileUrl || `${location.origin}/chatbot/${id}`),
      summary: visibleCardSummary(card),
      tokenInfo: clean(card?.querySelector?.(".ds-card-token-info")?.textContent || ""),
      note: clean(org.note || ""),
      tags: Array.isArray(org.tags) ? org.tags.map(clean).filter(Boolean) : [],
      collections: Array.isArray(org.collections) ? org.collections.map(clean).filter(Boolean) : [],
      status: clean(org.status || ""),
      favorite: !!DS.state.favoriteBotIdSet?.has(id),
      later: !!DS.state.laterBotIdSet?.has(id),
      opened: !!DS.state.openedChats?.has(id),
      blocked: !!DS.state.blockedBotIdSet?.has(id),
      notInterested: !!DS.state.notInterestedBotIdSet?.has(id)
    };
  }

  function snapshotFromCurrentPage() {
    let id = "";
    const chat = location.pathname.match(/^\/chat\/([^/?#]+)/i);
    const profile = location.pathname.match(/^\/chatbot\/([^/?#]+)/i);
    id = chat?.[1] || profile?.[1] || "";
    if (!id) return null;

    const name = clean(DS.getCurrentBotName?.() || document.querySelector("h1")?.textContent || id);
    const creatorLink = document.querySelector("a[aria-label='creator-profile'], a[href*='/creator/']");
    const creator = clean(creatorLink?.textContent || "");
    const img = document.querySelector("a[aria-label='chatbot-profile'] img, img[alt][class*='object-cover']");
    const org = DS.state.botOrganization?.meta?.[id] || {};
    return {
      id,
      name,
      creator,
      image: img?.currentSrc || img?.src || "",
      chatUrl: `${location.origin}/chat/${id}`,
      profileUrl: `${location.origin}/chatbot/${id}`,
      summary: "",
      tokenInfo: "",
      note: clean(org.note || ""),
      tags: Array.isArray(org.tags) ? org.tags.map(clean).filter(Boolean) : [],
      collections: Array.isArray(org.collections) ? org.collections.map(clean).filter(Boolean) : [],
      status: clean(org.status || ""),
      favorite: !!DS.state.favoriteBotIdSet?.has(id),
      later: !!DS.state.laterBotIdSet?.has(id),
      opened: !!DS.state.openedChats?.has(id),
      blocked: !!DS.state.blockedBotIdSet?.has(id),
      notInterested: !!DS.state.notInterestedBotIdSet?.has(id)
    };
  }

  async function recordSeen(snapshot) {
    const settings = DS.state.settings || {};
    if (!settings.enabled || !settings.trackRecentlySeenBots || !snapshot?.id) return;

    const store = recentStore();
    const existing = store.entries.find(item => item.id === snapshot.id);
    const now = Date.now();
    const entry = {
      id: snapshot.id,
      name: clean(snapshot.name || existing?.name || snapshot.id),
      creator: clean(snapshot.creator || existing?.creator || ""),
      image: clean(snapshot.image || existing?.image || ""),
      chatUrl: clean(snapshot.chatUrl || existing?.chatUrl || `${location.origin}/chat/${snapshot.id}`),
      profileUrl: clean(snapshot.profileUrl || existing?.profileUrl || `${location.origin}/chatbot/${snapshot.id}`),
      lastSeenAt: now,
      seenCount: existing && now - Number(existing.lastSeenAt || 0) < 10000
        ? Math.max(1, Number(existing.seenCount || 1))
        : Math.max(1, Number(existing?.seenCount || 0) + 1)
    };
    store.entries = [entry, ...store.entries.filter(item => item.id !== snapshot.id)];
    await saveRecentStore(store);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.style.position = "fixed";
      box.style.left = "-9999px";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function copyPayload(snapshot) {
    const lines = [
      snapshot.name || snapshot.id,
      snapshot.creator ? `Creator: ${snapshot.creator}` : "",
      snapshot.chatUrl ? `Chat: ${snapshot.chatUrl}` : "",
      snapshot.profileUrl ? `Profile: ${snapshot.profileUrl}` : "",
      snapshot.collections?.length ? `QoL folders: ${snapshot.collections.join(", ")}` : "",
      snapshot.tags?.length ? `Personal tags: ${snapshot.tags.join(", ")}` : "",
      snapshot.note ? `Private note: ${snapshot.note}` : "",
      snapshot.tokenInfo ? `Token info: ${snapshot.tokenInfo}` : "",
      snapshot.summary ? `Visible card info: ${snapshot.summary}` : ""
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function copyBotInfo(snapshot) {
    const ok = await copyText(copyPayload(snapshot));
    DS.setQuickStatus?.(ok ? `Copied bot info: ${snapshot.name || snapshot.id}` : "Could not copy bot info.");
  }

  async function quickUnblock(snapshot) {
    if (!snapshot?.id || !DS.state.blockedBotIdSet?.has(snapshot.id)) return;
    const before = JSON.parse(JSON.stringify(DS.state.blockedBots || { ids: [], names: [], meta: {} }));
    const store = DS.state.blockedBots || { ids: [], names: [], meta: {} };
    store.ids = (store.ids || []).filter(id => id !== snapshot.id);
    if (store.meta) delete store.meta[snapshot.id];

    const settings = DS.state.settings || {};
    if (Array.isArray(settings.blockedBotIds) && settings.blockedBotIds.includes(snapshot.id)) {
      settings.blockedBotIds = settings.blockedBotIds.filter(id => id !== snapshot.id);
      await DS.storageSet?.({ settings });
    }

    await DS.saveBlockedBots?.();
    await DS.recordLocalChange?.(
      `Unblocked bot: ${snapshot.name || snapshot.id}`,
      { [DS.BLOCKED_BOTS_KEY]: before },
      { [DS.BLOCKED_BOTS_KEY]: JSON.parse(JSON.stringify(DS.state.blockedBots || store)) }
    );
    DS.scheduleRun?.({ priority: "both", immediate: true, source: "quick-unblock" });
  }

  function makeActionButton(label, title, onClick, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ds-card-workflow-action${extraClass ? ` ${extraClass}` : ""}`;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClick?.(event);
    });
    return button;
  }

  function clearCardActions(card) {
    card?.querySelector?.(`.${ACTIONS_CLASS}`)?.remove();
    card?.classList?.remove("ds-card-density-target");
    card?.querySelector?.(".ds-card-density-image")?.classList?.remove("ds-card-density-image");
  }

  function ensureCardActions(card, anchor) {
    const settings = DS.state.settings || {};
    const snapshot = snapshotFrom(card, anchor);
    if (!snapshot) return;

    let host = card.querySelector(`.${ACTIONS_CLASS}`);
    const needsAny = !!(
      settings.showCopyBotInfoButtons ||
      settings.enableBotComparison ||
      settings.showQuickNotInterestedButtons ||
      (settings.showQuickUnblockButtons && snapshot.blocked)
    );

    if (!needsAny) {
      host?.remove();
      return;
    }

    if (!host) {
      if (getComputedStyle(card).position === "static") card.style.position = "relative";
      host = document.createElement("div");
      host.className = ACTIONS_CLASS;
      card.appendChild(host);
    }
    host.textContent = "";

    if (settings.showCopyBotInfoButtons) {
      host.appendChild(makeActionButton("⧉", `Copy bot info: ${snapshot.name}`, () => copyBotInfo(snapshot)));
    }

    if (settings.enableBotComparison) {
      const selected = selectedCompare.has(snapshot.id);
      const button = makeActionButton("⇄", selected ? `Remove ${snapshot.name} from comparison` : `Compare ${snapshot.name}`, () => {
        if (selectedCompare.has(snapshot.id)) selectedCompare.delete(snapshot.id);
        else {
          if (selectedCompare.size >= 2) selectedCompare.delete(selectedCompare.keys().next().value);
          selectedCompare.set(snapshot.id, snapshot);
        }
        refreshAllCardActions();
        updateToolbar();
        if (selectedCompare.size === 2) openComparisonModal();
      }, selected ? "ds-card-compare-selected" : "");
      host.appendChild(button);
    }

    if (settings.showQuickNotInterestedButtons && !snapshot.notInterested) {
      host.appendChild(makeActionButton("⊘", `Not Interested: ${snapshot.name}`, async () => {
        const before = JSON.parse(JSON.stringify(DS.state.notInterestedBots || { ids: [], meta: {} }));
        await DS.markBotNotInterestedFromCard?.(card, anchor);
        await DS.recordLocalChange?.(
          `Marked Not Interested: ${snapshot.name || snapshot.id}`,
          { [DS.NOT_INTERESTED_KEY]: before },
          { [DS.NOT_INTERESTED_KEY]: JSON.parse(JSON.stringify(DS.state.notInterestedBots || {})) }
        );
      }));
    }

    if (settings.showQuickUnblockButtons && snapshot.blocked && DS.state.settings?.hiddenCardMode === "dim") {
      host.appendChild(makeActionButton("↩", `Unblock ${snapshot.name}`, () => quickUnblock(snapshot)));
    }
  }

  function refreshAllCardActions() {
    for (const { card, anchor } of DS.collectCards?.() || []) ensureCardActions(card, anchor);
  }

  function applyDensity() {
    const mode = ["normal", "compact", "dense"].includes(DS.state.settings?.cardDensityMode)
      ? DS.state.settings.cardDensityMode
      : "normal";
    document.documentElement.dataset.dsCardDensity = mode;
    for (const { card } of DS.collectCards?.() || []) {
      card.classList.add("ds-card-density-target");
      const image = card.querySelector("img");
      if (image) image.classList.add("ds-card-density-image");
    }
  }

  function closeModal(id) {
    document.getElementById(id)?.remove();
  }

  function modalShell(id, title, subtitle = "") {
    closeModal(id);
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "ds-card-workflow-modal-overlay";

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "ds-card-workflow-modal-backdrop";
    backdrop.setAttribute("aria-label", "Close");
    backdrop.addEventListener("click", () => closeModal(id));

    const dialog = document.createElement("div");
    dialog.className = "ds-card-workflow-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "ds-card-workflow-modal-head";
    const text = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = title;
    text.appendChild(h2);
    if (subtitle) {
      const p = document.createElement("p");
      p.textContent = subtitle;
      text.appendChild(p);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => closeModal(id));
    head.append(text, close);
    dialog.appendChild(head);
    overlay.append(backdrop, dialog);
    document.body.appendChild(overlay);
    return { overlay, dialog };
  }

  function fmtDate(ts) {
    if (!ts) return "Unknown";
    try { return new Date(ts).toLocaleString(); } catch { return "Unknown"; }
  }

  function openRecentlySeenModal() {
    const entries = recentStore().entries;
    const { dialog } = modalShell(
      RECENT_MODAL_ID,
      "Recently seen bots",
      `${entries.length} locally remembered bot${entries.length === 1 ? "" : "s"}`
    );

    const controls = document.createElement("div");
    controls.className = "ds-card-workflow-modal-controls";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search recently seen...";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear history";
    controls.append(search, clear);
    dialog.appendChild(controls);

    const list = document.createElement("div");
    list.className = "ds-recently-seen-list";
    dialog.appendChild(list);

    const render = () => {
      const q = clean(search.value).toLowerCase();
      list.textContent = "";
      const rows = recentStore().entries.filter(item => !q || `${item.name} ${item.creator}`.toLowerCase().includes(q));
      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "ds-card-workflow-empty";
        empty.textContent = q ? "No matching recently seen bots." : "No recently seen bots saved yet.";
        list.appendChild(empty);
        return;
      }
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "ds-recently-seen-item";
        if (item.image) {
          const img = document.createElement("img");
          img.src = item.image;
          img.alt = "";
          row.appendChild(img);
        }
        const main = document.createElement("div");
        main.className = "ds-recently-seen-main";
        const name = document.createElement("strong");
        name.textContent = displayText(item.name || item.id);
        const meta = document.createElement("span");
        meta.textContent = [item.creator, `Seen ${item.seenCount}×`, fmtDate(item.lastSeenAt)].filter(Boolean).join(" • ");
        const actions = document.createElement("div");
        actions.className = "ds-recently-seen-actions";
        const chat = document.createElement("a");
        chat.href = item.chatUrl || `${location.origin}/chat/${item.id}`;
        chat.textContent = "Chat";
        const profile = document.createElement("a");
        profile.href = item.profileUrl || `${location.origin}/chatbot/${item.id}`;
        profile.textContent = "Profile";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", async () => {
          const store = recentStore();
          store.entries = store.entries.filter(entry => entry.id !== item.id);
          await saveRecentStore(store);
          render();
          updateToolbar();
        });
        actions.append(chat, profile, remove);
        main.append(name, meta, actions);
        row.appendChild(main);
        list.appendChild(row);
      }
    };

    search.addEventListener("input", render);
    clear.addEventListener("click", async () => {
      if (!confirm("Clear the local Recently Seen history?")) return;
      await saveRecentStore({ entries: [] });
      render();
      updateToolbar();
    });
    render();
  }

  function compareRow(table, label, a, b) {
    const row = document.createElement("div");
    row.className = "ds-bot-compare-row";
    const l = document.createElement("strong");
    l.textContent = label;
    const av = document.createElement("div");
    av.textContent = a || "—";
    const bv = document.createElement("div");
    bv.textContent = b || "—";
    row.append(l, av, bv);
    table.appendChild(row);
  }

  function openComparisonModal() {
    const items = [...selectedCompare.values()].slice(0, 2);
    if (items.length < 2) {
      DS.setQuickStatus?.("Select two bot cards to compare.");
      return;
    }
    const [a, b] = items;
    const { dialog } = modalShell(COMPARE_MODAL_ID, "Compare bots", "Local comparison using data already visible or saved by QoL.");

    const table = document.createElement("div");
    table.className = "ds-bot-compare-table";
    const head = document.createElement("div");
    head.className = "ds-bot-compare-row ds-bot-compare-header";
    const blank = document.createElement("span");
    const ah = document.createElement("strong");
    ah.textContent = displayText(a.name || a.id);
    const bh = document.createElement("strong");
    bh.textContent = displayText(b.name || b.id);
    head.append(blank, ah, bh);
    table.appendChild(head);
    compareRow(table, "Creator", a.creator, b.creator);
    compareRow(table, "Opened", a.opened ? "Yes" : "No", b.opened ? "Yes" : "No");
    compareRow(table, "Favorite", a.favorite ? "Yes" : "No", b.favorite ? "Yes" : "No");
    compareRow(table, "Later", a.later ? "Yes" : "No", b.later ? "Yes" : "No");
    compareRow(table, "Status", a.status, b.status);
    compareRow(table, "Folders", a.collections?.join(", "), b.collections?.join(", "));
    compareRow(table, "Personal tags", a.tags?.join(", "), b.tags?.join(", "));
    compareRow(table, "Private note", a.note, b.note);
    compareRow(table, "Token info", a.tokenInfo, b.tokenInfo);
    compareRow(table, "Visible card info", a.summary, b.summary);
    dialog.appendChild(table);

    const actions = document.createElement("div");
    actions.className = "ds-card-workflow-modal-actions";
    const openA = document.createElement("a");
    openA.href = a.profileUrl;
    openA.textContent = `Open ${displayText(a.name || "A")}`;
    const openB = document.createElement("a");
    openB.href = b.profileUrl;
    openB.textContent = `Open ${displayText(b.name || "B")}`;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy comparison";
    copy.addEventListener("click", async () => {
      const text = [
        `${a.name || a.id} vs ${b.name || b.id}`,
        "",
        `Creator: ${a.creator || "—"} | ${b.creator || "—"}`,
        `Opened: ${a.opened ? "Yes" : "No"} | ${b.opened ? "Yes" : "No"}`,
        `Favorite: ${a.favorite ? "Yes" : "No"} | ${b.favorite ? "Yes" : "No"}`,
        `Later: ${a.later ? "Yes" : "No"} | ${b.later ? "Yes" : "No"}`,
        `Folders: ${a.collections?.join(", ") || "—"} | ${b.collections?.join(", ") || "—"}`,
        `Personal tags: ${a.tags?.join(", ") || "—"} | ${b.tags?.join(", ") || "—"}`,
        `Private note: ${a.note || "—"} | ${b.note || "—"}`,
        `Token info: ${a.tokenInfo || "—"} | ${b.tokenInfo || "—"}`,
        "",
        `${a.name || a.id}: ${a.summary || "No visible summary"}`,
        `${b.name || b.id}: ${b.summary || "No visible summary"}`
      ].join("\n");
      const ok = await copyText(text);
      DS.setQuickStatus?.(ok ? "Copied bot comparison." : "Could not copy comparison.");
    });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear selection";
    clear.addEventListener("click", () => {
      selectedCompare.clear();
      refreshAllCardActions();
      updateToolbar();
      closeModal(COMPARE_MODAL_ID);
    });
    actions.append(openA, openB, copy, clear);
    dialog.appendChild(actions);
  }

  function toolbarHost() {
    const first = (DS.collectCards?.() || [])[0];
    if (!first) return null;
    const target = DS.getBestHideTarget?.(first.card) || first.card;
    const grid = target?.parentElement;
    return grid?.parentElement ? { parent: grid.parentElement, before: grid } : null;
  }

  function updateToolbar() {
    const settings = DS.state.settings || {};
    const shouldShow = !!(settings.showRecentlySeenButton || settings.enableBotComparison);
    if (!shouldShow || !DS.collectCards?.().length) {
      document.getElementById(TOOLBAR_ID)?.remove();
      return;
    }

    let bar = document.getElementById(TOOLBAR_ID);
    if (!bar) {
      const host = toolbarHost();
      if (!host) return;
      bar = document.createElement("div");
      bar.id = TOOLBAR_ID;
      bar.className = "ds-card-workflow-toolbar";
      host.parent.insertBefore(bar, host.before);
    }
    bar.textContent = "";

    if (settings.showRecentlySeenButton) {
      const recent = document.createElement("button");
      recent.type = "button";
      recent.textContent = `🕘 Recently seen (${recentStore().entries.length})`;
      recent.addEventListener("click", openRecentlySeenModal);
      bar.appendChild(recent);
    }

    if (settings.enableBotComparison) {
      const compare = document.createElement("button");
      compare.type = "button";
      compare.textContent = `⇄ Compare (${selectedCompare.size}/2)`;
      compare.disabled = selectedCompare.size < 2;
      compare.addEventListener("click", openComparisonModal);
      bar.appendChild(compare);

      if (selectedCompare.size) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.textContent = "Clear compare";
        clear.addEventListener("click", () => {
          selectedCompare.clear();
          refreshAllCardActions();
          updateToolbar();
        });
        bar.appendChild(clear);
      }
    }
  }

  async function trackCurrentRouteOnce() {
    const settings = DS.state.settings || {};
    if (!settings.trackRecentlySeenBots) return;
    const route = `${location.pathname}${location.search}`;
    if (route === lastTrackedRoute) return;
    const snapshot = snapshotFromCurrentPage();
    if (!snapshot) return;
    lastTrackedRoute = route;
    await recordSeen(snapshot);
  }

  function cardEntryForTarget(target) {
    if (!(target instanceof Element)) return null;
    for (const entry of DS.collectCards?.() || []) {
      if (entry?.card?.contains?.(target)) return entry;
    }
    return null;
  }

  function isExplicitCardControl(target, card) {
    if (!(target instanceof Element) || !card) return true;
    if (target.closest("button, input, select, textarea, [role='button'], [contenteditable='true'], .ds-card-workflow-actions, .ds-bot-organizer-button, .ds-bot-local-meta")) return true;

    const link = target.closest("a[href]");
    if (!link || !card.contains(link)) return false;
    let path = "";
    try { path = new URL(link.href, location.origin).pathname; } catch {}
    if (/^\/creator\//i.test(path) || /^\/chatbot\//i.test(path)) return true;
    if (!/^\/chat\//i.test(path)) return true;

    const label = clean(`${link.getAttribute("aria-label") || ""} ${link.getAttribute("title") || ""} ${link.textContent || ""}`).toLowerCase();
    if (/^(chat|start chat|continue chat|open chat|chat now|new chat)$/.test(label)) return true;
    return false;
  }

  document.addEventListener("click", event => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || settings.cardClickBehavior !== "profile") return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (DS.isSingleChatPage?.() || DS.isBotProfilePage?.() || DS.isChatListPage?.() || DS.isMyCreationsChatbotsPage?.()) return;

    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const entry = cardEntryForTarget(target);
    if (!entry?.card || isExplicitCardControl(target, entry.card)) return;

    const snapshot = snapshotFrom(entry.card, entry.anchor);
    if (!snapshot?.profileUrl) return;

    event.preventDefault();
    event.stopPropagation();
    location.assign(snapshot.profileUrl);
  }, true);

  document.addEventListener("click", event => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.trackRecentlySeenBots) return;
    const anchor = event.target?.closest?.("a[href*='/chat/'], a[href*='/chatbot/']");
    if (!anchor) return;
    const id = botIdFromHref(anchor.href || "");
    if (!id) return;
    const card = DS.getCardFromChatLink?.(anchor) || anchor.closest?.(".ds-card-density-target");
    const snapshot = card ? snapshotFrom(card, anchor) : {
      id,
      name: clean(anchor.textContent || id),
      creator: "",
      image: "",
      chatUrl: `${location.origin}/chat/${id}`,
      profileUrl: `${location.origin}/chatbot/${id}`
    };
    recordSeen(snapshot);
  }, true);

  DS.applyCardWorkflow = async function applyCardWorkflow() {
    const settings = DS.state.settings || {};
    if (!settings.enabled) {
      DS.removeCardWorkflow?.();
      return;
    }

    await trackCurrentRouteOnce();

    const density = ["normal", "compact", "dense"].includes(settings.cardDensityMode) ? settings.cardDensityMode : "normal";
    const listingFeatures = !!(
      density !== "normal" ||
      settings.showCopyBotInfoButtons ||
      settings.showRecentlySeenButton ||
      settings.enableBotComparison ||
      settings.showQuickNotInterestedButtons ||
      settings.showQuickUnblockButtons
    );

    const listing = !DS.isSingleChatPage?.() && !DS.isBotProfilePage?.() && !!DS.collectCards?.().length;
    if (!listing || !listingFeatures) {
      if (DS.state.cardWorkflowWasActive) DS.removeCardWorkflow?.();
      DS.state.cardWorkflowWasActive = false;
      return;
    }

    DS.state.cardWorkflowWasActive = true;
    applyDensity();
    refreshAllCardActions();
    updateToolbar();
  };

  DS.removeCardWorkflow = function removeCardWorkflow() {
    document.getElementById(TOOLBAR_ID)?.remove();
    closeModal(RECENT_MODAL_ID);
    closeModal(COMPARE_MODAL_ID);
    document.documentElement.removeAttribute("data-ds-card-density");
    for (const { card } of DS.collectCards?.() || []) clearCardActions(card);
    DS.state.cardWorkflowWasActive = false;
  };

  DS.openRecentlySeenBots = openRecentlySeenModal;
  DS.openBotComparison = openComparisonModal;
})();
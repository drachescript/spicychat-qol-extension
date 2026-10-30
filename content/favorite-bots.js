// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function displayText(value) {
    const raw = cleanText(value);
    return typeof DS.normalizeTextForDisplay === "function" ? DS.normalizeTextForDisplay(raw) : raw;
  }

  function getStore() {
    const source = DS.state.favoriteBots || { ids: [], meta: {} };
    const store = {
      ids: DS.uniqueClean(Array.isArray(source.ids) ? source.ids : []),
      meta: source.meta && typeof source.meta === "object" ? source.meta : {}
    };

    DS.state.favoriteBots = store;
    return store;
  }

  function cardCreator(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    const text = cleanText(anchor?.textContent || "");
    if (text) return text.startsWith("@") ? text : `@${text}`;

    const href = anchor?.getAttribute?.("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : "";
  }

  function cardDescription(card) {
    const direct = cleanText(DS.getCardDescriptionText?.(card));
    if (direct) return direct;

    const title = cleanText(DS.getCardTitle?.(card));
    return (DS.qsa?.("p, span", card) || [])
      .map(el => cleanText(el.textContent))
      .filter(Boolean)
      .filter(text => text !== title)
      .filter(text => !text.startsWith("@"))
      .sort((a, b) => b.length - a.length)
      .find(text => text.length > 35) || "";
  }

  function makeMeta(card, anchor, id) {
    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};

    return {
      ...base,
      id,
      name: base.name || DS.getCardTitle?.(card) || id,
      image: base.image || DS.getCardImageUrl?.(card) || "",
      creator: base.creator || cardCreator(card),
      description: cardDescription(card),
      tags: [...new Set([...(Array.isArray(base.tags) ? base.tags : []),
        ...[...(card?.querySelectorAll?.('[data-testid="CharacterCardTagRow"] button[aria-label]') || [])]
          .map(node => node.getAttribute('aria-label'))]
        .map(value => String(value || '').trim())
        .filter(value => value && value.length <= 70 && value.toLowerCase() !== 'image-gen'))],
      chatUrl: base.chatUrl || anchor?.href || `${location.origin}/chat/${id}`,
      profileUrl: base.profileUrl || `${location.origin}/chatbot/${id}`,
      savedAt: base.savedAt || Date.now(),
      lastSeenAt: Date.now(),
      cardMetaCaptured: true
    };
  }


  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function historyEntries() {
    const store = getStore();
    return (store.ids || [])
      .map((id, index) => {
        const meta = store.meta?.[id] || {};
        return {
          id,
          name: meta.name || id,
          image: meta.image || "",
          creator: meta.creator || "",
          description: meta.description || "",
          chatUrl: meta.chatUrl || `${location.origin}/chat/${id}`,
          profileUrl: meta.profileUrl || `${location.origin}/chatbot/${id}`,
          savedAt: Number(meta.savedAt || 0) || 0,
          inLater: !!DS.state.laterBotIdSet?.has(id),
          index
        };
      })
      .sort((a, b) => b.savedAt - a.savedAt || b.index - a.index);
  }

  function historyCardElement(entry) {
    const card = document.createElement("div");
    card.className = "ds-favorite-history-card";

    if (entry.image) {
      const image = document.createElement("img");
      image.src = entry.image;
      image.alt = "";
      card.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "ds-favorite-history-placeholder";
      placeholder.textContent = "?";
      card.appendChild(placeholder);
    }

    const main = document.createElement("div");
    main.className = "ds-favorite-history-main";
    const title = document.createElement("strong");
    title.textContent = displayText(entry.name);
    main.appendChild(title);

    if (entry.creator) {
      const creator = document.createElement("span");
      creator.textContent = displayText(entry.creator);
      main.appendChild(creator);
    }
    if (entry.inLater) {
      const status = document.createElement("span");
      status.className = "ds-favorite-history-status";
      status.textContent = "Saved for Later";
      main.appendChild(status);
    }
    if (entry.description) {
      const description = document.createElement("p");
      description.textContent = displayText(entry.description);
      main.appendChild(description);
    }

    const actions = document.createElement("div");
    actions.className = "ds-favorite-history-actions";
    for (const [href, label] of [[entry.chatUrl, "Open chat"], [entry.profileUrl, "Open profile"]]) {
      const link = document.createElement("a");
      link.href = href;
      link.target = "_self";
      link.rel = "noopener noreferrer";
      link.textContent = label;
      actions.appendChild(link);
    }
    main.appendChild(actions);
    card.appendChild(main);
    return card;
  }

  function showHistoryModal() {
    document.getElementById("ds-favorite-history-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "ds-favorite-history-modal";
    DS.setSafeMarkup(modal, `
      <div class="ds-favorite-history-backdrop"></div>
      <div class="ds-favorite-history-dialog" role="dialog" aria-modal="true" aria-label="Favorite history">
        <div class="ds-favorite-history-head">
          <div>
            <h2>Favorite history</h2>
            <p>Bots QoL has previously seen on your SpicyChat Favorites page stay here even if you unfavorite them later.</p>
          </div>
          <button type="button" class="ds-favorite-history-close" aria-label="Close">×</button>
        </div>
        <div class="ds-favorite-history-controls">
          <input class="ds-favorite-history-search" type="search" placeholder="Search favorite history">
          <select class="ds-favorite-history-sort" aria-label="Sort favorite history">
            <option value="newest">Recently saved in QoL history (may be first seen)</option><option value="oldest">Oldest in QoL history (may be first seen)</option><option value="name">Name A-Z</option><option value="creator">Creator A-Z</option>
          </select>
          <select class="ds-favorite-history-later" aria-label="Filter favorite history by Later">
            <option value="all">All history</option><option value="later">Also in Later</option><option value="not-later">Not in Later</option>
          </select>
        </div>
        <div class="ds-favorite-history-summary"></div>
        <div class="ds-favorite-history-list"></div>
      </div>
    `);

    document.documentElement.appendChild(modal);

    const search = modal.querySelector(".ds-favorite-history-search");
    const sort = modal.querySelector(".ds-favorite-history-sort");
    const later = modal.querySelector(".ds-favorite-history-later");
    const list = modal.querySelector(".ds-favorite-history-list");
    const summary = modal.querySelector(".ds-favorite-history-summary");
    const all = historyEntries();

    const render = () => {
      const query = cleanText(search?.value || "").toLowerCase();
      let entries = query
        ? all.filter(entry => [entry.name, entry.creator, entry.description, entry.id].join(" ").toLowerCase().includes(query))
        : [...all];

      if (later?.value === "later") entries = entries.filter(entry => entry.inLater);
      if (later?.value === "not-later") entries = entries.filter(entry => !entry.inLater);

      const mode = sort?.value || "newest";
      if (mode === "oldest") entries.sort((a, b) => a.savedAt - b.savedAt || a.index - b.index);
      else if (mode === "name") entries.sort((a, b) => a.name.localeCompare(b.name));
      else if (mode === "creator") entries.sort((a, b) => a.creator.localeCompare(b.creator) || a.name.localeCompare(b.name));
      else entries.sort((a, b) => b.savedAt - a.savedAt || b.index - a.index);

      summary.textContent = `${entries.length} of ${all.length} remembered favorite${all.length === 1 ? "" : "s"}`;

      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "ds-favorite-history-empty";
        empty.textContent = all.length ? "No matches." : "No favorite history saved yet.";
        list.replaceChildren(empty);
        return;
      }

      list.replaceChildren(...entries.map(historyCardElement));
    };

    search?.addEventListener("input", render);
    sort?.addEventListener("change", render);
    later?.addEventListener("change", render);
    modal.querySelector(".ds-favorite-history-backdrop")?.addEventListener("click", () => modal.remove());
    modal.querySelector(".ds-favorite-history-close")?.addEventListener("click", () => modal.remove());
    render();
    search?.focus();
  }

  let favoritePageFolderFilter = "all";
  let favoritePageSort = "native";
  let observedAdditions = DS.state?.favoriteObservedAdditions || {};
  const ADDITIONS_KEY='dsFavoritesObservedAdditionsV1';
  void Promise.resolve(DS.storageGet?.([ADDITIONS_KEY])).then(values=>{
    observedAdditions=values?.[ADDITIONS_KEY]?.at||{};
    if(DS.state)DS.state.favoriteObservedAdditions=observedAdditions;
    if(favoritePageSort.startsWith('added-'))applyFavoritePageExtras();
  }).catch(()=>{});
  window.addEventListener('ds-qol-favorites-additions-updated',()=>{
    observedAdditions=DS.state?.favoriteObservedAdditions||{};
    if(favoritePageSort.startsWith('added-'))applyFavoritePageExtras();
  });

  function favoriteFolderNames() {
    const stored = DS.state?.botOrganization || {};
    const configured = String(DS.state?.settings?.botCollections || "").split(/[\n,]+/);
    return [...new Set([...(stored.collections || []), ...configured].map(cleanText).filter(Boolean))];
  }

  function resetFavoriteCards() {
    for (const el of document.querySelectorAll("[data-ds-fav-page-managed='1']")) {
      el.classList.remove("ds-favorite-qol-filter-hidden");
      if (el.dataset.dsFavOldOrder !== undefined) {
        el.style.order = el.dataset.dsFavOldOrder;
        delete el.dataset.dsFavOldOrder;
      }
      delete el.dataset.dsFavPageManaged;
    }
  }

  async function assignFavoriteFolder(id, name) {
    const existing = DS.state.botOrganization || { meta: {}, collections: [] };
    const next = { ...existing, meta: { ...(existing.meta || {}) } };
    const current = next.meta[id] || {};
    const membership = [...new Set([...(current.collections || []), name])];
    next.meta[id] = { ...current, id, collections: membership, updatedAt: Date.now() };
    DS.state.botOrganization = next;
    await (DS.saveBotOrganization?.(next) || DS.storageSet?.({ [DS.BOT_ORGANIZER_KEY || "botOrganization"]: next }));
    applyFavoritePageExtras();
  }

  function applyFavoritePageExtras() {
    const settings = DS.state?.settings || {};
    const enabled = !!settings.enabled && !!DS.isFavoriteBotsPage?.();
    const folders = enabled && settings.favoritePageFoldersEnabled && !settings.botOrganizerExplorerFolders;
    const sorting = enabled && settings.favoritePageSortEnabled;
    const existing = document.getElementById("ds-favorite-qol-controls");
    if (!folders && !sorting) {
      existing?.remove();
      document.querySelectorAll(".ds-favorite-qol-folder-action").forEach(el => el.remove());
      resetFavoriteCards();
      return;
    }
    const heading = (DS.qsa?.("h1, h2, h3") || []).find(el => /^(favorites|favorite bots)$/i.test(cleanText(el.textContent)));
    if (!heading?.parentElement) return;
    let controls = existing;
    if (!controls || controls.previousElementSibling !== heading) {
      existing?.remove();
      controls = document.createElement("div");
      controls.id = "ds-favorite-qol-controls";
      controls.className = "ds-favorite-qol-controls";
      heading.insertAdjacentElement("afterend", controls);
    }
    const names = favoriteFolderNames();
    const signature = JSON.stringify([folders, sorting, names]);
    if (controls.dataset.signature !== signature) {
      controls.dataset.signature = signature;
      controls.replaceChildren();
      if (folders) {
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Filter Favorites by private folder");
        for (const name of ["all", "__unfoldered__", ...names]) {
          const opt = document.createElement("option"); opt.value = name;
          opt.textContent = name === "all" ? "All favorite folders" : name === "__unfoldered__" ? "Unfoldered" : name;
          select.appendChild(opt);
        }
        if (!["all", "__unfoldered__", ...names].includes(favoritePageFolderFilter)) favoritePageFolderFilter = "all";
        select.value = favoritePageFolderFilter;
        select.addEventListener("change", () => { favoritePageFolderFilter = select.value; applyFavoritePageExtras(); });
        controls.appendChild(select);
        const create = document.createElement("button"); create.type = "button"; create.textContent = "+ Folder";
        create.addEventListener("click", async () => {
          const name = cleanText(window.prompt("Name a private Favorites folder:"));
          if (!name || names.some(n => n.toLowerCase() === name.toLowerCase())) return;
          const combined = [...names, name];
          const org = DS.state.botOrganization || { meta: {}, collections: [] };
          DS.state.botOrganization = { ...org, collections: combined };
          DS.state.settings.botCollections = combined.join("\n");
          await Promise.all([
            DS.saveBotOrganization?.(DS.state.botOrganization) || DS.storageSet?.({ [DS.BOT_ORGANIZER_KEY || "botOrganization"]: DS.state.botOrganization }),
            DS.saveSettingsPatch?.({ botCollections: combined.join("\n") })
          ]);
          favoritePageFolderFilter = name;
          controls.dataset.signature = "";
          applyFavoritePageExtras();
        });
        controls.appendChild(create);
      }
      if (sorting) {
        const sortSelect = document.createElement("select");
        sortSelect.setAttribute("aria-label", "Sort loaded Favorites");
        for (const [id,label] of [["native","SpicyChat order"],["added-new","Recently added to Favorites (observed)"],["added-old","Oldest observed additions"],["newest","QoL newest first (first-seen estimate)"],["oldest","QoL oldest first (first-seen estimate)"]]) {
          const opt = document.createElement("option");opt.value=id;opt.textContent=label;sortSelect.appendChild(opt);
        }
        sortSelect.value = favoritePageSort;
        sortSelect.addEventListener("change", () => { favoritePageSort = sortSelect.value; applyFavoritePageExtras(); });
        controls.appendChild(sortSelect);
      }
      const help = document.createElement("small");
      help.textContent = "Only loaded cards. Observed additions are recorded when a bot appears between account snapshots; older dates are unknown.";
      controls.appendChild(help);
    }
    const orgMeta = DS.state?.botOrganization?.meta || {};
    const favoriteMeta = DS.state?.favoriteBots?.meta || {};
    const entries = (DS.collectCards?.() || []).map((item,i) => {
      const id = DS.botIdFromHref?.(item.anchor?.href || "") || DS.chatIdFromHref?.(item.anchor?.href || "");
      const target = DS.getBestHideTarget?.(item.card) || item.card;
      return { ...item, id, target, index: i, savedAt: Number(favoriteMeta[id]?.savedAt || 0) || 0, observedAt:Number(observedAdditions[id]||0)||0 };
    }).filter(entry => !!entry.id && !!entry.target?.isConnected);
    // CSS order only: never reparent React-owned cards or change SpicyChat favorites.
    const groups = new Map();
    for (const item of entries) {
      if (!groups.has(item.target.parentElement)) groups.set(item.target.parentElement, []);
      groups.get(item.target.parentElement).push(item);
      if (item.target.dataset.dsFavOldOrder === undefined) item.target.dataset.dsFavOldOrder = item.target.style.order || "";
      item.target.dataset.dsFavPageManaged = "1";
      const memberships = orgMeta[item.id]?.collections || [];
      const visible = !folders || favoritePageFolderFilter === "all" ||
        (favoritePageFolderFilter === "__unfoldered__" ? !memberships.length : memberships.includes(favoritePageFolderFilter));
      item.target.classList.toggle("ds-favorite-qol-filter-hidden", !visible);
      const oldButton = item.card.querySelector(".ds-favorite-qol-folder-action");
      if (folders && names.length && !oldButton) {
        const btn = document.createElement("button");
        btn.className = "ds-favorite-qol-folder-action";
        btn.type = "button";
        btn.textContent = "+ Folder";
        btn.title = "Add to private QoL folder";
        btn.addEventListener("click", event => {
          event.preventDefault();event.stopPropagation();
          const chosen = cleanText(window.prompt(`Add to which folder?\n${favoriteFolderNames().join(", ")}`, favoritePageFolderFilter !== "all" && favoritePageFolderFilter !== "__unfoldered__" ? favoritePageFolderFilter : ""));
          if (!chosen || !favoriteFolderNames().includes(chosen)) return;
          assignFavoriteFolder(item.id, chosen).catch(() => DS.setQuickStatus?.("Could not save folder"));
        });
        item.card.appendChild(btn);
      } else if (!folders) oldButton?.remove();
    }
    for (const group of groups.values()) {
      if (favoritePageSort === "native" || !sorting) {
        for (const item of group) item.target.style.order = item.target.dataset.dsFavOldOrder || "";
      } else {
        group.sort((a,b) => {
          if(favoritePageSort==='added-new'||favoritePageSort==='added-old'){
            const av=a.observedAt,bv=b.observedAt;
            if(!av||!bv)return (bv?1:0)-(av?1:0)||a.index-b.index;
            return (favoritePageSort==='added-old'?av-bv:bv-av)||a.index-b.index;
          }
          return favoritePageSort === "oldest"
            ? (a.savedAt || Number.MAX_SAFE_INTEGER) - (b.savedAt || Number.MAX_SAFE_INTEGER) || a.index-b.index
            : (b.savedAt || 0) - (a.savedAt || 0) || a.index-b.index;
        });
        group.forEach((item, i) => { item.target.style.order = String(i); });
      }
    }
  }

  DS.applyFavoriteHistoryButton = function applyFavoriteHistoryButton() {
    DS.applyFavoritesRecovery?.();
    DS.refreshFavoritesBulkManager?.();
    applyFavoritePageExtras();
    const settings = DS.state.settings || {};
    const existing = document.getElementById("ds-favorite-history-open");
    const existingWrap = document.getElementById("ds-favorite-history-button-wrap");

    if (
      !settings.enabled ||
      !settings.trackFavoriteBots ||
      !settings.showFavoriteHistoryButton ||
      !DS.isFavoriteBotsPage?.()
    ) {
      existing?.remove();
      existingWrap?.remove();
      document.getElementById("ds-favorite-history-modal")?.remove();
      return;
    }

    // Only mount into the real Favorites heading. On a cold SpicyChat load,
    // QoL can run before React has hydrated that heading. Older builds fell
    // back to documentElement in that moment, which could briefly become the
    // giant full-width "Favorite history" bar reported by testers and then
    // stay there because later passes saw an existing button. Waiting for the
    // real anchor is safer; the normal mutation pass will retry shortly.
    const heading = (DS.qsa?.("h1, h2, h3") || []).find(el => {
      const text = cleanText(el.textContent).toLowerCase();
      return text === "favorites" || text === "favorite bots";
    });

    if (!heading?.parentElement) {
      existing?.remove();
      existingWrap?.remove();
      return;
    }

    // If an older/stale button exists anywhere other than our dedicated
    // wrapper directly after the real heading, remove it and rebuild cleanly.
    const correctlyPlaced = !!(
      existing?.isConnected &&
      existingWrap?.isConnected &&
      existing.parentElement === existingWrap &&
      existingWrap.previousElementSibling === (document.getElementById("ds-favorite-qol-controls") || heading)
    );
    if (correctlyPlaced) return;

    existing?.remove();
    existingWrap?.remove();

    const button = document.createElement("button");
    button.id = "ds-favorite-history-open";
    button.type = "button";
    button.textContent = "Favorite history";
    button.title = "See bots previously saved from Favorites";
    button.classList.add("ds-favorite-history-inline");
    button.addEventListener("click", showHistoryModal);

    const wrap = document.createElement("div");
    wrap.id = "ds-favorite-history-button-wrap";
    wrap.className = "ds-favorite-history-button-wrap";
    wrap.appendChild(button);
    (document.getElementById("ds-favorite-qol-controls") || heading).insertAdjacentElement("afterend", wrap);
  };

  DS.removeFavoriteHistoryButton = function removeFavoriteHistoryButton() {
    document.getElementById("ds-favorites-recovery-open")?.remove();
    document.getElementById("ds-favorites-recovery-dialog")?.remove();
    document.getElementById("ds-favorite-history-open")?.remove();
    document.getElementById("ds-favorite-history-button-wrap")?.remove();
    document.getElementById("ds-favorite-history-modal")?.remove();
    document.getElementById("ds-favorite-qol-controls")?.remove();
    document.querySelectorAll(".ds-favorite-qol-folder-action").forEach(el => el.remove());
    resetFavoriteCards();
  };

  DS.importVisibleFavoriteBots = async function importVisibleFavoriteBots() {
    const settings = DS.state.settings || {};

    if (
      !settings.enabled ||
      !(settings.trackFavoriteBots || settings.enableFavoritesRecovery) ||
      !DS.isFavoriteBotsPage?.()
    ) {
      return 0;
    }

    const store = getStore();
    let changed = false;
    let seen = 0;

    for (const { card, anchor } of DS.collectCards?.() || []) {
      const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref?.(anchor?.href || "");
      if (!id) continue;

      seen++;
      const known = DS.state.favoriteBotIdSet?.has(id);
      if (!known) {
        store.ids.push(id);
        DS.state.favoriteBotIdSet?.add(id);
        changed = true;
      }

      const previous = store.meta[id] || {};
      if (!previous.cardMetaCaptured) {
        const nextMeta = makeMeta(card, anchor, id);
        store.meta[id] = {
          ...previous,
          ...nextMeta,
          savedAt: previous.savedAt || nextMeta.savedAt
        };
        changed = true;
      }
    }

    if (changed) {
      await DS.saveFavoriteBots?.(store);
    }

    return seen;
  };
})();

}

// Favorites-page bulk tools and scan/history extensions.
// Uses the same selector markup as the existing Recommendations/Home selector.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  'use strict';
  const DS = window.DragonScriptQoL;
  if (!DS || DS.__favoritesBulkManagerLoaded) return;
  DS.__favoritesBulkManagerLoaded = true;

  const LAUNCHER = 'ds-favorites-bulk-launcher';
  const BAR = 'ds-favorites-bulk-toolbar';
  const HOST = 'ds-listing-qol-controls';
  const STYLE = 'ds-favorite-bulk-style';
  const SCAN_STATE_KEY = 'dsFavoritesScanStateV1';
  const CLEANUP_KEY = 'dsFavoritesLaterCleanupV1';
  const LINK_RE = /\/(?:chat|chatbot)\/([a-f0-9-]{20,})(?:[/?#]|$)/i;
  const selected = new Map();
  const state = { active: false, busy: false, scanning: false, cancelScan: false, observer: null, refreshTimer: null, status: '', visibleSignature: '', autoSyncing: false, cleanupJob: null, cleanupLoaded: false, cleanupLoading: false, cleanupRunning: false, cleanupStop: false, cleanupStatus: '' };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isPage = () => /^\/favorite-bots(?:\/|$)/i.test(location.pathname) && DS.state?.settings?.enabled !== false;
  // Favorites have their own actions and must not depend on Bulk Card Blocking.
  const isEnabled = () => isPage() && !DS.isLaterFavoritesTabActive?.() && setting('showFavoritesBulkSelect') !== false;
  const scanEnabled = () => isPage() && !DS.isLaterFavoritesTabActive?.() && setting('showFavoritesScanButton') !== false;
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const idFrom = href => (String(href || '').match(LINK_RE)?.[1] || '').toLowerCase();
  const safeId = s => /^[0-9a-f-]{20,}$/i.test(String(s || ''));
  const unique = values => [...new Set(values.filter(Boolean))];
  const setting = k => DS.state?.settings?.[k];

  function css() {
    if (document.getElementById(STYLE)) return;
    const style = document.createElement('style');
    style.id = STYLE;
    style.textContent = `
      #${BAR}{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10020;display:flex;align-items:center;gap:7px;flex-wrap:wrap;max-width:calc(100vw - 30px);padding:7px 9px;border:1px solid rgba(148,163,184,.32);border-radius:10px;background:rgba(17,24,39,.96);color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.28);backdrop-filter:blur(8px);font:500 12px/1.2 system-ui,sans-serif}
      #${BAR} button{appearance:none;border:1px solid rgba(148,163,184,.32);border-radius:7px;background:rgba(55,65,81,.88);color:inherit;padding:6px 9px;cursor:pointer;font:inherit}
      #${BAR} button[data-primary="1"]{background:rgba(126,34,206,.95);border-color:rgba(168,85,247,.7)}
      #${BAR} button:disabled{opacity:.45;cursor:default}
      #${LAUNCHER}{appearance:none;border:1px solid rgba(148,163,184,.35);border-radius:7px;background:rgba(55,65,81,.72);color:inherit;padding:8px 10px;cursor:pointer;font:600 12px/1.2 system-ui,sans-serif}
      #${LAUNCHER}[aria-pressed="true"]{background:rgba(126,34,206,.96);border-color:rgba(216,180,254,.72);color:#fff}
      .ds-favorites-bulk-select{position:absolute!important;top:7px!important;left:7px!important;z-index:80!important;width:28px!important;height:28px!important;border:1px solid rgba(216,180,254,.9)!important;border-radius:8px!important;background:rgba(126,34,206,.96)!important;color:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;pointer-events:none!important}
      .ds-favorites-bulk-selected{outline:2px solid rgba(168,85,247,.92)!important;outline-offset:2px!important;cursor:pointer!important}
      #ds-favorites-cleanup-start,#ds-favorites-cleanup-clear,#ds-favorites-cleanup-retry{appearance:none;cursor:pointer;border:1px solid rgba(148,163,184,.36);border-radius:8px;background:rgba(55,65,81,.65);color:inherit;padding:7px 11px;font:500 12px system-ui,sans-serif}
      #ds-favorites-cleanup-status{font:500 12px system-ui,sans-serif;opacity:.82}
      #ds-favorites-scan{appearance:none;cursor:pointer;border:1px solid rgba(148,163,184,.36);border-radius:8px;background:rgba(55,65,81,.65);color:inherit;padding:7px 11px;font:500 12px system-ui,sans-serif}
      #ds-favorites-scan:disabled{opacity:.5;cursor:default}
      #ds-favorites-scan-status{font:400 12px/1.35 system-ui,sans-serif;opacity:.72;max-width:min(100%,650px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:650px){#${BAR}{bottom:7px;justify-content:center}}
    `;
    document.head?.appendChild(style);
  }

  function cards() {
    const found = new Map();
    const candidates = document.querySelectorAll('[data-testid="CharacterCard"], [data-testid="ChatbotCard"]');
    for (const card of candidates) {
      const id = cardId(card);
      if (id && !found.has(id)) found.set(id, card);
    }
    if (found.size) return found;
    for (const anchor of document.querySelectorAll('a[href*="/chat/"],a[href*="/chatbot/"]')) {
      const id = idFrom(anchor.href);
      if (!id || found.has(id)) continue;
      const card = anchor.closest('article,[data-testid*="Card"],div.relative.group');
      if (card) found.set(id, card);
    }
    return found;
  }
  function cardId(card) {
    return idFrom(card?.querySelector?.('a[href*="/chat/"],a[href*="/chatbot/"]')?.href);
  }
  function cardMeta(card, id = cardId(card)) {
    if (!safeId(id)) return null;
    const anchor = card?.querySelector?.('a[href*="/chat/"],a[href*="/chatbot/"]');
    const name = clean(card?.querySelector?.('[data-testid="CharacterCardHeader-TitleLink"],a[title][href*="/chat/"]')?.getAttribute('title') || card?.querySelector?.('img[alt]')?.getAttribute('alt') || id);
    const creator = clean(card?.querySelector?.('a[href*="/creator/"]')?.textContent);
    const image = card?.querySelector?.('img[alt]')?.src || '';
    const description = clean(DS.getCardDescriptionText?.(card) || card?.querySelector?.('[data-testid="CharacterCardBody"] p')?.textContent || '');
    return { id, name, creator, image, description, chatUrl: `https://spicychat.ai/chat/${id}`, profileUrl: `https://spicychat.ai/chatbot/${id}`, cardMetaCaptured: true };
  }
  function selectionCards() {
    const found = cards();
    for (const [id, card] of found) {
      card.dataset.dsFavBulkSelected = state.active && selected.has(id) ? '1' : '0';
      card.classList.toggle('ds-favorites-bulk-selected', state.active && selected.has(id));
      let badge = card.querySelector('.ds-favorites-bulk-select');
      if (state.active && selected.has(id)) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'ds-favorites-bulk-select';
          badge.textContent = '✓';
          badge.setAttribute('aria-hidden', 'true');
          card.append(badge);
        }
      } else badge?.remove();
    }
  }
  function clearSelectionUi() {
    document.querySelectorAll('[data-ds-fav-bulk-selected]').forEach(x => { x.classList.remove('ds-favorites-bulk-selected'); delete x.dataset.dsFavBulkSelected; x.querySelector('.ds-favorites-bulk-select')?.remove(); });
  }
  function setSelecting(next) {
    state.active = !!next;
    if (!state.active) { selected.clear(); clearSelectionUi(); if (document.getElementById(BAR)?.dataset.dsFavBulk === '1') document.getElementById(BAR)?.remove(); }
    else { css(); renderBar(); selectionCards(); }
    renderLauncher();
  }
  function button(label, action, handler, primary = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.action = action;
    if (primary) b.dataset.primary = '1';
    b.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (!state.busy) handler(); });
    return b;
  }
  function renderBar() {
    if (!state.active) return;
    let bar = document.getElementById(BAR);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = BAR;
      bar.dataset.dsOwned = '1';
      bar.dataset.dsFavBulk = '1';
      const count = document.createElement('span'); count.dataset.action = 'count';
      bar.append(count,
        button('Select loaded', 'all', () => { for (const [id, card] of cards()) { const meta = cardMeta(card, id); if (meta) selected.set(id, meta); } selectionCards(); renderBar(); }),
        button('Clear', 'clear', () => { selected.clear(); selectionCards(); renderBar(); }),
        button('Unfavorite', 'unfavorite', () => runBulk('unfavorite'), true),
        button('Unfavorite + Later', 'move', () => runBulk('move')),
        button('Add to Later', 'later', () => runBulk('later')),
        button('Done', 'done', () => setSelecting(false)));
      document.body.appendChild(bar);
    }
    const count = selected.size;
    bar.querySelector('[data-action="count"]').textContent = `${count} selected`;
    for (const b of bar.querySelectorAll('button')) b.disabled = state.busy || (!count && !['all','done'].includes(b.dataset.action));
    renderLauncher();
  }

  // The existing selector anchors itself between the native search controls and NSFW.
  function headerHost() {
    const root = document.querySelector('[data-testid="SearchClientCharacterListing"]') || document.querySelector('main') || document.body;
    const nsfw = root.querySelector('[data-testid="NsfwToggle"]') ||
      [...root.querySelectorAll('label')].find(label => /\bNSFW\b/i.test(clean(label.textContent)) && label.querySelector('input[type="checkbox"]'));
    const search = root.querySelector('input[placeholder*="Dive into" i],input[placeholder*="start searching" i],input[placeholder*="search" i],input[type="search"]');
    let row = null;
    if (nsfw && search) {
      const ancestors = new Set();
      for (let n = search; n && n !== root; n = n.parentElement) ancestors.add(n);
      for (let n = nsfw; n && n !== root; n = n.parentElement) {
        if (ancestors.has(n)) { row = n; break; }
      }
    }
    if (!row || row === root) row = nsfw?.parentElement?.parentElement || null;
    let right = nsfw || null;
    if (!row) {
      const heading = [...document.querySelectorAll('h1,h2,h3')]
        .find(e => /^(?:favorites|favorite bots|favorite chatbots)$/i.test(clean(e.textContent)));
      row = heading?.parentElement || null;
      right = null;
    }
    if (!(row instanceof HTMLElement)) return null;
    while (right?.parentElement && right.parentElement !== row) right = right.parentElement;
    let host = document.getElementById(HOST);
    if (!(host instanceof HTMLElement)) {
      host = document.createElement('div'); host.id = HOST;
      host.className = 'ds-listing-header-controls'; host.dataset.dsOwned = '1';
    }
    if (right && right !== host) {
      if (host.parentElement !== row || host.nextElementSibling !== right) right.before(host);
    } else if (host.parentElement !== row) row.append(host);
    return host;
  }
  function renderLauncher() {
    if (!isEnabled()) {
      const old = document.getElementById(LAUNCHER);
      if (old?.dataset.dsFavBulk === '1') old.remove();
      return;
    }
    const host = headerHost();
    if (!host) return;
    css();
    let b = document.getElementById(LAUNCHER);
    if (b && b.dataset.dsFavBulk !== '1') { b.remove(); b = null; }
    if (!b) {
      b = button('Select bots', 'select', () => setSelecting(!state.active));
      b.id = LAUNCHER;
      b.dataset.dsOwned = '1';
      b.dataset.dsFavBulk = '1';
      b.className = 'ds-listing-header-action';
    }
    if (b.parentElement !== host) host.append(b);
    b.setAttribute('aria-pressed', String(state.active));
    b.textContent = state.active ? `Selecting (${selected.size})` : 'Select bots';
    b.disabled = state.busy;
  }

  async function getStored(key) {
    const data = await DS.storageGet?.([key]);
    return data?.[key];
  }
  // Native Favorites cleanup is an explicitly started, resumable job. Never
  // interpret locally stored Favorite History as permission to unfavorite bots.
  function cleanupCounts(job = state.cleanupJob) {
    const ids = unique((job?.ids || []).filter(safeId));
    const done = new Set(job?.confirmed || []), pending = new Set(job?.pending || []), skipped = new Set(job?.skipped || []), notFound = new Set(job?.notFound || []);
    return { total: ids.length, confirmed: done.size, pending: pending.size, skipped: skipped.size, notFound: notFound.size,
      remaining: ids.filter(id => !done.has(id) && !pending.has(id) && !skipped.has(id) && !notFound.has(id)).length };
  }
  async function storeCleanupJob() {
    if (!state.cleanupJob) return;
    state.cleanupJob.updatedAt = Date.now();
    const job = state.cleanupJob;
    const saved = await DS.storageSet?.({ [CLEANUP_KEY]: job }, { immediate: true });
    if (saved === false) throw new Error('Cleanup progress could not be saved');
    const check = await getStored(CLEANUP_KEY);
    if (check?.updatedAt !== job.updatedAt || check?.ids?.length !== job.ids.length) throw new Error('Cleanup progress could not be verified');
  }
  async function loadCleanupJob() {
    if (state.cleanupLoaded || state.cleanupLoading || !isPage()) return;
    state.cleanupLoading = true;
    try {
      const stored = await getStored(CLEANUP_KEY);
      state.cleanupJob = stored?.version === 1 && Array.isArray(stored.ids) ? stored : null;
      state.cleanupLoaded = true;
      historyControls();
    } catch (error) {
      console.warn('[SpicyChat QoL] Could not load Favorites cleanup queue', error);
      cleanupFeedback('Could not load cleanup queue; refresh the page to retry.');
    } finally { state.cleanupLoading = false; }
  }
  function cleanupFeedback(text) {
    state.cleanupStatus = text;
    const label = document.getElementById('ds-favorites-cleanup-status');
    if (label) label.textContent = text;
  }
  async function clearCleanupJob() {
    if (state.cleanupRunning) return;
    const count = cleanupCounts();
    const finished = count.total > 0 && count.confirmed === count.total && !count.pending && !count.skipped && !count.notFound;
    if (!finished && !confirm('Clear the prepared Favorites cleanup queue? Your Favorite History and Later list will be kept.')) return;
    await DS.storageSet?.({ [CLEANUP_KEY]: null }, { immediate: true });
    state.cleanupJob = null;
    state.cleanupStatus = '';
    historyControls();
  }
  async function rewindFavorites() {
    let paginator = nativePagination();
    if (!paginator) throw new Error('Native Favorites pagination not available');
    for (let i = 0; paginator.page > 1 && i < 240; i++) {
      const page = paginator.page, signature = pageSignature();
      const back = paginator.first && !paginator.first.disabled ? paginator.first : paginator.previous;
      if (!back || back.disabled) throw new Error('Could not return to page 1');
      back.click();
      const changed = await waitForPageChange(page, signature);
      if (!changed || changed >= page) throw new Error('Could not return to page 1');
      paginator = nativePagination();
      if (!paginator) throw new Error('Native pagination disappeared');
    }
    if (paginator?.page !== 1) throw new Error('Could not verify page 1');
  }
  async function runCleanupJob() {
    const job = state.cleanupJob;
    if (!job || state.busy || state.scanning || state.cleanupRunning || !isPage()) return;
    // Recovered account favorites may have no native card. The same persisted
    // cleanup queue delegates these only to the account-verified action path.
    if (job.mode === 'api') {
      if (typeof DS.runFavoriteApiCleanupJob !== 'function') {
        cleanupFeedback('Enable Favorites recovery to run this verified cleanup queue.');return;
      }
      state.cleanupRunning = true;
      historyControls();
      try { await DS.runFavoriteApiCleanupJob(job); }
      finally { state.cleanupRunning = false;state.cleanupLoaded = false;await loadCleanupJob();historyControls(); }
      return;
    }
    if (document.visibilityState === 'hidden') { cleanupFeedback('Open the Favorites tab before starting native cleanup.'); return; }
    if (!unfilteredFavorites()) { cleanupFeedback('Clear native filters and turn on NSFW before starting.'); return; }
    const counts = cleanupCounts(job);
    if (!counts.remaining) {
      cleanupFeedback(counts.notFound ? `${counts.notFound} bots were not found in the native listing. They may still be account favorites; use Retry unresolved or Full Favorites for an account check.` : 'No unattempted bots left. Scan Favorites to verify pending removals.');
      return;
    }
    const later = await getStored(DS.LATER_BOTS_KEY || 'laterBots');
    const laterIds = new Set(later?.ids || []);
    const invalid = job.ids.filter(id => !laterIds.has(id));
    if (invalid.length) { cleanupFeedback(`${invalid.length} queued bots are missing from Later. No favorites were changed.`); return; }
    if (!confirm(`Unfavorite up to ${counts.remaining} bots that are already safely saved in Later? QoL will use SpicyChat's native Favorite buttons across its pages. You can stop and resume. Nothing is deleted from Favorite History.`)) return;
    state.cleanupRunning = true;
    state.cleanupStop = false;
    state.busy = true;
    if (state.active) setSelecting(false);
    historyControls();
    const done = new Set(job.confirmed || []), pending = new Set(job.pending || []), skipped = new Set(job.skipped || []), notFound = new Set(job.notFound || []);
    // Stop as soon as every requested bot has either been handled or queued
    // for verification. Otherwise the previous pass logic revisits all pages
    // even after the counter reaches 0 (the unnecessary "victory lap").
    const hasUnattempted = () => job.ids.some(id => !done.has(id) && !pending.has(id) && !skipped.has(id) && !notFound.has(id));
    let stopReason = '', operations = 0, allPagesChecked = false;
    try {
      // Deletions can shift bots between pagination pages. Multiple passes
      // from page 1 ensure that shifting doesn't silently skip targets.
      for (let pass = 0; pass < 3 && !state.cleanupStop && isPage() && hasUnattempted(); pass++) {
        if (document.visibilityState === 'hidden') { stopReason = 'tab went into background'; break; }
        await rewindFavorites();
        const visited = new Set();
        let thisPass = 0, loadingSince = 0, reachedLastPage = false;
        for (let step = 0; step < 500 && !state.cleanupStop && isPage() && hasUnattempted(); step++) {
          const pagination = nativePagination();
          if (!pagination?.page || visited.has(pagination.page)) { stopReason = 'pagination stopped or repeated'; break; }
          if (document.visibilityState === 'hidden') { state.cleanupStop = true; stopReason = 'tab went into background'; break; }
          if (loading()) {
            if (!loadingSince) loadingSince = Date.now();
            if (Date.now() - loadingSince > 12000) { stopReason = 'page did not finish loading'; break; }
            await sleep(180); step--; continue;
          }
          loadingSince = 0;
          const page = pagination.page;
          visited.add(page);
          const matches = [...cards().entries()].filter(([id]) => job.ids.includes(id) && !done.has(id) && !pending.has(id) && !skipped.has(id) && !notFound.has(id));
          // Re-check Later membership at every page, so a changed Later list
          // cannot cause an unsafe unfavorite action.
          if (matches.length) {
            const currentLater = new Set((await getStored(DS.LATER_BOTS_KEY || 'laterBots'))?.ids || []);
            for (const [id] of matches) {
              if (state.cleanupStop || !isPage() || document.visibilityState === 'hidden') { state.cleanupStop = true; break; }
              if (!currentLater.has(id)) { stopReason = `Bot ${id} was removed from Later`; state.cleanupStop = true; break; }
              if (currentPage() !== page) break;
              const result = await nativeUnfavorite(id);
              if (result.ok) {
                if (result.tentative) pending.add(id);
                else { done.add(id); await markFormer([id], 'later-cleanup'); }
                operations++; thisPass++;
              } else if (/favorite state needs checking/i.test(result.reason || '')) {
                // This is not a confirmed API failure. The card may have been
                // unfavorited already, or its control may have been rebuilt.
                notFound.add(id);
              } else {
                skipped.add(id);
              }
              job.confirmed = [...done]; job.pending = [...pending]; job.skipped = [...skipped]; job.notFound = [...notFound];
              // Persist each mutation to make even a browser shutdown safely resumable.
              await storeCleanupJob();
              const current = cleanupCounts(job);
              cleanupFeedback(`Checking page ${page}: ${current.confirmed} verified, ${current.pending} awaiting scan, ${current.notFound} not found, ${current.remaining} left`);
              if (!hasUnattempted()) break;
              await sleep(140);
            }
          }
          if (state.cleanupStop || !hasUnattempted()) break;
          const next = nativePagination();
          if (!next?.page) { stopReason = 'pagination disappeared'; break; }
          if (next.page !== page) continue; // SpicyChat changed page after removal.
          if (!next.next || next.next.disabled) { reachedLastPage = true; break; }
          const signature = pageSignature();
          next.next.click();
          if (!await waitForPageChange(page, signature)) { stopReason = `page after ${page} did not load`; break; }
        }
        // Only report an unseen bot as 'not found in the native listing'
        // after a clean, page-1-to-last-page traversal with no shifts. This
        // NEVER means the account no longer has that favorite.
        if(reachedLastPage && visited.has(1) && !state.cleanupStop && !stopReason){
          allPagesChecked = true;
          if(thisPass === 0){
            for(const id of job.ids)if(!done.has(id) && !pending.has(id) && !skipped.has(id))notFound.add(id);
          }
        }
        if (!hasUnattempted() || thisPass === 0) break;
      }
    } catch (error) {
      stopReason = error?.message || String(error);
      console.warn('[SpicyChat QoL] Later overlap cleanup stopped', error);
    } finally {
      state.cleanupRunning = false; state.busy = false;
      job.confirmed = [...done]; job.pending = [...pending]; job.skipped = [...skipped]; job.notFound = [...notFound];
      try { await storeCleanupJob(); } catch (error) { stopReason = `Could not verify final checkpoint: ${error.message}`; }
      const count = cleanupCounts(job);
      if (count.total > 0 && count.confirmed === count.total && !count.pending && !count.skipped) {
        cleanupFeedback(`Complete: ${count.confirmed}/${count.total} favorites unfavorited. All bots remain in Later and Favorite History.`);
      } else if (!count.remaining && count.pending && !count.skipped) {
        cleanupFeedback(`${count.confirmed} verified, ${count.pending} awaiting a complete Favorites scan. No further unfavorite pass needed.`);
      } else {
        cleanupFeedback(`${state.cleanupStop ? 'Stopped' : 'Paused'}: ${count.confirmed} verified, ${count.pending} awaiting scan, ${count.notFound} not found in native listing, ${count.remaining} not attempted, ${count.skipped} failed.${allPagesChecked?' Checked through the final page.':''}${stopReason ? ` ${stopReason}` : ''}`);
      }
      historyControls();
    }
  }

  function snapshot(store) {
    return { ids: unique([...(store?.ids || [])]), meta: { ...(store?.meta || {}) } };
  }
  async function saveAndVerify(key, store, ids) {
    const result = await DS.storageSet?.({ [key]: store }, { immediate: true });
    if (result === false) throw new Error(`${key} could not be saved`);
    const saved = await getStored(key);
    if (!Array.isArray(saved?.ids) || ids.some(id => !saved.ids.includes(id))) throw new Error(`${key} save could not be verified`);
    return saved;
  }
  async function rememberFavorites(entries) {
    const key = DS.FAVORITE_BOTS_KEY || 'favoriteBots';
    const store = snapshot(await getStored(key) || DS.state.favoriteBots);
    const now = Date.now();
    for (const meta of entries) {
      if (!meta?.id) continue;
      if (!store.ids.includes(meta.id)) store.ids.push(meta.id);
      const previous = store.meta[meta.id] || {};
      store.meta[meta.id] = { ...previous, ...meta, savedAt: previous.savedAt || now,
        lastConfirmedFavoriteAt: now, favoriteMembership: 'current', removedAt: 0, removedReason: '' };
    }
    const saved = await saveAndVerify(key, store, entries.map(e => e.id));
    DS.state.favoriteBots = saved;
    DS.refreshFastLookupCaches?.();
  }
  async function syncVisibleFavorites() {
    if (state.autoSyncing || state.busy || state.scanning || !isPage() || setting('trackFavoriteBots') === false) return;
    const visible = [...cards()].filter(([,card]) => !unfilled(heartButton(card))).map(([id, card]) => cardMeta(card, id)).filter(Boolean);
    const signature = visible.map(e => e.id).sort().join(',');
    if (!signature || signature === state.visibleSignature) return;
    state.visibleSignature = signature;
    const store = DS.state.favoriteBots || { ids: [], meta: {} };
    const missing = visible.filter(e => !store.ids?.includes(e.id) || store.meta?.[e.id]?.favoriteMembership !== 'current');
    if (!missing.length) return;
    state.autoSyncing = true;
    try { await rememberFavorites(missing); }
    catch (error) { state.visibleSignature = ''; console.warn('[SpicyChat QoL] Favorites page sync failed', error); }
    finally { state.autoSyncing = false; }
  }
  async function markFormer(ids, reason) {
    if (!ids.length) return;
    const key = DS.FAVORITE_BOTS_KEY || 'favoriteBots';
    const store = snapshot(await getStored(key) || DS.state.favoriteBots);
    for (const id of ids) {
      const old = store.meta[id] || {};
      if (!store.ids.includes(id)) store.ids.push(id);
      store.meta[id] = { ...old, id, favoriteMembership: 'former', removedAt: Date.now(), removedReason: reason, lastConfirmedFavoriteAt: old.lastConfirmedFavoriteAt || Date.now() };
    }
    const saved = await saveAndVerify(key, store, ids);
    DS.state.favoriteBots = saved;
    DS.refreshFastLookupCaches?.();
  }
  async function saveLater(entries) {
    if (!entries.length) return;
    const key = DS.LATER_BOTS_KEY || 'laterBots';
    const previous = snapshot(await getStored(key) || DS.state.laterBots);
    const next = snapshot(previous);
    for (const entry of entries) {
      if (!next.ids.includes(entry.id)) next.ids.push(entry.id);
      next.meta[entry.id] = { ...(next.meta[entry.id] || {}), ...entry, savedAt: next.meta[entry.id]?.savedAt || Date.now() };
    }
    const saved = await saveAndVerify(key, next, entries.map(e => e.id));
    DS.state.laterBots = saved;
    DS.refreshFastLookupCaches?.();
    DS.updateLaterBotButtons?.();
  }
  function heartButton(card) {
    return card?.querySelector?.('[data-testid="CharacterCardOverlayActions-Favorite"] button, button[aria-label="unfavorite" i], button[aria-label="favorite" i]') || null;
  }
  function unfilled(button) {
    if (!button) return false;
    const aria = (button.getAttribute('aria-label') || '').toLowerCase();
    if (aria === 'favorite' || aria === 'like') {
      const svg = button.querySelector('svg');
      if (svg?.classList.contains('fill-transparent')) return true;
    }
    return button.getAttribute('aria-pressed') === 'false' || button.querySelector('svg.fill-transparent') != null;
  }
  async function nativeUnfavorite(id) {
    // Use native React control. Never guess an undocumented SpicyChat API endpoint.
    const card = cards().get(id);
    const heart = heartButton(card);
    if (!heart || heart.disabled || !heart.isConnected) return { ok: false, reason: 'native Favorite button not available' };
    if (unfilled(heart)) return { ok: false, reason: 'favorite state needs checking' };
    heart.click();
    for (let n = 0; n < 14; n++) {
      await sleep(180);
      const current = cards().get(id);
      const currentHeart = heartButton(current);
      if (currentHeart && unfilled(currentHeart)) return { ok: true };
      if (!current && n >= 3) {
        // Favorites pages typically remove cards immediately; this is evidence,
        // but not an API confirmation. The next complete scan will verify it.
        return { ok: true, tentative: true };
      }
    }
    return { ok: false, reason: 'native unfavorite did not visibly complete' };
  }
  async function runBulk(mode) {
    if (!selected.size || state.busy || !isPage()) return;
    const entries = [...selected.values()];
    const action = mode === 'move' ? 'Add to Later and unfavorite' : mode === 'later' ? 'Add to Later' : 'Unfavorite';
    if (!confirm(`${action} ${entries.length} selected bot${entries.length === 1 ? '' : 's'}?`)) return;
    state.busy = true;
    renderBar();
    let added = 0, removed = 0, pending = 0, failed = 0;
    try {
      // Preserve local history before any native mutation.
      await rememberFavorites(entries);
      if (mode === 'later' || mode === 'move') {
        try { await saveLater(entries); added = entries.length; }
        catch (error) { DS.setQuickStatus?.(`Could not verify Later save: ${error.message}`, true); failed = entries.length; return; }
      }
      if (mode !== 'later') {
        const confirmed = [];
        for (const entry of entries) {
          if (!isPage()) break;
          const result = await nativeUnfavorite(entry.id);
          if (result.ok) {
            if (result.tentative) pending++;
            else { confirmed.push(entry.id); removed++; }
            selected.delete(entry.id);
          } else failed++;
          await sleep(120);
        }
        if (confirmed.length) await markFormer(confirmed, 'bulk-unfavorite');
        // Tentative removals remain Current until a complete scan confirms.
      } else entries.forEach(entry => selected.delete(entry.id));
      DS.setQuickStatus?.(`Later: ${added}; unfavorited: ${removed}; awaiting scan: ${pending}; failed: ${failed}.`, true);
    } catch (error) {
      console.warn('[SpicyChat QoL] Favorites bulk action failed', error);
      DS.setQuickStatus?.(`Favorites action failed: ${error.message || error}`, true);
    } finally {
      state.busy = false;
      if (!selected.size) setSelecting(false);
      else { selectionCards(); renderBar(); }
      DS.bumpDomRevision?.();
      DS.updateQuickPanel?.();
    }
  }

  function nativeCount() {
    // This is the result count for the selected native Chatbots tab, not the
    // number of cards currently mounted. Never use it to guess favorite status
    // after a filtered or incomplete scan.
    const root = document.querySelector('[data-testid="SearchClientCharacterListing"]') || document;
    for (const el of root.querySelectorAll('[data-testid="AppliedFiltersBarView-ResultCount"], [data-testid*="ResultCount"], .ais-Stats-text')) {
      const match = clean(el.textContent).match(/([\d,]+)\s+(?:results?|favorites?|bots?)\b/i);
      if (match) return Number(match[1].replaceAll(',', ''));
    }
    return null;
  }
  function accountFavoriteCount() {
    // Account-wide count is not the same as the searchable Chatbots results.
    // SpicyChat exposes both, and private/unavailable bots can make them differ.
    const element = document.querySelector('[data-testid="FavoriteCharactersCount-Total"]');
    const text = clean(element?.textContent || '');
    const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)\s*favorites?\b/i);
    if (!match) return null;
    const count = Number(match[1].replace(/,/g, ''));
    const limit = Number(match[2].replace(/,/g, ''));
    return Number.isSafeInteger(count) && Number.isSafeInteger(limit) ? { count, limit } : null;
  }
  function countComparison(listing, account) {
    if (!account) return '';
    if (listing === null) return ` · Account ${account.count}/${account.limit} (listing count unavailable)`;
    const hidden = account.count - listing;
    return ` · Account ${account.count}/${account.limit}` +
      (hidden > 0 ? ` · ${hidden} not returned by the Chatbots listing` :
       hidden < 0 ? ' · listing count exceeds account counter' : ' · account count agrees');
  }
  function unfilteredFavorites() {
    const root = document.querySelector('[data-testid="SearchClientCharacterListing"]') || document;
    const search = root.querySelector('input[placeholder*="Dive into" i],input[placeholder*="start searching" i],input[type="search"]');
    if (search?.value?.trim()) return false;
    if (root.querySelector('[data-testid="NsfwToggle-Input"]')?.checked === false) return false;
    if (root.querySelector('[data-testid^="AppliedFilterChipItem-"]')) return false;
    if (root.querySelector('[data-testid^="TagsCapabilityGate-Option-"] input:checked')) return false;
    if (root.querySelector('[data-testid="tab-chatbots"]')?.getAttribute('aria-selected') === 'false') return false;
    return true;
  }
  function loading() {
    const root = document.querySelector('[data-testid="SearchClientCharacterListing"]') || document;
    return !!root.querySelector('[aria-busy="true"], [data-testid*="Loading"], [data-testid*="Spinner"]');
  }
  // QoL may add its own numbered page buttons. Use SpicyChat's native
  // pagination only, since the QoL clones can reload the whole tab.
  function nativePagination() {
    const next = document.querySelector('button[aria-label="next-page"]');
    const parent = next?.parentElement;
    if (!parent || !parent.querySelector('button[aria-label="previous-page"]')) return null;
    const numbered = [...parent.querySelectorAll('button[aria-label^="page-"]:not([data-ds-pagination-qol="1"])')];
    const current = numbered.find(b => /^page-\d+$/.test(b.getAttribute('aria-label') || '') &&
      (b.getAttribute('aria-current') === 'page' || b.classList.contains('bg-blue-10')));
    const page = Number(current?.getAttribute('aria-label')?.slice(5)) || 0;
    return { next, parent, page, first: numbered.find(b => b.getAttribute('aria-label') === 'page-1'), previous: parent.querySelector('button[aria-label="previous-page"]') };
  }
  function currentPage() { return nativePagination()?.page || 0; }
  function pageSignature() {
    return [...cards().keys()].sort().join(',');
  }
  async function waitForPageChange(previousPage, previousSignature) {
    // Wait until both the native paginator AND the data have changed.
    // A page-number change alone can precede the React card update.
    const deadline = Date.now() + 12000;
    let stable = 0;
    while (Date.now() < deadline && !state.cancelScan && isPage()) {
      const page = currentPage();
      const signature = pageSignature();
      if (page && page !== previousPage && signature && signature !== previousSignature && !loading()) {
        if (++stable >= 2) return page;
      } else stable = 0;
      await sleep(120);
    }
    return 0;
  }
  function scanStatusLabel(message) {
    const value = String(message || '');
    const seen = value.match(/^Listing verified: ([\d,]+)\s*\/\s*([\d,]+)/i);
    const missing = value.match(/ · ([\d,]+) not returned by the Chatbots listing/i);
    if (seen) return `Listing checked ${seen[1]}/${seen[2]}` +
      (missing ? ` · ${missing[1]} account favorites not listed` : ' · account total not verified');
    return value;
  }
  function setScanStatus(message, announce = false) {
    state.status = message;
    const label = document.getElementById('ds-favorites-scan-status');
    if (label) { label.textContent = scanStatusLabel(message); label.title = message; }
    if (announce) DS.setQuickStatus?.(message, true);
  }
  async function scanFavorites() {
    if (state.scanning || state.cleanupRunning || !scanEnabled() || document.visibilityState === 'hidden') return;
    state.scanning = true;
    state.cancelScan = false;
    const button = document.getElementById('ds-favorites-scan');
    if (button) button.textContent = 'Cancel scan';
    const entries = new Map();
    const visited = new Set();
    let complete = false, expected = null, stopReason = '';
    let initialResultCount = null, initialAccount = null;
    try {
      if (!unfilteredFavorites()) {
        throw new Error('Clear native filters and turn on NSFW before scanning all favorites.');
      }
      let paginator = nativePagination();
      if (!paginator) throw new Error('Native Favorites pagination was not found. No scan was saved.');
      // Always start from the beginning so scanning from page 2+ cannot
      // accidentally omit the first page.
      for (let rewind = 0; paginator.page > 1 && rewind < 240; rewind++) {
        const prevPage = paginator.page;
        const signature = pageSignature();
        const toFirst = paginator.first && !paginator.first.disabled ? paginator.first : paginator.previous;
        if (!toFirst || toFirst.disabled) throw new Error('Could not return to the first page.');
        toFirst.click();
        const now = await waitForPageChange(prevPage, signature);
        if (!now || now >= prevPage) throw new Error('Favorites did not switch to an earlier page.');
        paginator = nativePagination();
        if (!paginator) throw new Error('Native page controls disappeared.');
      }
      if (paginator.page !== 1) throw new Error('Could not confirm page 1.');
      initialResultCount = nativeCount();
      initialAccount = accountFavoriteCount();
      // A scan can span many page switches. Never classify missing IDs as
      // former when filters, backend page caps, or interrupted loading exist.
      for (let step = 0; step < 1000 && !state.cancelScan && isPage(); step++) {
        paginator = nativePagination();
        if (!paginator?.page) { stopReason = 'pagination disappeared'; break; }
        const page = paginator.page;
        if (visited.has(page)) { stopReason = `page ${page} repeated`; break; }
        if (loading()) { await sleep(180); step--; continue; }
        const currentCards = cards();
        if (!currentCards.size && nativeCount() !== 0) { stopReason = `page ${page} had no cards`; break; }
        const newlySeen = [];
        for (const [id, card] of currentCards) {
          if (unfilled(heartButton(card))) continue;
          const meta = cardMeta(card, id);
          if (!meta) continue;
          if (!entries.has(id)) newlySeen.push(meta);
          entries.set(id, meta);
        }
        visited.add(page);
        const count = nativeCount();
        if (count !== null && (expected === null || count > expected)) expected = count;
        setScanStatus(`Scanning page ${page} · ${entries.size}${expected === null ? '' : ` / ${expected}`} listed${initialAccount ? ` · account ${initialAccount.count}` : ''}`);
        // Save every complete page. Unexpected navigation/errors will still
        // leave confirmed discoveries in Favorite History.
        if (newlySeen.length) await rememberFavorites(newlySeen);
        if (expected !== null && entries.size === expected && unfilteredFavorites()) { complete = true; break; }
        if (expected !== null && entries.size > expected) { stopReason = 'more unique cards than the reported result count'; break; }
        if (state.cancelScan) break;
        if (!paginator.next || paginator.next.disabled) {
          stopReason = `native pagination ended at page ${page}`;
          break;
        }
        const signature = pageSignature();
        paginator.next.click();
        const changed = await waitForPageChange(page, signature);
        if (!changed) { stopReason = `page ${page + 1} did not finish loading`; break; }
        if (changed <= page) { stopReason = 'pagination did not advance'; break; }
      }
      // Listing completeness and account completeness are separate checks.
      // A successful listing scan can contain fewer bots than the account-wide
      // counter. Do not classify the difference as removed or unavailable.
      const finalResultCount = nativeCount();
      const finalAccount = accountFavoriteCount();
      const listingStable = expected !== null && finalResultCount === expected &&
        (initialResultCount === null || initialResultCount === expected);
      const accountStable = !!initialAccount && !!finalAccount &&
        initialAccount.count === finalAccount.count && initialAccount.limit === finalAccount.limit;
      if (!listingStable || (initialAccount && !accountStable)) {
        complete = false;
        stopReason = !listingStable ? 'SpicyChat listing count changed during scan' : 'account Favorites counter changed during scan';
      }
      const listingVerified = complete && !state.cancelScan && entries.size === expected;
      const accountVerified = listingVerified && accountStable && finalAccount.count === entries.size;
      // A verified searchable listing is useful for Later actions, but it is
      // NOT proof that absent account-wide favorites were removed.
      if (listingVerified) {
        await DS.storageSet?.({ [SCAN_STATE_KEY]: {
          lastCompleteAt: Date.now(), count: entries.size, pages: visited.size,
          ids: [...entries.keys()], listingCount: expected, listingVerified: true,
          accountCount: finalAccount?.count ?? null, accountLimit: finalAccount?.limit ?? null,
          accountVerified
        } }, { immediate: true });
        // Reconcile pending native unfavorites only when the full ACCOUNT is
        // verified. Missing entries in a restricted listing are ambiguous.
        if (accountVerified && state.cleanupJob?.pending?.length) {
          const stillCurrent = new Set(entries.keys());
          const confirmed = state.cleanupJob.pending.filter(id => !stillCurrent.has(id));
          if (confirmed.length) await markFormer(confirmed, 'later-cleanup-verified');
          state.cleanupJob.confirmed = unique([...(state.cleanupJob.confirmed || []), ...confirmed]);
          // Any attempted bot still present after a verified complete scan
          // remains eligible for a later native retry.
          state.cleanupJob.pending = [];
          await storeCleanupJob();
        }
      }
      const description = listingVerified ? (accountVerified ? 'Verified account' : 'Listing verified') : state.cancelScan ? 'Stopped' : 'Partial';
      const detail = listingVerified ? (finalAccount && !accountVerified ? ' · Account-wide scan not verified; missing bots kept in history' : '') :
        ` · ${stopReason || 'not all pages were verified'}`;
      setScanStatus(`${description}: ${entries.size}${expected === null ? '' : ` / ${expected}`} visible favorites across ${visited.size} page${visited.size === 1 ? '' : 's'}${countComparison(expected, finalAccount)}${detail}.`, true);
    } catch (error) {
      setScanStatus(`Favorites scan stopped: ${error?.message || error}`, true);
    } finally {
      state.scanning = false;
      if (button) button.textContent = 'Scan Favorites';
      // Preserve the user's current scroll position; don't force scrolling.
    }
  }
  function historyControls() {
    if (!isPage()) {
      document.getElementById('ds-favorites-manager-tools')?.remove();
      return;
    }
    if (!scanEnabled() && !state.cleanupJob) {
      document.getElementById('ds-favorites-manager-tools')?.remove();
      return;
    }
    const heading = [...document.querySelectorAll('h1,h2,h3')]
      .find(el => /^(?:favorites|favorite bots|favorite chatbots)$/i.test(clean(el.textContent)));
    const target = heading || document.getElementById('ds-favorite-history-button-wrap');
    if (!target?.parentElement) return;
    let host = document.getElementById('ds-favorites-manager-tools');
    if (!host) {
      host = document.createElement('div'); host.id = 'ds-favorites-manager-tools'; host.dataset.dsOwned = '1';
      host.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;';
    }
    let scan = document.getElementById('ds-favorites-scan');
    let scanStatus = document.getElementById('ds-favorites-scan-status');
    if (scanEnabled()) {
      if (!scan) { scan = button('Scan Favorites','scan',() => state.scanning ? (state.cancelScan = true) : scanFavorites()); scan.id = 'ds-favorites-scan'; host.append(scan); }
      if (!scanStatus) { scanStatus = document.createElement('span'); scanStatus.id = 'ds-favorites-scan-status'; host.append(scanStatus); }
      scanStatus.textContent = scanStatusLabel(state.status);
      scanStatus.title = state.status;
    } else { scan?.remove(); scanStatus?.remove(); }
    let start = document.getElementById('ds-favorites-cleanup-start');
    let clear = document.getElementById('ds-favorites-cleanup-clear');
    let retry = document.getElementById('ds-favorites-cleanup-retry');
    let status = document.getElementById('ds-favorites-cleanup-status');
    if (state.cleanupJob?.ids?.length) {
      if (!start) { start = document.createElement('button'); start.type = 'button'; start.dataset.action = 'cleanup'; start.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (state.cleanupRunning) { state.cleanupStop = true; DS.stopFavoriteApiCleanupJob?.(); } else void runCleanupJob(); }); start.id = 'ds-favorites-cleanup-start'; host.append(start); }
      if (!clear) { clear = button('Clear cleanup queue', 'clear-cleanup', clearCleanupJob); clear.id = 'ds-favorites-cleanup-clear'; host.append(clear); }
      if (!retry) { retry = button('Retry unresolved', 'retry-cleanup', async () => { if (state.cleanupRunning || !state.cleanupJob) return; state.cleanupJob.skipped = []; state.cleanupJob.notFound = []; await storeCleanupJob(); state.cleanupStatus = ''; historyControls(); }); retry.id = 'ds-favorites-cleanup-retry'; host.append(retry); }
      if (!status) { status = document.createElement('span'); status.id = 'ds-favorites-cleanup-status'; host.append(status); }
      const count = cleanupCounts();
      const finished = count.total > 0 && count.confirmed === count.total && !count.pending && !count.skipped && !count.notFound;
      start.textContent = state.cleanupRunning ? 'Stop after current bot' : finished ? 'Cleanup complete' : count.remaining ? `Unfavorite Later overlap (${count.remaining})` : 'Awaiting verification';
      start.disabled = !state.cleanupRunning && !count.remaining;
      clear.textContent = finished ? 'Dismiss finished queue' : 'Clear cleanup queue';
      clear.disabled = state.cleanupRunning;
      retry.textContent = `Retry unresolved (${count.skipped + count.notFound})`;
      retry.disabled = state.cleanupRunning || !(count.skipped + count.notFound);
      status.textContent = state.cleanupStatus || (finished
        ? `Complete: ${count.confirmed}/${count.total} favorites unfavorited.`
        : `${count.confirmed} verified · ${count.pending} awaiting scan · ${count.notFound} not found · ${count.remaining} to process · ${count.skipped} failed`);
    } else { start?.remove(); clear?.remove(); retry?.remove(); status?.remove(); }
    if (target.nextElementSibling !== host) target.after(host);
  }
  function handleCardClick(event) {
    if (!state.active || !isPage() || state.busy || !(event.target instanceof Element)) return;
    if (event.target.closest(`#${BAR},#${LAUNCHER},#ds-favorites-manager-tools,#ds-qol-panel`)) return;
    const card = event.target.closest('[data-testid="CharacterCard"],[data-testid="ChatbotCard"],div.relative.group');
    if (!card) return;
    const meta = cardMeta(card);
    if (!meta) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    if (selected.has(meta.id)) selected.delete(meta.id);
    else selected.set(meta.id, meta);
    selectionCards(); renderBar();
  }
  function cleanup() {
    setSelecting(false);
    if (document.getElementById(LAUNCHER)?.dataset.dsFavBulk === '1') document.getElementById(LAUNCHER)?.remove();
    document.getElementById('ds-favorites-manager-tools')?.remove();
    const host = document.getElementById(HOST);
    if (host && !host.childElementCount) host.remove();
    state.visibleSignature = '';
    state.cleanupStop = true;
    state.cleanupLoaded = false;
    if (!state.cleanupRunning) state.cleanupJob = null;
    state.observer?.disconnect(); state.observer = null;
    clearTimeout(state.refreshTimer); state.refreshTimer = null;
  }
  function refresh() {
    if (!isPage()) { if (state.observer || state.active || document.getElementById(LAUNCHER)) cleanup(); return; }
    css();
    if (isEnabled()) { renderLauncher(); if (state.active) { selectionCards(); renderBar(); } }
    else { if (state.active) setSelecting(false); renderLauncher(); }
    historyControls();
    DS.refreshFavoritesLaterTab?.();
    void loadCleanupJob();
    if (!DS.isLaterFavoritesTabActive?.()) void syncVisibleFavorites();
    if (!state.observer) {
      const root = document.querySelector('[data-testid="SearchClientCharacterListing"]') || document.body;
      if (!root) return;
      state.observer = new MutationObserver(mutations => {
        if (!mutations.some(m => [...m.addedNodes].some(n => n instanceof Element && !n.closest?.('[data-ds-owned="1"]')))) return;
        if (state.refreshTimer) return;
        state.refreshTimer = setTimeout(() => { state.refreshTimer = null; if (isPage()) { renderLauncher(); historyControls(); if (state.active) selectionCards(); void syncVisibleFavorites(); } }, 300);
      });
      state.observer.observe(root, { childList: true, subtree: true });
    }
  }
  document.addEventListener('click', handleCardClick, true);
  window.addEventListener('popstate', () => setTimeout(refresh, 150));
  document.addEventListener('click', e => { if (e.target.closest?.('a[href]')) setTimeout(refresh, 200); }, true);
  // Called by the existing Favorites lifecycle (no permanent polling on other pages).
  DS.refreshFavoritesBulkManager = refresh;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
})();
}

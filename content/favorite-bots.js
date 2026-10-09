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
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A-Z</option><option value="creator">Creator A-Z</option>
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
    const folders = enabled && settings.favoritePageFoldersEnabled;
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
        for (const [id,label] of [["native","SpicyChat order"],["newest","QoL newest first"],["oldest","QoL oldest first"]]) {
          const opt = document.createElement("option");opt.value=id;opt.textContent=label;sortSelect.appendChild(opt);
        }
        sortSelect.value = favoritePageSort;
        sortSelect.addEventListener("change", () => { favoritePageSort = sortSelect.value; applyFavoritePageExtras(); });
        controls.appendChild(sortSelect);
      }
      const help = document.createElement("small");
      help.textContent = "Only loaded cards · QoL saved dates may be first-seen dates";
      controls.appendChild(help);
    }
    const orgMeta = DS.state?.botOrganization?.meta || {};
    const favoriteMeta = DS.state?.favoriteBots?.meta || {};
    const entries = (DS.collectCards?.() || []).map((item,i) => {
      const id = DS.botIdFromHref?.(item.anchor?.href || "") || DS.chatIdFromHref?.(item.anchor?.href || "");
      const target = DS.getBestHideTarget?.(item.card) || item.card;
      return { ...item, id, target, index: i, savedAt: Number(favoriteMeta[id]?.savedAt || 0) || 0 };
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
        group.sort((a,b) => favoritePageSort === "oldest"
          ? (a.savedAt || Number.MAX_SAFE_INTEGER) - (b.savedAt || Number.MAX_SAFE_INTEGER) || a.index-b.index
          : (b.savedAt || 0) - (a.savedAt || 0) || a.index-b.index);
        group.forEach((item, i) => { item.target.style.order = String(i); });
      }
    }
  }

  DS.applyFavoriteHistoryButton = function applyFavoriteHistoryButton() {
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
      !settings.trackFavoriteBots ||
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

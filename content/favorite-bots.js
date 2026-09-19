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

  DS.applyFavoriteHistoryButton = function applyFavoriteHistoryButton() {
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
      existingWrap.previousElementSibling === heading
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
    heading.insertAdjacentElement("afterend", wrap);
  };

  DS.removeFavoriteHistoryButton = function removeFavoriteHistoryButton() {
    document.getElementById("ds-favorite-history-open")?.remove();
    document.getElementById("ds-favorite-history-button-wrap")?.remove();
    document.getElementById("ds-favorite-history-modal")?.remove();
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

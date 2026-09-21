(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function normalizeHandle(value) {
    let text = String(value || "").trim();
    try { text = decodeURIComponent(text); } catch {}
    return text
      .replace(/^https?:\/\/[^/]+\/creator\//i, "")
      .replace(/^\/?creator\//i, "")
      .replace(/[?#].*$/g, "")
      .replace(/\/+$/g, "")
      .replace(/^@+/, "")
      .trim()
      .toLowerCase();
  }

  function creatorHandleFromHref(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/creator\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  }

  function currentCreatorHandle() {
    const match = String(location.pathname || "").match(/^\/creator\/([^/?#]+)/i);
    return match ? normalizeHandle(decodeURIComponent(match[1])) : "";
  }


  function normalizePreferences(value) {
    const raw = value && typeof value === "object" ? value : {};
    return {
      showOpenedBots: !!raw.showOpenedBots,
      showLaterBots: !!raw.showLaterBots,
      ignoreLanguageFilter: !!raw.ignoreLanguageFilter,
      ignoreTagWordFilters: !!raw.ignoreTagWordFilters,
      showAllBots: !!raw.showAllBots
    };
  }

  function normalizeFavoriteStore(value) {
    const source = value && typeof value === "object" ? value : {};
    const handles = DS.uniqueClean(
      Array.isArray(source.handles)
        ? source.handles.map(normalizeHandle)
        : []
    );

    const rawMeta = source.meta && typeof source.meta === "object" ? source.meta : {};
    const meta = {};
    for (const [rawKey, item] of Object.entries(rawMeta)) {
      const key = normalizeHandle(rawKey || item?.handle || "");
      if (!key) continue;
      const sourceItem = item && typeof item === "object" ? item : {};
      meta[key] = { ...sourceItem, handle: key, preferences: normalizePreferences(sourceItem.preferences) };
    }

    return { handles, meta };
  }

  function getStore() {
    DS.state.favoriteCreators = normalizeFavoriteStore(DS.state.favoriteCreators);
    return DS.state.favoriteCreators;
  }

  function getCreatorLabel(anchor, handle) {
    const text = String(anchor?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    return text || `@${handle}`;
  }

  function buttonIcon(isFavorite) {
    return isFavorite ? "★" : "☆";
  }

  function buttonTitle(isFavorite, label) {
    return isFavorite
      ? `Remove ${label} from favorite creators`
      : `Add ${label} to favorite creators`;
  }

  function updateOneButton(button) {
    const handle = normalizeHandle(button.dataset.dsCreatorHandle);
    const store = getStore();
    const isFavorite = store.handles.includes(handle);
    const label = button.dataset.dsCreatorLabel || `@${handle}`;

    const icon = buttonIcon(isFavorite);
    const favoriteValue = isFavorite ? "1" : "0";
    const title = buttonTitle(isFavorite, label);
    let changed = 0;
    if (button.textContent !== icon) { button.textContent = icon; changed++; }
    if (button.dataset.dsFavorite !== favoriteValue) { button.dataset.dsFavorite = favoriteValue; changed++; }
    if (button.title !== title) { button.title = title; changed++; }
    if (button.getAttribute("aria-label") !== title) { button.setAttribute("aria-label", title); changed++; }
    return changed;
  }

  async function toggleCreatorFavorite(anchor, button) {
    const handle = normalizeHandle(button?.dataset.dsCreatorHandle || creatorHandleFromHref(anchor?.href || ""));
    if (!handle) return;

    const label = button?.dataset?.dsCreatorLabel || getCreatorLabel(anchor, handle);
    const store = getStore();
    const exists = store.handles.includes(handle);

    if (exists) {
      store.handles = store.handles.filter(item => item !== handle);
      delete store.meta[handle];
    } else {
      store.handles.push(handle);
      store.meta[handle] = {
        ...(store.meta[handle] || {}),
        handle,
        name: label,
        url: `https://spicychat.ai/creator/${encodeURIComponent(handle)}`,
        savedAt: Date.now(),
        preferences: normalizePreferences(store.meta[handle]?.preferences)
      };
    }

    store.handles = DS.uniqueClean(store.handles.map(normalizeHandle));

    await DS.storageSet({
      [DS.FAVORITE_CREATORS_KEY]: store
    });

    DS.state.favoriteCreators = store;
    DS.updateCreatorFavoriteButtons?.();
    DS.updateQuickPanel?.();
  }

  DS.normalizeCreatorStore = normalizeFavoriteStore;
  DS.creatorHandleFromHref = creatorHandleFromHref;
  DS.currentCreatorHandle = currentCreatorHandle;

  DS.getFavoriteCreatorPreferences = function getFavoriteCreatorPreferences(handleOrHref) {
    const handle = normalizeHandle(
      String(handleOrHref || "").includes("/creator/")
        ? creatorHandleFromHref(handleOrHref)
        : handleOrHref
    );
    if (!handle || !getStore().handles.includes(handle)) return null;
    return normalizePreferences(getStore().meta?.[handle]?.preferences);
  };

  DS.favoriteCreatorContextForCard = function favoriteCreatorContextForCard(card) {
    if (!card) return null;
    const pageHandle = currentCreatorHandle();
    if (pageHandle && DS.isFavoriteCreator?.(pageHandle)) {
      return { handle: pageHandle, preferences: DS.getFavoriteCreatorPreferences(pageHandle) || normalizePreferences(null) };
    }
    for (const anchor of DS.qsa("a[href*='/creator/']", card)) {
      const handle = normalizeHandle(creatorHandleFromHref(anchor.href || ""));
      if (!handle || !DS.isFavoriteCreator?.(handle)) continue;
      return { handle, preferences: DS.getFavoriteCreatorPreferences(handle) || normalizePreferences(null) };
    }
    return null;
  };

  DS.isFavoriteCreator = function isFavoriteCreator(handleOrHref) {
    const handle = normalizeHandle(
      String(handleOrHref || "").includes("/creator/")
        ? creatorHandleFromHref(handleOrHref)
        : handleOrHref
    );

    return !!handle && getStore().handles.includes(handle);
  };

  DS.cardHasFavoriteCreator = function cardHasFavoriteCreator(card) {
    if (!card) return false;

    for (const anchor of DS.qsa("a[href*='/creator/']", card)) {
      const handle = creatorHandleFromHref(anchor.href || "");
      if (handle && DS.isFavoriteCreator(handle)) return true;
    }

    return false;
  };

  DS.removeCreatorFavoriteButtons = function removeCreatorFavoriteButtons() {
    DS.qsa(".ds-creator-fav-button").forEach(button => button.remove());
    DS.qsa(".ds-chat-creator-favorite-inline").forEach(host => {
      host.classList.remove("ds-chat-creator-favorite-inline");
    });
  };

  DS.updateCreatorFavoriteButtons = function updateCreatorFavoriteButtons() {
    const token = DS.diagOperationStart?.("creator-favorites", "update");
    let scanned = 0;
    let changed = 0;
    let skipped = 0;
    const { settings } = DS.state;

    if (!settings.enabled || settings.showCreatorFavoriteButtons === false) {
      const before = DS.qsa(".ds-creator-fav-button").length;
      DS.removeCreatorFavoriteButtons();
      DS.diagOperationEnd?.(token, { scanned: before, changed: before, skipped: 0 });
      return;
    }

    for (const anchor of DS.qsa("a[href*='/creator/']")) {
      scanned++;
      if (anchor.closest("#ds-qol-panel") || anchor.closest(".ds-creator-fav-row")) {
        skipped++;
        continue;
      }

      const handle = normalizeHandle(creatorHandleFromHref(anchor.href || ""));
      if (!handle) { skipped++; continue; }

      if (anchor.matches("a[aria-label='creator-profile']") && anchor.parentElement && !anchor.parentElement.classList.contains("ds-chat-creator-favorite-inline")) {
        anchor.parentElement.classList.add("ds-chat-creator-favorite-inline");
        changed++;
      }

      let button = anchor.parentElement?.querySelector?.(`:scope > .ds-creator-fav-button[data-ds-creator-handle="${CSS.escape(handle)}"]`) || null;

      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "ds-creator-fav-button";
        DS.markQolOwned?.(button, "creator-favorites");
        button.dataset.dsCreatorHandle = handle;
        button.dataset.dsCreatorLabel = getCreatorLabel(anchor, handle);
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          toggleCreatorFavorite(anchor, button);
        });

        anchor.insertAdjacentElement("afterend", button);
        changed++;
      } else {
        DS.markQolOwned?.(button, "creator-favorites");
      }

      const nextLabel = getCreatorLabel(anchor, handle);
      if (button.dataset.dsCreatorLabel !== nextLabel) { button.dataset.dsCreatorLabel = nextLabel; changed++; }
      changed += updateOneButton(button);
    }

    // Creator profile pages do not have a creator link in the page heading.
    // Add one favorite control to the heading itself so the creator can still
    // be favorited (and visibly recognized as favorite) even when every bot
    // card is currently hidden by QoL filters.
    const pageHandle = currentCreatorHandle();
    if (pageHandle) {
      const titleText = document.querySelector('[data-translate-key="creator:page.title"]');
      const titleHost = titleText?.parentElement || null;
      if (titleHost && !titleHost.closest("#ds-qol-panel")) {
        let pageButton = titleHost.querySelector(`:scope > .ds-creator-fav-button[data-ds-creator-page="1"]`);
        if (!pageButton) {
          pageButton = document.createElement("button");
          pageButton.type = "button";
          pageButton.className = "ds-creator-fav-button ds-creator-fav-page-button";
          DS.markQolOwned?.(pageButton, "creator-favorites");
          pageButton.dataset.dsCreatorPage = "1";
          pageButton.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            toggleCreatorFavorite(titleText, pageButton);
          });
          titleHost.appendChild(pageButton);
          changed++;
        } else {
          DS.markQolOwned?.(pageButton, "creator-favorites");
        }

        if (pageButton.dataset.dsCreatorHandle !== pageHandle) { pageButton.dataset.dsCreatorHandle = pageHandle; changed++; }
        const pageLabel = `@${pageHandle}`;
        if (pageButton.dataset.dsCreatorLabel !== pageLabel) { pageButton.dataset.dsCreatorLabel = pageLabel; changed++; }
        changed += updateOneButton(pageButton);
      }
    }
    DS.diagOperationEnd?.(token, { scanned, changed, skipped });
  };
})();

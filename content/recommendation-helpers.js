(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const OWN_HANDLES_KEY = "dsOwnCreatorHandles";
  const SESSION_BUTTON_CLASS = "ds-recommendation-session-hide";
  const REASON_CLASS = "ds-recommendation-reason";
  const sessionHidden = new Set();
  let ownHandles = new Set();
  let ownHandlesLoaded = false;

  function handleFromHref(href) {
    try {
      const match = new URL(href, location.origin).pathname.match(/^\/creator\/([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]).toLowerCase() : "";
    } catch { return ""; }
  }

  function cardHandle(card) {
    return handleFromHref(card?.querySelector?.("a[href*='/creator/']")?.href || "");
  }

  async function loadOwnHandles() {
    if (ownHandlesLoaded) return;
    ownHandlesLoaded = true;
    try {
      const result = await DS.storageGet?.([OWN_HANDLES_KEY]);
      ownHandles = new Set((Array.isArray(result?.[OWN_HANDLES_KEY]) ? result[OWN_HANDLES_KEY] : []).map(value => String(value).toLowerCase()).filter(Boolean));
    } catch {}
  }

  async function captureOwnHandles() {
    if (!DS.isMyCreationsChatbotsPage?.()) return;
    await loadOwnHandles();
    let changed = false;
    for (const anchor of document.querySelectorAll("a[href*='/creator/']")) {
      const handle = handleFromHref(anchor.href || "");
      if (handle && !ownHandles.has(handle)) {
        ownHandles.add(handle);
        changed = true;
      }
    }
    if (changed) {
      try { await DS.storageSet?.({ [OWN_HANDLES_KEY]: [...ownHandles] }); } catch {}
    }
  }

  function isRecommendationContext(card, context = {}) {
    if (context.recommendations) return true;
    if (/^\/recommended-bots\/?$/i.test(location.pathname)) return true;
    return !!((DS.isHomePage?.() || context.home) && DS.cardHasForYouBadge?.(card));
  }

  function cardTags(card) {
    const values = [...card.querySelectorAll("[data-testid^='TagSuggestionItem-'], a[aria-label^='tag-'], button[class*='cursor-default'][aria-label] > span")].map(el => String(el.dataset?.dsTagAliasOriginal || el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    return [...new Set(values.map(tag => DS.resolveTagAlias?.(tag) || tag))];
  }

  function configuredTags(value) {
    return String(value || "").split(/[\n,;]+/).map(tag => tag.trim()).filter(Boolean).map(tag => (DS.resolveTagAlias?.(tag) || tag).toLowerCase());
  }

  function hasConfiguredTag(card, value) {
    const wanted = new Set(configuredTags(value));
    if (!wanted.size) return false;
    return cardTags(card).some(tag => wanted.has(String(tag).toLowerCase()));
  }

  function isNotInterested(id) {
    const src = DS.state?.notInterestedBots || {};
    return !!(id && (src.ids?.includes?.(id) || src.meta?.[id]));
  }

  function isFavoriteCreator(card) {
    const handle = cardHandle(card);
    if (!handle) return false;
    const src = DS.state?.favoriteCreators || {};
    const handles = Array.isArray(src.handles) ? src.handles.map(v => String(v).replace(/^@/, "").toLowerCase()) : [];
    return handles.includes(handle) || !!src.meta?.[handle] || !!src.meta?.[`@${handle}`];
  }

  DS.shouldHideRecommendationCard = function shouldHideRecommendationCard(card, anchor, context = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enableRecommendationHelpers || !isRecommendationContext(card, context)) return null;
    const id = DS.chatIdFromHref?.(anchor?.href || "") || "";

    if (id && sessionHidden.has(id)) return "recommendation: hidden this session";
    if (!context.ignoreFavorite && settings.recommendationHideFavoriteBots && id && DS.state.favoriteBotIdSet?.has(id)) return "recommendation: already favorite";
    if (!context.ignoreLater && settings.recommendationHideLaterBots && id && DS.state.laterBotIdSet?.has(id)) return "recommendation: already in Later";
    if (settings.recommendationHideNotInterested && isNotInterested(id)) return "recommendation: Not Interested";
    if (settings.recommendationAvoidTags && hasConfiguredTag(card, settings.recommendationAvoidTags)) return "recommendation: avoided tag";
    if (!context.ignoreOpened && settings.recommendationOnlyUnopened && id && DS.state.openedChats?.has(id)) return "recommendation: already opened";
    if (settings.recommendationOnlyLorebook && !DS.cardHasLorebook?.(card)) return "recommendation: no Lorebook";
    if (settings.recommendationHideOwnBots) {
      const handle = cardHandle(card);
      if (handle && ownHandles.has(handle)) return "recommendation: your own bot";
    }
    return null;
  };

  function removeUi() {
    document.querySelectorAll(`.${SESSION_BUTTON_CLASS}`).forEach(button => button.remove());
    document.querySelectorAll(`.${REASON_CLASS}`).forEach(node => node.remove());
    document.querySelectorAll("[data-ds-recommendation-order]").forEach(card => { card.style.order = ""; delete card.dataset.dsRecommendationOrder; });
    document.querySelectorAll("[data-ds-recommendation-position]").forEach(card => { card.style.position = card.dataset.dsRecommendationPosition || ""; delete card.dataset.dsRecommendationPosition; });
    document.getElementById("ds-recommendation-toolbar")?.remove();
  }

  function addSessionButtons() {
    const settings = DS.state?.settings || {};
    if (!settings.recommendationSessionHideButtons) {
      document.querySelectorAll(`.${SESSION_BUTTON_CLASS}`).forEach(button => button.remove());
      return;
    }
    for (const { card, anchor } of DS.collectCards?.() || []) {
      if (!isRecommendationContext(card)) continue;
      const id = DS.chatIdFromHref?.(anchor.href || "");
      if (!id || card.querySelector(`.${SESSION_BUTTON_CLASS}`)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = SESSION_BUTTON_CLASS;
      button.textContent = "×";
      button.title = "Hide this recommendation until this tab is closed";
      button.setAttribute("aria-label", "Hide recommendation for this session");
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        sessionHidden.add(id);
        DS.applyCardHiding?.();
      });
      card.appendChild(button);
    }
  }

  function visibleRecommendationEntries() {
    return (DS.collectCards?.() || []).filter(({ card, anchor }) => {
      if (!isRecommendationContext(card)) return false;
      const target = DS.getBestHideTarget?.(card) || card;
      if (target.dataset?.dsHidden === "1" || target.classList.contains("ds-hidden") || target.classList.contains("ds-smart-filter-hidden") || target.classList.contains("ds-lorebook-filter-hidden")) return false;
      return !DS.shouldHideRecommendationCard(card, anchor);
    });
  }

  function ensureRandomToolbar() {
    const settings = DS.state?.settings || {};
    const isRecommendationsPage = /^\/recommended-bots\/?$/i.test(location.pathname);
    if (!settings.recommendationRandomButton || !isRecommendationsPage) {
      document.getElementById("ds-recommendation-toolbar")?.remove();
      return;
    }
    let toolbar = document.getElementById("ds-recommendation-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "ds-recommendation-toolbar";
      toolbar.className = "ds-recommendation-toolbar";
      DS.setSafeMarkup(toolbar, `<button type="button">🎲 Random visible bot</button>`);
      toolbar.querySelector("button")?.addEventListener("click", () => {
        const entries = visibleRecommendationEntries();
        if (!entries.length) return DS.setQuickStatus?.("No visible recommendations to pick from.");
        const picked = entries[Math.floor(Math.random() * entries.length)];
        picked.anchor?.click?.();
      });
      const first = DS.collectCards?.()[0];
      const grid = first ? (DS.getBestHideTarget?.(first.card) || first.card)?.parentElement : null;
      if (grid?.parentElement) grid.parentElement.insertBefore(toolbar, grid);
    }
  }

  function applyPreferenceDecorations() {
    const settings = DS.state?.settings || {};
    for (const { card } of DS.collectCards?.() || []) {
      if (!isRecommendationContext(card)) continue;
      const target = DS.getBestHideTarget?.(card) || card;
      const preferredTag = !!settings.recommendationPreferredTags && hasConfiguredTag(card, settings.recommendationPreferredTags);
      const favoriteCreator = !!settings.recommendationPreferFavoriteCreators && isFavoriteCreator(card);
      const preferred = preferredTag || favoriteCreator;
      if (preferred) {
        target.style.order = "-10";
        target.dataset.dsRecommendationOrder = "1";
      } else if (target.dataset.dsRecommendationOrder) {
        target.style.order = ""; delete target.dataset.dsRecommendationOrder;
      }
      target.querySelector(`.${REASON_CLASS}`)?.remove();
      if (settings.recommendationShowReasonBadges && preferred) {
        const note = document.createElement("span"); note.className = REASON_CLASS;
        note.textContent = favoriteCreator ? "★ favorite creator" : "★ preferred tag";
        note.style.cssText = "position:absolute;right:7px;bottom:7px;z-index:30;background:rgba(17,24,39,.9);color:#fff;border:1px solid rgba(167,139,250,.65);border-radius:999px;padding:3px 7px;font:600 10px system-ui;pointer-events:none";
        if (getComputedStyle(target).position === "static") { target.dataset.dsRecommendationPosition = target.style.position || ""; target.style.position = "relative"; }
        target.appendChild(note);
      }
    }
  }

  DS.applyRecommendationHelpers = async function applyRecommendationHelpers() {
    const settings = DS.state?.settings || {};
    await captureOwnHandles();
    if (!settings.enabled || !settings.enableRecommendationHelpers) {
      removeUi();
      if (DS.state.recommendationHelpersWasActive) DS.applyCardHiding?.();
      DS.state.recommendationHelpersWasActive = false;
      return;
    }
    DS.state.recommendationHelpersWasActive = true;
    await loadOwnHandles();
    addSessionButtons();
    ensureRandomToolbar();
    applyPreferenceDecorations();
  };

  DS.removeRecommendationHelpers = function removeRecommendationHelpers() {
    removeUi();
    DS.state.recommendationHelpersWasActive = false;
  };
})();

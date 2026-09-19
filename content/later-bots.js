(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getStore() {
    const store = DS.state.laterBots || { ids: [], meta: {} };
    store.ids = Array.isArray(store.ids) ? store.ids : [];
    store.meta = store.meta && typeof store.meta === "object" ? store.meta : {};
    DS.state.laterBots = store;
    return store;
  }


  function getCardCreator(card) {
    const anchor = card?.querySelector?.("a[href*='/creator/']");
    const text = cleanText(anchor?.textContent || "");

    if (text) return text.startsWith("@") ? text : `@${text}`;

    const href = anchor?.getAttribute?.("href") || "";
    const match = href.match(/\/creator\/([^/?#]+)/i);
    return match?.[1] ? `@${decodeURIComponent(match[1])}` : "";
  }

  function getCardDescription(card) {
    const direct = DS.getCardDescriptionText?.(card);
    if (cleanText(direct)) return cleanText(direct);

    const title = cleanText(DS.getCardTitle?.(card));
    const pieces = DS.qsa("p, span", card)
      .map(el => cleanText(el.textContent))
      .filter(Boolean)
      .filter(text => text !== title)
      .filter(text => !/^@/.test(text))
      .filter(text => !/^\d+$/.test(text))
      .filter(text => text.toLowerCase() !== "for you")
      .sort((a, b) => b.length - a.length);

    return pieces.find(text => text.length > 35) || "";
  }

  function makeLaterMeta(card, anchor, id) {
    const base = DS.makeBotMeta?.({ id, card, anchor }) || {};

    return {
      ...base,
      id,
      name: base.name || DS.getCardTitle?.(card) || id,
      image: base.image || DS.getCardImageUrl?.(card) || "",
      creator: base.creator || getCardCreator(card),
      description: getCardDescription(card),
      chatUrl: base.chatUrl || (id ? `${location.origin}/chat/${id}` : anchor?.href || ""),
      profileUrl: base.profileUrl || (id ? `${location.origin}/chatbot/${id}` : ""),
      savedAt: Date.now()
    };
  }

  function isSaved(id) {
    if (!id) return false;
    return DS.state.laterBotIdSet?.has(id) || false;
  }

  DS.cardIsSavedForLater = function cardIsSavedForLater(card, anchor) {
    const id = DS.botIdFromHref?.(anchor?.href || card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']")?.href || "") || "";
    return isSaved(id);
  };

  async function toggleLater(card, anchor, button) {
    const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");
    if (!id) return;

    const store = getStore();
    const beforeStore = JSON.parse(JSON.stringify(store));

    if (DS.state.laterBotIdSet?.has(id)) {
      store.ids = store.ids.filter(item => item !== id);
      DS.state.laterBotIdSet?.delete(id);
      delete store.meta[id];
      button.dataset.dsSaved = "0";
      button.title = "Save for later";
      button.setAttribute("aria-label", "Save for later");
      DS.setQuickStatus?.("Removed from Later.");
    } else {
      store.ids.push(id);
      DS.state.laterBotIdSet?.add(id);
      store.meta[id] = {
        ...(store.meta[id] || {}),
        ...makeLaterMeta(card, anchor, id)
      };
      button.dataset.dsSaved = "1";
      button.title = "Saved for later";
      button.setAttribute("aria-label", "Saved for later");
      DS.setQuickStatus?.(`Saved for later: ${store.meta[id].name || "bot"}`);

      if (DS.state.settings?.hideLaterBotsFromListings && !DS.isChatListPage?.()) {
        DS.hideCard?.(card, "card:saved for later");
        DS.applyListingAutoFill?.();
      }
    }

    await DS.saveLaterBots?.(store);
    await DS.recordLocalChange?.(`Changed Later list: ${store.meta?.[id]?.name || id}`, { [DS.LATER_BOTS_KEY]: beforeStore }, { [DS.LATER_BOTS_KEY]: JSON.parse(JSON.stringify(DS.state.laterBots || store)) });
    DS.updateLaterBotButtons?.();
    DS.applyCardHiding?.();
  }

  function textLower(value) {
    return cleanText(value).toLowerCase();
  }

  function classIncludes(el, needle) {
    return String(el?.className || "").includes(needle);
  }

  function findFavoriteButton(card) {
    const candidates = [];

    const controls = DS.qsa("button, a, [role='button']", card);
    for (const control of controls) {
      if (control.classList?.contains("ds-later-bot-button")) continue;
      if (control.classList?.contains("ds-card-block-button")) continue;
      if (control.classList?.contains("ds-creator-fav-button")) continue;
      if (control.closest?.("#ds-qol-panel")) continue;

      const aria = textLower(control.getAttribute("aria-label"));
      const title = textLower(control.getAttribute("title"));
      const tooltip = textLower(control.getAttribute("data-tooltip-content"));
      const tooltipWrap = control.closest?.("[data-tooltip-content]");
      const tooltipText = textLower(tooltipWrap?.getAttribute?.("data-tooltip-content"));
      const testId = textLower(control.getAttribute("data-testid"));
      const hasHeart = !!control.querySelector?.(
        "svg.lucide-heart, svg[class*='lucide-heart'], svg[class*='heart'], [data-icon*='heart']"
      );

      if (
        hasHeart ||
        aria.includes("favorite") ||
        aria === "like" ||
        title.includes("favorite") ||
        tooltip.includes("favorite") ||
        tooltip.includes("like") ||
        tooltipText.includes("favorite") ||
        tooltipText.includes("like") ||
        testId.includes("favorite")
      ) {
        candidates.push(control);
      }
    }

    // Some SpicyChat card revisions put the heart SVG inside a generic
    // clickable wrapper with no useful aria-label. Pick up that shape too.
    for (const heart of DS.qsa(
      "svg.lucide-heart, svg[class*='lucide-heart'], svg[class*='heart'], [data-icon*='heart']",
      card
    )) {
      const control = heart.closest?.("button, a, [role='button']");
      if (
        control &&
        !control.classList?.contains("ds-creator-fav-button") &&
        !control.classList?.contains("ds-later-bot-button") &&
        !candidates.includes(control)
      ) {
        candidates.push(control);
      }
    }

    return candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.top - br.top || ar.left - br.left;
    })[0] || null;
  }

  function findTopLeftCardActionsHost(card, favorite) {
    let node = favorite;
    const cardRect = card?.getBoundingClientRect?.();

    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const cls = String(node.className || "");
      const rect = node.getBoundingClientRect?.();
      const isAbsolute = cls.includes("absolute");
      const isTopLeftByClass = cls.includes("left") && (cls.includes("top") || cls.includes("[6px]") || cls.includes("[8px]"));
      const isTopLeftByPosition = cardRect && rect
        ? rect.top <= cardRect.top + 28 && rect.left <= cardRect.left + 50
        : false;
      const hasFavorite = node === favorite || !!node.contains?.(favorite);
      const compactActionHost = !!rect && rect.width <= 180 && rect.height <= 72;

      if (hasFavorite && (isAbsolute || compactActionHost) && (isTopLeftByClass || isTopLeftByPosition)) {
        return node;
      }
    }

    return null;
  }

  function findFavoriteActionItem(host, favorite) {
    if (!host || !favorite) return favorite;

    let node = favorite;
    let child = favorite;

    while (node && node.parentElement && node.parentElement !== host) {
      child = node.parentElement;
      node = node.parentElement;

      if (node === document.body || node.id === "root") break;
    }

    if (child?.parentElement === host) return child;
    if (favorite.parentElement === host) return favorite;

    return favorite.closest?.("[data-tooltip-content]") || favorite.parentElement || favorite;
  }


  function createFallbackActionHost(card) {
    let host = card.querySelector?.(":scope > .ds-card-fallback-actions");
    if (host) return host;

    host = document.createElement("div");
    host.className = "ds-card-fallback-actions ds-card-top-left-actions";
    host.dataset.dsActionHost = "later";

    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }

    card.insertAdjacentElement("afterbegin", host);
    return host;
  }

  function findButtonHost(card) {
    const favorite = findFavoriteButton(card);

    if (favorite) {
      const host = findTopLeftCardActionsHost(card, favorite);

      if (host) {
        const after = findFavoriteActionItem(host, favorite);
        host.classList.add("ds-card-top-left-actions");
        return { host, after };
      }

      // If SpicyChat uses a compact native favorite wrapper without the old
      // absolute-position classes, keep Later beside that native heart instead
      // of falling back to the opposite side of the card.
      const favoriteItem = favorite.closest?.("[data-tooltip-content]") || favorite;
      const nativeHost = favoriteItem?.parentElement;
      if (nativeHost) {
        const rect = nativeHost.getBoundingClientRect?.();
        const containsTitle = !!nativeHost.querySelector?.("a[aria-label^='chat-with-'][title]");
        const containsCreator = !!nativeHost.querySelector?.("a[href*='/creator/']");
        const compact = !!rect && rect.width <= 220 && rect.height <= 90;

        if (compact && !containsTitle && !containsCreator) {
          nativeHost.classList.add("ds-card-top-left-actions", "ds-card-native-favorite-actions");
          return { host: nativeHost, after: favoriteItem };
        }
      }

      // Do not blindly reuse the favorite button's parent chain here. On
      // SpicyChat's My Creations cards that chain can be the whole
      // title/creator column. Applying ds-card-top-left-actions to that
      // column turns it into an inline flex action row and can visually
      // cover/truncate the character name. If there is no real top-left
      // action host, fall through to the profile action or our dedicated
      // overlay host below.
    }

    const profile = DS.findCardProfileButton?.(card);
    if (profile?.parentElement) {
      profile.parentElement.classList.add("ds-card-top-right-actions");
      return { host: profile.parentElement, after: profile };
    }

    return { host: createFallbackActionHost(card), after: null };
  }

  function makeButton(card, anchor, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-later-bot-button";
    button.dataset.dsBotId = id;
    button.dataset.dsSaved = isSaved(id) ? "1" : "0";
    button.title = button.dataset.dsSaved === "1" ? "Saved for later" : "Save for later";
    button.setAttribute("aria-label", button.title);
    button.textContent = "◷";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleLater(card, anchor, button);
    }, true);

    return button;
  }

  DS.removeLaterBotButtons = function removeLaterBotButtons() {
    DS.qsa(".ds-later-bot-button").forEach(button => button.remove());

    // Clean up the bad host class left behind by older builds if the
    // extension is reloaded while My Creations is still open. A normal
    // page refresh would recreate this DOM anyway, but fixing it here
    // makes the patch take effect immediately.
    DS.qsa(".ds-card-top-left-actions").forEach(host => {
      const containsTitle = !!host.querySelector?.("a[aria-label^='chat-with-'][title]");
      const containsCreator = !!host.querySelector?.("a[href*='/creator/']");
      const isDedicatedOverlay = host.classList?.contains("ds-card-fallback-actions");

      if (!isDedicatedOverlay && containsTitle && containsCreator) {
        host.classList.remove("ds-card-top-left-actions");
      }
    });
  };

  DS.updateLaterBotButtons = function updateLaterBotButtons() {
    const settings = DS.state.settings || {};

    const shouldShowButton = !!settings.showLaterBotButtons;

    if (
      !settings.enabled ||
      !shouldShowButton ||
      DS.isSingleChatPage?.() ||
      DS.isChatListPage?.() ||
      DS.isBotProfilePage?.()
    ) {
      DS.removeLaterBotButtons();
      return;
    }

    const cards = DS.collectCards?.() || [];

    for (const { card, anchor } of cards) {
      if (!DS.isRecommendationCardRoot?.(card)) continue;

      const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");
      if (!id) continue;
      const existing = (DS.qsa?.(".ds-later-bot-button", card) || [])
        .find(button => button.dataset.dsBotId === id);

      if (existing) {
        existing.dataset.dsSaved = isSaved(id) ? "1" : "0";
        existing.title = existing.dataset.dsSaved === "1" ? "Saved for later" : "Save for later";
        existing.setAttribute("aria-label", existing.title);
        continue;
      }

      const { host, after } = findButtonHost(card);
      if (!host) continue;

      const button = makeButton(card, anchor, id);
      if (after && after.parentElement === host) {
        after.insertAdjacentElement("afterend", button);
      } else {
        host.appendChild(button);
      }
    }
  };
})();

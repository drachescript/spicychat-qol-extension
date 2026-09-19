(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  try {
    const params = new URLSearchParams(location.search || "");
    if (params.get("dsQuickDislike") === "1") {
      DS.state.quickDislikeWorker = true;
    }
  } catch {}

  function phoneOrAppEnvironment() {
    const env = DS.getRuntimeEnvironment?.() || DS.getAndroidEnvironment?.() || {};
    return !!env.android || window.innerWidth <= 760;
  }

  function queueQuickDislike(meta) {
    const settings = DS.state?.settings || {};
    if (phoneOrAppEnvironment()) return;
    if (!settings.quickDislikeIdleEnabled && !settings.quickDislikeOnBlock) return;
    if (!meta?.id) return;
    DS.queueQuickDislikeAfterBlock?.(meta);
  }

  function visibleElement(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  async function waitForElement(getter, timeoutMs = 16000, intervalMs = 120) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const value = getter();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  function ratingModal() {
    return [...document.querySelectorAll("div.fixed, [role='dialog']")].find(el => {
      if (!visibleElement(el)) return false;
      return /rate chatbot/i.test(String(el.textContent || ""));
    }) || null;
  }

  function unavailableChatStatus() {
    const text = String(document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim();
    const prerender = String(document.querySelector("meta[name='prerender-status-code']")?.getAttribute("content") || "").trim();
    if (/you have blocked the creator of this character/i.test(text)) return "unavailable-creator-blocked";
    if ((/not allowed to chat with this character/i.test(text) && /private|deleted/i.test(text)) || prerender === "404") {
      return "unavailable-private-or-deleted";
    }
    return "";
  }

  function dislikeAlreadySelected(button) {
    if (!button) return false;
    if (button.getAttribute("aria-pressed") === "true") return true;
    const state = String(button.getAttribute("data-state") || "").toLowerCase();
    if (["active", "checked", "on", "selected"].includes(state)) return true;
    const cls = String(button.className || "");
    return /(^|\s)bg-red-9(\s|$)/.test(cls) && !/(^|\s)bg-transparent(\s|$)/.test(cls);
  }

  async function runQuickDislikeWorker() {
    if (!DS.state.quickDislikeWorker) return { ok: false, status: "not-worker" };

    const opening = await waitForElement(() => {
      const unavailable = unavailableChatStatus();
      if (unavailable) return { unavailable };
      const button = document.querySelector("button[aria-label='ThumbsUp-button']");
      return visibleElement(button) && !button.disabled ? { button } : null;
    });
    if (opening?.unavailable) return { ok: true, status: opening.unavailable };
    const openButton = opening?.button || null;
    if (!openButton) {
      const unavailable = unavailableChatStatus();
      if (unavailable) return { ok: true, status: unavailable };
      return { ok: false, status: "rating-button-not-found" };
    }

    try { openButton.click(); } catch { DS.realClick?.(openButton); }

    const modal = await waitForElement(() => ratingModal(), 7000);
    if (!modal) return { ok: false, status: "rating-modal-not-found" };

    const dislike = [...modal.querySelectorAll("button")].find(button =>
      !!button.querySelector("svg.lucide-thumbs-down, svg[class*='lucide-thumbs-down']")
    );
    if (!dislike || dislike.disabled || dislike.getAttribute("aria-disabled") === "true") {
      return { ok: true, status: "already-rated-or-unavailable" };
    }
    // SpicyChat leaves an existing dislike button enabled, but paints it red
    // and disables Done because there is no unsaved rating change. Clicking
    // the selected button again would deselect it and make the worker time out.
    if (dislikeAlreadySelected(dislike)) {
      return { ok: true, status: "already-disliked" };
    }

    try { dislike.click(); } catch { DS.realClick?.(dislike); }

    const done = await waitForElement(() => {
      const button = modal.querySelector("button[aria-label='Done']");
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
    }, 3500);

    if (!done) {
      return { ok: false, status: "done-button-not-ready" };
    }

    try { done.click(); } catch { DS.realClick?.(done); }
    const closed = await waitForElement(() => !ratingModal(), 4000).catch?.(() => null);
    if (!closed) return { ok: false, status: "submit-not-confirmed" };
    return { ok: true, status: "disliked" };
  }

  DS.getCurrentBotName = function getCurrentBotName() {
    const selectors = [
      "h1",
      "[data-testid*='Character'] h1",
      "[data-testid*='character'] h1",
      "main h1"
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = String(el?.textContent || "").trim();

      if (text && text.length <= 120) {
        return text;
      }
    }

    const title =
      String(document.title || "")
        .replace(/\s*\|\s*Spicychat\s*$/i, "")
        .replace(/\s*-\s*Spicychat\s*$/i, "")
        .trim();

    if (
      title &&
      !title.toLowerCase().includes("spicychat")
    ) {
      return title;
    }

    return "";
  };

  DS.getCardImageUrl = function getCardImageUrl(card) {
    const img = card?.querySelector?.("img");
    return img?.currentSrc || img?.src || "";
  };

  DS.getCardTitle = function getCardTitle(card) {
    const isUsableTitle = textValue => {
      const text = String(textValue || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 120 || text.includes("@") || /^\d+$/.test(text)) return false;

      // Recommendation cards can put the purple "For You" badge before the
      // actual character name in DOM order. Never save that UI badge as bot metadata.
      const normalized = DS.normalize?.(text) || text.toLowerCase();
      if (normalized === "for you") return false;

      return true;
    };

    // Prefer heading/title-ish text first, then fall back to the old broad scan.
    const prioritySelectors = [
      "h1, h2, h3",
      "[data-testid*='name'], [data-testid*='title']",
      "[class*='title'], [class*='Title']",
      "p, span"
    ];

    for (const selector of prioritySelectors) {
      const title = DS.qsa(selector, card)
        .map(el => String(el.textContent || "").replace(/\s+/g, " ").trim())
        .find(isUsableTitle);
      if (title) return title;
    }

    return "";
  };

  DS.makeBotMeta = function makeBotMeta({ id = "", name = "", card = null, anchor = null } = {}) {
    const chatUrl = id ? `${location.origin}/chat/${id}` : (anchor?.href || "");

    return {
      id,
      name: name || DS.getCardTitle?.(card) || "",
      image: DS.getCardImageUrl?.(card) || "",
      chatUrl,
      profileUrl: id ? `${location.origin}/chatbot/${id}` : "",
      savedAt: Date.now()
    };
  };

  DS.blockCurrentBot = async function blockCurrentBot() {
    if (!DS.isSingleChatPage()) {
      DS.setQuickStatus?.("Open a specific chat first.");
      return {
        ok: false,
        error: "not-chat"
      };
    }

    const id = DS.chatIdFromHref(location.href);
    const name = DS.getCurrentBotName();
    const { blockedBots } = DS.state;
    const beforeBlocked = JSON.parse(JSON.stringify(blockedBots));

    if (!id && !name) {
      DS.setQuickStatus?.("Could not detect this bot.");
      return {
        ok: false,
        error: "not-detected"
      };
    }

    if (id && !DS.state.blockedBotIdSet?.has(id)) {
      blockedBots.ids.push(id);
      DS.state.blockedBotIdSet?.add(id);
    }

    if (name && !blockedBots.names.includes(name)) {
      blockedBots.names.push(name);
    }

    blockedBots.meta = blockedBots.meta || {};
    if (id) {
      blockedBots.meta[id] = {
        ...(blockedBots.meta[id] || {}),
        ...DS.makeBotMeta({ id, name })
      };
    }

    await DS.saveBlockedBots();
    await DS.recordLocalChange?.(`Blocked bot: ${name || id || "bot"}`, { [DS.BLOCKED_BOTS_KEY]: beforeBlocked }, { [DS.BLOCKED_BOTS_KEY]: JSON.parse(JSON.stringify(DS.state.blockedBots || blockedBots)) });

    DS.setQuickStatus?.(
      name ? `Blocked: ${name}` : "Blocked this bot."
    );

    if (id) queueQuickDislike(DS.makeBotMeta({ id, name }));

    return {
      ok: true,
      id,
      name
    };
  };

  DS.findCardProfileButton = function findCardProfileButton(card) {
    const controls = DS.qsa("button, a", card);

    for (const control of controls) {
      const aria =
        DS.normalize(control.getAttribute("aria-label"));

      const tooltip =
        DS.normalize(control.getAttribute("data-tooltip-content"));

      const hasInfoIcon =
        !!control.querySelector(
          "svg.lucide-info, svg[class*='lucide-info']"
        );

      if (
        hasInfoIcon ||
        aria === "info" ||
        aria === "profile" ||
        aria === "view profile" ||
        tooltip === "info" ||
        tooltip === "profile"
      ) {
        return control;
      }
    }

    return null;
  };

  DS.blockBotFromCard = async function blockBotFromCard(card, anchor) {
    if (DS.isFavoriteBotsPage?.() && DS.state.settings.protectFavoritesFromBlocking !== false) {
      DS.setQuickStatus?.("Favorites are protected from blocking.");
      return;
    }

    const id =
      DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");

    const { blockedBots } = DS.state;
    const beforeBlocked = JSON.parse(JSON.stringify(blockedBots));

    if (!id) return;

    if (!DS.state.blockedBotIdSet?.has(id)) {
      blockedBots.ids.push(id);
      DS.state.blockedBotIdSet?.add(id);
    }

    blockedBots.meta = blockedBots.meta || {};
    blockedBots.meta[id] = {
      ...(blockedBots.meta[id] || {}),
      ...DS.makeBotMeta({ id, card, anchor })
    };

    const blockedMeta = blockedBots.meta[id];
    const hideTarget = DS.getBestHideTarget?.(card) || card;

    // Blocking should feel instant. The old order waited for the full blocked
    // list to serialize/write before hiding the card, which became several
    // seconds once that list grew large.
    DS.hideCard?.(card, "card:blocked bot");
    DS.updateQuickPanel?.();

    try {
      await DS.saveBlockedBots();
    } catch (error) {
      DS.state.blockedBots = beforeBlocked;
      DS.refreshFastLookupCaches?.();
      if (hideTarget?.dataset?.dsReason === "card:blocked bot") DS.unhideElement?.(hideTarget);
      DS.updateQuickPanel?.();
      DS.setQuickStatus?.("Could not save that block. The card was restored.");
      throw error;
    }

    try {
      await DS.recordLocalChange?.(`Blocked bot: ${blockedBots.meta?.[id]?.name || id}`, { [DS.BLOCKED_BOTS_KEY]: beforeBlocked }, { [DS.BLOCKED_BOTS_KEY]: JSON.parse(JSON.stringify(DS.state.blockedBots || blockedBots)) });
    } catch {}

    queueQuickDislike(blockedMeta);
  };

  DS.markBotNotInterestedFromCard = async function markBotNotInterestedFromCard(card, anchor) {
    const id = DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref(anchor?.href || "");
    if (!id) return;

    const list = DS.state.notInterestedBots;
    list.ids = list.ids || [];
    list.meta = list.meta || {};

    if (!DS.state.notInterestedBotIdSet?.has(id)) {
      list.ids.push(id);
      DS.state.notInterestedBotIdSet?.add(id);
    }

    list.meta[id] = {
      ...(list.meta[id] || {}),
      ...DS.makeBotMeta({ id, card, anchor })
    };

    await DS.saveNotInterestedBots?.();
    DS.hideCard?.(card, "card:not interested");
    DS.updateQuickPanel?.();
  };

  DS.restoreCardProfileButtons = function restoreCardProfileButtons() {
    DS.qsa('[data-ds-reason="card-ui:profile-button"]').forEach(el => {
      DS.unhideElement(el);
    });

    DS.qsa(".ds-card-block-button").forEach(button => {
      button.remove();
    });
  };

  DS.applyCardBlockButtons = function applyCardBlockButtons() {
    const token = DS.diagOperationStart?.("block-filter", "refresh");
    let scanned = 0;
    let changed = 0;
    let skipped = 0;
    const { settings } = DS.state;

    if (
      !settings.enabled ||
      !settings.replaceCardProfileWithBlockButton ||
      DS.isSingleChatPage() ||
      DS.isChatListPage() ||
      DS.isBotProfilePage() ||
      DS.isFavoriteBotsPage()
    ) {
      const before = DS.qsa?.(".ds-card-block-button")?.length || 0;
      DS.restoreCardProfileButtons();
      DS.diagOperationEnd?.(token, { scanned: before, changed: before, skipped: 0 });
      return;
    }

    const cards = DS.collectCards?.() || [];

    for (const { card, anchor } of cards) {
      scanned++;
      if (!DS.isRecommendationCardRoot?.(card)) {
        skipped++;
        continue;
      }

      if (card.querySelector(".ds-card-block-button")) {
        skipped++;
        continue;
      }

      const profileButton =
        DS.findCardProfileButton(card);

      const host =
        profileButton?.parentElement ||
        card;

      host.classList?.add("ds-card-top-right-actions");

      if (profileButton) {
        DS.unhideElement?.(profileButton);
        profileButton.classList.add("ds-card-profile-restored");
      }

      const blockButton =
        document.createElement("button");

      blockButton.type = "button";
      blockButton.className = "ds-card-block-button";
      DS.markQolOwned?.(blockButton, "block-filter");
      blockButton.setAttribute("aria-label", "Block this bot");
      blockButton.title = "Block this bot";
      blockButton.textContent = "×";

      blockButton.addEventListener(
        "click",
        async event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          blockButton.disabled = true;

          await DS.blockBotFromCard(
            card,
            anchor
          );
        },
        true
      );

      if (profileButton && profileButton.parentElement === host) {
        profileButton.insertAdjacentElement("afterend", blockButton);
      } else {
        host.appendChild(blockButton);
      }
      changed++;
    }
    DS.diagOperationEnd?.(token, { scanned, changed, skipped });
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "DS_GET_PAGE_INFO") {
      const path = String(location.pathname || "");
      const isSingleChatPage = !!DS.isSingleChatPage();
      sendResponse({
        ok: true,
        path,
        isSingleChatPage,
        isChatListPage: !!DS.isChatListPage?.(),
        isChatbotEditor: /^\/chatbot\/(?:edit\/[^/]+|[^/]+\/edit)(?:\/|$)/i.test(path),
        isLorebookEditor: /^\/lorebook\/(?:edit\/[^/]+|[^/]+\/edit)(?:\/|$)/i.test(path),
        isLorebookEntriesPage: /^\/lorebook\/[^/]+\/entries(?:\/|$)/i.test(path),
        botName: isSingleChatPage ? DS.getCurrentBotName() : "",
        chatId: isSingleChatPage ? DS.chatIdFromHref(location.href) : null
      });

      return false;
    }

    if (message?.type === "DS_BLOCK_CURRENT_BOT") {
      DS.blockCurrentBot().then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_DISLIKE_RUN") {
      runQuickDislikeWorker().then(sendResponse);
      return true;
    }

    return false;
  });
})();
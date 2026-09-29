(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  try {
    const params = new URLSearchParams(location.search || "");
    if (params.get("dsQuickDislike") === "1") {
      DS.state.quickDislikeWorker = true;
    }
    if (params.get("dsQuickLessLike") === "1" || params.get("dsQolRecommendationWorker") === "1") {
      DS.state.quickLessLikeWorker = true;
      DS.state.recommendationWorker = params.get("dsQolRecommendationWorker") === "1";
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

  async function navigateQuickDislikeWorker(message) {
    if (!DS.state.quickDislikeWorker) return { ok: false, status: "not-worker" };

    let target;
    try { target = new URL(String(message?.targetUrl || ""), location.origin); }
    catch { return { ok: false, status: "invalid-url" }; }
    if (target.origin !== location.origin || !/^\/chat\/[^/]+/i.test(target.pathname)) {
      return { ok: false, status: "invalid-url" };
    }

    const botId = String(message?.botId || target.pathname.match(/^\/chat\/([^/]+)/i)?.[1] || "").trim().toLowerCase();
    try {
      history.pushState(history.state, "", target.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    } catch {
      return { ok: false, status: "navigation-failed" };
    }

    const ready = await waitForElement(() => {
      const profile = document.querySelector(`a[aria-label='chatbot-profile'][href*='/chatbot/${CSS.escape(botId)}']`);
      if (profile) return true;
      const unavailable = unavailableChatStatus();
      return unavailable ? true : null;
    }, 12000, 140);

    return ready
      ? { ok: true, status: "navigated", botId }
      : { ok: false, status: "navigation-timeout", botId };
  }

  async function runQuickDislikeWorker() {
    if (!DS.state.quickDislikeWorker) return { ok: false, status: "not-worker" };
    const params = new URLSearchParams(location.search || "");
    const botId = String(params.get("dsQuickBotId") || DS.chatIdFromHref?.(location.href) || "").trim().toLowerCase();
    const jobId = String(params.get("dsQuickJobId") || "").trim();
    const token = DS.diagOperationStart?.("quick-dislike", "helper", { botId, jobId });
    const finish = result => {
      DS.diagOperationEnd?.(token, {
        scanned: 1,
        changed: result?.status === "disliked" ? 1 : 0,
        skipped: result?.ok && result?.status !== "disliked" ? 1 : 0,
        status: result?.status || "unknown",
        botId,
        jobId
      });
      return result;
    };

    const opening = await waitForElement(() => {
      const unavailable = unavailableChatStatus();
      if (unavailable) return { unavailable };
      const button = document.querySelector("button[aria-label='ThumbsUp-button']");
      return visibleElement(button) && !button.disabled ? { button } : null;
    }, 10000);
    if (opening?.unavailable) return finish({ ok: true, status: opening.unavailable });
    const openButton = opening?.button || null;
    if (!openButton) {
      const unavailable = unavailableChatStatus();
      if (unavailable) return finish({ ok: true, status: unavailable });
      return finish({ ok: false, status: "rating-button-not-found" });
    }

    try { openButton.click(); } catch { DS.realClick?.(openButton); }

    const modal = await waitForElement(() => ratingModal(), 6000);
    if (!modal) return finish({ ok: false, status: "rating-modal-not-found" });

    const dislike = [...modal.querySelectorAll("button")].find(button =>
      !!button.querySelector("svg.lucide-thumbs-down, svg[class*='lucide-thumbs-down']")
    );
    if (!dislike || dislike.disabled || dislike.getAttribute("aria-disabled") === "true") {
      return finish({ ok: true, status: "already-rated-or-unavailable" });
    }
    if (dislikeAlreadySelected(dislike)) {
      return finish({ ok: true, status: "already-disliked" });
    }

    try { dislike.click(); } catch { DS.realClick?.(dislike); }

    const done = await waitForElement(() => {
      const button = modal.querySelector("button[aria-label='Done']");
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
    }, 3500);

    if (!done) return finish({ ok: false, status: "done-button-not-ready" });

    try { done.click(); } catch { DS.realClick?.(done); }
    const closed = await waitForElement(() => !ratingModal(), 4000).catch?.(() => null);
    if (!closed) return finish({ ok: false, status: "submit-not-confirmed" });
    return finish({ ok: true, status: "disliked" });
  }

  function workerCardForBotId(botId) {
    const wanted = String(botId || "").trim().toLowerCase();
    if (!wanted) return null;
    const cards = DS.collectCards?.() || [];
    for (const item of cards) {
      const id = String(DS.botIdFromHref?.(item.anchor?.href || "") || DS.chatIdFromHref?.(item.anchor?.href || "") || "").trim().toLowerCase();
      if (id === wanted) return item;
    }
    return null;
  }

  function workerVisibleMenuItemByText(text) {
    const wanted = String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
    return [...document.querySelectorAll("button, [role='menuitem'], [role='option'], li, div")].find(el => {
      if (!el?.isConnected || !visibleElement(el)) return false;
      return String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() === wanted;
    }) || null;
  }

  async function navigateQuickLessLikeWorker(message) {
    if (!DS.state.quickLessLikeWorker) return { ok: false, status: "not-worker" };
    let target;
    try { target = new URL(String(message?.targetUrl || ""), location.origin); }
    catch { return { ok: false, status: "invalid-url" }; }
    if (target.origin !== location.origin || target.pathname !== "/") return { ok: false, status: "invalid-url" };

    try {
      history.pushState(history.state, "", target.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    } catch {
      return { ok: false, status: "navigation-failed" };
    }

    const botId = String(message?.botId || "").trim().toLowerCase();
    const ready = await waitForElement(() => workerCardForBotId(botId), 14000, 140);
    return ready ? { ok: true, status: "navigated", botId } : { ok: false, status: "navigation-timeout", botId };
  }

  async function runQuickLessLikeWorker() {
    if (!DS.state.quickLessLikeWorker) return { ok: false, status: "not-worker" };
    const params = new URLSearchParams(location.search || "");
    const botId = String(params.get("dsLessLikeBotId") || "").trim().toLowerCase();
    const botName = String(params.get("dsLessLikeBotName") || "").trim();
    const jobId = String(params.get("dsLessLikeJobId") || "").trim();
    const token = DS.diagOperationStart?.("quick-less-like", "helper", { botId, botName, jobId });
    const finish = result => {
      DS.diagOperationEnd?.(token, {
        scanned: 1,
        changed: result?.status === "less-liked" ? 1 : 0,
        skipped: result?.ok && result?.status !== "less-liked" ? 1 : 0,
        status: result?.status || "unknown",
        botId,
        jobId,
        executor: "spicychat-native-ui"
      });
      return result;
    };
    if (!botId) return finish({ ok: false, status: "invalid-bot" });

    const found = await waitForElement(() => workerCardForBotId(botId), 12000, 140);
    if (!found?.card) return finish({ ok: false, status: "card-not-found" });
    const card = found.card;
    // A previous QoL filter pass can have hidden this card before the helper
    // route fully settled. The helper is isolated in a hidden tab, so restore
    // only this exact target card before using SpicyChat's native menu.
    const hideTarget = DS.getBestHideTarget?.(card) || card;
    DS.unhideElement?.(hideTarget);
    const buttons = [...card.querySelectorAll("button")];
    const menuButton = buttons.find(button => {
      const aria = String(button.getAttribute("aria-label") || "").toLowerCase();
      const title = String(button.getAttribute("title") || "").toLowerCase();
      const testid = String(button.getAttribute("data-testid") || "").toLowerCase();
      return aria.includes("more") || aria.includes("action") || aria.includes("ellipsis") || aria.includes("menu") ||
        title.includes("more") || title.includes("action") || testid.includes("more") || testid.includes("menu") ||
        !!button.querySelector("svg.lucide-ellipsis, svg.lucide-ellipsis-vertical");
    });
    if (!menuButton) return finish({ ok: false, status: "menu-button-not-found" });

    try { menuButton.click(); } catch { DS.realClick?.(menuButton); }
    const item = await waitForElement(() => workerVisibleMenuItemByText("Less Like This"), 3500, 80);
    if (!item) return finish({ ok: false, status: "less-like-missing" });
    try { item.click(); } catch { DS.realClick?.(item); }

    const started = Date.now();
    while (Date.now() - started < 6000) {
      const pageText = String(document.body?.innerText || "").replace(/\s+/g, " ");
      if (/failed to update character preferences/i.test(pageText)) return finish({ ok: false, status: "submit-failed" });
      if (/character preferences updated/i.test(pageText)) return finish({ ok: true, status: "less-liked" });
      if (!card.isConnected || !workerCardForBotId(botId)) {
        // Native Less Like normally removes the card from the recommendation
        // results after the preference update succeeds.
        await new Promise(resolve => setTimeout(resolve, 350));
        const afterText = String(document.body?.innerText || "").replace(/\s+/g, " ");
        if (!/failed to update character preferences/i.test(afterText)) return finish({ ok: true, status: "less-liked" });
        return finish({ ok: false, status: "submit-failed" });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return finish({ ok: false, status: "submit-not-confirmed" });
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
    const onChat = !!DS.isSingleChatPage?.();
    const onProfile = !!DS.isBotProfilePage?.();
    if (!onChat && !onProfile) {
      DS.setQuickStatus?.("Open a specific chat or chatbot profile first.");
      return {
        ok: false,
        error: "not-bot-page"
      };
    }

    const id = DS.botIdFromHref?.(location.href) || DS.chatIdFromHref?.(location.href);
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


  const DIRECT_FEEDBACK_REQUEST_EVENT = "ds-qol-character-feedback-request-v1";
  const DIRECT_FEEDBACK_RESPONSE_EVENT = "ds-qol-character-feedback-response-v1";
  const RECOMMENDATION_WORKER_PROBE_REQUEST_EVENT = "ds-qol-recommendation-worker-probe-request-v1";
  const RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT = "ds-qol-recommendation-worker-probe-response-v1";
  const RECOMBEE_PUBLIC_TOKEN_CACHE_KEY = "dsQolRecombeePublicTokenCache";
  const RECOMBEE_PUBLIC_TOKEN_CACHE_MS = 24 * 60 * 60 * 1000;
  const directFeedbackInFlight = new Map();
  const lessLikeRunDiagTokens = new Map();

  function plausiblePublicToken(value) {
    const token = String(value || "").trim();
    return token.length >= 16 && token.length <= 180 && /^[A-Za-z0-9_-]+$/.test(token) ? token : "";
  }

  async function cachedRecombeePublicToken() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get([RECOMBEE_PUBLIC_TOKEN_CACHE_KEY], value => resolve(value || {}));
      });
      const cached = result?.[RECOMBEE_PUBLIC_TOKEN_CACHE_KEY] || {};
      const token = plausiblePublicToken(cached.token);
      const at = Number(cached.at || 0);
      if (!token || !at || Date.now() - at > RECOMBEE_PUBLIC_TOKEN_CACHE_MS) return "";
      return token;
    } catch {
      return "";
    }
  }

  async function rememberRecombeePublicToken(token, source = "") {
    const cleanToken = plausiblePublicToken(token);
    if (!cleanToken) return false;
    try {
      await new Promise(resolve => {
        chrome.storage.local.set({
          [RECOMBEE_PUBLIC_TOKEN_CACHE_KEY]: {
            token: cleanToken,
            at: Date.now(),
            source: String(source || "").slice(0, 80)
          }
        }, () => resolve());
      });
      return true;
    } catch {
      return false;
    }
  }

  async function clearRecombeePublicTokenCache() {
    try {
      await new Promise(resolve => chrome.storage.local.remove([RECOMBEE_PUBLIC_TOKEN_CACHE_KEY], () => resolve()));
    } catch {}
  }

  function settleRecommendationWorkerPresentation() {
    if (!DS.state.recommendationWorker) return;
    try {
      document.documentElement?.setAttribute("data-ds-qol-recommendation-worker-settled", "1");
      if (!document.getElementById("ds-qol-recommendation-worker-style")) {
        const style = document.createElement("style");
        style.id = "ds-qol-recommendation-worker-style";
        style.textContent = `
          html[data-ds-qol-recommendation-worker-settled="1"] body { overflow: hidden !important; }
          html[data-ds-qol-recommendation-worker-settled="1"] #root {
            content-visibility: hidden !important;
            contain: strict !important;
            pointer-events: none !important;
            user-select: none !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      }
    } catch {}
  }

  async function probeRecommendationWorker() {
    if (!DS.state.quickLessLikeWorker || !DS.state.recommendationWorker) {
      return { ok: false, ready: false, status: "not-recommendation-worker" };
    }
    try { window.DSCardTokenBridgeLoader?.ensure?.(); } catch {}
    const preferredRecombeeToken = await cachedRecombeePublicToken();
    const requestId = `worker-probe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return await new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT, onResponse);
        if (value?.ready) settleRecommendationWorkerPresentation();
        resolve(value || { ok: false, ready: false, status: "worker-probe-empty" });
      };
      const onResponse = event => {
        const detail = event?.detail || {};
        if (String(detail.requestId || "") !== requestId) return;
        finish(detail);
      };
      window.addEventListener(RECOMMENDATION_WORKER_PROBE_RESPONSE_EVENT, onResponse);
      const timer = setTimeout(() => finish({
        ok: false, ready: false, status: "worker-probe-timeout",
        bridgeReady: document.documentElement?.getAttribute("data-ds-card-token-main-bridge") === "2"
      }), 9000);
      try {
        window.dispatchEvent(new CustomEvent(RECOMMENDATION_WORKER_PROBE_REQUEST_EVENT, {
          detail: { requestId, preferredRecombeeToken }
        }));
      } catch (error) {
        finish({ ok: false, ready: false, status: "worker-probe-unavailable", reason: String(error?.message || error || "") });
      }
    });
  }

  async function runDirectCharacterFeedback(message) {
    const botId = String(message?.botId || "").trim().toLowerCase();
    const mode = String(message?.mode || "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(botId) || mode !== "less-like") {
      return { ok: false, status: "invalid-feedback-request" };
    }

    const existing = directFeedbackInFlight.get(botId);
    if (existing) return existing;

    const operation = DS.diagOperationStart?.("quick-less-like", "direct-api", { botId, mode });
    const availabilityNetwork = DS.diagNetworkStart?.("quick-less-like", "GET", `https://prod.nd-api.com/v2/characters/${botId}`, { phase: "availability-preflight", botId });
    const ratingNetwork = DS.diagNetworkStart?.("quick-less-like", "POST", "https://client-rapi-ca-east.recombee.com/spicychat-prod/ratings/", { phase: "rating", botId });
    const work = (async () => {
      try { window.DSCardTokenBridgeLoader?.ensure?.(); } catch {}
      const preferredRecombeeToken = await cachedRecombeePublicToken();
      const requestId = `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.removeEventListener(DIRECT_FEEDBACK_RESPONSE_EVENT, onResponse);
          resolve(value);
        };
        const onResponse = event => {
          const detail = event?.detail || {};
          if (String(detail.requestId || "") !== requestId) return;
          finish(detail);
        };
        window.addEventListener(DIRECT_FEEDBACK_RESPONSE_EVENT, onResponse);
        // Token discovery can lazily inspect SpicyChat's own cached JS bundles.
        // Give that one direct attempt enough time to finish; the background
        // worker deliberately will not fan out to another tab after a timeout.
        const timer = setTimeout(() => finish({
          ok: false,
          status: "direct-feedback-timeout",
          stage: "isolated-bridge-timeout",
          reason: "Timed out waiting for the MAIN-world feedback result; request completion is ambiguous.",
          requestSent: true,
          networkAttempts: 1,
          retryable: false,
          networkAmbiguous: true,
          throttleSignal: "timeout"
        }), 45000);
        try {
          window.dispatchEvent(new CustomEvent(DIRECT_FEEDBACK_REQUEST_EVENT, {
            detail: { requestId, botId, mode, preferredRecombeeToken }
          }));
        } catch (error) {
          finish({ ok: false, status: "direct-feedback-unavailable", error: String(error?.message || error || ""), requestSent: false, networkAttempts: 0 });
        }
      });
      if (result?.ok && result?.publicToken) {
        await rememberRecombeePublicToken(result.publicToken, result.tokenSource || "less-like-success");
      } else if (preferredRecombeeToken && result?.status === "recombee-request-failed") {
        await clearRecombeePublicTokenCache();
      }

      DS.diagOperationEnd?.(operation, {
        scanned: 1,
        changed: result?.ok && result?.status === "less-liked" ? 1 : 0,
        skipped: result?.ok && result?.status !== "less-liked" ? 1 : 0,
        status: result?.status || "unknown",
        botId,
        executor: result?.executor || "direct-recombee-api",
        stage: result?.stage || "",
        httpStatus: Number(result?.httpStatus || 0),
        tokenAttempts: Number(result?.tokenAttempts || 0),
        networkAttempts: Number(result?.networkAttempts || 0),
        availabilityNetworkAttempts: Number(result?.availabilityNetworkAttempts || 0),
        availabilityConfirmed: !!result?.availabilityConfirmed,
        tokenSource: String(result?.tokenSource || ""),
        requestSent: !!result?.requestSent,
        retryable: !!result?.retryable,
        retryAfterMs: Number(result?.retryAfterMs || 0),
        throttleSignal: String(result?.throttleSignal || ""),
        networkAmbiguous: !!result?.networkAmbiguous,
        availabilityMs: Number(result?.availabilityMs || 0),
        userLookupMs: Number(result?.userLookupMs || 0),
        ratingMs: Number(result?.ratingMs || 0),
        elapsedMs: Number(result?.elapsedMs || 0)
      });
      DS.diagNetworkEnd?.(availabilityNetwork, {
        status: Number(result?.availabilityHttpStatus || result?.httpStatus || 0),
        ok: !!result?.availabilityConfirmed,
        outcome: result?.availabilityConfirmed ? "confirmed" : String(result?.stage || result?.status || "unknown")
      });
      DS.diagNetworkEnd?.(ratingNetwork, {
        status: Number(result?.ratingHttpStatus || (result?.requestSent ? result?.httpStatus : 0) || 0),
        ok: !!(result?.ok && result?.status === "less-liked"),
        outcome: result?.requestSent ? String(result?.status || "unknown") : "not-sent"
      });
      return result;
    })();

    directFeedbackInFlight.set(botId, work);
    try {
      return await work;
    } finally {
      if (directFeedbackInFlight.get(botId) === work) directFeedbackInFlight.delete(botId);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "DS_GET_PAGE_INFO") {
      const path = String(location.pathname || "");
      const isSingleChatPage = !!DS.isSingleChatPage();
      const isBotProfilePage = !!DS.isBotProfilePage?.();
      const botPage = isSingleChatPage || isBotProfilePage;
      sendResponse({
        ok: true,
        path,
        isSingleChatPage,
        isBotProfilePage,
        isChatListPage: !!DS.isChatListPage?.(),
        isChatbotEditor: /^\/chatbot\/(?:edit\/[^/]+|[^/]+\/edit)(?:\/|$)/i.test(path),
        isLorebookEditor: /^\/lorebook\/(?:edit\/[^/]+|[^/]+\/edit)(?:\/|$)/i.test(path),
        isLorebookEntriesPage: /^\/lorebook\/[^/]+\/entries(?:\/|$)/i.test(path),
        botName: botPage ? DS.getCurrentBotName() : "",
        botId: botPage ? (DS.botIdFromHref?.(location.href) || DS.chatIdFromHref?.(location.href) || null) : null,
        chatId: isSingleChatPage ? DS.chatIdFromHref(location.href) : null
      });

      return false;
    }

    if (message?.type === "DS_BLOCK_CURRENT_BOT") {
      DS.blockCurrentBot().then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_LESS_LIKE_WORKER_READY") {
      probeRecommendationWorker().then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_LESS_LIKE_TIMING") {
      const timing = message?.timing && typeof message.timing === "object" ? message.timing : {};
      const token = DS.diagOperationStart?.("quick-less-like", "bulk-item-timing", { botId: String(message?.botId || "") });
      DS.diagOperationEnd?.(token, {
        scanned: 1,
        changed: String(timing.status || "") === "less-liked" ? 1 : 0,
        skipped: 0,
        errors: ["less-liked", "unavailable", "already-handled"].includes(String(timing.status || "")) ? 0 : 1,
        outcome: String(timing.status || "unknown"),
        configuredDelayMs: Number(timing.configuredDelayMs || 0),
        itemBeforeDelayMs: Number(timing.itemBeforeDelayMs || 0),
        workerReadyMs: Number(timing.workerReadyMs || 0),
        coordinatorWaitMs: Number(timing.coordinatorWaitMs || 0),
        feedbackMs: Number(timing.feedbackMs || 0),
        availabilityMs: Number(timing.availabilityMs || 0),
        userLookupMs: Number(timing.userLookupMs || 0),
        ratingMs: Number(timing.ratingMs || 0),
        requestElapsedMs: Number(timing.requestElapsedMs || 0),
        historyPersistMs: Number(timing.historyPersistMs || 0),
        backgroundTotalMs: Number(timing.backgroundTotalMs || timing.totalMs || 0),
        totalMs: Number(timing.totalMs || timing.itemBeforeDelayMs || 0),
        networkAttempts: Number(timing.networkAttempts || 0),
        currentIntervalMs: Number(timing.currentIntervalMs || 0),
        pacingState: String(timing.pacingState || ""),
        recentMedianRequestMs: Number(timing.recentMedianRequestMs || 0),
        retries: Number(timing.retries || 0),
        http429: Number(timing.http429 || 0),
        http5xx: Number(timing.http5xx || 0)
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "DS_QUICK_LESS_LIKE_RUN_TIMING") {
      const runId = String(message?.runId || "");
      const phase = String(message?.phase || "");
      const timing = message?.timing && typeof message.timing === "object" ? message.timing : {};
      const meta = message?.meta && typeof message.meta === "object" ? message.meta : {};
      if (phase === "start") {
        const token = DS.diagOperationStart?.("quick-less-like", "bulk-run", { runId, ...meta, ...timing });
        if (token && runId) lessLikeRunDiagTokens.set(runId, token);
      } else if (phase === "end") {
        const token = lessLikeRunDiagTokens.get(runId) || null;
        if (runId) lessLikeRunDiagTokens.delete(runId);
        DS.diagOperationEnd?.(token, {
          scanned: Number(meta.processed || 0),
          changed: Number(meta.sent || 0),
          skipped: Number(meta.unavailable || 0),
          errors: Number(meta.failed || 0),
          outcome: meta.stopped ? "stopped" : "completed",
          totalRunMs: Number(timing.totalRunMs || 0),
          currentIntervalMs: Number(timing.currentIntervalMs || 0),
          recentMedianRequestMs: Number(timing.recentMedianRequestMs || 0),
          ...meta
        });
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "DS_DIRECT_CHARACTER_FEEDBACK") {
      runDirectCharacterFeedback(message).then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_DISLIKE_NAVIGATE") {
      navigateQuickDislikeWorker(message).then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_DISLIKE_RUN") {
      runQuickDislikeWorker().then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_LESS_LIKE_NAVIGATE") {
      navigateQuickLessLikeWorker(message).then(sendResponse);
      return true;
    }

    if (message?.type === "DS_QUICK_LESS_LIKE_RUN") {
      runQuickLessLikeWorker().then(sendResponse);
      return true;
    }

    return false;
  });
})();
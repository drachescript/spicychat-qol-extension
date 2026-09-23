(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  DS.normalize = text =>
    (typeof DS.normalizeTextForMatching === "function"
      ? DS.normalizeTextForMatching(text)
      : String(text || ""))
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  DS.qsa = (selector, root = document) => {
    try {
      if (!selector || !root?.querySelectorAll) return [];
      return [...root.querySelectorAll(selector)];
    } catch (error) {
      if (DS.state?.settings?.debug) {
        console.warn(`[${DS.EXT_NAME}] selector skipped`, selector, error);
      }
      return [];
    }
  };

  DS.qs = (selector, root = document) => {
    try {
      if (!selector || !root?.querySelector) return null;
      return root.querySelector(selector);
    } catch (error) {
      if (DS.state?.settings?.debug) {
        console.warn(`[${DS.EXT_NAME}] selector skipped`, selector, error);
      }
      return null;
    }
  };

  DS.sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  // Keep route parsing in one place. A surprising number of QoL features used to
  // re-read location.pathname and run their own regexes on every scheduler pass.
  // This cache is intentionally route-only; DOM refs have their own connected-node
  // cache below so React remounts cannot leave stale elements behind.
  let pageStateCacheHref = "";
  let pageStateCache = null;
  const stablePageElements = new Map();

  function normalizedRoutePath() {
    const raw = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return raw.replace(/^\/[a-z]{2}(?=\/)/i, "") || "/";
  }

  DS.invalidatePageStateCache = function invalidatePageStateCache() {
    pageStateCacheHref = "";
    pageStateCache = null;
    stablePageElements.clear();
  };

  DS.getPageState = function getPageState(options = {}) {
    const href = String(location.href || "");
    if (!options.refresh && pageStateCache && pageStateCacheHref === href) return pageStateCache;

    const path = normalizedRoutePath();
    const singleChatMatch = path.match(/^\/chat\/([^/?#]+)(?:\/([^/?#]+))?/i);
    const storyModeMatch = path.match(/^\/story\/([^/?#]+)(?:\/([^/?#]+))?/i);
    const lorebookExplore = path === "/lorebooks/explore" || path.startsWith("/lorebooks/explore/");
    const botEditor = /^\/chatbot\/(?:create(?:\/|$)|edit(?:\/|$)|[^/]+\/edit(?:\/|$))/i.test(path);
    const botProfileMatch = !botEditor ? path.match(/^\/chatbot\/([^/?#]+)/i) : null;
    const lorebookEditor = /^\/lorebook\/(?:create(?:\/|$)|edit(?:\/|$)|[^/]+\/edit(?:\/|$))/i.test(path);
    const lorebookMatch = path.match(/^\/lorebook\/([^/?#]+)/i);
    const chatsPage = path === "/chats" || path.startsWith("/chats/");
    const chatRoot = path === "/chat";
    const favoriteBots = path === "/favorite-bots" || path.startsWith("/favorite-bots/");
    const publicCreator = /^\/creator\/[^/]+(?:\/|$)/i.test(path);
    const myCreationsChatbots = path === "/my-creations/chatbots" || path.startsWith("/my-creations/chatbots/");
    const myCreationsLorebooks = path === "/my-creations/lorebooks" || path.startsWith("/my-creations/lorebooks/");
    const personaPage = /^\/(?:persona|personas)(?:\/|$)/i.test(path);
    const home = path === "/";
    const singleChat = !!singleChatMatch;
    const chatList = chatsPage || chatRoot;
    const botProfile = !!botProfileMatch;
    const lorebookPage = path === "/lorebook" || path.startsWith("/lorebook/") || lorebookExplore || myCreationsLorebooks;

    let routeType = "other";
    if (singleChat) routeType = "chat";
    else if (storyModeMatch) routeType = "story";
    else if (chatList) routeType = "chat-list";
    else if (botEditor) routeType = "bot-editor";
    else if (lorebookEditor) routeType = "lorebook-editor";
    else if (lorebookExplore) routeType = "lorebook-explore";
    else if (lorebookMatch) routeType = "lorebook-public";
    else if (botProfile) routeType = "bot-profile";
    else if (myCreationsChatbots) routeType = "creator-listing";
    else if (myCreationsLorebooks || path === "/lorebook") routeType = "lorebook-listing";
    else if (personaPage) routeType = "persona";
    else if (home || favoriteBots || publicCreator || /^\/(?:search|discover|recommended(?:-bots)?|trending)(?:\/|$)/i.test(path)) routeType = "listing";

    pageStateCacheHref = href;
    pageStateCache = {
      href,
      path,
      routeType,
      isHome: home,
      isChatsPage: chatsPage,
      isChatRootPage: chatRoot,
      isChatListPage: chatList,
      isSingleChatPage: singleChat,
      chatId: singleChatMatch?.[1] || "",
      conversationId: singleChatMatch?.[2] || "",
      isStoryModePage: !!storyModeMatch,
      storyBotId: storyModeMatch?.[1] || "",
      storyId: storyModeMatch?.[2] || "",
      isBotEditor: botEditor,
      isBotProfilePage: botProfile,
      botId: botProfileMatch?.[1] || "",
      isLorebookEditor: lorebookEditor,
      isLorebookPage: lorebookPage,
      isLorebookExplorePage: lorebookExplore,
      lorebookId: lorebookMatch?.[1] && !["create", "edit"].includes(String(lorebookMatch[1]).toLowerCase()) ? lorebookMatch[1] : "",
      isFavoriteBotsPage: favoriteBots,
      isPublicCreatorPage: publicCreator,
      isSubscribePage: path === "/subscribe" || path.startsWith("/subscribe/"),
      isMyCreationsChatbotsPage: myCreationsChatbots,
      isMyCreationsLorebooksPage: myCreationsLorebooks,
      isPersonaPage: personaPage,
      isCreatorPage: botEditor || lorebookEditor || myCreationsChatbots || myCreationsLorebooks
    };
    return pageStateCache;
  };

  DS.getStablePageElement = function getStablePageElement(key, selector, root = document) {
    const cacheKey = String(key || selector || "");
    if (!cacheKey || !selector || !root?.querySelector) return null;
    const route = DS.getPageState?.().href || String(location.href || "");
    const cached = stablePageElements.get(cacheKey);
    if (cached?.route === route && cached.element?.isConnected) return cached.element;
    let element = null;
    try { element = root.querySelector(selector); } catch {}
    stablePageElements.set(cacheKey, { route, element });
    return element;
  };

  DS.isHomePage = () => !!DS.getPageState().isHome;
  DS.isChatsPage = () => !!DS.getPageState().isChatsPage;
  DS.isChatRootPage = () => !!DS.getPageState().isChatRootPage;
  DS.isChatListPage = () => !!DS.getPageState().isChatListPage;
  DS.isSingleChatPage = () => !!DS.getPageState().isSingleChatPage;
  DS.isStoryModePage = () => !!DS.getPageState().isStoryModePage;
  DS.isBotProfilePage = () => !!DS.getPageState().isBotProfilePage;
  DS.isFavoriteBotsPage = () => !!DS.getPageState().isFavoriteBotsPage;
  DS.isSubscribePage = () => !!DS.getPageState().isSubscribePage;
  DS.isMyCreationsChatbotsPage = () => !!DS.getPageState().isMyCreationsChatbotsPage;
  DS.isLorebookPage = () => !!DS.getPageState().isLorebookPage;
  DS.isLorebookExplorePage = () => !!DS.getPageState().isLorebookExplorePage;

  DS.chatIdFromHref = function chatIdFromHref(href) {
    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/chat\/([^/?#]+)/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  // /chat/<character>/<conversation> is the real persisted chat scope.
  // The first segment is the character id, so using it alone makes local
  // per-chat tools leak state into every conversation with the same bot.
  // Fresh unsaved chats do not have the second segment yet; give those a
  // temporary page-session scope and expose it for a one-time handoff once
  // SpicyChat creates the conversation id.
  let draftChatScopeHref = "";
  let draftChatScopeBotId = "";
  let draftChatScopeKey = "";
  const recentDraftScopeByBot = new Map();

  DS.getCurrentChatScope = function getCurrentChatScope() {
    const page = DS.getPageState?.() || {};
    if (!page.isSingleChatPage || !page.chatId) return null;

    const botId = String(page.chatId || "").trim();
    const conversationId = String(page.conversationId || "").trim();
    if (!botId) return null;

    if (conversationId) {
      const draftKey = recentDraftScopeByBot.get(botId) || "";
      // Force a new temporary key if the user later starts another fresh chat
      // with this same bot at /chat/<character>.
      draftChatScopeHref = `persisted:${String(location.href || "")}`;
      return {
        key: `conversation:${conversationId}`,
        botId,
        conversationId,
        persisted: true,
        legacyKey: botId,
        draftKey
      };
    }

    const href = String(location.href || "");
    if (!draftChatScopeKey || draftChatScopeBotId !== botId || draftChatScopeHref !== href) {
      draftChatScopeKey = `draft:${botId}:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      draftChatScopeBotId = botId;
      draftChatScopeHref = href;
      recentDraftScopeByBot.set(botId, draftChatScopeKey);
    }

    return {
      key: draftChatScopeKey,
      botId,
      conversationId: "",
      persisted: false,
      legacyKey: botId,
      draftKey: draftChatScopeKey
    };
  };

  DS.botIdFromHref = function botIdFromHref(href) {
    if (!href) return null;

    const chatId = DS.chatIdFromHref?.(href);
    if (chatId) return chatId;

    try {
      const url = new URL(href, location.origin);
      const match = url.pathname.match(/^\/chatbot\/([^/?#]+)/i);
      if (match) {
        const value = String(match[1] || "").trim();
        if (["create", "edit"].includes(value.toLowerCase())) return null;
        return value || null;
      }

      // Some compact/WebView listing builds keep the character id in a query
      // parameter even when the visible card link itself is not /chatbot/<id>.
      // Accept only UUID-like values so generic ?id= pagination/search values
      // cannot be mistaken for chatbot ids.
      for (const key of ["chatbotId", "characterId", "botId", "chatbot_id", "character_id"]) {
        const value = String(url.searchParams.get(key) || "").trim();
        if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(value)) return value;
      }
      return null;
    } catch {
      return null;
    }
  };

  function botIdentityFromRawValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const fromHref = DS.botIdFromHref?.(text) || DS.chatIdFromHref?.(text);
    if (fromHref) return String(fromHref).trim();
    const direct = text.match(/(?:^|[^0-9a-f])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[^0-9a-f]|$)/i);
    return direct?.[1] || "";
  }

  DS.cardBotIdentityCandidates = function cardBotIdentityCandidates(card, anchor = null) {
    const ids = [];
    const seen = new Set();
    const add = value => {
      const id = botIdentityFromRawValue(value);
      const key = String(id || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      ids.push(String(id).trim());
    };

    add(anchor?.href || anchor?.getAttribute?.("href"));
    add(anchor?.getAttribute?.("data-href"));

    const root = card || anchor;
    if (!root?.querySelectorAll) return ids;

    for (const link of root.querySelectorAll("a[href], [data-href]")) {
      add(link.getAttribute?.("href") || link.href);
      add(link.getAttribute?.("data-href"));
    }

    // Android/WebView builds have occasionally moved the id off the anchor and
    // onto the card/wrapper. Keep this intentionally narrow to identity-looking
    // attributes instead of scanning every text node on the card.
    const identityNodes = [root, ...root.querySelectorAll("[data-bot-id], [data-chatbot-id], [data-character-id], [data-chat-id], [data-id]")];
    for (const node of identityNodes) {
      for (const name of ["data-bot-id", "data-chatbot-id", "data-character-id", "data-chat-id", "data-id", "id"]) {
        add(node.getAttribute?.(name));
      }
      const dataset = node.dataset || {};
      for (const [key, value] of Object.entries(dataset)) {
        if (!/(?:bot|chatbot|character|chat).*id|^id$/i.test(key)) continue;
        add(value);
      }
    }

    return ids;
  };

  DS.realClick = function realClick(el, options = {}) {
    if (!el) return false;

    if (options?.scroll === true) {
      try {
        el.scrollIntoView({
          block: "center",
          inline: "center"
        });
      } catch {}
    }

    try {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true
        })
      );

      el.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true
        })
      );

      el.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true
        })
      );

      el.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true
        })
      );
    } catch {}

    el.click();
    return true;
  };

  DS.hideElement = function hideElement(el, reason = "") {
    if (!el) return;

    const wantedReason = String(reason || "");
    if (el.dataset.dsHidden !== "1") el.dataset.dsHidden = "1";
    if (el.dataset.dsReason !== wantedReason) el.dataset.dsReason = wantedReason;
    if (!el.classList.contains("ds-hidden")) el.classList.add("ds-hidden");
  };

  DS.unhideElement = function unhideElement(el) {
    if (!el) return;

    const hasHiddenClass = el.classList.contains("ds-hidden");
    const hasDimmedClass = el.classList.contains("ds-dimmed");
    const hasHiddenState = el.hasAttribute("data-ds-hidden");
    const hasReason = el.hasAttribute("data-ds-reason");
    if (!hasHiddenClass && !hasDimmedClass && !hasHiddenState && !hasReason) return;

    if (hasHiddenClass) el.classList.remove("ds-hidden");
    if (hasDimmedClass) el.classList.remove("ds-dimmed");
    if (hasHiddenState) delete el.dataset.dsHidden;
    if (hasReason) delete el.dataset.dsReason;
  };

  DS.setAttributeIfChanged = function setAttributeIfChanged(el, name, value) {
    if (!el || !name) return false;
    const wanted = String(value ?? "");
    if (el.getAttribute(name) === wanted) return false;
    el.setAttribute(name, wanted);
    return true;
  };

  DS.setDatasetIfChanged = function setDatasetIfChanged(el, key, value) {
    if (!el?.dataset || !key) return false;
    const wanted = String(value ?? "");
    if (el.dataset[key] === wanted) return false;
    el.dataset[key] = wanted;
    return true;
  };

  DS.setTextIfChanged = function setTextIfChanged(el, value) {
    if (!el) return false;
    const wanted = String(value ?? "");
    if (el.textContent === wanted) return false;
    el.textContent = wanted;
    return true;
  };

  DS.setClassState = function setClassState(el, className, enabled) {
    if (!el || !className) return false;
    const has = el.classList.contains(className);
    if (!!enabled === has) return false;
    el.classList.toggle(className, !!enabled);
    return true;
  };

  // Shared MutationObserver guard. Several QoL features watch broad SpicyChat
  // subtrees, and without a common ownership check one feature can wake another
  // simply by adding/updating its own controls. Keep this intentionally
  // conservative: it only classifies nodes that are explicitly QoL-owned.
  DS.isQolOwnedNode = function isQolOwnedNode(node) {
    const el = node instanceof Element ? node : node?.parentElement;
    if (!el) return false;
    if (el.dataset?.dsOwned === "1" || el.dataset?.dsOwner === "qol") return true;
    if (String(el.id || "").startsWith("ds-")) return true;
    if (Array.from(el.classList || []).some(name => String(name).startsWith("ds-"))) return true;
    return !!el.closest?.("[data-ds-owned='1'],[data-ds-owner='qol'],#ds-qol-panel,#ds-chat-export-modal");
  };

  DS.mutationIsQolOnly = function mutationIsQolOnly(mutation) {
    if (!mutation) return false;
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target && DS.isQolOwnedNode(target)) return true;

    const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
    if (!nodes.length) return false;
    return nodes.every(node => DS.isQolOwnedNode(node));
  };

  DS.mutationsHaveNativeChanges = function mutationsHaveNativeChanges(mutations) {
    return Array.from(mutations || []).some(mutation => !DS.mutationIsQolOnly?.(mutation));
  };

  DS.searchableTextForMatching = function searchableTextForMatching(value) {
    let text = "";

    try {
      text = typeof DS.normalizeTextForMatching === "function"
        ? DS.normalizeTextForMatching(value, { stripDecorativeSymbols: true })
        : String(value || "");
    } catch {
      text = String(value || "");
    }

    return text
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  DS.matchesSearchTerm = function matchesSearchTerm(text, term) {
    const haystack = DS.searchableTextForMatching(text);
    const needle = DS.searchableTextForMatching(term);

    if (!haystack || !needle) return false;

    return ` ${haystack} `.includes(` ${needle} `);
  };

  DS.unhideAllDragonScriptElements = function unhideAllDragonScriptElements(reasonPrefix = "") {
    DS.qsa('[data-ds-hidden="1"]').forEach(el => {
      const reason = String(el.dataset.dsReason || "");

      if (reasonPrefix && !reason.startsWith(reasonPrefix)) {
        return;
      }

      DS.unhideElement(el);
    });

    DS.qsa('.ds-dimmed').forEach(el => {
      if (!el.dataset.dsHidden) {
        el.classList.remove("ds-dimmed");
      }
    });

    // Compact-listing mode adds this helper class only to card grids. Always
    // remove any stale markers when QoL is disabled so a past bad match can
    // never keep SpicyChat's outer app grid in a squeezed/reordered state.
    DS.qsa('.ds-grid-dense').forEach(el => el.classList.remove('ds-grid-dense'));
  };

})();
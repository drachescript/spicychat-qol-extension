(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  DS.classText = el =>
    String(el?.className || "");

  DS.isRecommendationCardRoot = function isRecommendationCardRoot(el) {
    const cls = DS.classText(el);

    return (
      el &&
      cls.includes("rounded-xl") &&
      cls.includes("group") &&
      cls.includes("flex") &&
      cls.includes("flex-col") &&
      !!el.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']")
    );
  };

  DS.isChatHistoryRow = function isChatHistoryRow(el) {
    const cls = DS.classText(el);

    return (
      el &&
      cls.includes("rounded") &&
      cls.includes("relative") &&
      !!el.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']")
    );
  };

  DS.findRecommendationCardRoot = function findRecommendationCardRoot(anchor) {
    let el = anchor;

    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      if (el === document.body || el.id === "root") break;
      if (DS.isRecommendationCardRoot(el)) return el;
    }

    return null;
  };

  DS.findChatHistoryRow = function findChatHistoryRow(anchor) {
    let el = anchor;

    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      if (el === document.body || el.id === "root") break;
      if (DS.isChatHistoryRow(el)) return el;
    }

    return null;
  };

  DS.findFallbackCard = function findFallbackCard(anchor) {
    let fallback = anchor;
    let el = anchor.parentElement;

    for (let i = 0; el && i < 12; i++, el = el.parentElement) {
      if (el === document.body || el.id === "root") break;

      if (el.querySelector?.("textarea[placeholder='Message...'], button[aria-label='chat-dropdown'], nav, [role='navigation']")) {
        continue;
      }

      const links = DS.qsa("a[href*='/chat/'], a[href*='/chatbot/']", el);
      const textLen = DS.normalize(el.textContent).length;

      if (
        links.length >= 1 &&
        links.length <= 4 &&
        textLen > 35 &&
        textLen < 2600
      ) {
        fallback = el;
      }
    }

    return fallback;
  };

  DS.getCardFromChatLink = function getCardFromChatLink(anchor) {
    return (
      DS.findRecommendationCardRoot(anchor) ||
      DS.findChatHistoryRow(anchor) ||
      DS.findFallbackCard(anchor)
    );
  };

  DS.getBestHideTarget = function getBestHideTarget(card) {
    if (!card) return null;

    if (DS.isRecommendationCardRoot(card)) {
      const wrapper = card.parentElement;

      if (
        wrapper &&
        wrapper !== document.body &&
        wrapper.id !== "root" &&
        wrapper.children.length === 1 &&
        wrapper.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']").length >= 1
      ) {
        return wrapper;
      }
    }

    return card;
  };

  DS.isUnsafeCardHideTarget = function isUnsafeCardHideTarget(target) {
    if (!target) return true;
    if (target === document.documentElement || target === document.body || target.id === "root") return true;
    if (target.matches?.("main, [role='main'], [data-overlay-container='true'], [data-testid='SearchClientCharacterListing']")) return true;

    // Card filtering must never be allowed to hide an actual chat/page shell.
    // A fallback card match on a single chat used to climb to the large chat
    // container, and Hide Opened Chats could then blank the entire page.
    if (target.querySelector?.("textarea[placeholder='Message...'], button[aria-label='chat-dropdown'], nav, [role='navigation'], [data-testid='SearchClientCharacterListing']")) {
      return true;
    }

    // Last-resort page-scale guard. Recommendation cards are small. If a
    // candidate consumes most of the viewport and contains several bot links,
    // it is a listing/page shell rather than a single card and must never be
    // hidden by a card filter.
    try {
      const rect = target.getBoundingClientRect();
      const pageScale = rect.width >= Math.max(480, window.innerWidth * 0.72) && rect.height >= Math.max(360, window.innerHeight * 0.45);
      const botLinks = target.querySelectorAll?.("a[href*='/chat/'], a[href*='/chatbot/']")?.length || 0;
      if (pageScale && botLinks >= 3) return true;
    } catch {}

    return false;
  };

  DS.recoverAccidentalCardPageHide = function recoverAccidentalCardPageHide() {
    let restored = 0;
    DS.qsa?.("[data-ds-hidden='1']").forEach(target => {
      const reason = String(target.dataset?.dsReason || "");
      if (!(reason.startsWith("card:") || reason === "opened chat")) return;
      if (!DS.isUnsafeCardHideTarget?.(target)) return;
      DS.unhideElement?.(target);
      restored += 1;
    });

    if (restored) {
      DS.runtimeLog?.("warn", "cards", "Recovered an accidentally hidden chat page", { restored });
    }
    return restored;
  };


  DS.restoreOpenedCardsForSmartFilter = function restoreOpenedCardsForSmartFilter() {
    let restored = 0;
    for (const target of DS.qsa?.("[data-ds-hidden='1']") || []) {
      const reason = String(target.dataset?.dsReason || "");
      if (reason !== "opened chat" && reason !== "card:opened chat") continue;
      DS.unhideElement?.(target);
      restored += 1;
    }
    if (restored) {
      const runtime = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      runtime.openedSmartFilterRestores = Number(runtime.openedSmartFilterRestores || 0) + restored;
    }
    return restored;
  };

  DS.ensureCardHideSafetyWatchdog = function ensureCardHideSafetyWatchdog() {
    if (DS.state.cardHideSafetyWatchdog || !document.documentElement) return;
    const observer = new MutationObserver(records => {
      let restored = 0;
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof Element)) continue;
        const reason = String(target.dataset?.dsReason || "");
        const hidden = target.dataset?.dsHidden === "1" || target.classList?.contains("ds-hidden");
        if (!hidden || !(reason.startsWith("card:") || reason === "opened chat") || !DS.isUnsafeCardHideTarget?.(target)) continue;
        DS.unhideElement?.(target);
        restored += 1;
      }
      if (restored) {
        DS.runtimeLog?.("error", "cards", "Safety watchdog prevented a page-scale card hide", { restored, route: location.pathname });
        DS.setQuickStatus?.("QoL prevented a listing filter from hiding the whole page.");
      }
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class", "data-ds-hidden", "data-ds-reason"] });
    DS.state.cardHideSafetyWatchdog = observer;
  };

  DS.removeCardHideSafetyWatchdog = function removeCardHideSafetyWatchdog() {
    try { DS.state.cardHideSafetyWatchdog?.disconnect?.(); } catch {}
    DS.state.cardHideSafetyWatchdog = null;
  };

  DS.addDebugBadge = function addDebugBadge(card, reason) {
    if (!DS.state.settings.debug || !card) return;

    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }

    let badge = card.querySelector(":scope > .ds-card-debug-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "ds-card-debug-badge";
      card.appendChild(badge);
    }
    const text = String(reason || "").replace(/^card:/, "DS: ");
    const title = String(reason || "").replace(/^card:/, "");
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.title !== title) badge.title = title;
  };

  DS.hideCard = function hideCard(card, reason = "") {
    const target = DS.getBestHideTarget(card);

    if (!target || target.dataset.dsHidden === "1" || DS.isUnsafeCardHideTarget?.(target)) {
      return false;
    }

    target.dataset.dsHidden = "1";
    target.dataset.dsReason = reason;

    if (DS.state.settings.hiddenCardMode === "dim") {
      target.classList.add("ds-dimmed");
      DS.addDebugBadge(target, reason);
    } else {
      target.classList.add("ds-hidden");
    }

    return true;
  };

  function getParticipantCountFromCard(card) {
    const participantBlocks = DS.qsa(
      '[data-tooltip-content="Participant count"]',
      card
    );

    for (const block of participantBlocks) {
      const number = DS.qsa("span, p", block)
        .map(el => String(el.textContent || "").trim())
        .find(text => /^\d+$/.test(text));

      if (number) {
        return Number(number);
      }
    }

    const userIcon = card.querySelector(
      "svg.lucide-users, svg[class*='lucide-users']"
    );

    if (userIcon) {
      return 2;
    }

    return 1;
  }

  DS.isGroupChatCard = function isGroupChatCard(card) {
    return getParticipantCountFromCard(card) > 1;
  };


  DS.cardHasForYouBadge = function cardHasForYouBadge(card) {
    if (!card) return false;

    for (const el of DS.qsa("p, span, div", card)) {
      if (DS.normalize(el.textContent) !== "for you") continue;

      const badge = el.closest("div[class*='bg-purple'], div[class*='bottom-0'], div[class*='absolute']");
      const badgeClass = DS.classText(badge);
      const parentClass = DS.classText(badge?.parentElement);

      if (
        badgeClass.includes("bg-purple") ||
        badgeClass.includes("bottom-0") ||
        parentClass.includes("bottom-0")
      ) {
        return true;
      }
    }

    return false;
  };

  function compactTokenWindowMatch(preparedHaystack, matcher) {
    const target = String(matcher?.compact || "");
    if (!preparedHaystack || target.length < 3) return false;

    const hayTokens = String(preparedHaystack).split(" ").filter(Boolean);
    if (!hayTokens.length) return false;

    // Compare joined token windows instead of doing a raw substring check. This
    // makes TF141 == TF 141 and TaskForce 141 == Task Force 141 without making a
    // short blocked word such as "gas" accidentally match a token like "vegas".
    const matcherTokenCount = Math.max(1, Number(matcher?.tokens?.length || 1));
    const maxWindow = Math.min(hayTokens.length, matcherTokenCount + 3);

    for (let start = 0; start < hayTokens.length; start += 1) {
      let joined = "";
      for (let size = 1; size <= maxWindow && start + size <= hayTokens.length; size += 1) {
        joined += hayTokens[start + size - 1];
        if (joined === target) return true;
        if (joined.length > target.length + 2) break;
      }
    }

    return false;
  }

  function findPreparedMatch(preparedHaystack, matchers) {
    if (!preparedHaystack || !Array.isArray(matchers) || !matchers.length) return null;

    const padded = ` ${preparedHaystack} `;
    for (const matcher of matchers) {
      const variants = [matcher?.needle, matcher?.flexibleNeedle].filter(Boolean);
      if (variants.some(needle => padded.includes(` ${needle} `))) {
        return matcher;
      }

      if (compactTokenWindowMatch(preparedHaystack, matcher)) {
        return matcher;
      }
    }

    return null;
  }

  function findPreparedMatchInFields(fields, matchers) {
    for (const field of fields || []) {
      const match = findPreparedMatch(field, matchers);
      if (match) return match;
    }
    return null;
  }

  function findUnorderedNameMatch(fields, matchers) {
    for (const field of fields || []) {
      const hayTokens = String(field || "").split(" ").filter(Boolean);
      if (!hayTokens.length) continue;
      const haySet = new Set(hayTokens);

      for (const matcher of matchers || []) {
        const tokens = Array.isArray(matcher?.tokens) ? matcher.tokens.filter(Boolean) : [];
        const meaningfulWords = tokens.filter(token => /^\p{L}{3,}$/u.test(token));

        // Only use order-insensitive matching for entries with at least two
        // meaningful word tokens. That covers nickname/name lists such as
        // "Ghost Simon" -> "Simon Ghost Riley" without making single broad
        // words unexpectedly fuzzy.
        if (meaningfulWords.length < 2) continue;
        if (tokens.every(token => haySet.has(token))) return matcher;
      }
    }

    return null;
  }

  function preparedCardFields(card, fallbackPreparedText = "") {
    const prepare = value => DS.searchableTextForMatching?.(value || "") || DS.normalize(value || "");
    const title = prepare(DS.getCardTitle?.(card) || "");
    const description = prepare(DS.getCardDescriptionText?.(card) || "");
    const creatorCandidates = [];
    const creatorSeen = new Set();
    const addCreator = rawValue => {
      const raw = String(rawValue || "").replace(/\s+/g, " ").trim();
      if (!raw) return;
      const value = prepare(raw.replace(/^@+/, ""));
      if (!value || creatorSeen.has(value)) return;
      creatorSeen.add(value);
      creatorCandidates.push(value);
    };
    DS.qsa("a[href*='/creator/'], a[aria-label*='creator' i]", card).forEach(link => {
      addCreator(link.textContent || "");
      addCreator(link.getAttribute?.("aria-label") || "");
      addCreator(link.getAttribute?.("title") || "");
      try {
        const url = new URL(link.href, location.origin);
        const handle = url.pathname.match(/\/creator\/([^/?#]+)/i)?.[1] || "";
        if (handle) addCreator(decodeURIComponent(handle));
      } catch {}
    });
    const pageCreator = String(location.pathname || "").match(/^\/creator\/([^/?#]+)/i)?.[1] || "";
    if (pageCreator) {
      try { addCreator(decodeURIComponent(pageCreator)); } catch { addCreator(pageCreator); }
    }
    const creator = creatorCandidates[0] || "";
    const all = fallbackPreparedText || prepare(card?.textContent || "");

    // SpicyChat has used several different card title layouts. Keep a small set
    // of title-ish candidates instead of trusting one DOM selector. This avoids
    // missing a blocked name when a badge/tag happens to be the first short text
    // element in a recycled React card.
    const nameCandidates = [];
    const seenCandidates = new Set();
    const addCandidate = rawValue => {
      const raw = String(rawValue || "").replace(/\s+/g, " ").trim();
      if (!raw || raw.length > 180 || raw.startsWith("@")) return;
      const value = prepare(raw);
      if (!value || seenCandidates.has(value)) return;
      if (["for you", "chat", "profile", "info", "new", "op"].includes(value)) return;
      seenCandidates.add(value);
      nameCandidates.push(value);
    };

    addCandidate(DS.getCardTitle?.(card) || "");
    DS.qsa(
      "h1, h2, h3, p, span, [data-testid*='name'], [data-testid*='title'], [class*='font-bold'], [class*='font-semibold'], a[href*='/chat/'], a[href*='/chatbot/']",
      card
    ).forEach(el => addCandidate(el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || ""));

    return {
      title,
      description,
      creator,
      creatorCandidates,
      all,
      nameCandidates,
      nameDescriptionCandidates: [...nameCandidates, description].filter(Boolean)
    };
  }

  DS.shouldHideBlockedBot = function shouldHideBlockedBot(card, anchor, preparedText = "", preparedFields = null) {
    const id = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref(anchor.href || "");

    if (id && DS.state.blockedBotIdSet?.has(id)) {
      return `blocked bot id: ${id}`;
    }

    const fields = typeof preparedFields === "function"
      ? preparedFields()
      : (preparedFields || preparedCardFields(card, preparedText));
    const blockedNameMatchers = DS.state.preparedMatchers?.blockedNames || [];
    const match = findPreparedMatchInFields(
      fields.nameCandidates.length ? fields.nameCandidates : [fields.title, fields.all],
      blockedNameMatchers
    ) || findUnorderedNameMatch(fields.nameCandidates, blockedNameMatchers);

    if (match) {
      return `blocked bot: ${match.raw}`;
    }

    return null;
  };

  DS.shouldHideNotInterestedBot = function shouldHideNotInterestedBot(card, anchor) {
    const id = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref(anchor.href || "");

    if (id && DS.state.notInterestedBotIdSet?.has(id)) {
      return `not interested bot id: ${id}`;
    }

    return null;
  };

  DS.shouldHideCard = function shouldHideCard(card, anchor, context = {}) {
    const { settings, openedChats } = DS.state;
    const discoveryContext = !!context.discovery;
    const homeContext = !!context.home;
    const preparedText = DS.searchableTextForMatching?.(card.textContent || "") || DS.normalize(card.textContent);
    const id = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref(anchor.href || "");
    let preparedFields = null;
    const getPreparedFields = () => preparedFields || (preparedFields = preparedCardFields(card, preparedText));

    if (!discoveryContext && DS.isBotProfilePage()) {
      return null;
    }

    if (!discoveryContext && DS.isFavoriteBotsPage() && settings.neverHideFavorites !== false) {
      return null;
    }

    if (settings.protectFavoriteCreatorsFromFiltering !== false) {
      // On a creator profile, all listed cards belong to the creator in the
      // route. Protect the whole page when that creator is favorited. This is
      // more reliable than depending only on each card's creator link and also
      // restores already-hidden opened-chat cards immediately after favoriting.
      const pageCreator = DS.currentCreatorHandle?.();
      if (pageCreator && DS.isFavoriteCreator?.(pageCreator)) {
        return null;
      }

      if (DS.cardHasFavoriteCreator?.(card)) {
        return null;
      }
    }

    const isSavedForLater = !!DS.cardIsSavedForLater?.(card, anchor);

    if (
      settings.hideLaterBotsFromListings &&
      !context.ignoreLater &&
      isSavedForLater &&
      (!DS.isChatListPage() || discoveryContext)
    ) {
      return "saved for later";
    }

    if (
      settings.protectLaterBotsFromFiltering &&
      isSavedForLater
    ) {
      return null;
    }

    if (
      settings.hideHomeForYouCards &&
      !DS.shouldDeferToSaiToolkit?.("home-for-you") &&
      (DS.isHomePage?.() || homeContext) &&
      DS.cardHasForYouBadge(card)
    ) {
      return "home For You badge";
    }

    if (settings.hideGroupChats && DS.isGroupChatCard(card)) {
      return "group chat / multiple participants";
    }

    const languageReason = DS.shouldHideByLanguage?.(card);
    if (languageReason) return languageReason;

    const blockedReason = DS.shouldHideBlockedBot(card, anchor, preparedText, getPreparedFields);
    if (blockedReason) return blockedReason;

    const notInterestedReason = DS.shouldHideNotInterestedBot?.(card, anchor);
    if (notInterestedReason) return notInterestedReason;

    const recommendationReason = DS.shouldHideRecommendationCard?.(card, anchor, context);
    if (recommendationReason) return recommendationReason;

    if (
      settings.hideOpenedChats &&
      !context.ignoreOpened &&
      (!DS.isChatListPage() || discoveryContext) &&
      !DS.isMyCreationsChatbotsPage?.() &&
      id &&
      openedChats.has(id)
    ) {
      return "opened chat";
    }

    if (settings.blockCards) {
      const fields = getPreparedFields();
      const tagMatch = findPreparedMatch(fields.all, DS.state.preparedMatchers?.blockedTags || []);
      if (tagMatch) return `blocked tag: ${tagMatch.raw}`;

      // Blocked words use the detected name/description plus several title-ish
      // candidates because SpicyChat card markup changes frequently. Matching is
      // punctuation/spacing tolerant, and multi-word name entries can also match
      // the same name tokens in a different order (for example Ghost Simon ->
      // Simon “Ghost” Riley).
      const wordMatchers = DS.state.preparedMatchers?.blockedWords || [];
      const wordFields = fields.nameDescriptionCandidates.length
        ? fields.nameDescriptionCandidates
        : [fields.title, fields.description, fields.all].filter(Boolean);
      const wordMatch = findPreparedMatchInFields(wordFields, wordMatchers)
        || findUnorderedNameMatch(fields.nameCandidates, wordMatchers);
      if (wordMatch) return `blocked word: ${wordMatch.raw}`;

      const creatorMatch = findPreparedMatchInFields(
        fields.creatorCandidates?.length ? fields.creatorCandidates : (fields.creator ? [fields.creator] : [fields.all]),
        DS.state.preparedMatchers?.blockedCreators || []
      );
      if (creatorMatch) return `blocked creator: ${creatorMatch.raw}`;
    }

    return null;
  };


  DS.getCardBlockingDiagnostic = function getCardBlockingDiagnostic(card, anchor) {
    if (!card || !anchor) return null;
    const preparedText = DS.searchableTextForMatching?.(card.textContent || "") || DS.normalize(card.textContent || "");
    const fields = preparedCardFields(card, preparedText);
    const wordMatchers = DS.state.preparedMatchers?.blockedWords || [];
    const wordFields = fields.nameDescriptionCandidates.length
      ? fields.nameDescriptionCandidates
      : [fields.title, fields.description, fields.all].filter(Boolean);
    const word = findPreparedMatchInFields(wordFields, wordMatchers) || findUnorderedNameMatch(fields.nameCandidates, wordMatchers);
    const creator = findPreparedMatchInFields(fields.creatorCandidates?.length ? fields.creatorCandidates : [fields.creator, fields.all].filter(Boolean), DS.state.preparedMatchers?.blockedCreators || []);
    const tag = findPreparedMatch(fields.all, DS.state.preparedMatchers?.blockedTags || []);
    return {
      title: DS.getCardTitle?.(card) || "",
      description: DS.getCardDescriptionText?.(card) || "",
      creators: fields.creatorCandidates || [],
      word: word?.raw || "",
      creator: creator?.raw || "",
      tag: tag?.raw || ""
    };
  };

  DS.collectCards = function collectCards() {
    const revision = Number(DS.state?.domRevision || 0);
    const url = location.href;

    if (
      Array.isArray(DS.state?.cardCache) &&
      DS.state.cardCacheRevision === revision &&
      DS.state.cardCacheUrl === url
    ) {
      return DS.state.cardCache;
    }

    const cards = [];
    const seen = new Set();

    DS.qsa("a[href*='/chat/'], a[href*='/chatbot/']").forEach(anchor => {
      const id = DS.botIdFromHref?.(anchor.href) || DS.chatIdFromHref(anchor.href);
      if (!id) return;

      const card = DS.getCardFromChatLink(anchor);
      if (!card || seen.has(card)) return;

      seen.add(card);
      cards.push({ card, anchor });
    });

    DS.state.cardCache = cards;
    DS.state.cardCacheRevision = revision;
    DS.state.cardCacheUrl = url;
    return cards;
  };

  function cleanCardText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cardDisplayNormalizationEnabled() {
    const settings = DS.state.settings || {};
    return !!settings.enabled && !!settings.textNormalizationEnabled && (
      !!settings.normalizeFancyUnicode ||
      !!settings.normalizePunctuation ||
      !!settings.normalizeInvisibleCharacters ||
      !!settings.normalizeDecorativeSymbols
    );
  }

  function normalizedDisplayText(value) {
    const text = String(value || "");
    if (!text) return text;
    if (typeof DS.normalizeTextForDisplay === "function") return DS.normalizeTextForDisplay(text);
    if (typeof DS.normalizeTextForMatching !== "function") return text;
    return DS.normalizeTextForMatching(text).replace(/\s+/g, " ").trim();
  }

  function normalizeCardDisplayElement(el) {
    if (!el || el.closest?.("button, input, textarea, select")) return;

    const current = String(el.textContent || "");
    const previousApplied = String(el.dataset.dsNormalizedApplied || "");
    let source = el.dataset.dsNormalizedOriginal;

    // React may recycle the same card DOM node for a different bot. If the
    // visible text no longer equals the value QoL last applied, treat it as a
    // new source value instead of restoring stale text from the previous card.
    if (source == null || (previousApplied && current !== previousApplied)) {
      source = current;
    }

    const normalized = normalizedDisplayText(source);
    if (normalized === source) {
      delete el.dataset.dsNormalizedOriginal;
      delete el.dataset.dsNormalizedApplied;
      return;
    }

    el.dataset.dsNormalizedOriginal = source;
    el.dataset.dsNormalizedApplied = normalized;
    if (current !== normalized) el.textContent = normalized;
  }

  function restoreCardDisplayElement(el) {
    if (!el || el.dataset.dsNormalizedOriginal == null) return;
    const applied = String(el.dataset.dsNormalizedApplied || "");
    if (!applied || String(el.textContent || "") === applied) {
      el.textContent = el.dataset.dsNormalizedOriginal;
    }
    delete el.dataset.dsNormalizedOriginal;
    delete el.dataset.dsNormalizedApplied;
  }

  DS.applyCardDisplayNormalization = function applyCardDisplayNormalization(cards = DS.collectCards?.() || []) {
    const enabled = cardDisplayNormalizationEnabled();

    if (!enabled) {
      DS.qsa?.("[data-ds-normalized-original]").forEach(restoreCardDisplayElement);
      return;
    }

    for (const { card } of cards) {
      const title = card.querySelector?.("a[aria-label^='chat-with-'][title], a[aria-label^='chat-with-'], a[href*='/chat/'][title]");
      if (title) normalizeCardDisplayElement(title);

      const descriptionBlock = findDescriptionBlock(card);
      if (descriptionBlock) {
        const leaves = DS.qsa?.("p, span", descriptionBlock).filter(el => !el.querySelector?.("p, span")) || [];
        if (leaves.length) leaves.forEach(normalizeCardDisplayElement);
        else normalizeCardDisplayElement(descriptionBlock);
      }
    }
  };

  function isLikelyTagText(text) {
    const clean = String(text || "").toLowerCase();
    const tagWords = [
      "female", "male", "malepov", "femalepov", "romantic", "scenario",
      "fantasy", "english", "anime", "real", "comedy", "roommate", "action",
      "dominant", "submissive", "for you", "nsfw"
    ];

    return tagWords.includes(clean) || /^\d+(\.\d+)?k?$/.test(clean);
  }

  function findDescriptionBlock(card) {
    if (!card) return null;

    const exactSelectors = [
      ":scope > div[class*='px-2'][class*='py-3'] > div[class*='line-clamp-2'][class*='group-hover:line-clamp-none']",
      ":scope > div[class*='px-2'][class*='py-3'] > div[class*='scrollbar-hide'][class*='overflow-y-auto']",
      "div[class*='line-clamp-2'][class*='group-hover:line-clamp-none']",
      "div[class*='scrollbar-hide'][class*='overflow-y-auto']"
    ];

    for (const selector of exactSelectors) {
      let block = null;

      try {
        block = card.querySelector(selector);
      } catch {
        block = null;
      }

      if (!block) continue;
      if (block.querySelector?.("a, button, input, textarea, select")) continue;

      const text = cleanCardText(block.textContent);
      if (text.length >= 20 && !isLikelyTagText(text)) return block;
    }

    const title = cleanCardText(DS.getCardTitle?.(card));
    const candidates = DS.qsa("p, span, div", card)
      .filter(el => !el.closest?.("#ds-qol-panel"))
      .filter(el => !el.closest?.("a, button, input, textarea, select"))
      .filter(el => !el.querySelector?.("a, button, input, textarea, select"))
      .filter(el => {
        try {
          const rect = el.getBoundingClientRect();
          return !!(rect.width || rect.height);
        } catch {
          return true;
        }
      })
      .map(el => {
        const text = cleanCardText(el.textContent);
        const cls = DS.classText(el);
        const childCount = el.children?.length || 0;
        const score =
          (cls.includes("line-clamp-2") ? 260 : 0) +
          (cls.includes("group-hover:line-clamp-none") ? 180 : 0) +
          (cls.includes("scrollbar-hide") ? 120 : 0) +
          (cls.includes("overflow-y-auto") ? 80 : 0) +
          (cls.includes("text-gray-11") ? 35 : 0) +
          (cls.includes("paragraph") ? 25 : 0) +
          (el.tagName === "P" ? 35 : 0) +
          (el.tagName === "SPAN" ? 10 : 0) +
          Math.min(text.length, 160) -
          childCount * 35;

        return { el, text, score };
      })
      .filter(item => item.text.length >= 20)
      .filter(item => item.text.length <= 700)
      .filter(item => item.text !== title)
      .filter(item => !item.text.startsWith("@"))
      .filter(item => !isLikelyTagText(item.text));

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.el || null;
  }

  function descriptionSignature(block) {
    return cleanCardText(block?.textContent).slice(0, 240);
  }

  function isLongDescription(block) {
    if (!block) return false;

    const text = cleanCardText(block.textContent);
    if (text.length < 40) return false;

    try {
      const rect = block.getBoundingClientRect();
      const visibleHeight = Math.max(rect.height, block.clientHeight || 0);
      const fullHeight = block.scrollHeight || 0;

      if (fullHeight > visibleHeight + 3) return true;
    } catch {
      // Fall back to a text-length estimate below.
    }

    return text.length >= 78;
  }

  function clearDescriptionExpansion(root) {
    const host = root || document;
    const items = [];

    if (host.matches?.("[data-ds-description-expanded='1']")) items.push(host);
    items.push(...(DS.qsa?.("[data-ds-description-expanded='1']", host) || []));

    items.forEach(el => {
      el.removeAttribute("data-ds-description-expanded");
      el.classList.remove("ds-card-description-block");
      [
        "display",
        "-webkit-line-clamp",
        "line-clamp",
        "-webkit-box-orient",
        "max-height",
        "min-height",
        "overflow",
        "overflow-y",
        "scrollbar-width",
        "white-space"
      ].forEach(prop => el.style.removeProperty(prop));
    });
  }

  function lockDescriptionExpansion(block) {
    if (!block) return;

    if (block.dataset.dsDescriptionExpanded !== "1") block.dataset.dsDescriptionExpanded = "1";
    if (!block.classList.contains("ds-card-description-block")) block.classList.add("ds-card-description-block");

    // Older patches wrote clamp styles directly onto whichever element was
    // selected. Clear those old inline rules and let content.css own the
    // stable layout so React can replace the description node safely.
    [
      "display",
      "-webkit-line-clamp",
      "line-clamp",
      "-webkit-box-orient",
      "max-height",
      "min-height",
      "overflow",
      "overflow-y",
      "scrollbar-width",
      "white-space"
    ].forEach(prop => block.style.removeProperty(prop));
  }

  DS.applyCardDescriptionExpansion = function applyCardDescriptionExpansion() {
    const settings = DS.state.settings || {};

    if (!settings.enabled || !settings.expandLongCardDescriptions) {
      DS.qsa(".ds-card-long-description").forEach(card => {
        card.classList.remove("ds-card-long-description");
        delete card.dataset.dsDescriptionSignature;
        delete card.dataset.dsDescriptionLong;
      });
      clearDescriptionExpansion(document);
      return;
    }

    const cards = DS.collectCards?.() || [];
    const activeBlocks = new Set();

    for (const { card } of cards) {
      const block = findDescriptionBlock(card);

      if (!block) {
        card.classList.remove("ds-card-long-description");
        delete card.dataset.dsDescriptionSignature;
        delete card.dataset.dsDescriptionLong;
        clearDescriptionExpansion(card);
        continue;
      }

      const signature = descriptionSignature(block);
      const sameDescription = card.dataset.dsDescriptionSignature === signature;
      let shouldExpand = sameDescription && card.dataset.dsDescriptionLong === "1";

      if (!sameDescription) {
        // Remove any stale styles from a recycled/virtualized card before
        // measuring SpicyChat's normal two-line description.
        card.classList.remove("ds-card-long-description");
        clearDescriptionExpansion(card);
        shouldExpand = isLongDescription(block);
        card.dataset.dsDescriptionSignature = signature;
        card.dataset.dsDescriptionLong = shouldExpand ? "1" : "0";
      }

      card.classList.toggle("ds-card-long-description", shouldExpand);

      DS.qsa("[data-ds-description-expanded='1']", card).forEach(old => {
        if (old !== block) clearDescriptionExpansion(old);
      });

      if (shouldExpand) {
        activeBlocks.add(block);
        lockDescriptionExpansion(block);
      } else {
        clearDescriptionExpansion(block);
      }
    }

    DS.qsa("[data-ds-description-expanded='1']").forEach(old => {
      if (!activeBlocks.has(old) && !old.closest?.(".ds-card-long-description")) {
        clearDescriptionExpansion(old);
      }
    });
  };


  DS.compactLayouts = function compactLayouts(cards) {
    if (!DS.state.settings.compactAfterHiding) {
      DS.qsa?.(".ds-grid-dense").forEach(parent => parent.classList.remove("ds-grid-dense"));
      return;
    }

    const parents = new Set();

    for (const { card } of cards) {
      const target = DS.getBestHideTarget(card);
      const parent = target?.parentElement;

      if (parent) parents.add(parent);
    }

    // Only compact actual card grids. SpicyChat's outer app shell is also a
    // CSS grid; marking that shell as dense can swap the main column/sidebar
    // placement after a SPA rerender and leave the whole page squeezed into
    // the narrow navigation column.
    for (const parent of parents) {
      if (!DS.classText(parent).includes("grid")) continue;
      if (parent.querySelector?.("nav, [role='navigation']")) {
        parent.classList.remove("ds-grid-dense");
        continue;
      }
      parent.classList.add("ds-grid-dense");
    }
  };

  DS.applyCardHiding = async function applyCardHiding() {
    if (!DS.state.settings.enabled) return;

    DS.recoverAccidentalCardPageHide?.();

    if (DS.isSingleChatPage?.() || DS.isBotProfilePage()) {
      return;
    }

    const cards = DS.collectCards();
    DS.applyCardDisplayNormalization?.(cards);

    if (DS.isFavoriteBotsPage() && DS.state.settings.neverHideFavorites !== false) {
      return;
    }
    let hidden = 0;
    let processed = 0;
    const chunkLargeListing = cards.length >= 80;

    for (const { card, anchor } of cards) {
      processed += 1;
      if (chunkLargeListing && processed > 1 && processed % 36 === 0) {
        // A 100-200 card grid can otherwise become one long synchronous task.
        // Yield between small chunks so Brave/Chrome can paint and process input.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const target = DS.getBestHideTarget(card);

      if (!target) {
        continue;
      }

      const existingReason = String(target.dataset.dsReason || "");
      // An explicit Smart Filter = Opened should win over the general
      // "hide opened bots" discovery preference. Otherwise the Smart Filter
      // can correctly match an opened card only for the earlier hide pass to
      // remove it again, producing an apparently empty listing.
      const reason = DS.shouldHideCard(card, anchor, {
        // An explicit membership Smart Filter should temporarily win over the
        // matching "hide saved/opened" preference. Unrelated safety/content
        // filters still apply normally.
        ignoreOpened: !!DS.smartFilterWantsOpened?.(),
        ignoreFavorite: !!DS.smartFilterWantsFavorites?.(),
        ignoreLater: !!DS.smartFilterWantsLater?.()
      });

      if (target.dataset.dsHidden === "1") {
        const isManagedCardReason =
          existingReason.startsWith("card:") ||
          existingReason === "opened chat";

        if (isManagedCardReason) {
          const wasLanguageHidden = existingReason.startsWith("card:language:");

          if (!reason) {
            if (wasLanguageHidden) {
              const languageStillEnabled =
                !!DS.state.settings.enableLanguageFilter &&
                Array.isArray(DS.state.settings.allowedLanguages) &&
                DS.state.settings.allowedLanguages.length > 0;
              const hasDescription = card.dataset.dsLanguageDescriptionPresent === "1";

              if (!languageStillEnabled) {
                delete card.dataset.dsLanguageAllowedPasses;
                DS.unhideElement(target);
              } else if (hasDescription) {
                const passes = Number(card.dataset.dsLanguageAllowedPasses || 0) + 1;
                card.dataset.dsLanguageAllowedPasses = String(passes);

                // Require two matching allowed-language checks before unhiding.
                // This prevents recycled/loading cards from flashing in and out.
                if (passes >= 2) {
                  delete card.dataset.dsLanguageAllowedPasses;
                  DS.unhideElement(target);
                }
              }
            } else {
              DS.unhideElement(target);
            }
          } else {
            delete card.dataset.dsLanguageAllowedPasses;
            if (existingReason !== `card:${reason}`) {
              target.dataset.dsReason = `card:${reason}`;
              DS.addDebugBadge?.(target, `card:${reason}`);
            }
          }
        }

        continue;
      }

      if (reason && DS.hideCard(card, `card:${reason}`)) {
        hidden++;
      }
    }

    DS.compactLayouts(cards);

    if (hidden > 0) {
      DS.updateQuickPanel?.();
    }
  };
})();
if (!window.__DSQ_TAB_GATE__?.paused) {
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
      if (el === document.body || el.id === "root" || DS.isNativePickerSurface?.(el) || DS.containsNativePickerSurface?.(el)) break;

      if (el.querySelector?.("textarea[placeholder='Message...'], button[aria-label='chat-dropdown'], nav, [role='navigation']")) {
        continue;
      }

      // A shared grid may contain hundreds of links. Check its link count
      // before reading and normalizing the text of the entire grid; those
      // ancestors cannot qualify as an individual fallback card anyway.
      const linkCount = el.querySelectorAll("a[href*='/chat/'], a[href*='/chatbot/']").length;
      if (linkCount < 1 || linkCount > 4) continue;
      const textLen = DS.normalize(el.textContent).length;

      if (
        textLen > 35 &&
        textLen < 2600
      ) {
        fallback = el;
      }
    }

    return fallback;
  };

  DS.getCardFromChatLink = function getCardFromChatLink(anchor) {
    if (DS.isNativePickerSurface?.(anchor)) return null;
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
        // isRecommendationCardRoot has already verified a chat link inside
        // this sole child. A second full wrapper query is redundant.
        wrapper.children.length === 1
      ) {
        return wrapper;
      }
    }

    return card;
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

    if (!target || DS.isUnsafeCardHideTarget?.(target)) return false;

    // React/listing helpers can reuse a hidden wrapper and overwrite its class
    // while leaving QoL's data-ds-hidden marker behind. Repair that mismatch
    // instead of deciding the card is already hidden and letting it reappear.
    const dim = DS.state.settings.hiddenCardMode === "dim";
    const wasHidden = target.dataset.dsHidden === "1";
    const hasVisualHide = dim
      ? target.classList.contains("ds-dimmed")
      : target.classList.contains("ds-hidden");
    if (wasHidden && hasVisualHide) return false;

    if (!wasHidden) target.dataset.dsHidden = "1";
    if (!wasHidden || !target.dataset.dsReason) target.dataset.dsReason = reason;
    if (dim) {
      if (target.classList.contains("ds-hidden")) target.classList.remove("ds-hidden");
      if (!target.classList.contains("ds-dimmed")) target.classList.add("ds-dimmed");
      DS.addDebugBadge(target, reason);
    } else {
      if (target.classList.contains("ds-dimmed")) target.classList.remove("ds-dimmed");
      if (!target.classList.contains("ds-hidden")) target.classList.add("ds-hidden");
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
    const target = String(matcher?.compact || "").toLocaleLowerCase();
    if (!preparedHaystack || target.length < 3) return false;

    const hayTokens = Array.isArray(preparedHaystack)
      ? preparedHaystack
      : String(preparedHaystack).toLocaleLowerCase().split(" ").filter(Boolean);
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

    const normalizedHaystack = String(preparedHaystack).toLocaleLowerCase();
    const padded = ` ${normalizedHaystack} `;
    // The same card description may be compared against hundreds of blocked
    // words. Split into tokens only once per field, not once per matcher.
    let hayTokens = null;
    for (const matcher of matchers) {
      const variants = [matcher?.needle, matcher?.flexibleNeedle].filter(Boolean).map(value => String(value).toLocaleLowerCase());
      if (variants.some(needle => padded.includes(` ${needle} `))) {
        return matcher;
      }

      if (String(matcher?.compact || "").length >= 3) {
        hayTokens ||= normalizedHaystack.split(" ").filter(Boolean);
        if (compactTokenWindowMatch(hayTokens, matcher)) return matcher;
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

  // Weak references permit React's old pagination cards to be collected.
  // Compare native text *and* filter settings before reusing expensive tag,
  // creator and description extraction. Dirty cards invalidate on mutation.
  const preparedMetadataCache = new WeakMap();
  function cachedPreparedCardFields(card) {
    const settings = DS.state?.settings || {};
    const nativeText = String(card?.textContent || "");
    const context = [location.pathname, DS.state?.cardFilterStateRevision || 0,
      settings.blockCards === true, settings.autoBlockTagMatches === true,
      settings.autoBlockWordMatches === true].join("|");
    const cached = preparedMetadataCache.get(card);
    if (cached?.context === context && cached.nativeText === nativeText) {
      const metrics = DS.state?.runtimePerformance;
      if (metrics) metrics.cardMetadataCacheHits = (metrics.cardMetadataCacheHits || 0) + 1;
      return cached.fields;
    }
    const fields = preparedCardFields(card, DS.searchableTextForMatching?.(nativeText) || DS.normalize(nativeText));
    preparedMetadataCache.set(card, { context, nativeText, fields });
    return fields;
  }
  function preparedCardFields(card, fallbackPreparedText = "") {
    // Keep both spellings for blocked-word matching. A user who blocks
    // "TF141" or "TF 141" should match "TF141's Omega", while a rule that
    // explicitly contains "TF141's" must continue to match as before.
    const prepareOriginal = value => String(DS.searchableTextForMatching?.(value || "") || DS.normalize(value || "") || "").toLocaleLowerCase();
    const prepare = value => prepareOriginal(String(value || "").replace(/([\p{L}\p{N}])['\u2019]s\b/giu, "$1"));
    const rawTitle = DS.getCardTitle?.(card) || "";
    const rawDescription = DS.getCardDescriptionText?.(card) || "";
    const title = prepare(rawTitle);
    const titleOriginal = prepareOriginal(rawTitle);
    const description = prepare(rawDescription);
    const descriptionOriginal = prepareOriginal(rawDescription);
    const descriptionVariants = [...new Set([description, descriptionOriginal].filter(Boolean))];
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
    const settings = DS.state?.settings || {};
    const inspectTags = settings.blockCards && (settings.autoBlockTagMatches || settings.autoBlockWordMatches);
    // Only trust tag-like UI elements. Native cards also use aria-labels on
    // their Chat/Profile/Follow buttons; interpreting those as tags caused
    // misleading "blocked tag" matches against character names.
    const tagButtons = inspectTags ? (DS.qsa?.("button[aria-label]", card) || []) : [];
    const cardTagLabels = inspectTags ? [
      ...(DS.getCardTags?.(card) || []),
      ...tagButtons.filter(button => {
        if (button.closest?.("[data-ds-owned='1'], [data-ds-owner='qol']")) return false;
        const label = String(button.getAttribute?.("aria-label") || "").trim();
        if (/^(?:chat(?:[-_\s]+with)?|favorite|unfavorite|block|profile|edit|search|share|follow|unfollow|more|load|report|copy|menu)\b/i.test(label)) return false;
        const cls = `${String(button.className || "")} ${String(button.parentElement?.className || "")}`;
        return !!button.closest?.("[data-testid*='tag' i]") || /^tag[:\s]/i.test(label) || /(?:^|[\s_-])(?:tag|chip|pill)(?:$|[\s_-])/i.test(cls);
      }).map(button => String(button.getAttribute("aria-label") || button.textContent || "").trim())
    ] : [];
    const nativeTagLabels = DS.qsa?.("[data-testid*='tag' i] button, [data-testid*='tag' i] span, a[href*='/tag/'], button[aria-label^='tag:' i]", card)
      .map(element => element.getAttribute?.("aria-label") || element.textContent || "") || [];
    const tagValues = new Set([...cardTagLabels, ...nativeTagLabels].map(prepare).filter(Boolean));
    const verifiedNameCandidates = [...new Set([title, titleOriginal]
      .filter(value => value && !tagValues.has(value)))];
    if (settings.autoBlockWordMatches) {
      const nativeNameLink = card?.querySelector?.(
        "a[aria-label^='chat-with-'][href*='/chat/'], a[aria-label^='chat-with-'][href*='/chatbot/']"
      );
      if (nativeNameLink) {
        for (const candidate of [
          String(nativeNameLink.getAttribute('aria-label') || '').replace(/^chat-with-/i, ''),
          nativeNameLink.querySelector('img[alt]')?.getAttribute('alt') || ''
        ]) {
          for (const verified of new Set([prepare(candidate), prepareOriginal(candidate)])) {
            if (verified && !tagValues.has(verified) && verified.length <= 180) {
              verifiedNameCandidates.push(verified);
            }
          }
        }
      }
    }
    if (!verifiedNameCandidates.length && settings.autoBlockWordMatches) {
      DS.qsa("h1, h2, h3, [data-testid*='name'], [data-testid*='title']", card)
        .forEach(el => verifiedNameCandidates.push(prepare(el?.textContent || ""), prepareOriginal(el?.textContent || "")));
    }

    // SpicyChat has used several different card title layouts. Keep a small set
    // of title-ish candidates instead of trusting one DOM selector. This avoids
    // missing a blocked name when a badge/tag happens to be the first short text
    // element in a recycled React card.
    const nameCandidates = [];
    const seenCandidates = new Set();
    const addCandidate = rawValue => {
      const raw = String(rawValue || "").replace(/\s+/g, " ").trim();
      if (!raw || raw.length > 180 || raw.startsWith("@")) return;
      for (const value of new Set([prepare(raw), prepareOriginal(raw)])) {
        if (!value || seenCandidates.has(value)) continue;
        if (["for you", "chat", "profile", "info", "new", "op"].includes(value) || tagValues.has(value)) continue;
        seenCandidates.add(value);
        nameCandidates.push(value);
      }
    };

    addCandidate(DS.getCardTitle?.(card) || "");
    DS.qsa(
      "h1, h2, h3, p, span, [data-testid*='name'], [data-testid*='title'], [class*='font-bold'], [class*='font-semibold'], a[href*='/chat/'], a[href*='/chatbot/']",
      card
    ).forEach(el => addCandidate(el?.textContent || el?.getAttribute?.("aria-label") || el?.getAttribute?.("title") || ""));

    const descriptiveCandidates = [];
    const descriptiveSeen = new Set();
    const addDescriptiveCandidate = (rawValue, el = null) => {
      if (el?.closest?.("a[href*='/creator/'], a[aria-label*='creator' i], nav, aside, header, footer")) return;
      const raw = String(rawValue || "").replace(/\s+/g, " ").trim();
      for (const value of new Set([prepare(raw), prepareOriginal(raw)])) {
        if (!value || value.length < 2 || descriptiveSeen.has(value) || tagValues.has(value) || creatorSeen.has(value)) continue;
        descriptiveSeen.add(value);
        descriptiveCandidates.push(value);
      }
    };
    DS.qsa("p, [data-tooltip-content]", card).forEach(el => {
      if (el.closest?.("button[aria-label]") && tagValues.has(prepare(el.textContent || el.getAttribute?.("data-tooltip-content") || ""))) return;
      addDescriptiveCandidate(el.getAttribute?.("data-tooltip-content") || el.textContent || "", el);
    });

    return {
      title,
      description,
      descriptionVariants,
      creator,
      creatorCandidates,
      all,
      nameCandidates,
      verifiedNameCandidates: [...new Set(verifiedNameCandidates.filter(Boolean))],
      tagCandidates: [...tagValues],
      descriptionCandidates: descriptiveCandidates,
      nameDescriptionCandidates: [...nameCandidates, ...descriptionVariants, ...descriptiveCandidates].filter(Boolean)
    };
  }


  // Local, explainable inference for content themes creators often leave
  // untagged. No network calls, NLP services, observers or persistent blocks.
  // Only invoked for a changed card after a matching user tag exclusion.
  const IMPLIED_CHEATING = 1;
  const IMPLIED_CUCKOLD = 2;
  let nativeExclusionSearch = null;
  let nativeExclusionMask = 0;
  const impliedCardCache = new WeakMap();

  function impliedTagCategory(tag) {
    const clean = String(tag || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (/^(?:cheating|cheat|infidelity|adultery|emotional cheating|emotional affair)$/.test(clean)) return IMPLIED_CHEATING | IMPLIED_CUCKOLD;
    if (/^(?:ntr|netorare|netorase)$/.test(clean)) return IMPLIED_CHEATING | IMPLIED_CUCKOLD;
    if (/^(?:cuckold|cuckolding|cuckquean|cuckqueaning|hotwife|hotwifing)$/.test(clean)) return IMPLIED_CUCKOLD;
    return 0;
  }

  DS.getActiveImpliedBlockedThemes = function getActiveImpliedBlockedThemes(settings = DS.state?.settings || {}) {
    if (!settings.enabled || !settings.filterImpliedBlockedTags) return 0;
    const search = String(location.search || "");
    if (search !== nativeExclusionSearch) {
      nativeExclusionSearch = search;
      nativeExclusionMask = 0;
      // Native SpicyChat negative tag chips are encoded as
      // ...[refinementList][tags][0]=-Cheating. Never infer a block from
      // positive filters, and never treat a generic URL word as an exclusion.
      for (const [key, value] of new URLSearchParams(search)) {
        if (!/\[refinementList\]\[tags\](?:\[\d+\])?$/i.test(key)) continue;
        if (!value.startsWith("-")) continue;
        nativeExclusionMask |= impliedTagCategory(value.slice(1));
      }
    }
    let result = nativeExclusionMask;
    if (settings.blockCards) for (const rule of settings.blockedTags || []) result |= impliedTagCategory(rule);
    return result;
  };

  // Text-only, explainable theme classifier. Runs for an enabled filter on a
  // changed listing card, not for a full-page scan or a remote profile fetch.
  const sceneText = value => String(value || "").normalize("NFKC").toLowerCase()
    .replace(/[\u2019\u2018]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const has = (pattern, text) => pattern.test(text);
  const RELATIONSHIP = /\b(?:your|his|her|my|their|the|a|an)\s+(?:(?:ex|former)\s+)?(?:wife|husband|girlfriend|boyfriend|spouse|fiancee?|fiance|partner|bride|groom)\b|\b(?:married|engaged|long term partner|romantic partner|newlyweds|wedding day|marriage|in a relationship|dating you|dating him|dating her)\b/;
  const THIRD_PERSON = /\b(?:co worker|coworker|colleague|boss|manager|neighbor|neighbour|male friend|female friend|best friend|close friend|her ex|his ex|your friend|another (?:man|woman|guy|girl|person)|someone else|other (?:man|woman|guy|girl)|old flame|stranger|new guy|new man|new woman|the other man|the other woman|a (?:male|female) (?:friend|colleague))\b/;
  const SUSPICIOUS_CLOSENESS = /\b(?:grown|growing|getting|became|become|becoming|got|is|seems|feels|has gotten|has become)\s+(?:(?:unusually|suspiciously|too|very|increasingly|emotionally|far too|a little too|much too|much|dangerously)\s+){1,3}(?:close|attached|intimate)\s+(?:to|with)\b/;
  const DEVELOPING_FEELINGS = /\b(?:develop(?:ed|ing)?\s+(?:romantic\s+)?feelings\s+for|fall(?:s|en|ing)?\s+(?:in\s+love\s+)?(?:for|with)|romantic feelings for|secretly in love with|flirt(?:s|ed|ing)? with|stolen kisses with|romantically interested in|crush on|attracted to another|feelings for another)\b/;
  const SECRET_BEHAVIOR = /\b(?:secret(?:ly)?\s+(?:texts|texting|meeting|dating|seeing|flirting|sleeping|spending nights|sneaking|kissing)|hiding\s+(?:her|his|their|the)\s+(?:texts|messages|relationship|meetings)|late night\s+(?:texts|messages|calls|meetings)|behind (?:your|his|her|their|my) back|sneak(?:s|ing)? around with|secret meetings with|secret rendezvous with)\b/;
  const CONFIRMED_AFFAIR = /\b(?:emotional affair|emotional cheating|sexual affair|secret affair|illicit affair|extramarital affair|marital infidelity|having an affair|has an affair|had an affair|affair with|affair partner|unfaithful|infidelity|adultery|adulterous|two timing|secret lover|other lover)\b/;
  const CHEATING_RELATIONSHIP = /\b(?:cheating (?:wife|husband|girlfriend|boyfriend|spouse|partner)|unfaithful (?:wife|husband|girlfriend|boyfriend|spouse|partner)|(?:wife|husband|girlfriend|boyfriend|spouse|fiancee?|fiance|partner|ex wife|ex husband|ex girlfriend|ex boyfriend|she|he|you|they)\s+(?:has |had |have |was |were |is |been )?(?:cheat(?:s|ed|ing)?(?:\s+on\b|\s+with\b|\s+behind\b|\b))|cheat(?:s|ed|ing)?\s+on\s+(?:you|him|her|his|her|their|your|my|wife|husband|boyfriend|girlfriend|partner))\b/;
  const EXPLICIT_THEME_TITLE = /\b(?:imaginary cheating|your cheating (?:wife|husband|girlfriend|boyfriend)|cheating (?:wife|husband|girlfriend|boyfriend)|the cheating (?:wife|husband|girlfriend|boyfriend)|unfaithful (?:spouse|wife|husband|girlfriend|boyfriend)|marital infidelity|emotional affair)\b/;
  const CUCK_TITLE = /\b(?:ntr|netorare|netorase|cuck|cucky|cuckold|cuckolded|cuckolding|cuckoldry|cuckquean|cuckqueaning|cuckqueen)\b/;
  const CUCK_SCENE = /\b(?:ntr|netorare|netorase|cuckold|cuckolded|cuckolding|cuckoldry|cuckquean|cuckqueaning|cuckqueen|hotwife|hotwifing|wife sharing|husband sharing|sharing your wife|sharing your husband|sharing his wife|sharing her husband|partner swapping|partner swap|wife swap|husband swap|bull for (?:your|his|her) wife)\b/;
  const WATCH_BETRAYAL = /\b(?:watch|watches|watching|forced to watch|made to watch)\b.{0,95}\b(?:wife|husband|girlfriend|boyfriend|partner|spouse)\b.{0,95}\b(?:kissing|kiss|sleeping|sex|intimate|making love|with another)\b|\b(?:wife|husband|girlfriend|boyfriend|spouse)\b.{0,85}\b(?:another (?:man|woman)|stranger|lover)\b.{0,65}\b(?:while you watch|as you watch|in front of you|humiliat(?:e|ing) you)\b/;
  const PHYSICAL_BETRAYAL = /\b(?:caught|found|discover(?:ed|s)?)\b.{0,85}\b(?:wife|husband|girlfriend|boyfriend|spouse|fiancee?|fiance|partner|bride|groom|her|him)\b.{0,100}\b(?:kissing|kiss(?:ing)?|in bed|making out|having sex|sleeping with|intimate with|another (?:man|woman)|a stranger)\b|\b(?:wife|husband|girlfriend|boyfriend|partner|fiancee?|fiance|spouse)\b.{0,90}\b(?:kiss(?:ed|es|ing)?|slept with|sleeping with|having sex with|in bed with|making out with|intimate with)\b.{0,60}\b(?:another|other|stranger|co worker|coworker|friend|boss|neighbor|neighbour|lover)\b/;
  const BEHIND_BACK_BETRAYAL = /\b(?:kiss(?:ed|es|ing)?|sleep(?:s|ing)? with|slept with|dating|dated|seeing|met|meeting|having sex with|in bed with)\b.{0,100}\b(?:another (?:man|woman)|other (?:man|woman)|coworker|co worker|colleague|friend|stranger|lover|boss|neighbor|neighbour|someone else)\b.{0,90}\b(?:behind (?:your|his|her|their|my) back|without (?:your|his|her|their) knowledge|in secret|secretly)\b|\b(?:behind (?:your|his|her|their|my) back|without (?:your|his|her|their) knowledge)\b.{0,105}\b(?:dating|kissing|seeing|sleeping with|having sex with)\b/;
  const PARTNER_REPLACEMENT = /\b(?:wife|husband|girlfriend|boyfriend|spouse|fiancee?|fiance|partner|she|he)\b.{0,70}\b(?:left|leaves|leaving|chose|chooses|choosing|dumped|abandoned)\b.{0,75}\b(?:for|over)\b.{0,50}\b(?:(?:his|her|their|your|my) )?(?:another (?:man|woman)|someone else|coworker|co worker|colleague|lover|best friend|other (?:man|woman))\b|\b(?:steal(?:s|ing)?|stole|lure(?:d|s|ing)?)\b.{0,65}\b(?:wife|husband|girlfriend|boyfriend|partner|women away from their boyfriends|men away from their girlfriends)\b/;
  const SECRETLY_DATING_OTHERS = /\b(?:secretly dating|dating in secret|secret relationship|secretly seeing)\b.{0,85}\b(?:while|despite)\b.{0,60}\b(?:dating|her boyfriend|his girlfriend|husband|wife|partner)\b|\b(?:dating|married to|engaged to)\b.{0,90}\b(?:while|but)\b.{0,50}\b(?:secretly dating|secretly seeing|secret lover)\b/;
  const PARTNER_CHOSE_RIVAL = /\b(?:wife|husband|girlfriend|boyfriend|spouse|partner|she|he)\b.{0,80}\b(?:chose|chooses|choosing|picked|picks|prefers?)\b.{0,75}\b(?:her |his |their |my |your )?(?:coworker|co worker|colleague|boss|best friend|another (?:man|woman)|other (?:man|woman)|lover)\b.{0,45}\b(?:over|instead of|rather than) (?:you|me|him|her|their (?:wife|husband|partner))\b/;
  const PATERNITY_BETRAYAL = /\b(?:pregnant by|pregnant with (?:another|someone else)|child (?:isn t|is not) (?:yours|his|mine)|baby (?:isn t|is not) (?:yours|his|mine)|not the (?:real|biological) father|paternity fraud)\b/;
  const EMOTIONAL_DEPENDENCE = /\b(?:understands? (?:me|her|him) (?:better|more) than|makes? (?:me|her|him) feel (?:seen|understood|loved)|share(?:s|d|ing)? (?:personal|intimate|private|deepest) (?:secrets|feelings|thoughts|problems|details)|can(?:not| t)? talk to (?:my|her|his) (?:wife|husband|partner|spouse) about|emotionally dependent on|emotionally attached to|emotional intimacy with|more than just friends|something more than friendship|work (?:husband|wife))\b/;
  const PARTNER_COMPARISON = /\b(?:better than (?:you|her husband|his wife|her boyfriend|his girlfriend)|compares? (?:you|her husband|his wife|her boyfriend|his girlfriend) (?:to|with)|unlike (?:you|her husband|his wife|her boyfriend|his girlfriend)|instead of (?:her|his|your) (?:wife|husband|partner|spouse))\b/;
  const PRIVATE_CONTACT = /\b(?:hide(?:s|ing)? (?:her|his|their) (?:phone|messages|texts|calls)|delet(?:es|ed|ing) (?:her|his|their) (?:messages|texts|chat)|secret (?:texts|messages|calls|meetings)|late night (?:texts|messages|calls|meetings)|changed (?:her|his|their) (?:phone )?password|spend(?:s|ing)? (?:more|a lot of) time (?:alone )?with|stays? late (?:at work )?with|spend(?:s|ing)? (?:late )?nights with)\b/;
  // Some ensemble bots advertise a committed partner while making concealed
  // romantic/sexual history and new concurrent attractions the main premise.
  // This is *not evidence of cheating*. We expose a distinct, lower-certainty
  // "boundary risk" reason for users who opt into implied-theme hiding.
  // A vague "wedding", "old friends", "drama" or "secret" ALONE is insufficient.
  const PARTNER_FRIENDS = /\b(?:girlfriend|boyfriend|wife|husband|spouse|partner) s (?:old |longtime |closest |close )?friends?\b|\b(?:your|user s) (?:new )?(?:girlfriend|boyfriend|partner)\b.{0,90}\b(?:old friends|friendship circle|friend group)\b/;
  const HIDDEN_GROUP_HISTORY = /\b(?:more history than (?:you|they|he|she) know|more (?:secrets|history|past) than (?:you|they) (?:know|realize)|(?:private|secret|hidden|untold|undisclosed) (?:romantic |sexual )?(?:history|hookups|affairs|flings|past)|hookups relationships (?:and )?secrets|friendships hookups relationships (?:and )?secrets|old friends with (?:sexual|romantic) secrets)\b/;
  const ENSEMBLE_ROMANTIC_ROUTES = /\b(?:new attraction adds rather than replaces|existing relationships (?:and )?(?:hookups|continue)|attraction information (?:and )?consequences spread|attraction (?:and )?(?:new )?connections? develop|overlapping (?:friendships|relationships|hookups)|relationship(?:s)? (?:and )?hookups|private hookups|sexual history|sexual connections|fwb|friends with benefits|route freedom|connect with any several or none|other (?:romantic|sexual) partners?)\b/;
  const SOCIAL_SECRETS_CUE = /\b(?:wedding weekend|wedding guests|old friends|friendship circle|friend group|girlfriend s friends|boyfriend s friends|partner s friends|group of friends)\b/;
  const ROMANTIC_SETTING_CUE = /\b(?:wedding weekend|all kinks|hookups|romantic|private hookups|partner)\b/;

  function impliedBoundaryRisk(titleText, descriptionText, tagContext, extendedText) {
    const intro = (titleText + ' ' + descriptionText).trim();
    const tags = sceneText(tagContext);
    const detailed = sceneText(String(extendedText || '').slice(0, 16000));
    const full = (intro + ' ' + detailed).trim();
    // Titles/descriptions often expose the *teaser* even when character
    // definitions are not public. Require three complementary title clues;
    // no API fetch or creator-editor probing is performed.
    if (has(PARTNER_FRIENDS, intro) && has(HIDDEN_GROUP_HISTORY, intro)
      && (has(ROMANTIC_SETTING_CUE, intro) || has(/\b(?:romantic|partner)\b/, tags))) {
      return { category: 'Relationship-boundary risk', evidence: "partner's friend circle and hinted undisclosed history in a romantic/drama setting", certainty: 'risk-not-confirmed' };
    }
    // If an authorized caller already has the public definition, inspect its
    // more specific promises. NEVER infer betrayal from a past fling alone.
    if (detailed && has(/\b(?:your|user s) (?:new )?(?:girlfriend|boyfriend|partner)\b/, full)
      && has(SOCIAL_SECRETS_CUE, full)
      && has(HIDDEN_GROUP_HISTORY, full)
      && has(ENSEMBLE_ROMANTIC_ROUTES, detailed)
      && /\b(?:attraction|romantic|sexual|fwb|hookups?)\b/.test(detailed)) {
      return { category: 'Relationship-boundary risk', evidence: 'partner-centered friend group combines concealed sexual history and ongoing romantic routes', certainty: 'risk-not-confirmed' };
    }
    return null;
  }
  const DENIAL_ONLY = /\b(?:never (?:actually )?cheat(?:ed|s|ing)?|has never cheated|have never cheated|did not cheat|didn t cheat|hasn t cheated|wasn t cheating|isn t cheating|not cheating|no affair|there (?:was|is) no affair|no infidelity|false (?:accusation|rumor|rumour) (?:of|about) cheating|falsely accused of cheating|wrongly accused of cheating|didn t have an affair|not having an affair)\b/;
  const MISUNDERSTANDING = /\b(?:misunderstanding|false accusation|false rumor|false rumour|only a (?:rumor|rumour)|not actually cheating|wasn t cheating|never cheated|wrongly accused|falsely accused|innocent|thinks? (?:you|she|he|they) cheat(?:ed|s|ing)?|suspect(?:s|ed)? (?:you|she|he|they) cheat(?:ed|s|ing)?|(?:no proof|no evidence|unproven|supposedly cheating|suspect(?:s|ed)? .{0,55}(?:cheat|affair)|accus(?:e|ed|ation) .{0,55}(?:cheat|affair))|secret (?:anniversary|birthday|surprise) (?:party|gift|plan)?|audio (?:acting|recording|roleplay)|manga|comic con)\b/;
  const NON_ROMANTIC_CHEAT = /\b(?:cheat(?:s|ed|ing)?|cheater)\s+(?:at|on|with|during)\s+(?:(?:an?|the|her|his|your|my|their) )?(?:(?:math|school|final|college|university|history|science|board) )?(?:exam|test|quiz|chess|cards|card game|game|video game|homework|assignment|schoolwork|contest|puzzle|race)\b/;
  const AFFAIR_UNRELATED = /\b(?:political|business|state|diplomatic|foreign|legal|public|current) affairs?\b/;

  // Priority: indisputable theme > direct betrayal > clustered emotional
  // boundary crossing. Suspicion, accusations and denials alone never hide.
  // The source bundle is a classification guide; its grades are NOT evidence
  // that particular unexposed character fields exist.
  DS.inferImpliedBlockedThemeText = function inferImpliedBlockedThemeText(title, description, themeMask, tagContext = "", availableProfileText = "") {
    const mask = Number(themeMask) || 0;
    if (!mask) return null;
    const titleText = sceneText(String(title || "").slice(0, 240));
    const descriptionText = sceneText(String(description || "").slice(0, 1200));
    const text = (titleText + " " + descriptionText).trim();
    if (!text) return null;
    const committed = has(RELATIONSHIP, text) || /\bmarried partner\b/.test(sceneText(tagContext));
    const third = has(THIRD_PERSON, text);
    const denial = has(DENIAL_ONLY, text);
    const misunderstanding = has(MISUNDERSTANDING, text);

    // Risk-based *hide*, not a finding that an affair happened. The old
    // classifier remains authoritative for established infidelity and NTR.
    const boundaryRisk = (mask & IMPLIED_CHEATING)
      ? impliedBoundaryRisk(titleText, descriptionText, tagContext, availableProfileText) : null;

    if (mask & IMPLIED_CUCKOLD) {
      if (has(CUCK_TITLE, titleText)) {
        return { category: "NTR/Cuckolding", evidence: "explicit NTR/cuck theme in title" };
      }
      if ((has(CUCK_SCENE, descriptionText) || (committed && has(WATCH_BETRAYAL, text))) && !denial) {
        return { category: "NTR/Cuckolding", evidence: "partner-sharing or humiliation premise" };
      }
    }
    if (!(mask & IMPLIED_CHEATING)) return null;

    // Negated or disputed cheating should not be reinterpreted as confirmed.
    // Direct independently described betrayal still counts even when a
    // character tries to minimize it elsewhere in the same synopsis.
    const directBetrayal = committed && (has(PHYSICAL_BETRAYAL, text) || has(BEHIND_BACK_BETRAYAL, text)
      || has(PARTNER_REPLACEMENT, text) || has(PARTNER_CHOSE_RIVAL, text) || has(PATERNITY_BETRAYAL, text)
      || has(SECRETLY_DATING_OTHERS, text));
    if (directBetrayal) {
      return { category: "Cheating", evidence: "direct romantic betrayal in the premise" };
    }
    if (!denial && !misunderstanding && !has(NON_ROMANTIC_CHEAT, text) && !has(AFFAIR_UNRELATED, text)) {
      if (has(EXPLICIT_THEME_TITLE, titleText) || has(CONFIRMED_AFFAIR, text) || (committed && has(CHEATING_RELATIONSHIP, text))) {
        return { category: "Cheating", evidence: "explicit affair or infidelity theme" };
      }
    }
    if (committed && third && !denial && !misunderstanding) {
      if (has(SUSPICIOUS_CLOSENESS, text)) {
        return { category: "Cheating", evidence: "partner becoming unusually close to a third party" };
      }
      if (has(DEVELOPING_FEELINGS, text) && (has(SECRET_BEHAVIOR, text) || has(PRIVATE_CONTACT, text) || has(PARTNER_COMPARISON, text) || has(EMOTIONAL_DEPENDENCE, text)
        || /\b(?:meeting|seeing|texting|dating) (?:him|her|them) secretly\b/.test(text))) {
        return { category: "Cheating", evidence: "romantic feelings and concealed emotional intimacy" };
      }
      if (has(SECRET_BEHAVIOR, text) && (has(DEVELOPING_FEELINGS, text) || has(EMOTIONAL_DEPENDENCE, text) || has(PARTNER_COMPARISON, text))) {
        return { category: "Cheating", evidence: "secret contact crossing relationship boundaries" };
      }
      // Preserve the prior strict filter's treatment of an explicitly
      // clandestine exchange involving the committed partner and a third party.
      // A bare mention of texting or working late is not enough.
      if (/\bsecret(?:ly)?\s+(?:texts|texting|meeting|dating|seeing|flirting|kissing)\b/.test(text)) {
        return { category: "Cheating", evidence: "partner's secret contact with a third party" };
      }
      if (has(EMOTIONAL_DEPENDENCE, text) && (has(PRIVATE_CONTACT, text) || has(PARTNER_COMPARISON, text))) {
        return { category: "Cheating", evidence: "emotional dependency plus concealed contact or comparison" };
      }
    }
    return boundaryRisk;
  };

  DS.getImpliedBlockedThemeMatch = function getImpliedBlockedThemeMatch(card, mask = DS.getActiveImpliedBlockedThemes()) {
    if (!card || !mask) return null;
    const title = DS.getCardTitle?.(card) || "";
    const description = DS.getCardDescriptionText?.(card) || "";
    if (!description && !title) return null;
    // Relationship tags are only context, never independent proof of cheating.
    const tags = card.querySelector?.('[data-testid="CharacterCardTagRow"]')?.textContent || "";
    const signature = `${mask}|${title}|${description}|${tags}`;
    const cached = impliedCardCache.get(card);
    if (cached?.signature === signature) return cached.match;
    const match = DS.inferImpliedBlockedThemeText(title, description, mask, tags);
    impliedCardCache.set(card, { signature, match });
    return match;
  };

  // The automatic block queue waits for storage and can outlive a React card
  // rerender. Re-check the live card against the *current* rules immediately
  // before performing any persistent block action.
  DS.getVerifiedCardAutoBlockMatches = function getVerifiedCardAutoBlockMatches(card) {
    const settings = DS.state?.settings || {};
    if (!card || !settings.enabled || !settings.blockCards) return { word: null, tag: null };
    // Persistent auto-block confirmation must always reread live metadata.
    // The weak cache is only for reversible card hiding and presentation.
    const fields = preparedCardFields(card);
    const wordMatchers = DS.state?.preparedMatchers?.blockedWords || [];
    return {
      word: settings.autoBlockWordMatches
        ? (findPreparedMatchInFields([...fields.verifiedNameCandidates, ...fields.descriptionVariants].filter(Boolean), wordMatchers)
          || findUnorderedNameMatch(fields.verifiedNameCandidates, wordMatchers)) : null,
      tag: settings.autoBlockTagMatches
        ? findPreparedMatchInFields(fields.tagCandidates, DS.state?.preparedMatchers?.blockedTags || []) : null
    };
  };

  DS.shouldHideBlockedBot = function shouldHideBlockedBot(card, anchor, preparedText = "", preparedFields = null) {
    const id = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref(anchor.href || "");

    // A clicked Block is optimistic until chrome.storage confirms it. Keep
    // the card visible during that short save instead of hiding on pending ID.
    if (id && DS.state.blockedBotIdSet?.has(id) && DS.pendingBlockedBotAdds?.get(id)?.state !== "pending") {
      return `blocked bot id: ${id}`;
    }

    const blockedNameMatchers = DS.state.preparedMatchers?.blockedNames || [];
    // An explicit ID block above needs no card text. If there are no blocked
    // name rules, avoid traversing titles, descriptions, tags and creators.
    if (!blockedNameMatchers.length) return null;
    const fields = typeof preparedFields === "function"
      ? preparedFields()
      : (preparedFields || cachedPreparedCardFields(card));
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

  // Native card markup distinguishes a publicly visible definition from a
  // normal profile. An absent profile marker is UNKNOWN, not proof of privacy.
  function publicPersonalitySignal(card) {
    const anchor = card?.querySelector?.("a[aria-label='character-info'], a[data-testid='CharacterCardOverlayActions-InfoLink']");
    const tooltip = anchor?.closest?.('[data-tooltip-content]')?.getAttribute('data-tooltip-content') || '';
    if (/definition visible/i.test(tooltip)) return 'public';
    if (/^chatbot profile$/i.test(tooltip.trim())) return 'not-public';
    return 'unknown';
  }

  function syncPublicPersonalityControl() {
    const header = document.querySelector('[data-testid="FeaturesCapabilityGate-Header"]');
    const body = header?.parentElement?.querySelector('[data-testid="FeaturesCapabilityGate-Body"]');
    if (!body) { document.getElementById('ds-public-personality-filter')?.remove(); return; }
    let label = body.querySelector('#ds-public-personality-filter');
    if (!label) {
      label = document.createElement('label'); label.id = 'ds-public-personality-filter';
      label.style.cssText = 'display:flex;gap:8px;align-items:center;margin:8px 10px;padding:8px;border-radius:6px;border:1px solid rgba(148,163,184,.24);font:12px system-ui;cursor:pointer';
      const input = document.createElement('input');input.type='checkbox';input.style.accentColor='#a855f7';
      const span = document.createElement('span');span.textContent='Public Personality only (QoL)';
      label.title='Filters currently loaded bots using SpicyChat’s public-definition marker. Unknown markers remain visible.';
      label.append(input,span);body.prepend(label);
      input.addEventListener('change', async () => {
        const settings = DS.state?.settings;
        if (!settings) return;
        settings.publicPersonalityOnly = input.checked;
        try { await DS.saveSettingsPatch?.({ publicPersonalityOnly: input.checked }); }
        catch { DS.setQuickStatus?.('Could not save the Personality filter.'); }
        DS.state.cardHidingHasFullPass=false;
        DS.scheduleRun?.({ priority: 'normal', source: 'public-personality-filter' });
      });
    }
    const input=label.querySelector('input');
    if (input && input.checked !== !!DS.state?.settings?.publicPersonalityOnly)
      input.checked=!!DS.state?.settings?.publicPersonalityOnly;
  }

  DS.syncPublicPersonalityControl = syncPublicPersonalityControl;

  DS.shouldHideCard = function shouldHideCard(card, anchor, context = {}) {
    // The dedicated Less Like helper must be able to see the exact blocked bot
    // it is processing. It runs in a hidden SpicyChat tab and does not affect
    // the user's visible listings.
    if (DS.state.quickLessLikeWorker) return null;

    const { settings, openedChats } = DS.state;
    const discoveryContext = !!context.discovery;
    const homeContext = !!context.home;
    const id = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref(anchor.href || "");
    let preparedFields = null;
    const getPreparedFields = () => {
      if (preparedFields) return preparedFields;
      // Preserve the established search-normalization rules while calculating
      // the potentially large card text only if a name/word/tag rule needs it.
      return (preparedFields = cachedPreparedCardFields(card));
    };

    if (!discoveryContext && DS.isBotProfilePage()) {
      return null;
    }

    if (!discoveryContext && DS.isFavoriteBotsPage() && settings.neverHideFavorites !== false && !settings.publicPersonalityOnly) {
      return null;
    }

    // Explicit bot blocks always win. Favorite-creator visibility overrides
    // are intentionally evaluated only after this hard block check so a
    // followed/favorite creator can never resurrect a bot the user blocked.
    const blockedReason = DS.shouldHideBlockedBot(card, anchor, "", getPreparedFields);
    if (blockedReason) return blockedReason;

    // My Creations is a management surface, not discovery. Keep explicit
    // user blocks authoritative, but do not run automatic discovery filters,
    // language scans, recommendation filters or blocked-word auto-actions
    // against the user's own My Creations cards.
    if (!discoveryContext && DS.isMyCreationsPage?.()) return null;

    const favoriteCreator = DS.favoriteCreatorContextForCard?.(card) || null;
    const favoritePrefs = favoriteCreator?.preferences || {};
    const legacyProtectAll = !!favoriteCreator && settings.protectFavoriteCreatorsFromFiltering === true;
    const favoriteShowAll = !!favoriteCreator && (legacyProtectAll || favoritePrefs.showAllBots === true);

    // "Show all bots" is the per-creator master override for soft discovery
    // filters only. Explicit bot blocks above remain authoritative.
    if (favoriteShowAll) return null;

    const isSavedForLater = !!DS.cardIsSavedForLater?.(card, anchor);

    // A matching blocked word/tag is a persistent user rule, not merely a
    // visibility filter. Evaluate it once before any unrelated soft filter
    // can return early (for example Language, Saved for Later, or Not Interested).
    // Only a verified name/description or an actual tag badge may auto-block;
    // broad card text still supplies the regular hide-only fallback below.
    if (settings.blockCards && favoritePrefs.ignoreTagWordFilters !== true &&
        !(isSavedForLater && (settings.protectLaterBotsFromFiltering || settings.hideLaterBotsFromListings)) &&
        (settings.autoBlockWordMatches || settings.autoBlockTagMatches)) {
      const fields = getPreparedFields();
      const tagMatchers = DS.state.preparedMatchers?.blockedTags || [];
      const wordMatchers = DS.state.preparedMatchers?.blockedWords || [];
      const verifiedTagMatch = settings.autoBlockTagMatches
        ? findPreparedMatchInFields(fields.tagCandidates, tagMatchers) : null;
      const wordFields = [...fields.verifiedNameCandidates, ...fields.descriptionVariants].filter(Boolean);
      const verifiedWordMatch = settings.autoBlockWordMatches
        ? (findPreparedMatchInFields(wordFields, wordMatchers)
          || findUnorderedNameMatch(fields.verifiedNameCandidates, wordMatchers))
        : null;
      if (verifiedWordMatch || verifiedTagMatch) {
        DS.queueAutoBlockRuleMatch?.(card, anchor, {
          word: verifiedWordMatch, tag: verifiedTagMatch
        });
      }
    }

    if (
      settings.hideLaterBotsFromListings &&
      !context.ignoreLater &&
      favoritePrefs.showLaterBots !== true &&
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

    if (settings.publicPersonalityOnly && publicPersonalitySignal(card) === "not-public") return "personality not public";

    if (settings.hideGroupChats && DS.isGroupChatCard(card)) {
      return "group chat / multiple participants";
    }

    if (favoritePrefs.ignoreLanguageFilter !== true) {
      const languageReason = DS.shouldHideByLanguage?.(card);
      if (languageReason) return languageReason;
    }

    const notInterestedReason = DS.shouldHideNotInterestedBot?.(card, anchor);
    if (notInterestedReason) return notInterestedReason;

    const recommendationReason = DS.shouldHideRecommendationCard?.(card, anchor, context);
    if (recommendationReason) return recommendationReason;

    if (
      settings.hideOpenedChats &&
      !context.ignoreOpened &&
      favoritePrefs.showOpenedBots !== true &&
      (!DS.isChatListPage() || discoveryContext) &&
      !DS.isMyCreationsPage?.() &&
      id &&
      openedChats.has(id)
    ) {
      return "opened chat";
    }

    if (settings.blockCards && favoritePrefs.ignoreTagWordFilters !== true) {
      const fields = getPreparedFields();
      const tagMatchers = DS.state.preparedMatchers?.blockedTags || [];
      // Tag auto-blocking requires a tag label on the card, not a text match
      // in a bot name or description. Filtering retains its broad fallback.
      const verifiedTagMatch = settings.autoBlockTagMatches
        ? findPreparedMatchInFields(fields.tagCandidates, tagMatchers)
        : null;
      const tagMatch = verifiedTagMatch || findPreparedMatchInFields(fields.tagCandidates, tagMatchers);

      // When tags already hide a card, skip expensive word matching unless
      // word auto-blocking is enabled (overlapping rules must still work).
      let strictWordMatch = null;
      let wordMatch = null;
      if (!tagMatch || settings.autoBlockWordMatches) {
        const wordMatchers = DS.state.preparedMatchers?.blockedWords || [];
        // Persistent word blocks must match a verified name or description,
        // not a tag badge caught by a broad fallback selector.
        const strictWordFields = [...fields.verifiedNameCandidates, ...fields.descriptionVariants].filter(Boolean);
        strictWordMatch = findPreparedMatchInFields(strictWordFields, wordMatchers)
          || findUnorderedNameMatch(fields.verifiedNameCandidates, wordMatchers);
        const wordFields = fields.nameDescriptionCandidates.length
          ? fields.nameDescriptionCandidates
          : [fields.title, fields.description, fields.all].filter(Boolean);
        wordMatch = strictWordMatch || findPreparedMatchInFields(wordFields, wordMatchers)
          || findUnorderedNameMatch(fields.nameCandidates, wordMatchers);
      }
      if (tagMatch) return `blocked tag: ${tagMatch.raw}`;
      if (wordMatch) return `blocked word: ${wordMatch.raw}`;

      const creatorMatch = findPreparedMatchInFields(
        fields.creatorCandidates?.length ? fields.creatorCandidates : (fields.creator ? [fields.creator] : [fields.all]),
        DS.state.preparedMatchers?.blockedCreators || []
      );
      if (creatorMatch) return `blocked creator: ${creatorMatch.raw}`;
    }

    // Title-only Archive preferences are independent of native Block, auto-block,
    // Community Themes and Smart Filter Presets. This path never persists an ID.
    if (settings.archiveBlockingPresetsEnabled &&
        !(settings.protectFavoritesFromBlocking && id && DS.state.favoriteBotIdSet?.has(id))) {
      const preset = DS.getArchiveBlockingPresetMatch?.(card, settings);
      if (preset?.hide) return `Archive preset: ${preset.reason}`;
      // Load on demand if settings became enabled before the lazy module ran.
      DS.ensureArchiveBlockingPresets?.();
    }

    // Archive evidence is separate, reversible and cannot trigger auto-blocks.
    // Preserve native and QoL tag rules, creator exceptions and saved favorites.
    if (settings.archiveCommunityThemesEnabled && favoritePrefs.ignoreTagWordFilters !== true &&
        !(settings.protectFavoritesFromBlocking && id && DS.state.favoriteBotIdSet?.has(id))) {
      const remote = DS.getArchiveCommunityThemeMatch?.(id, settings);
      if (remote?.hide) return `community theme: ${remote.evidence}`;
    }

    // Native excluded tags also count. Unlike explicit verified tag/word
    // auto-blocks, an inferred theme is reversible and NEVER written to storage.
    if (settings.filterImpliedBlockedTags && favoritePrefs.ignoreTagWordFilters !== true) {
      const themes = DS.getActiveImpliedBlockedThemes(settings);
      const implied = themes && DS.getImpliedBlockedThemeMatch(card, themes);
      if (implied) return `blocked tag: ${implied.category} (implied: ${implied.evidence})`;
    }

    return null;
  };


  DS.getCardBlockingDiagnostic = function getCardBlockingDiagnostic(card, anchor) {
    if (!card || !anchor) return null;
    const fields = cachedPreparedCardFields(card);
    const wordMatchers = DS.state.preparedMatchers?.blockedWords || [];
    const wordFields = fields.nameDescriptionCandidates.length
      ? fields.nameDescriptionCandidates
      : [fields.title, fields.description, fields.all].filter(Boolean);
    const word = findPreparedMatchInFields(wordFields, wordMatchers) || findUnorderedNameMatch(fields.nameCandidates, wordMatchers);
    const creator = findPreparedMatchInFields(fields.creatorCandidates?.length ? fields.creatorCandidates : [fields.creator, fields.all].filter(Boolean), DS.state.preparedMatchers?.blockedCreators || []);
    const tag = findPreparedMatchInFields(fields.tagCandidates, DS.state.preparedMatchers?.blockedTags || []);
    return {
      title: DS.getCardTitle?.(card) || "",
      description: DS.getCardDescriptionText?.(card) || "",
      creators: fields.creatorCandidates || [],
      word: word?.raw || "",
      creator: creator?.raw || "",
      tag: tag?.raw || "",
      implied: DS.getActiveImpliedBlockedThemes?.() && DS.getImpliedBlockedThemeMatch?.(card)?.category || ""
    };
  };

  // Lightweight, opt-in per-phase metrics for Inspector/Performance reports.
  // Aggregated values only: no bot IDs, names, descriptions or message text.
  function recordCardPhase(name, started, count, excludedWaitMs = 0) {
    if (!started || typeof performance === "undefined") return;
    const ms = Math.max(0, performance.now() - started - Math.max(0, excludedWaitMs));
    const stats = DS.state.performanceStats || (DS.state.performanceStats = {});
    const key = `card ${name}`;
    const item = stats[key] || (stats[key] = { calls: 0, totalMs: 0, maxMs: 0 });
    item.calls++;
    item.totalMs += ms;
    item.maxMs = Math.max(item.maxMs, ms);
    item.lastMs = ms;
    item.lastAt = Date.now();
    item.lastCount = Number(count) || 0;
    DS.diagPerformance?.("card-phase", { phase: name, durationMs: Math.round(ms * 100) / 100, cards: item.lastCount });
  }
  function cardTimingStart() {
    return (DS.state?.settings?.performanceDiagnostics || DS.isDiagnosticTraceActive?.("normal")) &&
      typeof performance !== "undefined" ? performance.now() : 0;
  }

  DS.collectCards = function collectCards() {
    // Chat message DOM often contains dozens of /chat/ and /chatbot/ links.
    // Those are NOT listing cards; walking their ancestors can become an
    // expensive full-chat traversal. Chat-list discovery still works on /chats.
    if (DS.getPageState?.()?.isSingleChatPage) return [];
    const started = cardTimingStart();
    const revision = Number(DS.state?.domRevision || 0);
    const url = location.href;

    const cached = DS.state?.cardCache;
    // The page observer advances domRevision on native DOM changes. Running an
    // O(card-count) connectivity check on every same-revision cache hit adds
    // CPU to large listings without finding changes. Validate boundary cards
    // cheaply and periodically audit the whole list as a fail-safe.
    const cacheHitNumber = Number(DS.state.cardCacheHitNumber || 0) + 1;
    const cacheHealthy = Array.isArray(cached) && (
      !cached.length || ((cached[0]?.card?.isConnected && cached[0]?.anchor?.isConnected) &&
      (cached[cached.length - 1]?.card?.isConnected && cached[cached.length - 1]?.anchor?.isConnected))
    );
    if (
      cacheHealthy &&
      !DS.state.listingDirtyNeedsFullPass &&
      !(DS.state.listingDirtyCards instanceof Set && DS.state.listingDirtyCards.size) &&
      DS.state.cardCacheRevision === revision &&
      DS.state.cardCacheUrl === url &&
      (cacheHitNumber % 24 !== 0 || cached.every(item => item.card?.isConnected && item.anchor?.isConnected))
    ) {
      DS.state.cardCacheHitNumber = cacheHitNumber;
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.cardCollectionCacheHits = (perf.cardCollectionCacheHits || 0) + 1;
      return DS.state.cardCache;
    }

    // The shared page observer already reports changed card shells. Reconcile
    // those directly instead of enumerating every native anchor again.
    const cachedCards = DS.state?.cardCache;
    const dirtyCards = DS.state?.listingDirtyCards;
    if (Array.isArray(cachedCards) && DS.state.cardCacheUrl === url &&
        !DS.state.listingDirtyNeedsFullPass && dirtyCards instanceof Set &&
        dirtyCards.size > 0 && dirtyCards.size < 96) {
      // Preserve native page order when React refreshes an existing card.
      // Deleting/reinserting a Map entry moved a changed card to the end of
      // the cache, even when the visible card never moved.
      const updated = new Map();
      const fresh = [];
      for (const changedCard of dirtyCards) {
        if (!changedCard?.isConnected) continue;
        const anchor = changedCard.matches?.("a[href*='/chat/'], a[href*='/chatbot/']") ? changedCard :
          changedCard.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
        if (!anchor || !anchor.isConnected || anchor.closest?.('#ds-favorites-later-panel')) continue;
        const id = DS.botIdFromHref?.(anchor.href) || DS.chatIdFromHref?.(anchor.href);
        if (!id) continue;
        const card = DS.getCardFromChatLink(anchor);
        if (!card?.isConnected) continue;
        const entry = { card, anchor };
        updated.set(card, entry);
        fresh.push(entry);
      }
      const reused = [];
      const present = new Set();
      const movedCards = [];
      for (const item of cachedCards) {
        const card = item.card;
        if (!card?.isConnected || !item.anchor?.isConnected || present.has(card)) continue;
        const replacement = updated.get(card);
        if (replacement) updated.delete(card);
        if (dirtyCards.has(card) && !replacement) continue;
        present.add(card);
        if (replacement) movedCards.push(card);
        reused.push(replacement || item);
      }
      // Most updates replace one card in-place. Only newly mounted cards need
      // an order insertion, and only moved existing cards need an order audit.
      const comesBefore = (left, right) =>
        !!(left?.compareDocumentPosition?.(right) & 4);
      for (const entry of updated.values()) {
        if (present.has(entry.card)) continue;
        let low = 0, high = reused.length;
        while (low < high) {
          const mid = (low + high) >> 1;
          if (comesBefore(reused[mid].card, entry.card)) low = mid + 1;
          else high = mid;
        }
        reused.splice(low, 0, entry);
        present.add(entry.card);
      }
      // A native reordering may move an existing node without replacing it.
      // Check the affected neighbors; sort all cached cards only if needed.
      if (movedCards.length) {
        const indexByCard = new Map(reused.map((item, i) => [item.card, i]));
        const outOfOrder = movedCards.some(card => {
          const at = indexByCard.get(card);
          if (at == null) return false;
          return (at > 0 && !comesBefore(reused[at - 1].card, card)) ||
            (at + 1 < reused.length && !comesBefore(card, reused[at + 1].card));
        });
        if (outOfOrder) {
          reused.sort((a, b) => comesBefore(a.card, b.card) ? -1 : comesBefore(b.card, a.card) ? 1 : 0);
          const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
          perf.incrementalCardNativeReorders = (perf.incrementalCardNativeReorders || 0) + 1;
        }
      }
      DS.state.cardCache = reused;
      DS.state.cardCacheHitNumber = 0;
      DS.state.cardCacheRevision = revision;
      DS.state.cardCacheUrl = url;
      if (fresh.length) DS.rememberListedBotCards?.(fresh);
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.incrementalCardCollections = (perf.incrementalCardCollections || 0) + 1;
      perf.incrementalCardChanges = (perf.incrementalCardChanges || 0) + dirtyCards.size;
      recordCardPhase("collection-incremental", started, dirtyCards.size);
      return reused;
    }

    const cards = [];
    const seen = new Set();

    DS.qsa("a[href*='/chat/'], a[href*='/chatbot/']").forEach(anchor => {
      if (anchor.closest('#ds-favorites-later-panel')) return; // Not a native listing card.
      const id = DS.botIdFromHref?.(anchor.href) || DS.chatIdFromHref(anchor.href);
      if (!id) return;

      const card = DS.getCardFromChatLink(anchor);
      if (!card || seen.has(card)) return;

      seen.add(card);
      cards.push({ card, anchor });
    });

    DS.state.cardCache = cards;
    DS.state.cardCacheHitNumber = 0;
    DS.state.cardCacheRevision = revision;
    DS.state.cardCacheUrl = url;
    // Identity-only discovery is deferred by Bot Archive. It must not block
    // card collection, hide/filter controls or the initial listing paint.
    DS.rememberListedBotCards?.(cards);
    recordCardPhase("collection", started, cards.length);
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
      !!settings.normalizeDecorativeSymbols ||
      !!settings.normalizeEmojis
    );
  }

  function normalizedDisplayText(value) {
    const text = String(value || "");
    if (!text) return text;
    if (typeof DS.normalizeTextForDisplay === "function") return DS.normalizeTextForDisplay(text);
    if (typeof DS.normalizeTextForMatching !== "function") return text;
    return DS.normalizeTextForMatching(text).replace(/\s+/g, " ").trim();
  }

  // WeakMap values do not keep detached native cards alive after pagination.
  // Covers unchanged ASCII as well as already-normalized text; React text or
  // settings changes invalidate the decision without retaining a card list.
  const displayNormalizationCache = new WeakMap();
  function normalizeCardDisplayElement(el, configurationKey) {
    if (!el || el.closest?.("button, input, textarea, select")) return;

    const current = String(el.textContent || "");
    const cached = displayNormalizationCache.get(el);
    if (cached?.key === configurationKey && cached.text === current) return;
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
      displayNormalizationCache.set(el, { key: configurationKey, text: current });
      return;
    }

    // Skip unchanged dataset writes. Native React can recheck hundreds of
    // cards without the displayed text changing, and reassigning data attrs
    // still produces attribute mutations in other extensions/observers.
    if (el.dataset.dsNormalizedOriginal !== source) el.dataset.dsNormalizedOriginal = source;
    if (el.dataset.dsNormalizedApplied !== normalized) el.dataset.dsNormalizedApplied = normalized;
    if (current !== normalized) el.textContent = normalized;
    displayNormalizationCache.set(el, { key: configurationKey, text: normalized });
  }

  function restoreCardDisplayElement(el) {
    if (!el || el.dataset.dsNormalizedOriginal == null) return;
    const applied = String(el.dataset.dsNormalizedApplied || "");
    if (!applied || String(el.textContent || "") === applied) {
      el.textContent = el.dataset.dsNormalizedOriginal;
    }
    delete el.dataset.dsNormalizedOriginal;
    delete el.dataset.dsNormalizedApplied;
    displayNormalizationCache.delete(el);
  }

  function botNameTitleFromTarget(target) {
    const el = target instanceof Element ? target : target?.parentElement;
    if (!el) return null;
    const link = el.closest?.("a[aria-label^='chat-with-'][title], a[href*='/chat/'][title], a[href*='/chatbot/'][title]");
    if (!link) return null;
    const card = DS.getCardFromChatLink?.(link) || link.closest?.("div.relative.group.rounded-xl");
    return DS.isRecommendationCardRoot?.(card) ? link : null;
  }

  function removeBotNameOverlay() {
    document.getElementById("ds-bot-name-expander")?.remove();
    DS.state.botNameExpandedTarget = null;
  }

  function showBotNameOverlay(link) {
    if (!link?.isConnected) return;
    const full = String(link.getAttribute("title") || link.textContent || "").replace(/\s+/g, " ").trim();
    if (!full) return;

    const rect = link.getBoundingClientRect();
    if (!(link.scrollWidth > link.clientWidth + 2 || rect.width < 90)) return;

    removeBotNameOverlay();
    const overlay = document.createElement("div");
    overlay.id = "ds-bot-name-expander";
    overlay.textContent = full;
    overlay.setAttribute("role", "tooltip");
    overlay.style.left = `${Math.max(4, rect.left)}px`;
    overlay.style.top = `${Math.max(4, rect.top - 2)}px`;
    document.documentElement.appendChild(overlay);
    DS.state.botNameExpandedTarget = link;
  }

  function installBotNameExpanderListeners() {
    if (DS.state.botNameExpanderListenersInstalled) return;
    DS.state.botNameExpanderListenersInstalled = true;

    document.addEventListener("pointerover", event => {
      if (!DS.state.settings?.expandBotNamesOnHover || event.pointerType === "touch") return;
      const link = botNameTitleFromTarget(event.target);
      if (link) showBotNameOverlay(link);
    }, true);

    document.addEventListener("pointerout", event => {
      const target = DS.state.botNameExpandedTarget;
      if (!target) return;
      if (event.relatedTarget && target.contains?.(event.relatedTarget)) return;
      removeBotNameOverlay();
    }, true);

    document.addEventListener("click", event => {
      if (!DS.state.settings?.expandBotNamesOnHover) {
        removeBotNameOverlay();
        return;
      }
      const link = botNameTitleFromTarget(event.target);
      if (!link) {
        removeBotNameOverlay();
        return;
      }
      if (window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches) {
        event.preventDefault();
        event.stopPropagation();
        if (DS.state.botNameExpandedTarget === link) removeBotNameOverlay();
        else showBotNameOverlay(link);
      }
    }, true);

    window.addEventListener("scroll", removeBotNameOverlay, true);
    window.addEventListener("resize", removeBotNameOverlay, { passive: true });
  }

  DS.applyBotNameExpander = function applyBotNameExpander() {
    installBotNameExpanderListeners();
    if (!DS.state.settings?.expandBotNamesOnHover) removeBotNameOverlay();
  };

  DS.applyCardDisplayNormalization = function applyCardDisplayNormalization(cards = DS.collectCards?.() || []) {
    const enabled = cardDisplayNormalizationEnabled();

    if (!enabled) {
      DS.qsa?.("[data-ds-normalized-original]").forEach(restoreCardDisplayElement);
      return;
    }

    const settings = DS.state.settings || {};
    const config = [settings.normalizeFancyUnicode, settings.normalizePunctuation,
      settings.normalizeInvisibleCharacters, settings.normalizeDecorativeSymbols,
      settings.normalizeEmojis].map(Boolean).map(Number).join('');
    for (const { card } of cards) {
      const title = card.querySelector?.("a[aria-label^='chat-with-'][title], a[aria-label^='chat-with-'], a[href*='/chat/'][title]");
      if (title) normalizeCardDisplayElement(title, config);

      const descriptionBlock = findDescriptionBlock(card);
      if (descriptionBlock) {
        const leaves = DS.qsa?.("p, span", descriptionBlock).filter(el => !el.querySelector?.("p, span")) || [];
        if (leaves.length) leaves.forEach(el => normalizeCardDisplayElement(el, config));
        else normalizeCardDisplayElement(descriptionBlock, config);
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
      ":scope > div[class*='px-2'][class*='py-3'] > div[class*='line-clamp-3'][class*='group-hover:line-clamp-none']",
      ":scope > div[class*='px-2'][class*='py-3'] > div[class*='line-clamp-2'][class*='group-hover:line-clamp-none']",
      ":scope > div[class*='px-2'][class*='py-3'] > div[class*='scrollbar-hide'][class*='overflow-y-auto']",
      "div[class*='line-clamp-3'][class*='group-hover:line-clamp-none']",
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
          ((cls.includes("line-clamp-3") || cls.includes("line-clamp-2")) ? 260 : 0) +
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

  function descriptionCardBody(card, block) {
    if (!card || !block) return null;
    let node = block.parentElement;
    for (let i = 0; node && node !== card && i < 6; i += 1, node = node.parentElement) {
      const cls = DS.classText?.(node) || String(node.className || "");
      if (cls.includes("px-2") && cls.includes("py-3") && (cls.includes("h-[180px]") || cls.includes("flex-col"))) return node;
    }
    return null;
  }

  function clearDescriptionBodyExpansion(root) {
    const host = root || document;
    const bodies = [];
    if (host.matches?.("[data-ds-description-body-expanded='1']")) bodies.push(host);
    bodies.push(...(DS.qsa?.("[data-ds-description-body-expanded='1']", host) || []));
    for (const body of bodies) {
      body.removeAttribute("data-ds-description-body-expanded");
      if (body.style.getPropertyValue("height") === "auto") body.style.removeProperty("height");
      if (body.style.getPropertyValue("min-height") === "180px") body.style.removeProperty("min-height");
      if (body.style.getPropertyValue("overflow") === "visible") body.style.removeProperty("overflow");
    }
  }

  function lockDescriptionBodyExpansion(card, block) {
    const body = descriptionCardBody(card, block);
    if (!body) return null;
    if (body.dataset.dsDescriptionBodyExpanded !== "1") body.dataset.dsDescriptionBodyExpanded = "1";
    // CSSStyleDeclaration.setProperty can emit a native attribute mutation
    // even when the value is unchanged. Avoid doing that on every card pass.
    for (const [property, value] of [["height", "auto"], ["min-height", "180px"], ["overflow", "visible"]]) {
      if (body.style.getPropertyValue(property) !== value || body.style.getPropertyPriority(property) !== "important") {
        body.style.setProperty(property, value, "important");
      }
    }
    return body;
  }

  function clearDescriptionExpansion(root) {
    const host = root || document;
    const items = [];

    if (host.matches?.("[data-ds-description-expanded='1']")) items.push(host);
    items.push(...(DS.qsa?.("[data-ds-description-expanded='1']", host) || []));

    items.forEach(el => {
      el.removeAttribute("data-ds-description-expanded");
      el.classList.remove("ds-card-description-block");
      const originalStyle = el.getAttribute("data-ds-description-original-style");
      if (originalStyle !== null) {
        // Restore SpicyChat's original clamp/scrollbox when disabled.
        if (originalStyle) el.setAttribute("style", originalStyle);
        else el.removeAttribute("style");
        el.removeAttribute("data-ds-description-original-style");
      } else {
        // Compatibility for cards expanded by earlier QoL versions.
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
      }
    });
  }

  function lockDescriptionExpansion(block) {
    if (!block) return;

    if (!block.hasAttribute("data-ds-description-original-style")) {
      block.setAttribute("data-ds-description-original-style", block.getAttribute("style") || "");
    }
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
    ].forEach(prop => {
      if (block.style.getPropertyValue(prop)) block.style.removeProperty(prop);
    });
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
      clearDescriptionBodyExpansion(document);
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
        clearDescriptionBodyExpansion(card);
        continue;
      }

      const signature = descriptionSignature(block);
      const sameDescription = card.dataset.dsDescriptionSignature === signature;
      // This setting means *full* descriptions, not just descriptions above
      // an arbitrary character limit. Even short SpicyChat descriptions have
      // a 40px max-height and forced internal scrolling on some card layouts.
      // Avoid layout reads (scrollHeight/getBoundingClientRect) on every card.
      const shouldExpand = !!signature;

      if (!sameDescription) {
        // Remove stale styles from recycled/virtualized cards before applying
        // the current description's layout.
        card.classList.remove("ds-card-long-description");
        clearDescriptionExpansion(card);
        clearDescriptionBodyExpansion(card);
        card.dataset.dsDescriptionSignature = signature;
      }

      // Also refresh the cached decision for cards processed by older QoL
      // versions, which may have marked short descriptions as "0".
      const expandedValue = shouldExpand ? "1" : "0";
      if (card.dataset.dsDescriptionLong !== expandedValue) card.dataset.dsDescriptionLong = expandedValue;
      if (card.classList.contains("ds-card-long-description") !== shouldExpand) {
        card.classList.toggle("ds-card-long-description", shouldExpand);
      }

      DS.qsa("[data-ds-description-expanded='1']", card).forEach(old => {
        if (old !== block) clearDescriptionExpansion(old);
      });

      if (shouldExpand) {
        activeBlocks.add(block);
        lockDescriptionExpansion(block);
        lockDescriptionBodyExpansion(card, block);
      } else {
        clearDescriptionExpansion(block);
        clearDescriptionBodyExpansion(card);
      }
    }

    DS.qsa("[data-ds-description-expanded='1']").forEach(old => {
      if (!activeBlocks.has(old) && !old.closest?.(".ds-card-long-description")) {
        clearDescriptionExpansion(old);
      }
    });
  };


  function installCardBlockDiagnosticListener() {
    if (DS.state.cardBlockDiagnosticListenerInstalled) return;
    DS.state.cardBlockDiagnosticListenerInstalled = true;
    document.addEventListener("click", event => {
      const button = event.target?.closest?.(".ds-card-block-button");
      if (!button || !/^block/i.test(String(button.getAttribute("aria-label") || button.title || ""))) return;
      const card = button.closest?.("[class*='rounded-xl']") || button.parentElement;
      const link = card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
      const id = String(DS.botIdFromHref?.(link?.href || "") || DS.chatIdFromHref?.(link?.href || "") || "");
      const token = DS.diagOperationStart?.("block-card", "block-card", { source: "card-button", hasBotId: !!id });
      if (!token) return;
      const started = performance.now();
      const finish = () => {
        const blocked = !!(id && DS.state.blockedBotIdSet?.has(id) && DS.pendingBlockedBotAdds?.get(id)?.state !== "pending");
        if (!blocked && performance.now() - started < 2600) {
          setTimeout(finish, 120);
          return;
        }
        DS.diagOperationEnd?.(token, {
          outcome: blocked ? "ok" : "timeout",
          counts: { scanned: 1, changed: blocked ? 1 : 0, skipped: blocked ? 0 : 1, errors: 0 }
        });
      };
      setTimeout(finish, 80);
    }, true);
  }

  installCardBlockDiagnosticListener();

  DS.compactLayouts = function compactLayouts(cards) {
    if (!DS.state.settings.compactAfterHiding) {
      DS.qsa?.(".ds-grid-dense").forEach(parent => {
        if (parent.classList.contains("ds-grid-dense")) parent.classList.remove("ds-grid-dense");
      });
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
        if (parent.classList.contains("ds-grid-dense")) parent.classList.remove("ds-grid-dense");
        continue;
      }
      if (!parent.classList.contains("ds-grid-dense")) parent.classList.add("ds-grid-dense");
    }
  };

  function cardHidingPassKey() {
    return [
      location.href,
      Number(DS.state?.domRevision || 0),
      Number(DS.state?.cardFilterStateRevision || 0),
      Number(DS.state?.archiveThemeRevision || 0),
      Number(DS.state?.archiveBlockingRevision || 0),
      DS.state?.settings?.archiveBlockingPresetsEnabled ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesEnabled ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesMode || 'reviewed',
      DS.state?.settings?.archiveCommunityThemesRiskWarnings ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesExtraTags || '',
      DS.state?.settings?.archiveCommunityThemesAllowIds || '',
      DS.state?.settings?.hiddenCardMode || "hide",
      DS.smartFilterWantsOpened?.() ? 1 : 0,
      DS.smartFilterWantsFavorites?.() ? 1 : 0,
      DS.smartFilterWantsLater?.() ? 1 : 0
    ].join("|");
  }

  function hasPendingLanguageUnhideVerification() {
    return !!document.querySelector("[data-ds-language-allowed-passes='1'], [data-ds-language-allowed-passes=\"1\"]");
  }

  function cardFilterKey() {
    return [
      Number(DS.state?.cardFilterStateRevision || 0),
      Number(DS.state?.archiveThemeRevision || 0),
      Number(DS.state?.archiveBlockingRevision || 0),
      DS.state?.settings?.archiveBlockingPresetsEnabled ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesEnabled ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesMode || 'reviewed',
      DS.state?.settings?.archiveCommunityThemesRiskWarnings ? 1 : 0,
      DS.state?.settings?.archiveCommunityThemesExtraTags || '',
      DS.state?.settings?.archiveCommunityThemesAllowIds || '',
      DS.state?.settings?.hiddenCardMode || "hide",
      DS.state?.settings?.publicPersonalityOnly ? 1 : 0,
      DS.smartFilterWantsOpened?.() ? 1 : 0,
      DS.smartFilterWantsFavorites?.() ? 1 : 0,
      DS.smartFilterWantsLater?.() ? 1 : 0
    ].join("|");
  }

  // A native React rerender can replace a card immediately after it was
  // blocked. Re-hide only *newly mounted* blocked cards, without waiting for
  // the deliberately deferred full-listing refresh or rescanning the grid.
  DS.hideBlockedCardMounts = function hideBlockedCardMounts(mutations) {
    const ids = DS.state?.blockedBotIdSet;
    if (!DS.state?.settings?.enabled || !ids?.size ||
        DS.isSingleChatPage?.() || DS.isBotProfilePage?.() || DS.isChatListPage?.() ||
        (DS.isFavoriteBotsPage?.() && DS.state.settings.neverHideFavorites !== false)) return 0;

    const seen = new Set();
    let hidden = 0;
    const checkLink = link => {
      if (!link || !link.isConnected || seen.has(link)) return;
      seen.add(link);
      const id = DS.botIdFromHref?.(link.href || "") || DS.chatIdFromHref?.(link.href || "");
      if (!id || !ids.has(id)) return;
      const card = DS.getCardFromChatLink?.(link);
      const target = DS.getBestHideTarget?.(card);
      if (!target || DS.isUnsafeCardHideTarget?.(target)) return;
      if (DS.hideCard?.(card, `card:blocked bot id: ${id}`)) hidden++;
    };
    const checkCard = (element, strictShell = false) => {
      if (!element || !(element instanceof Element)) return;
      // Ordinary class changes on buttons/images/text inside cards cannot
      // reveal the hidden outer card. Handle them only when a *new* card is
      // inserted or its bot link changes; keep class-repair on the actual
      // card shell and its one-child wrapper.
      const direct = element.matches?.('[data-testid="CharacterCard"]') ? element : null;
      const wrapped = element.children?.length === 1 &&
        element.firstElementChild?.matches?.('[data-testid="CharacterCard"]')
        ? element.firstElementChild : null;
      const card = direct || wrapped || (!strictShell ? element.closest?.('[data-testid="CharacterCard"]') : null);
      if (!card || !DS.isRecommendationCardRoot?.(card)) return;
      if (strictShell) {
        const target = DS.getBestHideTarget?.(card);
        const dim = DS.state.settings.hiddenCardMode === "dim";
        const alreadyHidden = target?.dataset?.dsHidden === "1" &&
          target.classList?.contains(dim ? "ds-dimmed" : "ds-hidden");
        if (alreadyHidden) {
          const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
          perf.blockedCardUnchangedClassSkips = Number(perf.blockedCardUnchangedClassSkips || 0) + 1;
          return;
        }
      }
      checkLink(card.querySelector("a[aria-label^='chat-with-'][href*='/chat/'], a[href*='/chat/'], a[href*='/chatbot/']"));
    };
    for (const mutation of mutations || []) {
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "href" && mutation.target?.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) {
          checkLink(mutation.target);
        } else if (["class", "style", "data-ds-hidden"].includes(mutation.attributeName)) {
          // The existing attribute-only safety watcher receives thousands of
          // native class updates. Only a changed card shell/wrapper can undo
          // the actual hide; child decorations cannot. Href and mounts above
          // still handle React changing a bot ID or replacing the card.
          checkCard(mutation.target, true);
        }
        continue;
      }
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) checkLink(node);
        checkCard(node);
        node.querySelectorAll?.("a[href*='/chat/'], a[href*='/chatbot/']").forEach(checkLink);
      }
    }
    if (hidden) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.blockedCardRemountHides = Number(perf.blockedCardRemountHides || 0) + hidden;
      DS.diagPerformance?.("blocked-card-remount", { hidden });
    }
    return hidden;
  };

  DS.markListingDirtyCards = function markListingDirtyCards(mutations) {
    const dirty = DS.state.listingDirtyCards instanceof Set
      ? DS.state.listingDirtyCards
      : (DS.state.listingDirtyCards = new Set());

    const addNode = node => {
      const el = node instanceof Element ? node : node?.parentElement;
      if (!el || !el.isConnected) return;

      const direct = el.closest?.("div.relative.group.rounded-xl, div[class*='rounded-xl'][class*='group']");
      if (direct && DS.isRecommendationCardRoot?.(direct)) {
        // A changed child or mounted card already identifies exactly one bot.
        // Do not query all descendant chat links inside that card again.
        dirty.add(direct);
        preparedMetadataCache.delete(direct);
        return;
      }

      const anchors = [];
      if (el.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) anchors.push(el);
      el.querySelectorAll?.("a[href*='/chat/'], a[href*='/chatbot/']").forEach(anchor => anchors.push(anchor));
      for (const anchor of anchors) {
        const card = DS.getCardFromChatLink?.(anchor);
        if (card?.isConnected) { dirty.add(card); preparedMetadataCache.delete(card); }
      }
    };

    for (const mutation of mutations || []) {
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target) {
        const nearestCard = target.closest?.("div.relative.group.rounded-xl, div[class*='rounded-xl'][class*='group'], .ds-card-density-target");
        if (nearestCard?.isConnected && DS.isRecommendationCardRoot?.(nearestCard)) {
          dirty.add(nearestCard);
          preparedMetadataCache.delete(nearestCard);
        }
        // Only scan the mutation target itself when it is an anchor. Scanning
        // all descendant anchors of a grid/container dirtied every card after
        // unrelated React list and sidebar changes.
        if (target.matches?.("a[href*='/chat/'], a[href*='/chatbot/']")) addNode(target);
      }
      for (const node of mutation.addedNodes || []) addNode(node);
    }
    // Large React grid replacements should produce one full pass, not retain
    // hundreds of detached card nodes while new pages are still mounting.
    if (dirty.size > 96) {
      dirty.clear();
      DS.state.listingDirtyNeedsFullPass = true;
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.listingDirtyOverflowFullPasses = Number(perf.listingDirtyOverflowFullPasses || 0) + 1;
    }
    return dirty.size;
  };

  DS.applyCardHiding = async function applyCardHiding(options = {}) {
    if (!DS.state.settings.enabled || DS.isLaterFavoritesTabActive?.()) return;
    syncPublicPersonalityControl();

    DS.recoverAccidentalCardPageHide?.();

    if (DS.isSingleChatPage?.() || DS.isBotProfilePage()) {
      return;
    }

    // The Favorites default is to keep all favorites visible. If no display
    // normalization is requested, there is no reason to enumerate those cards
    // in either the critical or settled filter pass. Preserve cleanup if an
    // older filter left card markers behind.
    if (DS.isFavoriteBotsPage?.() && DS.state.settings.neverHideFavorites !== false &&
        !DS.state.settings.publicPersonalityOnly &&
        !(DS.state.settings.textNormalizationEnabled && (
          DS.state.settings.normalizeFancyUnicode || DS.state.settings.normalizePunctuation ||
          DS.state.settings.normalizeInvisibleCharacters || DS.state.settings.normalizeDecorativeSymbols ||
          DS.state.settings.normalizeEmojis)) &&
        !document.querySelector('[data-ds-normalized-original], [data-ds-hidden]')) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.favoriteCardFilterBypasses = Number(perf.favoriteCardFilterBypasses || 0) + 1;
      return;
    }
    const passKey = cardHidingPassKey();
    const pendingLanguagePass = hasPendingLanguageUnhideVerification();
    const filterKey = cardFilterKey();
    const routeKey = location.href;
    const dirty = DS.state.listingDirtyCards instanceof Set
      ? DS.state.listingDirtyCards
      : (DS.state.listingDirtyCards = new Set());
    const canUseDirty =
      !options.force &&
      !DS.state.listingDirtyNeedsFullPass &&
      !pendingLanguagePass &&
      DS.state.cardHidingHasFullPass === true &&
      DS.state.cardHidingLastFilterKey === filterKey &&
      DS.state.cardHidingLastRouteKey === routeKey;

    let cards;
    if (canUseDirty) {
      // Other listing features share this cache after the dirty queue clears.
      if (dirty.size) DS.collectCards();
      cards = [...dirty]
        .filter(card => card?.isConnected)
        .map(card => ({
          card,
          anchor: card.querySelector("a[href*='/chat/'], a[href*='/chatbot/']")
        }))
        .filter(item => item.anchor);
      dirty.clear();

      if (!cards.length) {
        const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
        perf.cardHidingStablePassSkips = Number(perf.cardHidingStablePassSkips || 0) + 1;
        DS.state.cardHidingLastPassKey = passKey;
        return;
      }
    } else {
      cards = DS.collectCards();
      dirty.clear();
      DS.state.listingDirtyNeedsFullPass = false;
    }

    const traceActive = !!DS.isDiagnosticTraceActive?.('normal');
    const traceStartedAt = traceActive ? performance.now() : 0;
    const traceToken = traceActive ? DS.diagOperationStart?.('card-filtering', 'hide-cards', {
      trigger: String(options.source || DS.state.lastRunTrigger || 'listing-mutation'),
      reason: canUseDirty ? 'changed-card-reconciliation' : 'listing-filter-or-page-change',
      phase: 'filter-and-hide',
      parentOperationId: String(DS.state.diagCriticalOperationId || DS.state.diagSlowOperationId || '')
    }) : null;
    let traceYieldMs = 0, traceHidden = 0, traceProcessed = 0, traceSkipped = 0, traceOutcome = 'completed';
    try {
    const normalizationStarted = cardTimingStart();
    DS.applyCardDisplayNormalization?.(cards);
    // Queues at most one 80-ID request from this already-collected card set.
    // The background service handles versioned caching and response validation.
    if (DS.state.settings.archiveCommunityThemesEnabled) DS.queueArchiveCommunityThemeLookups?.(cards);
    if (normalizationStarted) recordCardPhase("normalization", normalizationStarted, cards.length);
    const filterStarted = cardTimingStart();
    let filterYieldMs = 0;

    if (DS.isFavoriteBotsPage() && DS.state.settings.neverHideFavorites !== false && !DS.state.settings.publicPersonalityOnly) {
      DS.state.cardHidingLastFilterKey = filterKey;
      DS.state.cardHidingLastRouteKey = routeKey;
      DS.state.cardHidingHasFullPass = true;
      return;
    }
    let hidden = 0;
    let processed = 0;
    let alreadyBlockedSkips = 0;
    const chunkLargeListing = cards.length >= 32;
    let lastCardYieldAt = chunkLargeListing ? performance.now() : 0;

    for (const { card, anchor } of cards) {
      processed += 1;
      if (chunkLargeListing && processed > 1 &&
          (processed % 16 === 0 || (processed % 4 === 0 && performance.now() - lastCardYieldAt >= 9))) {
        // Typical 48-card creator pages also benefit from short paint/input
        // breaks. Critical hide decisions still run before cosmetic passes.
        const yieldStarted = filterStarted ? performance.now() : 0;
        await new Promise(resolve => setTimeout(resolve, 0));
        lastCardYieldAt = performance.now();
        if (yieldStarted) filterYieldMs += performance.now() - yieldStarted;
        if (routeKey !== location.href || filterKey !== cardFilterKey() || DS.isSingleChatPage?.()) {
          DS.state.cardHidingLastPassKey = "";
          DS.state.cardHidingHasFullPass = false;
          DS.state.listingDirtyNeedsFullPass = true;
          traceOutcome = 'cancelled';
          const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
          perf.cardFilterCancelledStalePasses = Number(perf.cardFilterCancelledStalePasses || 0) + 1;
          return;
        }
      }
      if (!card?.isConnected || !anchor?.isConnected) continue;
      const target = DS.getBestHideTarget(card);

      if (!target) {
        continue;
      }

      const existingReason = String(target.dataset.dsReason || "");
      // The ID is authoritative. Rechecking every name, tag, language and
      // recommendation rule on an already-hidden, unchanged explicitly blocked
      // bot wastes a full card scan. Still verify the CURRENT link: React may
      // recycle the same wrapper for a different bot after pagination/refill.
      if (target.dataset.dsHidden === "1") {
        const liveId = DS.botIdFromHref?.(anchor.href || "") || DS.chatIdFromHref?.(anchor.href || "");
        const dim = DS.state.settings.hiddenCardMode === "dim";
        if (liveId && existingReason === `card:blocked bot id: ${liveId}` &&
            DS.state.blockedBotIdSet?.has(liveId) &&
            DS.pendingBlockedBotAdds?.get(liveId)?.state !== "pending" &&
            target.classList.contains(dim ? "ds-dimmed" : "ds-hidden")) {
          alreadyBlockedSkips++;
          continue;
        }
      }
      // An explicit Smart Filter = Opened should win over the general
      // "hide opened bots" discovery preference. Otherwise the Smart Filter
      // can correctly match an opened card only for the earlier hide pass to
      // remove it again, producing an apparently empty listing.
      DS.applyArchiveCommunityThemeWarning?.(card,
        DS.botIdFromHref?.(anchor.href || "") || "", DS.state.settings);
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

    recordCardPhase("filtering", filterStarted, processed, filterYieldMs);
    if (alreadyBlockedSkips && filterStarted) {
      // One aggregated marker per pass; no per-card telemetry or extra observer.
      DS.diagPerformance?.("card-blocked-id-fastpath", { skipped: alreadyBlockedSkips, examined: processed });
    }
    const layoutStarted = cardTimingStart();
    DS.compactLayouts(cards);
    if (layoutStarted) recordCardPhase("layout", layoutStarted, cards.length);

    if (hidden > 0) {
      DS.updateQuickPanel?.();
    }

    // Cache only fully-settled passes. Language-hidden cards intentionally need
    // one follow-up confirmation before being unhidden, so leave that pass dirty.
    if (!hasPendingLanguageUnhideVerification()) {
      DS.state.cardHidingLastPassKey = cardHidingPassKey();
      DS.state.cardHidingLastFilterKey = filterKey;
      DS.state.cardHidingLastRouteKey = routeKey;
      DS.state.cardHidingHasFullPass = true;
    } else {
      DS.state.cardHidingLastPassKey = "";
      DS.state.cardHidingHasFullPass = false;
    }
    traceYieldMs = filterYieldMs;
    traceHidden = hidden;
    traceProcessed = processed;
    traceSkipped = alreadyBlockedSkips;
    } catch (error) {
      traceOutcome = 'failed';
      DS.diagError?.('card-filtering', 'hide-cards', error, { phase: 'filter-and-hide', parentOperationId: traceToken?.id || '' });
      throw error;
    } finally {
      if (traceToken) DS.diagOperationEnd?.(traceToken, {
        outcome: traceOutcome,
        counts: { scanned: cards.length, changed: traceHidden, skipped: traceSkipped,
          reused: canUseDirty ? cards.length : 0, errors: traceOutcome === 'failed' ? 1 : 0 },
        meta: { activeMs: Math.max(0, performance.now() - traceStartedAt - traceYieldMs),
          yieldMs: traceYieldMs, fullPass: !canUseDirty, phase: 'filter-and-hide' }
      });
    }
  };
})();
}

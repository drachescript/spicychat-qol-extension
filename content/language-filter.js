(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const LANGUAGE_NAMES = {
    en: "English",
    de: "German",
    ru: "Russian / Cyrillic",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
    he: "Hebrew",
    th: "Thai",
    hi: "Hindi / Devanagari",
    el: "Greek",
    es: "Spanish",
    fr: "French",
    it: "Italian",
    pt: "Portuguese",
    nl: "Dutch",
    pl: "Polish",
    tr: "Turkish"
  };

  const LANGUAGE_CACHE_KEY = "detectedBotLanguagesV1";
  const LANGUAGE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const languageCache = new Map();
  const languageFetchQueue = [];
  const languageFetchPending = new Set();
  let languageCacheLoaded = false;
  let languageCacheSaveTimer = null;
  let languageFetchRunning = false;

  const LATIN_WORDS = {
    en: ["the","and","you","your","with","for","from","this","that","are","was","have","has","they","their","about","into","would","could","should","when","where"],
    de: ["der","die","das","und","ist","nicht","mit","für","ich","du","sie","wir","ein","eine","auf","aus","dem","den","aber","auch","oder","wenn"],
    es: ["el","la","los","las","que","de","del","con","para","por","una","uno","eres","está","esta","como","pero","cuando","donde","tiene","sus","muy","más","mas","sin","sobre","entre","ella","él","hombre","mujer","chica","chico","cuerpo","suave","pesado","pesada","obsceno","obscena","pervertido","pervertida","extremadamente","caótico","caótica","caotico","caotica","quiere","quiero","quieres","puede","puedo","puedes","tengo","tienes","dormir","contigo","conmigo","temo","miedo","oscuridad","porque","porqué","siempre","nunca","solo","sola","corrupción","corrupcion","femenina","femenino","novio","novia","ciudad","chico","chica","hacia","desde","vida","amor"],
    fr: ["le","la","les","des","une","un","avec","pour","dans","est","vous","tu","elle","il","mais","comme","quand","où","sur","pas","son"],
    it: ["il","lo","la","gli","le","una","uno","con","per","che","sei","è","sono","ma","come","quando","dove","non","suo","sua","nel"],
    pt: ["o","a","os","as","uma","um","com","para","que","você","voce","está","esta","não","nao","mas","como","quando","onde","seu","sua"],
    nl: ["de","het","een","en","met","voor","van","dat","dit","niet","jij","je","zij","hij","maar","als","waar","heeft","zijn","haar"],
    pl: ["jest","nie","dla","oraz","ale","jak","kiedy","gdzie","jego","jej","się","sie","ten","ta","to","który","ktory","przez","zawsze","może","moze"],
    tr: ["bir","ve","ile","için","icin","bu","şu","su","değil","degil","sen","siz","o","ama","gibi","zaman","nerede","onun","var","olan"]
  };

  function cleanText(value) {
    return String(value || "")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function norm(value) {
    return cleanText(value).toLowerCase();
  }

  function isUsableDescriptionElement(el) {
    if (!el || el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    if (el.dataset?.dsHidden === "1") return false;

    try {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
    } catch {}

    // Do not require a non-zero rectangle here. A card hidden by the language
    // filter has zero-sized descendants, but its text still needs to be read so
    // the next cleanup pass does not immediately unhide it again.
    return true;
  }

  function languageFilterEnabled() {
    const settings = DS.state?.settings || {};
    return !!settings.enableLanguageFilter;
  }

  function getAllowedLanguages() {
    const settings = DS.state?.settings || {};
    const raw = Array.isArray(settings.allowedLanguages)
      ? settings.allowedLanguages
      : [];

    return [...new Set(
      raw
        .map(item => String(item || "").trim().toLowerCase().slice(0, 2))
        .filter(Boolean)
    )];
  }

  function getLanguageSelectionMode() {
    const mode = String(DS.state?.settings?.languageSelectionMode || "include").toLowerCase();
    return mode === "exclude" ? "exclude" : "include";
  }

  function selectedLanguageShouldHide(code, selected = getAllowedLanguages()) {
    const normalized = String(code || "").toLowerCase();
    if (!normalized || !selected.length) return false;
    return getLanguageSelectionMode() === "exclude"
      ? selected.includes(normalized)
      : !selected.includes(normalized);
  }

  function getScriptCounts(text) {
    const value = cleanText(text);
    const matchCount = regex => (value.match(regex) || []).length;

    return {
      latin: matchCount(/[A-Za-zÀ-ÖØ-öø-ÿ]/g),
      cyrillic: matchCount(/[\u0400-\u04FF]/g),
      greek: matchCount(/[\u0370-\u03FF]/g),
      hiraganaKatakana: matchCount(/[\u3040-\u30FF]/g),
      cjk: matchCount(/[\u3400-\u9FFF]/g),
      hangul: matchCount(/[\uAC00-\uD7AF]/g),
      arabic: matchCount(/[\u0600-\u06FF]/g),
      hebrew: matchCount(/[\u0590-\u05FF]/g),
      thai: matchCount(/[\u0E00-\u0E7F]/g),
      devanagari: matchCount(/[\u0900-\u097F]/g)
    };
  }

  function wordScore(text, words) {
    const tokens = norm(text).match(/[\p{L}]{2,}/gu) || [];
    if (!tokens.length) return 0;
    const set = new Set(words);
    let score = 0;
    for (const token of tokens) if (set.has(token)) score += 1;
    return score;
  }

  function scriptToLanguage(counts) {
    const entries = [
      ["ru", counts.cyrillic], ["ja", counts.hiraganaKatakana], ["zh", counts.cjk],
      ["ko", counts.hangul], ["ar", counts.arabic], ["he", counts.hebrew],
      ["th", counts.thai], ["hi", counts.devanagari], ["el", counts.greek]
    ].sort((a, b) => b[1] - a[1]);
    return entries[0]?.[1] > 0 ? entries[0][0] : "";
  }

  function detectLikelyLanguage(text) {
    const value = cleanText(text);
    if (!value || value.length < 4) return { code: "", confidence: 0 };
    const counts = getScriptCounts(value);
    const nonLatinTotal = counts.cyrillic + counts.greek + counts.hiraganaKatakana + counts.cjk + counts.hangul + counts.arabic + counts.hebrew + counts.thai + counts.devanagari;
    const script = scriptToLanguage(counts);
    if (script && nonLatinTotal >= 4 && (nonLatinTotal > counts.latin || (nonLatinTotal >= 8 && counts.latin < 12))) {
      return { code: script, confidence: Math.min(1, nonLatinTotal / 24), source: "script" };
    }

    const scored = Object.entries(LATIN_WORDS).map(([code, words]) => [code, wordScore(value, words)]).sort((a, b) => b[1] - a[1]);
    const [bestCode, bestScore] = scored[0] || ["", 0];
    const secondScore = scored[1]?.[1] || 0;
    const letterCount = (value.match(/[\p{L}]/gu) || []).length;
    if (bestScore >= 3 && bestScore >= secondScore + 1) return { code: bestCode, confidence: Math.min(0.98, 0.55 + bestScore * 0.07), source: "words" };
    // Short listing descriptions are often only one sentence. Requiring ~80
    // letters let obvious non-English blurbs slip through (for example short
    // Spanish descriptions with several distinctive words). Two unambiguous
    // lexical hits are enough once there is a real sentence-sized sample.
    if (bestScore >= 2 && letterCount >= 28 && bestScore >= secondScore + 2) return { code: bestCode, confidence: Math.min(0.9, 0.62 + bestScore * 0.06), source: "words-short" };
    return { code: "", confidence: 0 };
  }

  function detectSentenceLikeTitleLanguage(title) {
    const value = cleanText(title);
    if (!value) return { code: "", confidence: 0 };
    const words = value.match(/[\p{L}]{2,}/gu) || [];
    const letters = (value.match(/[\p{L}]/gu) || []).length;
    const sentenceLike = words.length >= 4 && letters >= 18 && (/[¿¡!?…,:;.]/u.test(value) || value.length >= 30);
    if (!sentenceLike) return { code: "", confidence: 0 };
    const detected = detectLikelyLanguage(value);
    return detected.code ? { ...detected, source: `title-${detected.source || "text"}` } : detected;
  }

  const languageReasonCache = new WeakMap();

  function shouldHideDescriptionByLanguage(description, allowed = getAllowedLanguages()) {
    const detected = detectLikelyLanguage(description);
    if (!detected.code || !selectedLanguageShouldHide(detected.code, allowed)) return "";
    const action = getLanguageSelectionMode() === "exclude" ? "excluded" : "outside selected languages";
    return `language: likely ${LANGUAGE_NAMES[detected.code] || detected.code} (${action})`;
  }

  DS.detectLikelyBotLanguage = function detectLikelyBotLanguage(text) {
    return detectLikelyLanguage(text);
  };

  function ignoredDescriptionArea(el) {
    return !!el.closest([
      "#ds-qol-panel",
      "#ds-chat-export-modal",
      "nav",
      "aside",
      "header",
      "footer",
      "button",
      "select",
      "textarea",
      "input",
      "a[aria-label='creator']",
      "a[href*='/creator/']",
      "a[href*='/chat/']",
      "a[href*='/chatbot/']",
      "[role='button']",
      "[data-testid='LocaleSelector']",
      "[data-testid='FloatingUpgradeCta']",
      "[data-testid='GetPremiumButton']"
    ].join(", "));
  }

  function looksLikeTagOrUi(text) {
    const value = norm(text);
    if (!value) return true;

    const tagsAndUi = new Set([
      "male", "female", "malepov", "femalepov", "adventure", "anthro",
      "fictional media", "furry", "non-english", "original character",
      "villain", "anime", "fantasy", "romantic", "dominant", "submissive",
      "scenario", "drama", "friend", "action", "comedy", "horror",
      "wholesome", "english", "german", "nsfw", "home", "chats",
      "favorites", "recommendations", "leaderboard", "subscribe", "help",
      "true supporter", "en"
    ]);

    if (tagsAndUi.has(value)) return true;
    if (/^\d+$/.test(value)) return true;
    if (value.length <= 2) return true;

    return false;
  }

  function findCardRootFromAnyElement(el) {
    let node = el;

    for (let i = 0; node && i < 9; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const hasChatLink = !!node.querySelector("a[href*='/chat/'], a[href*='/chatbot/']");
      const hasImage = !!node.querySelector("img");
      const hasDescription = !!node.querySelector("p");
      const hasTags = node.querySelectorAll("button[aria-label]").length >= 2;

      if (hasChatLink && (hasImage || hasDescription || hasTags)) return node;
    }

    return el;
  }

  function getCardTitle(card) {
    const link =
      card.querySelector("a[aria-label^='chat-with-']") ||
      card.querySelector("a[href*='/chat/']") ||
      card.querySelector("a[href*='/chatbot/']");

    return cleanText(link?.getAttribute("title") || link?.textContent || "");
  }

  function getCardCreator(card) {
    return cleanText(
      card.querySelector("a[aria-label='creator']")?.textContent ||
      card.querySelector("a[href*='/creator/']")?.textContent ||
      ""
    );
  }

  function getCardTags(card) {
    return DS.qsa("button[aria-label]", card)
      .map(button => cleanText(button.getAttribute("aria-label") || button.textContent))
      .filter(Boolean);
  }

  function explicitLanguageCode(card) {
    const tagText = getCardTags(card).map(norm);
    for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
      const n = norm(name).replace(/\s*\/.*$/, "");
      if (tagText.some(tag => tag === code || tag === n || tag.includes(`language: ${n}`))) return code;
    }
    return "";
  }

  function cardBotId(card) {
    const anchor = card?.querySelector?.("a[href*='/chat/'], a[href*='/chatbot/']");
    return String(DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref?.(anchor?.href || "") || "").trim().toLowerCase();
  }

  async function ensureLanguageCacheLoaded() {
    if (languageCacheLoaded) return;
    languageCacheLoaded = true;
    try {
      const result = await DS.storageGet?.(LANGUAGE_CACHE_KEY);
      const raw = result?.[LANGUAGE_CACHE_KEY];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const now = Date.now();
      for (const [id, entry] of Object.entries(raw)) {
        if (!entry || !LANGUAGE_NAMES[entry.code] || now - Number(entry.updatedAt || 0) > LANGUAGE_CACHE_TTL) continue;
        const key = String(id).toLowerCase();
        if (!languageCache.has(key)) languageCache.set(key, { code: entry.code, updatedAt: Number(entry.updatedAt || now), source: entry.source || "profile" });
      }
    } catch {}
  }

  function scheduleLanguageCacheSave() {
    clearTimeout(languageCacheSaveTimer);
    languageCacheSaveTimer = setTimeout(async () => {
      await ensureLanguageCacheLoaded();
      const out = {};
      const now = Date.now();
      for (const [id, entry] of languageCache.entries()) {
        if (now - Number(entry.updatedAt || 0) > LANGUAGE_CACHE_TTL) continue;
        out[id] = entry;
      }
      try { await DS.storageSet?.({ [LANGUAGE_CACHE_KEY]: out }); } catch {}
    }, 700);
  }

  function cacheLanguage(id, code, source = "local") {
    if (!id || !LANGUAGE_NAMES[code]) return;
    const current = languageCache.get(id);
    if (current?.code === code && Date.now() - Number(current.updatedAt || 0) < 6 * 60 * 60 * 1000) return;
    languageCache.set(id, { code, source, updatedAt: Date.now() });
    scheduleLanguageCacheSave();
  }

  async function drainLanguageFetchQueue() {
    if (languageFetchRunning) return;
    languageFetchRunning = true;
    try {
      await ensureLanguageCacheLoaded();
      while (languageFetchQueue.length) {
        const id = languageFetchQueue.shift();
        if (!id) continue;
        if (languageCache.has(id)) { languageFetchPending.delete(id); continue; }
        try {
          const fields = await DS.fetchPublicCharacterFields?.(id);
          const combined = [fields?.greeting, fields?.description].map(cleanText).filter(Boolean).join(" ");
          const detected = detectLikelyLanguage(combined);
          if (detected.code) cacheLanguage(id, detected.code, "greeting+description");
        } catch {}
        languageFetchPending.delete(id);
        DS.scheduleRun?.();
        await new Promise(resolve => setTimeout(resolve, 650));
      }
    } finally { languageFetchRunning = false; }
  }

  function queueLanguageProfileCheck(card) {
    const settings = DS.state?.settings || {};
    if (!settings.languageAutoDetectUntagged) return;
    const id = cardBotId(card);
    if (!id || languageCache.has(id) || languageFetchPending.has(id)) return;
    languageFetchPending.add(id);
    languageFetchQueue.push(id);
    drainLanguageFetchQueue().catch(() => {});
  }

  function applyDetectedLanguageBadge(card, code) {
    const settings = DS.state?.settings || {};
    const existing = card?.querySelector?.(":scope .ds-detected-language-badge");
    if (!settings.languageShowDetectedBadge || !code) { existing?.remove(); return; }
    let badge = existing;
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "ds-detected-language-badge";
      const host = card.querySelector("a[href*='/creator/']")?.parentElement || card;
      host.appendChild(badge);
    }
    badge.textContent = `QoL: ${LANGUAGE_NAMES[code] || code}`;
    badge.title = "Language detected locally from the bot title/description/greeting; this does not edit the creator's SpicyChat tags.";
  }

  function getDescriptionCandidates(card) {
    const title = norm(getCardTitle(card));
    const creator = norm(getCardCreator(card));
    const tags = new Set(getCardTags(card).map(norm));

    return DS.qsa("p, span, div", card)
      .filter(isUsableDescriptionElement)
      .filter(el => !ignoredDescriptionArea(el))
      .map((el, index) => ({
        el,
        index,
        text: cleanText(el.textContent || el.innerText)
      }))
      .filter(item => item.text)
      .filter(item => item.text.length >= 4)
      .filter(item => item.text.length <= 1200)
      .filter(item => norm(item.text) !== title)
      .filter(item => norm(item.text) !== creator)
      .filter(item => !tags.has(norm(item.text)))
      .filter(item => !looksLikeTagOrUi(item.text))
      .filter(item => {
        const buttons = item.el.querySelectorAll?.("button");
        const links = item.el.querySelectorAll?.("a");
        return !(buttons?.length || links?.length);
      })
      .sort((a, b) => {
        const scriptA = getScriptCounts(a.text);
        const scriptB = getScriptCounts(b.text);

        const nonLatinA =
          scriptA.cyrillic + scriptA.hiraganaKatakana + scriptA.cjk +
          scriptA.hangul + scriptA.arabic + scriptA.hebrew +
          scriptA.thai + scriptA.devanagari + scriptA.greek;

        const nonLatinB =
          scriptB.cyrillic + scriptB.hiraganaKatakana + scriptB.cjk +
          scriptB.hangul + scriptB.arabic + scriptB.hebrew +
          scriptB.thai + scriptB.devanagari + scriptB.greek;

        return nonLatinB - nonLatinA || b.text.length - a.text.length || a.index - b.index;
      });
  }

  DS.getCardDescriptionText = function getCardDescriptionText(card) {
    const root = findCardRootFromAnyElement(card);
    const candidates = getDescriptionCandidates(root);
    return candidates[0]?.text || "";
  };

  DS.getLanguageHideReason = function getLanguageHideReason(card) {
    if (!languageFilterEnabled()) return "";

    const allowed = getAllowedLanguages();
    if (!allowed.length) return "";

    // Description discovery is one of the more expensive listing operations.
    // Reuse the result while a recycled card's visible text and language
    // settings are unchanged instead of walking every descendant again.
    const rawText = String(card?.textContent || "");
    const cfg = DS.state?.settings || {};
    const settingsKey = `${getLanguageSelectionMode()}|${allowed.join(",")}|auto:${cfg.languageAutoDetectUntagged ? 1 : 0}|badge:${cfg.languageShowDetectedBadge ? 1 : 0}`;
    const cached = card ? languageReasonCache.get(card) : null;

    if (cached && cached.rawText === rawText && cached.settingsKey === settingsKey) {
      return cached.reason;
    }

    const description = DS.getCardDescriptionText(card);
    const title = getCardTitle(card);
    const explicit = explicitLanguageCode(card);
    const localDetected = detectLikelyLanguage(description);
    // A confidently sentence-like title is independent language evidence.
    // Do not suppress it just because the description was detected first: a
    // Spanish title plus an English description still contains Spanish content
    // and should respect an English/German-only (or Spanish-excluded) filter.
    const titleDetected = detectSentenceLikeTitleLanguage(title);
    const id = cardBotId(card);
    if (id && !explicit) {
      if (titleDetected.code) cacheLanguage(id, titleDetected.code, "title");
      else if (localDetected.code) cacheLanguage(id, localDetected.code, "description");
    }
    const cachedCode = id ? languageCache.get(id)?.code || "" : "";
    const currentEvidence = [
      explicit ? { code: explicit, source: "tag" } : null,
      titleDetected.code ? { code: titleDetected.code, source: "title" } : null,
      localDetected.code ? { code: localDetected.code, source: "description" } : null
    ].filter(Boolean);
    // Cached profile/title inference is fallback evidence only. If the creator
    // later edits the bot and the current card now gives us confident language
    // evidence, do not let an older cached language override the live content.
    const hiddenEvidence = currentEvidence.find(item => selectedLanguageShouldHide(item.code, allowed))
      || (!currentEvidence.length && cachedCode && selectedLanguageShouldHide(cachedCode, allowed)
        ? { code: cachedCode, source: "cache" }
        : null);
    const code = hiddenEvidence?.code || explicit || titleDetected.code || localDetected.code || cachedCode;
    let reason = "";
    if (hiddenEvidence) {
      const modeLabel = getLanguageSelectionMode() === "exclude" ? "excluded" : "outside selected languages";
      const sourceLabel = hiddenEvidence.source === "tag" ? " tag" : hiddenEvidence.source === "title" ? " title" : hiddenEvidence.source === "description" ? " description" : " (QoL detected)";
      reason = `language: likely ${LANGUAGE_NAMES[hiddenEvidence.code] || hiddenEvidence.code}${sourceLabel} · ${modeLabel}`;
    }

    if (!explicit && !localDetected.code && !titleDetected.code && !cachedCode) {
      ensureLanguageCacheLoaded().then(() => DS.scheduleRun?.()).catch(() => {});
      queueLanguageProfileCheck(card);
    }
    applyDetectedLanguageBadge(card, !explicit ? (titleDetected.code || localDetected.code || cachedCode) : "");

    if (card?.dataset) {
      card.dataset.dsLanguageDescriptionPresent = description ? "1" : "0";
      card.dataset.dsLanguageDescriptionSignature = description ? `${description.length}:${description.slice(0, 90)}` : "";
      card.dataset.dsLanguageTitleSignature = titleDetected.code ? `${title.length}:${title.slice(0, 90)}` : "";
      card.dataset.dsDetectedLanguage = code || "";
    }

    if (card) languageReasonCache.set(card, { rawText, settingsKey, reason });
    return reason;
  };

  DS.shouldHideByLanguage = function shouldHideByLanguage(card) {
    return DS.getLanguageHideReason(card);
  };

  DS.applyLanguageFilterToCards = function applyLanguageFilterToCards() {
    if (!languageFilterEnabled()) {
      document.querySelectorAll(".ds-detected-language-badge").forEach(node => node.remove());
      return;
    }
    if (!getAllowedLanguages().length) return;

    const links = DS.qsa("a[href*='/chat/'], a[href*='/chatbot/']")
      .filter(link => !link.closest("#ds-qol-panel"));

    const roots = [...new Set(links.map(findCardRootFromAnyElement).filter(Boolean))];

    for (const root of roots) {
      if (root.closest("nav, aside, header, footer")) continue;
      if (root.dataset.dsHidden === "1") continue;

      const reason = DS.getLanguageHideReason(root);
      if (!reason) continue;

      if (typeof DS.hideElement === "function") {
        DS.hideElement(root, reason);
      } else {
        if (!root.classList.contains("ds-hidden")) root.classList.add("ds-hidden");
        if (root.dataset.dsHidden !== "1") root.dataset.dsHidden = "1";
        if (root.dataset.dsReason !== reason) root.dataset.dsReason = reason;
      }
    }
  };
})();

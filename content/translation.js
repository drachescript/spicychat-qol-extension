// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const CACHE_KEY = "dsTranslationCacheV1";
  const memoryCache = new Map();
  let cacheLoaded = false;
  let cacheSaveTimer = null;
  let observerTimer = null;
  let translationObserverActive = false;
  const autoStability = new WeakMap();
  const sourceContainers = new WeakMap();
  let lastApplySignature = "";
  let lastApplyRoute = "";

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getMessageRoots() {
    return [...document.querySelectorAll("div[id^='message-']")]
      .filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
  }

  function textContainer(root) {
    if (!root) return null;

    const cached = sourceContainers.get(root);
    if (
      cached?.isConnected &&
      root.contains(cached) &&
      !cached.matches?.(".ds-translation-block") &&
      !cached.querySelector?.(".ds-translation-block")
    ) {
      return cached;
    }

    const candidates = [...root.querySelectorAll("div")]
      .filter(el => {
        if (el.closest("#ds-qol-panel, #ds-chat-export-modal, .ds-translation-block")) return false;
        // Do not choose a broad ancestor after QoL inserts the translation as
        // its sibling/descendant. Doing so made the translated text become part
        // of the source hash, so the block removed and recreated itself forever.
        if (el.querySelector?.(".ds-translation-block")) return false;
        if (!String(el.className || "").includes("overflow-wrap")) return false;
        return cleanText(el.textContent).length > 0;
      })
      .sort((a, b) => {
        // Prefer the deepest matching message-text node first; use text length
        // only as a tie breaker. This is substantially more stable than picking
        // the largest ancestor on every pass.
        const depth = el => {
          let n = el, d = 0;
          while (n && n !== root) { d++; n = n.parentElement; }
          return d;
        };
        return depth(b) - depth(a) || cleanText(b.textContent).length - cleanText(a.textContent).length;
      });

    const found = candidates[0] || null;
    if (found) sourceContainers.set(root, found);
    return found;
  }

  function isAiMessage(root) {
    return !!root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function sourceText(root) {
    const container = textContainer(root);
    // textContent avoids a forced style/layout flush on every QoL pass.
    return String(container?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  const CHAT_LANG_KEY = "dsTranslationChatLanguagesV1";
  let chatLangMap = null;
  function targetLang() {
    return String(chatLangMap?.[location.pathname] || DS.state?.settings?.translationTargetLanguage || "EN-US").trim().toUpperCase() || "EN-US";
  }
  async function loadChatLanguages() {
    if (chatLangMap !== null) return;
    try {
      const stored = DS.state?.settings?.translationChatLanguageOverrides;
      if (stored) chatLangMap = JSON.parse(stored);
      else { const result = await DS.storageGet?.([CHAT_LANG_KEY]); chatLangMap = result?.[CHAT_LANG_KEY] || {}; }
      if (!chatLangMap || typeof chatLangMap !== "object") chatLangMap = {};
    } catch { chatLangMap = {}; }
  }
  async function saveChatLang(value) {
    await loadChatLanguages();
    if (value) chatLangMap[location.pathname] = value;
    else delete chatLangMap[location.pathname];
    // Bound map growth to avoid indefinite history.
    const entries = Object.entries(chatLangMap).slice(-300);
    chatLangMap = Object.fromEntries(entries);
    if (DS.saveSettingsPatch) await DS.saveSettingsPatch({ translationChatLanguageOverrides: JSON.stringify(chatLangMap) });
    else await DS.storageSet?.({ [CHAT_LANG_KEY]: chatLangMap });
    document.querySelectorAll("[data-ds-translation-done], [data-ds-translation-skipped]").forEach(root => {
      root.querySelector(":scope .ds-translation-block")?.remove();
      delete root.dataset.dsTranslationDone; delete root.dataset.dsTranslationSkipped;
      delete root.dataset.dsTranslationSourceHash; delete root.dataset.dsTranslationTarget;
    });
    lastApplySignature = "";
    DS.applyTranslationTools?.();
  }
  async function localTranslate(text, target) {
    const API = globalThis.Translator;
    if (!API?.create || !API?.availability) throw new Error("On-device translation isn't supported by this browser. Choose DeepL, LibreTranslate, or manual external translation in Settings.");
    const targetLanguage = normalizedBaseLanguage(target).toLowerCase();
    let sourceLanguage = guessLanguage(text).toLowerCase();
    if (!sourceLanguage && globalThis.LanguageDetector?.create) {
      try {
        const detector = await globalThis.LanguageDetector.create();
        const candidates = await detector.detect(text);
        sourceLanguage = String(candidates?.[0]?.detectedLanguage || "").toLowerCase();
        detector.destroy?.();
      } catch {}
    }
    if (!sourceLanguage) throw new Error("On-device source language couldn't be detected. Use DeepL or LibreTranslate for this message.");
    if (sourceLanguage === targetLanguage) return { text, detectedSourceLanguage: sourceLanguage, provider: "On-device" };
    const status = await API.availability({ sourceLanguage, targetLanguage });
    if (["unavailable", "no"].includes(status)) throw new Error(`On-device ${sourceLanguage} → ${targetLanguage} is unavailable.`);
    const translator = await API.create({ sourceLanguage, targetLanguage });
    try { return { text: await translator.translate(text), detectedSourceLanguage: sourceLanguage, provider: "On-device" }; }
    finally { translator.destroy?.(); }
  }
  function provider() { return String(DS.state?.settings?.translationProvider || "deepl"); }
  async function translateWithProvider(text, target, context = "") {
    const name = provider();
    if (name === "external") throw new Error("External Google Translate is manual only.");
    if (name === "local" || name === "auto") {
      try { return await localTranslate(text, target); }
      catch (error) {
        if (name === "local" || !DS.state?.settings?.translationAllowRemoteFallback) throw error;
      }
    }
    if (name === "libre") return await sendMessage({ type: "DS_QOL_TRANSLATE", provider: "libre", text, targetLang: target, settings: { libreTranslateUrl: DS.state?.settings?.libreTranslateUrl || "" } });
    const deep = await sendMessage({ type: "DS_DEEPL_TRANSLATE", text, targetLang: target, context });
    return { ...deep, provider: "DeepL" };
  }
  function openExternalTranslator(text, target) {
    if (!text || text.length > 4500) throw new Error("External translator supports up to 4,500 characters at once.");
    const dest = `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(target.split("-")[0].toLowerCase())}&text=${encodeURIComponent(text)}&op=translate`;
    window.open(dest, "_blank", "noopener,noreferrer");
  }
  function ensureChatLanguageControl() {
    const enabled = !!DS.state?.settings?.translationPerChatControls;
    let select = document.getElementById("ds-translation-chat-language");
    if (!enabled) { select?.remove(); return; }
    const header = document.querySelector("#ds-chat-background-control")?.parentElement || document.querySelector("button[aria-label='chat-dropdown']")?.parentElement;
    if (!header) return;
    if (!select) {
      select = document.createElement("select"); select.id = "ds-translation-chat-language";
      select.setAttribute("aria-label", "Target translation language for this chat"); select.title = "Translation language for this chat";
      for (const [code, label] of Object.entries({ "": "Global language", "EN-US": "English", DE: "German", FR: "French", ES: "Spanish", IT: "Italian", JA: "Japanese", KO: "Korean", "ZH-HANS": "Chinese", PT: "Portuguese" })) {
        const option = document.createElement("option"); option.value = code; option.textContent = label; select.appendChild(option);
      }
      select.addEventListener("change", () => saveChatLang(select.value));
    }
    select.value = chatLangMap?.[location.pathname] || "";
    if (select.parentElement !== header) header.appendChild(select);
  }

  function normalizedBaseLanguage(code) {
    return String(code || "").toUpperCase().split("-")[0];
  }

  function understoodLanguages() {
    const raw = String(DS.state?.settings?.translationUnderstoodLanguages || "");
    const list = raw.split(/[\s,;]+/g).map(normalizedBaseLanguage).filter(Boolean);
    list.push(normalizedBaseLanguage(targetLang()));
    return new Set(list);
  }

  const STOPWORDS = {
    EN: ["the", "and", "you", "your", "that", "this", "with", "for", "are", "not", "have", "she", "he", "they", "what", "from"],
    ES: ["que", "de", "la", "el", "y", "en", "un", "una", "por", "para", "con", "no", "como", "pero", "su"],
    DE: ["der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "für", "ich", "du", "sie", "von", "zu"],
    FR: ["le", "la", "les", "de", "des", "et", "est", "un", "une", "pour", "avec", "pas", "vous", "que", "dans"],
    IT: ["il", "la", "che", "di", "e", "un", "una", "per", "con", "non", "sono", "come", "tu", "lei", "nel"],
    ID: ["yang", "dan", "untuk", "dengan", "ini", "itu", "saya", "kamu", "tidak", "dari", "ada", "adalah", "bisa", "ke", "di"],
    PT: ["de", "que", "o", "a", "e", "um", "uma", "para", "com", "não", "você", "ela", "ele", "por", "como"]
  };

  function guessLanguage(text) {
    const raw = String(text || "");
    if (/[\u3040-\u30ff]/u.test(raw)) return "JA";
    if (/[\uac00-\ud7af]/u.test(raw)) return "KO";
    if (/[\u0400-\u04ff]/u.test(raw)) return "RU";
    if (/[\u3400-\u4dbf\u4e00-\u9fff]/u.test(raw)) return "ZH";

    const words = raw.toLowerCase().match(/[\p{L}']+/gu) || [];
    if (words.length < 4) return "";
    const counts = {};
    for (const [lang, stopwords] of Object.entries(STOPWORDS)) {
      const set = new Set(stopwords);
      counts[lang] = words.reduce((sum, word) => sum + (set.has(word) ? 1 : 0), 0);
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!ranked[0] || ranked[0][1] < 2 || ranked[0][1] === ranked[1]?.[1]) return "";
    return ranked[0][0];
  }

  async function loadCache() {
    if (cacheLoaded) return;
    cacheLoaded = true;
    try {
      const result = await DS.storageGet?.([CACHE_KEY]);
      const stored = result?.[CACHE_KEY];
      if (!stored || typeof stored !== "object") return;
      Object.entries(stored).slice(-250).forEach(([key, value]) => {
        if (value && typeof value === "object" && value.text) memoryCache.set(key, value);
      });
    } catch {}
  }

  function simpleHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function cacheKey(text, target) {
    return `${provider()}:${target}:${simpleHash(text)}:${text.length}`;
  }


  function stableEnoughForAuto(root, text) {
    const signature = `${simpleHash(text)}:${text.length}`;
    const current = autoStability.get(root);
    const now = Date.now();
    if (!current || current.signature !== signature) {
      autoStability.set(root, { signature, changedAt: now });
      setTimeout(() => DS.applyTranslationTools?.(), 850);
      return false;
    }
    return now - current.changedAt >= 700;
  }

  function scheduleCacheSave() {
    clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(async () => {
      const entries = [...memoryCache.entries()].slice(-250);
      try { await DS.storageSet?.({ [CACHE_KEY]: Object.fromEntries(entries) }); } catch {}
    }, 700);
  }

  function previousMessageContext(root) {
    const roots = getMessageRoots();
    const index = roots.indexOf(root);
    if (index <= 0) return "";
    return sourceText(roots[index - 1]).slice(0, 1800);
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function configuredProtectedTerms() {
    return String(DS.state?.settings?.translationProtectedTerms || "")
      .split(/\r?\n/g)
      .map(term => term.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  }

  function protectForTranslation(input) {
    let text = String(input || "");
    const values = [];
    const hold = value => {
      const token = `ZXQDSKEEP${values.length}QXZ`;
      values.push(String(value));
      return token;
    };

    text = text.replace(/```[\s\S]*?```|`[^`\n]+`|\{\{[^{}\n]+\}\}|https?:\/\/[^\s<]+/g, hold);

    for (const term of configuredProtectedTerms()) {
      const regex = new RegExp(escapeRegex(term), "gi");
      text = text.replace(regex, match => hold(match));
    }

    return {
      text,
      restore(value) {
        let restored = String(value || "");
        values.forEach((original, index) => {
          const token = `ZXQDSKEEP${index}QXZ`;
          restored = restored.split(token).join(original);
        });
        return restored;
      }
    };
  }

  function sendMessage(payload) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(payload, response => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message || "Translation request failed." });
            return;
          }
          resolve(response || { ok: false, error: "No response." });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function ensureBlock(root) {
    let block = root.querySelector(":scope .ds-translation-block");
    if (block) return block;
    const container = textContainer(root);
    if (!container) return null;
    block = document.createElement("div");
    block.className = "ds-translation-block";
    DS.setSafeMarkup(block, `
      <div class="ds-translation-actions">
        <button type="button" class="ds-translation-button">Translate</button>
        <button type="button" class="ds-translation-toggle" hidden>Hide translation</button>
      </div>
      <div class="ds-translation-text" hidden></div>
      <div class="ds-translation-note" hidden></div>
    `);
    container.insertAdjacentElement("afterend", block);
    const translateButton = block.querySelector(".ds-translation-button");
    const toggle = block.querySelector(".ds-translation-toggle");
    translateButton.addEventListener("click", () => {
      if (provider() === "external") {
        // Open directly inside the user gesture; await/storage operations can
        // cause browsers to block a newly opened translation tab.
        try { openExternalTranslator(sourceText(root), targetLang()); }
        catch (error) {
          const note = block.querySelector(".ds-translation-note");
          note.hidden = false; note.textContent = error?.message || String(error);
        }
      } else translateRoot(root, { manual: true });
    });
    toggle.addEventListener("click", () => {
      const text = block.querySelector(".ds-translation-text");
      const hidden = !text.hidden;
      text.hidden = hidden;
      block.querySelector(".ds-translation-note").hidden = hidden;
      toggle.textContent = hidden ? "Show translation" : "Hide translation";
    });
    return block;
  }

  function renderResult(root, result, source = "") {
    const block = ensureBlock(root);
    if (!block) return;
    const textHost = block.querySelector(".ds-translation-text");
    const note = block.querySelector(".ds-translation-note");
    const button = block.querySelector(".ds-translation-button");
    const toggle = block.querySelector(".ds-translation-toggle");

    textHost.textContent = result.text || "";
    textHost.hidden = false;
    note.textContent = result.detectedSourceLanguage
      ? `Translated from ${result.detectedSourceLanguage} with ${result.provider || "DeepL"}`
      : `Translated with ${result.provider || "DeepL"}`;
    note.hidden = false;
    button.textContent = "Translate again";
    button.disabled = false;
    toggle.hidden = false;
    toggle.textContent = "Hide translation";
    root.dataset.dsTranslationDone = "1";
    root.dataset.dsTranslationTarget = targetLang();
    if (source) root.dataset.dsTranslationSourceHash = `${simpleHash(source)}:${source.length}`;
  }

  async function translateRoot(root, { manual = false } = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableTranslation || !DS.isSingleChatPage?.()) return;

    const text = sourceText(root);
    if (!text || text.length < 2) return;

    if (!manual) {
      const guessed = guessLanguage(text);
      if (guessed && understoodLanguages().has(guessed)) {
        root.dataset.dsTranslationSkipped = guessed;
        root.dataset.dsTranslationSourceHash = `${simpleHash(text)}:${text.length}`;
        return;
      }
    }

    await loadCache();
    const target = targetLang();
    const key = cacheKey(text, target);
    const cached = memoryCache.get(key);
    if (cached?.text) {
      const cachedSource = normalizedBaseLanguage(cached.detectedSourceLanguage);
      if (!understoodLanguages().has(cachedSource) || manual) {
        renderResult(root, cached, text);
      } else {
        root.dataset.dsTranslationSkipped = cachedSource || "understood";
        root.dataset.dsTranslationSourceHash = `${simpleHash(text)}:${text.length}`;
      }
      return;
    }

    const block = ensureBlock(root);
    const button = block?.querySelector(".ds-translation-button");
    if (button) {
      button.disabled = true;
      button.textContent = "Translating...";
    }

    if (provider() === "external") {
      if (!manual) return;
      try { openExternalTranslator(text, target); }
      catch (error) { const note = block?.querySelector(".ds-translation-note"); if (note) { note.hidden = false; note.textContent = error.message; } }
      if (button) { button.disabled = false; button.textContent = "Translate externally"; }
      return;
    }
    const protectedText = protectForTranslation(text);
    let response;
    try { response = await translateWithProvider(protectedText.text, target, previousMessageContext(root)); }
    catch (error) { response = { ok: false, error: error?.message || String(error) }; }
    if (response && response.ok === undefined) response.ok = true;

    if (!response?.ok) {
      if (button) {
        button.disabled = false;
        button.textContent = "Translate";
      }
      const note = block?.querySelector(".ds-translation-note");
      if (note) {
        note.hidden = false;
        note.textContent = response?.error || "Translation failed. Check the chosen provider in Settings.";
      }
      if (!manual) {
        root.dataset.dsTranslationSkipped = "provider-error";
        root.dataset.dsTranslationSourceHash = `${simpleHash(text)}:${text.length}`;
      }
      return;
    }

    const result = {
      text: protectedText.restore(response.text || ""),
      detectedSourceLanguage: response.detectedSourceLanguage || "",
      savedAt: Date.now(),
      provider: response.provider || (provider() === "deepl" ? "DeepL" : provider())
    };
    memoryCache.set(key, result);
    scheduleCacheSave();

    const sourceBase = normalizedBaseLanguage(result.detectedSourceLanguage);
    if (!manual && sourceBase && understoodLanguages().has(sourceBase)) {
      block?.remove();
      root.dataset.dsTranslationSkipped = sourceBase;
      root.dataset.dsTranslationSourceHash = `${simpleHash(text)}:${text.length}`;
      return;
    }

    renderResult(root, result, text);
  }

  function removeBlocks() {
    if (translationObserverActive) {
      observer.disconnect();
      translationObserverActive = false;
    }
    clearTimeout(observerTimer);
    observerTimer = null;
    DS.state.translationWasActive = false;
    lastApplySignature = "";
    lastApplyRoute = "";
    document.querySelectorAll(".ds-translation-block").forEach(el => el.remove());
    document.getElementById("ds-translation-chat-language")?.remove();
    document.querySelectorAll("[data-ds-translation-done], [data-ds-translation-skipped]").forEach(el => {
      delete el.dataset.dsTranslationDone;
      delete el.dataset.dsTranslationSkipped;
      delete el.dataset.dsTranslationTarget;
      delete el.dataset.dsTranslationSourceHash;
    });
  }

  DS.translateVisibleMessages = async function translateVisibleMessages() {
    const roots = getMessageRoots().filter(root => {
      const rect = root.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });
    if (!roots.length) return;

    await loadCache();
    const target = targetLang();
    const pending = [];

    for (const root of roots) {
      const text = sourceText(root);
      if (!text || text.length < 2) continue;
      const key = cacheKey(text, target);
      const cached = memoryCache.get(key);
      if (cached?.text) {
        renderResult(root, cached, text);
        continue;
      }
      const protectedText = protectForTranslation(text);
      const block = ensureBlock(root);
      const button = block?.querySelector(".ds-translation-button");
      if (button) { button.disabled = true; button.textContent = "Translating..."; }
      pending.push({ root, text, key, protectedText, block });
    }

    for (let offset = 0; offset < pending.length; offset += (provider() === "deepl" ? 50 : 10)) {
      const chunk = pending.slice(offset, offset + (provider() === "deepl" ? 50 : 10));
      let response;
      if (provider() === "external") { response = { ok: false, error: "External translation works per message only." }; }
      else if (provider() === "deepl") response = await sendMessage({ type: "DS_DEEPL_TRANSLATE_BATCH", texts: chunk.map(item => item.protectedText.text), targetLang: target, context: previousMessageContext(chunk[0]?.root) });
      else {
        const translations = [];
        for (const item of chunk) {
          try {
            const result = await translateWithProvider(item.protectedText.text, target);
            if (result?.ok === false) throw new Error(result.error || "Translation failed");
            translations.push(result);
          } catch (error) { response = { ok: false, error: error?.message || String(error) }; break; }
        }
        if (!response) response = { ok: true, translations };
      }

      if (!response?.ok || !Array.isArray(response.translations)) {
        for (const item of chunk) {
          const button = item.block?.querySelector(".ds-translation-button");
          const note = item.block?.querySelector(".ds-translation-note");
          if (button) { button.disabled = false; button.textContent = "Translate"; }
          if (note) { note.hidden = false; note.textContent = response?.error || "Translation failed. Check your DeepL setup in Settings."; }
        }
        continue;
      }

      response.translations.forEach((translated, index) => {
        const item = chunk[index];
        if (!item) return;
        const result = {
          text: item.protectedText.restore(translated?.text || ""),
          detectedSourceLanguage: translated?.detectedSourceLanguage || "",
          savedAt: Date.now(),
          provider: translated?.provider || (provider() === "deepl" ? "DeepL" : provider())
        };
        memoryCache.set(item.key, result);
        renderResult(item.root, result, item.text);
      });
    }
    scheduleCacheSave();
  };

  DS.applyTranslationTools = function applyTranslationTools() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableTranslation || !DS.isSingleChatPage?.()) {
      removeBlocks();
      return;
    }

    if (!translationObserverActive) {
      observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
      translationObserverActive = true;
    }
    DS.state.translationWasActive = true;
    loadChatLanguages().then(() => ensureChatLanguageControl());
    const route = String(location.pathname || "");
    const signature = JSON.stringify([
      targetLang(),
      !!settings.translationShowMessageButtons,
      !!settings.translationAutoAi,
      !!settings.translationAutoUser,
      String(settings.translationUnderstoodLanguages || ""),
      provider(), !!settings.translationPerChatControls, !!settings.translationAllowRemoteFallback
    ]);
    const fullPass = signature !== lastApplySignature || route !== lastApplyRoute;
    lastApplySignature = signature;
    lastApplyRoute = route;

    let roots = fullPass
      ? (DS.getMessageEnhancerRoots?.({ newest: 24, margin: 1400 }) || getMessageRoots())
      : (DS.getCurrentMessageLaneRoots?.() || []);
    if (!roots.length && !fullPass) return;
    roots = [...new Set(roots)].filter(root => root?.isConnected && !DS.isMessageEditPending?.(root));

    if (!fullPass) {
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.translationIncrementalUpdates = Number(counters.translationIncrementalUpdates || 0) + 1;
      counters.translationDirtyRoots = Number(counters.translationDirtyRoots || 0) + roots.length;
    }

    for (const root of roots) {
      const currentText = sourceText(root);
      const currentSourceHash = currentText ? `${simpleHash(currentText)}:${currentText.length}` : "";
      if (
        (root.dataset.dsTranslationTarget && root.dataset.dsTranslationTarget !== targetLang()) ||
        (root.dataset.dsTranslationSourceHash && currentSourceHash && root.dataset.dsTranslationSourceHash !== currentSourceHash)
      ) {
        root.querySelector(":scope .ds-translation-block")?.remove();
        delete root.dataset.dsTranslationDone;
        delete root.dataset.dsTranslationSkipped;
        delete root.dataset.dsTranslationTarget;
        delete root.dataset.dsTranslationSourceHash;
      }

      const ai = isAiMessage(root);
      const showButton = !!settings.translationShowMessageButtons || provider() === "external";
      const auto = provider() !== "external" && (ai ? !!settings.translationAutoAi : !!settings.translationAutoUser);

      if (showButton || auto) {
        const block = ensureBlock(root);
        if (block) block.querySelector(".ds-translation-actions").hidden = !showButton;
      }

      if (
        auto &&
        currentText &&
        stableEnoughForAuto(root, currentText) &&
        !root.dataset.dsTranslationDone &&
        !root.dataset.dsTranslationPending &&
        !root.dataset.dsTranslationSkipped
      ) {
        root.dataset.dsTranslationPending = "1";
        translateRoot(root).finally(() => delete root.dataset.dsTranslationPending);
      }
    }
  };

  DS.removeTranslationTools = removeBlocks;

  const observer = new MutationObserver(mutations => {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.enableTranslation || !DS.isSingleChatPage?.()) return;
    let relevant = false;
    for (const mutation of mutations) {
      if (DS.mutationIsQolOnly?.(mutation)) continue;
      const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
      if (target?.closest?.(".ds-translation-block")) continue;

      const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(node => !DS.isQolOwnedNode?.(node));
      if (nodes.length && nodes.every(node => {
        const el = node instanceof Element ? node : node.parentElement;
        return !!el?.closest?.(".ds-translation-block") || !!el?.matches?.(".ds-translation-block");
      })) continue;

      const candidates = [target, ...nodes.map(node => node instanceof Element ? node : node.parentElement)].filter(Boolean);
      for (const candidate of candidates) {
        const root = candidate.matches?.("div[id^='message-']") ? candidate : candidate.closest?.("div[id^='message-']");
        if (root) { DS.invalidateMessageCacheForNode?.(root); relevant = true; }
        candidate.querySelectorAll?.("div[id^='message-']").forEach(messageRoot => {
          DS.invalidateMessageCacheForNode?.(messageRoot);
          relevant = true;
        });
      }
    }
    if (!relevant) return;
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => DS.scheduleMessageLane?.("translation-mutation"), 100);
  });

  // Observed only while translation is enabled; removeBlocks disconnects it.
})();

}

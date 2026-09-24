(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const CACHE_KEY = "cardGreetingTokenCache";
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const RETRY_AFTER_MS = 45 * 1000;
  const MAX_CACHE_ENTRIES = 700;
  const MAX_PROFILE_BYTES = 2_500_000;
  const MAX_CONCURRENT = 2;
  const MAIN_REQUEST_EVENT = "ds-qol-card-token-request-v2";
  const MAIN_RESPONSE_EVENT = "ds-qol-card-token-response-v2";
  const MAIN_BRIDGE_TIMEOUT_MS = 8200;
  const MAIN_BRIDGE_FAILURE_LIMIT = 2;
  const MAIN_BRIDGE_COOLDOWN_MS = 5 * 60 * 1000;
  const BOT_LINK_RE = /\/(?:chat|chatbot)\/([0-9a-f-]{20,})(?:[/?#]|$)/i;
  const CARD_SELECTOR = "div.relative.group.rounded-xl,article,[data-testid*='ChatbotCard'],[data-testid*='CharacterCard']";

  const state = {
    cacheLoaded: false,
    cacheLoadPromise: null,
    cache: {},
    cacheWriteTimer: null,
    inFlight: new Map(),
    failedAt: new Map(),
    failureReason: new Map(),
    queue: [],
    queued: new Set(),
    active: 0,
    observer: null,
    auth: null,
    authCheckedAt: 0,
    mainBridgeFailures: 0,
    mainBridgeDisabledUntil: 0,
    mainBridgeRoute: "",
    characterAuthRejectedUntil: 0
  };

  function settings() {
    return DS.state?.settings || DS.DEFAULT_SETTINGS || {};
  }

  function enabled() {
    const cfg = settings();
    return !!cfg.enabled && !!cfg.showCardGreetingTokenInfo;
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function estimateTokens(text) {
    const source = cleanText(text);
    if (!source) return null;
    // This is only an estimate. Mixing word pieces with character length is a bit
    // closer than a plain characters/4 guess for short, punctuation-heavy RP.
    const words = source.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) || [];
    const charEstimate = source.length / 4;
    const pieceEstimate = words.reduce((sum, part) => {
      if (/^[\p{L}\p{N}_]+$/u.test(part)) return sum + Math.max(1, part.length / 4.2);
      return sum + 0.55;
    }, 0);
    return Math.max(1, Math.round((charEstimate + pieceEstimate) / 2));
  }

  function chromeGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, result => {
          try { if (chrome.runtime?.lastError) return resolve({}); } catch {}
          resolve(result || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function chromeSet(payload) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(payload, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          try { if (chrome.runtime?.lastError) return resolve(null); } catch {}
          resolve(response || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function resetMainBridgeCircuitIfNeeded() {
    const route = String(location.pathname || "");
    if (state.mainBridgeRoute === route) return;
    state.mainBridgeRoute = route;
    state.mainBridgeFailures = 0;
    state.mainBridgeDisabledUntil = 0;
  }

  function mainBridgeCircuitOpen() {
    resetMainBridgeCircuitIfNeeded();
    return Date.now() < Number(state.mainBridgeDisabledUntil || 0);
  }

  function mainBridgeHasCapturedAuth() {
    return document.documentElement?.getAttribute("data-ds-card-token-main-auth") === "1";
  }

  function noteCharacterAuthRejected() {
    state.auth = null;
    state.authCheckedAt = Date.now();
    state.characterAuthRejectedUntil = Date.now() + 60 * 1000;
    const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    perf.cardTokenAuthCircuitTrips = Number(perf.cardTokenAuthCircuitTrips || 0) + 1;
  }

  function characterAuthCircuitOpen() {
    if (mainBridgeHasCapturedAuth()) {
      state.characterAuthRejectedUntil = 0;
      return false;
    }
    return Date.now() < Number(state.characterAuthRejectedUntil || 0);
  }

  function skipCharacterApi(reason) {
    const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    perf.cardTokenAuthSkips = Number(perf.cardTokenAuthSkips || 0) + 1;
    throw new Error(reason);
  }

  function noteMainBridgeResult(status) {
    resetMainBridgeCircuitIfNeeded();
    const value = String(status || "");
    if (value === "success") {
      state.mainBridgeFailures = 0;
      state.mainBridgeDisabledUntil = 0;
      return;
    }
    if (!["bridge-timeout", "bridge-unavailable", "bridge-dispatch-failure"].includes(value)) return;
    state.mainBridgeFailures += 1;
    if (state.mainBridgeFailures >= MAIN_BRIDGE_FAILURE_LIMIT) {
      state.mainBridgeDisabledUntil = Date.now() + MAIN_BRIDGE_COOLDOWN_MS;
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.cardTokenMainCircuitTrips = Number(perf.cardTokenMainCircuitTrips || 0) + 1;
      perf.cardTokenMainCircuitUntil = state.mainBridgeDisabledUntil;
    }
  }

  function waitForMainBridge(timeoutMs = 1400) {
    if (document.documentElement?.getAttribute("data-ds-card-token-main-bridge") === "2") return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("ds-qol-card-token-bridge-ready-v2", onReady);
        resolve(!!value);
      };
      const onReady = () => finish(true);
      const timer = setTimeout(() => finish(document.documentElement?.getAttribute("data-ds-card-token-main-bridge") === "2"), timeoutMs);
      window.addEventListener("ds-qol-card-token-bridge-ready-v2", onReady, { once: true });
    });
  }

  async function mainWorldCharacterRequest(botId, auth) {
    if (mainBridgeCircuitOpen()) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.cardTokenMainCircuitSkips = Number(perf.cardTokenMainCircuitSkips || 0) + 1;
      throw new Error("main-world character bridge circuit open");
    }
    const ready = await waitForMainBridge();
    if (!ready) {
      noteMainBridgeResult("bridge-unavailable");
      throw new Error("main-world character bridge unavailable");
    }
    const requestId = `dsct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener(MAIN_RESPONSE_EVENT, onResponse);
        resolve(value || null);
      };
      const onResponse = event => {
        if (String(event?.detail?.requestId || "") !== requestId) return;
        finish(event.detail);
      };
      const timer = setTimeout(() => finish({ ok: false, status: "bridge-timeout", elapsedMs: MAIN_BRIDGE_TIMEOUT_MS }), MAIN_BRIDGE_TIMEOUT_MS + 500);
      window.addEventListener(MAIN_RESPONSE_EVENT, onResponse);
      try {
        window.dispatchEvent(new CustomEvent(MAIN_REQUEST_EVENT, {
          detail: {
            requestId,
            botId,
            authToken: auth?.token || "",
            guestUserId: auth?.guest || "",
            authSource: auth?.source || "none"
          }
        }));
      } catch {
        finish({ ok: false, status: "bridge-dispatch-failure" });
      }
    });
    noteMainBridgeResult(response?.ok ? "success" : String(response?.status || "failed"));
    runtimeMessage({
      type: "DS_CARD_TOKEN_BRIDGE_DIAG",
      status: response?.ok ? "success" : String(response?.status || "failed"),
      httpStatus: Number(response?.httpStatus || 0),
      elapsedMs: Number(response?.elapsedMs || 0),
      authProvided: !!response?.authProvided,
      authSource: String(response?.authSource || "none")
    });
    if (!response) throw new Error("main-world character bridge did not respond");
    if (!response.ok) {
      const suffix = response.httpStatus ? ` HTTP ${response.httpStatus}` : "";
      const error = new Error(`main-world character API ${response.status || "failed"}${suffix}`);
      error.httpStatus = Number(response.httpStatus || 0);
      error.authProvided = !!response.authProvided;
      error.authSource = String(response.authSource || "none");
      error.bridgeStatus = String(response.status || "failed");
      throw error;
    }
    state.characterAuthRejectedUntil = 0;
    return response.data;
  }

  async function ensureCache() {
    if (state.cacheLoaded) return;
    if (state.cacheLoadPromise) return state.cacheLoadPromise;

    // Do not mark the cache as loaded until the storage read has actually
    // finished. Several listing refreshes can run very close together on
    // SpicyChat. The old code let later runs continue against an empty cache
    // while the first storage read was still pending; a freshly fetched token
    // result could then be overwritten by that late storage read and the card
    // would visibly fall back to "Token info: loading…".
    state.cacheLoadPromise = (async () => {
      const result = await chromeGet([CACHE_KEY]);
      const raw = result?.[CACHE_KEY];
      const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

      // If anything managed to populate the in-memory cache while storage was
      // loading, keep the newer in-memory values.
      state.cache = { ...stored, ...(state.cache || {}) };
      state.cacheLoaded = true;
    })().finally(() => {
      state.cacheLoadPromise = null;
    });

    return state.cacheLoadPromise;
  }

  function normalizedCacheEntry(raw) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return { greetingTokens: Math.max(0, Math.round(raw)), updatedAt: 0, legacy: true };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const fields = raw.fields && typeof raw.fields === "object" ? raw.fields : {};
    const n = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : null;
    return {
      greetingTokens: n(raw.greetingTokens ?? raw.greeting ?? raw.tokens ?? fields.greetingTokens),
      descriptionTokens: n(raw.descriptionTokens ?? fields.descriptionTokens),
      personalityTokens: n(raw.personalityTokens ?? raw.definitionTokens ?? fields.personalityTokens),
      scenarioTokens: n(raw.scenarioTokens ?? fields.scenarioTokens),
      examplesTokens: n(raw.examplesTokens ?? raw.exampleDialogueTokens ?? fields.examplesTokens),
      combinedTokens: n(raw.combinedTokens ?? raw.totalTokens ?? fields.combinedTokens),
      updatedAt: Number(raw.updatedAt || raw.savedAt || raw.fetchedAt || 0) || 0,
      source: String(raw.source || "cache")
    };
  }

  function scheduleCacheWrite() {
    clearTimeout(state.cacheWriteTimer);
    state.cacheWriteTimer = setTimeout(async () => {
      state.cacheWriteTimer = null;
      const entries = Object.entries(state.cache || {});
      if (entries.length > MAX_CACHE_ENTRIES) {
        entries.sort((a, b) => Number(normalizedCacheEntry(b[1])?.updatedAt || 0) - Number(normalizedCacheEntry(a[1])?.updatedAt || 0));
        state.cache = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
      }
      await chromeSet({ [CACHE_KEY]: state.cache });
    }, 650);
  }

  function botIdFromHref(href) {
    return (String(href || "").match(BOT_LINK_RE)?.[1] || "").toLowerCase();
  }

  function cardBotId(card) {
    if (!(card instanceof Element)) return "";
    for (const anchor of card.querySelectorAll("a[href*='/chat/'],a[href*='/chatbot/']")) {
      const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
      if (id) return id;
    }
    return "";
  }

  function cardFromAnchor(anchor) {
    if (!(anchor instanceof Element)) return null;
    const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
    if (!id) return null;
    let card = anchor.closest(CARD_SELECTOR);
    if (card && cardBotId(card) === id) return card;
    let node = anchor.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (cardBotId(node) !== id) continue;
      if (node.querySelector("img") && node.querySelector("a[aria-label^='chat-with-'],a[href*='/chatbot/']")) card = node;
    }
    return card;
  }

  function listingCards() {
    const out = new Map();
    document.querySelectorAll("a[href*='/chat/'],a[href*='/chatbot/']").forEach(anchor => {
      const id = botIdFromHref(anchor.getAttribute("href") || anchor.href);
      if (!id || out.has(id)) return;
      const card = cardFromAnchor(anchor);
      if (card) out.set(id, card);
    });
    return [...out.values()];
  }

  function descriptionFromCard(card) {
    if (!(card instanceof Element)) return "";
    const known = card.querySelector("[data-ds-description-signature]")?.getAttribute("data-ds-description-signature");
    if (known) return cleanText(known);
    const title = card.querySelector("a[aria-label^='chat-with-'][title]")?.getAttribute("title") || "";
    const candidates = [...card.querySelectorAll("p")]
      .map(node => cleanText(node.textContent))
      .filter(text => text && text !== title && !/^@/.test(text) && !/^\d+(?:\.\d+)?[kmb]?$/i.test(text));
    return candidates.find(text => text.length >= 8) || "";
  }

  function archiveMetaFromCard(card, botId) {
    if (!(card instanceof Element)) return { profileUrl: `https://spicychat.ai/chatbot/${botId}` };
    const chat = card.querySelector("a[aria-label^='chat-with-'],a[href*='/chat/']");
    const profile = card.querySelector("a[aria-label='character-info'],a[href*='/chatbot/']");
    const name = cleanText(chat?.getAttribute("title") || chat?.getAttribute("aria-label")?.replace(/^chat-with-/i, "") || "");
    const image = String(card.querySelector("img")?.getAttribute("src") || "").trim();
    const creator = [...card.querySelectorAll("p,span,a")].map(node => cleanText(node.textContent)).find(text => /^@[^\s]+/.test(text)) || "";
    return {
      name, creator, image,
      profileUrl: String(profile?.getAttribute("href") || `https://spicychat.ai/chatbot/${botId}`),
      source: "Card token data"
    };
  }

  function desiredFields() {
    const cfg = settings();
    return {
      greeting: cfg.cardTokenShowGreeting !== false,
      personality: !!cfg.cardTokenShowPersonality,
      scenario: !!cfg.cardTokenShowScenario,
      examples: !!cfg.cardTokenShowExamples
    };
  }

  function cacheHasDesired(entry, wanted) {
    if (!entry) return false;
    if (wanted.greeting && entry.greetingTokens == null) return false;
    if (wanted.personality && entry.personalityTokens == null) return false;
    if (wanted.scenario && entry.scenarioTokens == null) return false;
    if (wanted.examples && entry.examplesTokens == null) return false;
    if (entry.legacy && (wanted.personality || wanted.scenario || wanted.examples)) return false;
    return true;
  }

  function freshEnough(entry) {
    if (!entry) return false;
    if (entry.legacy) return true;
    return entry.updatedAt > 0 && Date.now() - entry.updatedAt < CACHE_TTL_MS;
  }

  function decodeJsonString(raw) {
    try { return JSON.parse(`"${raw}"`); } catch { return String(raw || "").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
  }

  function rawJsonField(html, keys) {
    for (const key of keys) {
      const safe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`"${safe}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i");
      const match = html.match(re);
      if (match?.[1]) {
        const value = cleanText(decodeJsonString(match[1]));
        if (value) return value;
      }
    }
    return "";
  }

  function deepFindCharacterFields(root, botId) {
    const seen = new Set();
    const stack = [root];
    let best = null;
    let bestScore = -1;
    const get = (obj, keys) => {
      for (const key of keys) {
        const value = obj?.[key];
        if (typeof value === "string" && cleanText(value)) return cleanText(value);
      }
      return "";
    };
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object") stack.push(child);
        continue;
      }
      const id = String(value.id || value.uuid || value.character_id || value.characterId || value.chatbot_id || value.chatbotId || "").toLowerCase();
      const fields = {
        greeting: get(value, ["greeting", "first_message", "firstMessage", "initial_message", "initialMessage"]),
        description: get(value, ["description", "title", "short_description", "shortDescription"]),
        personality: get(value, ["personality", "definition", "persona", "background", "system_prompt", "systemPrompt"]),
        scenario: get(value, ["scenario", "context"]),
        examples: get(value, ["example_dialogue", "exampleDialogue", "example_dialogues", "exampleDialogues", "mes_example"])
      };
      const score = Object.values(fields).filter(Boolean).length * 2 + (id && id === botId ? 20 : 0) + (fields.greeting ? 4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = fields;
      }
      for (const child of Object.values(value)) if (child && typeof child === "object") stack.push(child);
    }
    return bestScore >= 4 ? best : null;
  }

  function extractFromScripts(doc, botId) {
    let best = null;
    for (const script of doc.querySelectorAll("script")) {
      const text = script.textContent || "";
      if (!text || text.length > MAX_PROFILE_BYTES) continue;
      if (!/(greeting|first_message|firstMessage|personality|scenario)/i.test(text)) continue;
      try {
        const parsed = JSON.parse(text);
        const fields = deepFindCharacterFields(parsed, botId);
        if (fields?.greeting) return fields;
        if (fields) best = fields;
      } catch {}
    }
    return best;
  }

  function sectionText(doc, labels) {
    const normalizedLabels = labels.map(x => x.toLowerCase());
    const nodes = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6,label,p,span,div")];
    for (const label of nodes) {
      const own = cleanText(label.textContent).toLowerCase();
      if (!normalizedLabels.includes(own)) continue;
      const candidates = [];
      if (label.nextElementSibling) candidates.push(label.nextElementSibling);
      let parent = label.parentElement;
      for (let depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
        for (const child of parent.children || []) if (child !== label && !child.contains(label)) candidates.push(child);
      }
      for (const node of candidates) {
        const text = cleanText(node.textContent);
        if (!text || normalizedLabels.includes(text.toLowerCase())) continue;
        if (/^(show more|show less|copy|edit|suggest tag)$/i.test(text)) continue;
        if (text.length >= 2 && text.length <= 120000) return text;
      }
    }
    return "";
  }

  function looksLikeJwt(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
  }

  function jwtExpiryMs(token) {
    try {
      const body = String(token || "").split(".")[1] || "";
      const padded = body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4);
      const payload = JSON.parse(atob(padded));
      return Number(payload?.exp || 0) * 1000;
    } catch {
      return 0;
    }
  }

  function findFirstJwtInObject(value, depth = 0) {
    if (depth > 7 || value == null) return "";
    if (typeof value === "string") return looksLikeJwt(value) ? value.trim() : "";
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = findFirstJwtInObject(item, depth + 1);
        if (hit) return hit;
      }
      return "";
    }
    if (typeof value === "object") {
      for (const item of Object.values(value)) {
        const hit = findFirstJwtInObject(item, depth + 1);
        if (hit) return hit;
      }
    }
    return "";
  }

  function scanStorageForJwt(store) {
    const hits = [];
    try {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (!key) continue;
        let raw = "";
        try { raw = store.getItem(key) || ""; } catch { continue; }
        if (!raw) continue;
        if (looksLikeJwt(raw)) hits.push(raw.trim());
        if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
          try {
            const hit = findFirstJwtInObject(JSON.parse(raw));
            if (hit) hits.push(hit);
          } catch {}
        }
      }
    } catch {}
    return hits;
  }

  async function discoverFirebaseIndexedDbToken() {
    if (!globalThis.indexedDB) return "";
    const openDb = name => new Promise(resolve => {
      let settled = false;
      try {
        const req = indexedDB.open(name);
        const finish = value => { if (!settled) { settled = true; resolve(value || null); } };
        const timer = setTimeout(() => finish(null), 1400);
        req.onsuccess = () => { clearTimeout(timer); finish(req.result || null); };
        req.onerror = () => { clearTimeout(timer); finish(null); };
        req.onblocked = () => { clearTimeout(timer); finish(null); };
      } catch { resolve(null); }
    });
    const db = await openDb("firebaseLocalStorageDb");
    if (!db) return "";
    try {
      const storeName = db.objectStoreNames.contains("firebaseLocalStorage")
        ? "firebaseLocalStorage"
        : [...db.objectStoreNames].find(name => /firebase/i.test(name));
      if (!storeName) return "";
      const values = await new Promise(resolve => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const store = tx.objectStore(storeName);
          if (typeof store.getAll === "function") {
            const req = store.getAll();
            req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
            req.onerror = () => resolve([]);
          } else {
            const out = [];
            const req = store.openCursor();
            req.onsuccess = () => {
              const cursor = req.result;
              if (!cursor) return resolve(out);
              out.push(cursor.value);
              cursor.continue();
            };
            req.onerror = () => resolve(out);
          }
        } catch { resolve([]); }
      });
      const tokens = values.map(value => findFirstJwtInObject(value)).filter(Boolean).filter(token => {
        const expiry = jwtExpiryMs(token);
        return !expiry || expiry > Date.now() + 5000;
      });
      return tokens.sort((a, b) => b.length - a.length)[0] || "";
    } finally {
      try { db.close(); } catch {}
    }
  }

  function discoverGuestUserId() {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const keys = ["guest_userid", "guestUserId", "x-guest-userid", "nd_guest_userid", "spicychat_guest_userid"];
    for (const key of keys) {
      for (const store of [localStorage, sessionStorage]) {
        try {
          const value = String(store.getItem(key) || "").trim();
          if (uuid.test(value)) return value;
        } catch {}
      }
    }
    return "";
  }

  async function discoverSpicychatAuth(force = false) {
    if (!force && state.auth && Date.now() - state.authCheckedAt < 30000) return state.auth;
    state.authCheckedAt = Date.now();
    const storageTokens = [...scanStorageForJwt(localStorage), ...scanStorageForJwt(sessionStorage)]
      .filter(Boolean)
      .filter((token, index, all) => all.indexOf(token) === index)
      .filter(token => {
        const expiry = jwtExpiryMs(token);
        return !expiry || expiry > Date.now() + 5000;
      })
      .sort((a, b) => b.length - a.length);
    let token = storageTokens[0] || "";
    let source = token ? "storage" : "none";
    if (!token) {
      token = await discoverFirebaseIndexedDbToken();
      if (token) source = "indexeddb";
    }
    state.auth = { token, guest: discoverGuestUserId(), source };
    return state.auth;
  }

  function definitionVisibleFromCard(card) {
    if (!(card instanceof Element)) return false;
    const profile = card.querySelector("a[aria-label='character-info'],a[href*='/chatbot/']");
    if (!profile) return false;
    const tooltip = profile.closest?.("[data-tooltip-content]")?.getAttribute?.("data-tooltip-content") || "";
    if (/definition visible/i.test(tooltip)) return true;
    const marker = profile.querySelector?.("[class*='bg-purple']");
    return !!marker;
  }

  function desiredFieldsForCard(card) {
    const wanted = desiredFields();
    // SpicyChat marks cards whose full definition is publicly visible. If that
    // marker is absent, Greeting is the only field we should expect to resolve.
    // This avoids showing fake/unavailable Personality/Scenario/Examples chips
    // and stops repeatedly retrying fields the listing does not expose.
    if (!definitionVisibleFromCard(card)) {
      return {
        greeting: wanted.greeting,
        personality: false,
        scenario: false,
        examples: false
      };
    }
    return wanted;
  }

  function fieldsFromApiCharacter(sc, allowDefinition = false) {
    const value = sc && typeof sc === "object" ? sc : {};
    return {
      greeting: cleanText(value.greeting || value.first_message || value.firstMessage || ""),
      description: cleanText(value.title || value.description || value.short_description || value.shortDescription || ""),
      // Personality/scenario/examples are intentionally ignored unless the
      // listing itself shows SpicyChat's purple expanded-profile indicator.
      // This keeps the token helper from surfacing definition fields the
      // creator chose not to expose publicly.
      personality: allowDefinition ? cleanText(value.persona || value.personality || value.definition || "") : "",
      scenario: allowDefinition ? cleanText(value.scenario || "") : "",
      examples: allowDefinition ? cleanText(value.dialogue || value.example_dialogue || value.exampleDialogue || value.example_dialogues || value.exampleDialogues || "") : ""
    };
  }

  function characterPayload(data) {
    if (!data || typeof data !== "object") return null;
    const direct = data?.data && typeof data.data === "object" ? data.data : data;
    if (direct?.greeting || direct?.persona || direct?.name || direct?.id) return direct;
    // Be defensive about wrapper changes (for example { data: { character: ... } }).
    const seen = new Set();
    const stack = [direct];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      if (!Array.isArray(value) && (value.greeting || value.first_message || value.firstMessage) && (value.id || value.name || value.persona || value.title)) return value;
      for (const child of Object.values(value)) if (child && typeof child === "object") stack.push(child);
    }
    return direct;
  }

  async function fetchProfileApi(botId, card, forceAuth = false) {
    const auth = await discoverSpicychatAuth(forceAuth);
    let mainError = null;

    // A character request without either a discovered token or auth already
    // captured from SpicyChat's own MAIN-world traffic predictably returns 401
    // on current SpicyChat. Go straight to the profile-HTML fallback instead of
    // generating a failed API request for every visible card.
    if (characterAuthCircuitOpen()) {
      skipCharacterApi("character API auth cooldown active; using profile fallback");
    }
    if (!auth?.token && !mainBridgeHasCapturedAuth()) {
      skipCharacterApi("character API auth unavailable; using profile fallback");
    }

    const mainNet = DS.diagNetworkStart?.("card-token-info", "GET", `https://prod.nd-api.com/v2/characters/${botId}`, { transport: "main-world" });
    try {
      const data = await mainWorldCharacterRequest(botId, auth);
      const sc = characterPayload(data);
      if (!sc || typeof sc !== "object") throw new Error("main-world character API returned no character data");
      const fields = fieldsFromApiCharacter(sc, definitionVisibleFromCard(card));
      if (!fields.greeting) throw new Error("main-world character API returned no greeting");
      DS.diagNetworkEnd?.(mainNet, { status: 200, ok: true, outcome: "main-world-success" });
      return fields;
    } catch (error) {
      DS.diagNetworkEnd?.(mainNet, { status: Number(error?.httpStatus || 0), ok: false, outcome: error?.name === "AbortError" ? "timeout" : "main-world-failed" });
      mainError = error;
      if (Number(error?.httpStatus || 0) === 401) {
        noteCharacterAuthRejected();
        throw error;
      }
    }

    // The background worker cannot reuse a MAIN-world-only captured token. If
    // no explicit token was found, another fetch would just repeat the failure.
    if (!auth?.token) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.cardTokenBackgroundAuthSkips = Number(perf.cardTokenBackgroundAuthSkips || 0) + 1;
      throw new Error(`${String(mainError?.message || mainError || "main-world API unavailable")}; background fallback skipped because no reusable auth was available`);
    }

    const backgroundNet = DS.diagNetworkStart?.("card-token-info", "GET", `https://prod.nd-api.com/v2/characters/${botId}`, { transport: "background" });
    const response = await runtimeMessage({
      type: "DS_CARD_TOKEN_FETCH",
      botId,
      authToken: auth.token,
      guestUserId: auth?.guest || "",
      authSource: auth?.source || "none"
    });
    DS.diagNetworkEnd?.(backgroundNet, { status: Number(response?.httpStatus || 0), ok: response?.ok === true, outcome: String(response?.status || (response?.ok ? "success" : "no-response")) });
    if (!response) throw new Error(`${String(mainError?.message || mainError || "main-world API unavailable")}; background worker did not respond`);
    if (!response.ok) {
      if (Number(response.httpStatus || 0) === 401) noteCharacterAuthRejected();
      const suffix = response.httpStatus ? ` HTTP ${response.httpStatus}` : "";
      throw new Error(`${String(mainError?.message || mainError || "main-world API unavailable")}; background character API ${response.status || "failed"}${suffix}`);
    }
    state.characterAuthRejectedUntil = 0;
    const sc = characterPayload(response.data);
    if (!sc || typeof sc !== "object") throw new Error("character API returned no character data");
    const fields = fieldsFromApiCharacter(sc, definitionVisibleFromCard(card));
    if (!fields.greeting) throw new Error("character API returned no greeting");
    return fields;
  }

  // Shared public-data helper for Local Bot Archive. This deliberately uses
  // the same already-working character request path as token estimates, but
  // with no card definition marker so only universally accessible fields
  // (notably Greeting + public description/title) are returned.
  DS.fetchPublicCharacterFields = async function fetchPublicCharacterFields(botId) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id) return null;
    // Public bot backups may need the Greeting even when token chips are off.
    // Only start the page bridge when this request actually needs it.
    try { window.DSCardTokenBridgeLoader?.ensure?.(); } catch {}
    return fetchProfileApi(id, null);
  };

  async function fetchAuditCharacter(botId, forceAuth = false) {
    const auth = await discoverSpicychatAuth(forceAuth);
    let mainError = null;
    if (characterAuthCircuitOpen()) skipCharacterApi("character API auth cooldown active");
    if (!auth?.token && !mainBridgeHasCapturedAuth()) skipCharacterApi("character API auth unavailable");
    const mainNet = DS.diagNetworkStart?.("creation-audit", "GET", `https://prod.nd-api.com/v2/characters/${botId}`, { transport: "main-world" });
    try {
      const data = await mainWorldCharacterRequest(botId, auth);
      const sc = characterPayload(data);
      if (sc && typeof sc === "object") {
        DS.diagNetworkEnd?.(mainNet, { status: 200, ok: true, outcome: "main-world-success" });
        return sc;
      }
      throw new Error("character data unavailable");
    } catch (error) {
      DS.diagNetworkEnd?.(mainNet, { status: Number(error?.httpStatus || 0), ok: false, outcome: error?.name === "AbortError" ? "timeout" : "main-world-failed" });
      mainError = error;
      if (Number(error?.httpStatus || 0) === 401) {
        noteCharacterAuthRejected();
        throw error;
      }
    }

    if (!auth?.token) throw new Error(String(mainError?.message || mainError || "character data unavailable"));
    const backgroundNet = DS.diagNetworkStart?.("creation-audit", "GET", `https://prod.nd-api.com/v2/characters/${botId}`, { transport: "background" });
    const response = await runtimeMessage({
      type: "DS_CARD_TOKEN_FETCH",
      botId,
      authToken: auth.token,
      guestUserId: auth?.guest || "",
      authSource: auth?.source || "none"
    });
    DS.diagNetworkEnd?.(backgroundNet, { status: Number(response?.httpStatus || 0), ok: response?.ok === true, outcome: String(response?.status || (response?.ok ? "success" : "no-response")) });
    if (!response?.ok) {
      if (Number(response?.httpStatus || 0) === 401) noteCharacterAuthRejected();
      throw new Error(String(mainError?.message || mainError || response?.status || "character data unavailable"));
    }
    state.characterAuthRejectedUntil = 0;
    const sc = characterPayload(response.data);
    if (!sc || typeof sc !== "object") throw new Error("character data unavailable");
    return sc;
  }

  DS.getCardProfileFieldInfo = async function getCardProfileFieldInfo(botId, options = {}) {
    const id = String(botId || "").trim().toLowerCase();
    if (!id) return null;

    try { window.DSCardTokenBridgeLoader?.ensure?.(); } catch {}

    let sc = null;
    let fields = null;
    let apiError = null;
    let htmlFields = null;
    let htmlError = null;
    let ownerFields = null;
    let ownerError = null;
    let localOwnerFields = null;

    try {
      sc = await fetchAuditCharacter(id, !!options.force);
      const direct = fieldsFromApiCharacter(sc, true);
      // SpicyChat has changed the character-response wrapper before. Reuse the
      // defensive deep extractor as a cheap second chance before doing another
      // network request. Non-empty direct fields always win.
      const nested = deepFindCharacterFields(sc, id) || null;
      fields = mergeAuditFields(direct, nested);
    } catch (error) {
      apiError = error;
    }

    // My Creations can have stronger local creator data than the public API.
    // Use only non-empty locally captured/editor-backed fields as positive evidence;
    // an empty/stale local field is never treated as proof that something is missing.
    if (options.ownerEditor && typeof DS.getCachedOwnerAuditFields === "function") {
      try {
        localOwnerFields = await DS.getCachedOwnerAuditFields(id);
        fields = mergeAuditFields(fields, localOwnerFields);
      } catch {}
    }

    const apiTags = characterTags(sc);
    const needsHtml = auditFieldsNeedFallback(fields, !!options.requireTags, apiTags);
    if (needsHtml) {
      try {
        htmlFields = await fetchProfileHtml(id);
        fields = mergeAuditFields(fields, htmlFields);
      } catch (error) {
        htmlError = error;
      }
    }

    // Creation Audit runs on the user's own My Creations cards. The public
    // character endpoint can legitimately omit/redact creator-only fields (and
    // sometimes leaves the corresponding keys present but empty). When asked,
    // use the normal signed-in editor page as the strongest source of truth.
    // Its SSR markup contains the actual form controls without publishing or
    // changing anything. If access is denied we simply fall back to "unknown".
    const afterPublicTags = apiTags.length ? apiTags : (Array.isArray(htmlFields?.tags) && htmlFields.tags.length ? htmlFields.tags : []);
    const needsOwner = !!options.ownerEditor && auditFieldsNeedFallback(fields, !!options.requireTags, afterPublicTags);
    if (needsOwner) {
      try {
        ownerFields = await fetchOwnerEditorHtml(id);
        fields = mergeAuditFields(fields, ownerFields);
      } catch (error) {
        ownerError = error;
      }
    }

    if (!fields) {
      const message = [apiError?.message, htmlError?.message, ownerError?.message].filter(Boolean).join("; ");
      throw new Error(message || "profile check failed");
    }

    const profileTagsList = Array.isArray(htmlFields?.tags) ? htmlFields.tags : [];
    const ownerTags = Array.isArray(ownerFields?.tags) ? ownerFields.tags : [];
    const localTags = Array.isArray(localOwnerFields?.tags) ? localOwnerFields.tags : [];
    let tags = null;
    if (ownerFields?.verified?.tags) tags = ownerTags;
    else if (apiTags.length) tags = apiTags;
    else if (profileTagsList.length) tags = profileTagsList;
    else if (localTags.length) tags = localTags;

    const verifiedFields = {};
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      // A non-empty value proves availability. An empty value is only called
      // missing when the owner editor actually rendered that field, because
      // public/API responses may redact creator-only data while retaining an
      // empty property. This prevents false "Missing core" results.
      verifiedFields[key] = !!cleanText(fields?.[key] || "") || ownerFields?.verified?.[key] === true || localOwnerFields?.verified?.[key] === true;
    }
    const incomplete = Object.values(verifiedFields).some(value => !value) || (options.requireTags && !Array.isArray(tags));
    const sources = [];
    if (sc) sources.push("character-api");
    if (htmlFields) sources.push("profile-html");
    if (ownerFields) sources.push("owner-editor-html");
    if (localOwnerFields) sources.push("owner-local-cache");
    return {
      fields: auditFieldInfo(fields, verifiedFields),
      tags,
      incomplete,
      auditHints: fieldAuditHints(fields, sc),
      source: sources.join("+") || "unknown"
    };
  };

  function tagNames(value) {
    const out = [];
    const add = item => {
      if (typeof item === "string") {
        const text = cleanText(item);
        if (text && text.length <= 80 && !/^[0-9a-f-]{20,}$/i.test(text)) out.push(text);
        return;
      }
      if (!item || typeof item !== "object") return;
      add(item.name || item.title || item.label || item.tag || "");
    };
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "string") value.split(/[,|]/).forEach(add);
    return [...new Set(out.map(text => text.trim()).filter(Boolean))];
  }

  function characterTags(sc) {
    if (!sc || typeof sc !== "object") return [];
    const candidates = [
      sc.tags,
      sc.tag_list,
      sc.tagList,
      sc.character_tags,
      sc.characterTags,
      sc.categories
    ];
    for (const value of candidates) {
      const tags = tagNames(value);
      if (tags.length) return tags;
    }
    return [];
  }

  function profileTags(doc) {
    return [...new Set([...doc.querySelectorAll('[data-testid^="TagSuggestionItem-"], a[aria-label^="tag-"]')]
      .map(node => cleanText(node.textContent || ""))
      .filter(Boolean))];
  }

  function fieldAuditHints(fields, sc) {
    const hints = [];
    const fieldTexts = {
      greeting: cleanText(fields?.greeting || ""),
      description: cleanText(fields?.description || ""),
      personality: cleanText(fields?.personality || ""),
      scenario: cleanText(fields?.scenario || ""),
      examples: cleanText(fields?.examples || "")
    };
    const text = Object.values(fieldTexts).filter(Boolean).join("\n");
    const withoutGoodPlaceholders = text.replace(/\{\{\s*(?:char|user)\s*\}\}/gi, "");
    if (/\{\s*(?:char|user)\s*\}/i.test(withoutGoodPlaceholders)) {
      hints.push("Found {char} or {user}; SpicyChat placeholders normally use {{char}} and {{user}}");
    }

    const greeting = fieldTexts.greeting;
    const personality = fieldTexts.personality;
    const scenario = fieldTexts.scenario;
    const examples = fieldTexts.examples;
    const description = fieldTexts.description;

    if (greeting) {
      const userActionPatterns = [
        /\{\{\s*user\s*\}\}\s+(?:sit|sits|sat|stand|stands|stood|walk|walks|walked|enter|enters|entered|look|looks|looked|nod|nods|nodded|smile|smiles|smiled|move|moves|moved|take|takes|took|feel|feels|felt|think|thinks|thought|decide|decides|decided)\b/gi,
        /\byou\s+(?:sit|stand|walk|enter|nod|smile|move|take a seat|feel|think|decide)\b/gi
      ];
      const assumedActions = userActionPatterns.reduce((n, re) => n + (greeting.match(re)?.length || 0), 0);
      if (assumedActions) hints.push(`Greeting appears to pre-write ${assumedActions} user action${assumedActions === 1 ? "" : "s"}; leave the user's actions open where possible`);

      const common = new Set(["The","This","That","There","When","While","After","Before","Your","You","Come","Now","Then","With","From","Into","About","Most","Some","None","What","Who","Why","How","One","Two","Three","Iron","Gold","Bronze","Rank"]);
      const proper = [...new Set((greeting.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter(word => !common.has(word)))];
      const scenarioOnly = proper.filter(word => new RegExp(`\\b${word}\\b`).test(scenario) && !new RegExp(`\\b${word}\\b`).test(`${description}\n${personality}`));
      if (scenarioOnly.length >= 2) hints.push(`Greeting uses named context mainly explained in Scenario (${scenarioOnly.slice(0, 4).join(", ")})`);
    }

    if (examples) {
      if (/\b(?:core\s+personality\s+rules?|personality\s+rules?|behavior\s+rules?|character\s+rules?|formula|scenario\s*:|worldbuilding|world\s+lore|history\s*:)/i.test(examples)) {
        hints.push("Example Dialogue appears to contain rules or worldbuilding; consider moving static instructions/lore to Personality, Scenario, or a Lorebook");
      }
      if ((examples.match(/\b(?:must|never|always|should)\b/gi)?.length || 0) >= 5) {
        hints.push("Example Dialogue contains many rule-like instructions; examples work best when they mainly demonstrate voice and interaction style");
      }
    }

    if (/\b(?:intelligent|brilliant|genius)\b/i.test(personality) && !/\b(?:research|strateg|tactic|academic|scholar|engineer|medical|medicine|scient|magic|investigat|analysis|analytical|technical|program|law|combat|planning|teacher|mentor)\w*/i.test(personality)) {
      hints.push("Intelligence is described broadly without a concrete domain or behavior; defining what the character is good at can reduce generic know-it-all behavior");
    }

    const compareFields = Object.entries(fieldTexts).filter(([, value]) => value.length >= 120);
    const normalizedWords = value => value.toLowerCase().replace(/[^a-z0-9{}]+/g, " ").trim().split(/\s+/).filter(Boolean);
    let duplicateFieldPair = "";
    outer: for (let i = 0; i < compareFields.length; i++) {
      const [nameA, valueA] = compareFields[i];
      const a = normalizedWords(valueA);
      if (a.length < 12) continue;
      const shingles = new Set();
      for (let x = 0; x <= a.length - 12; x++) shingles.add(a.slice(x, x + 12).join(" "));
      for (let j = i + 1; j < compareFields.length; j++) {
        const [nameB, valueB] = compareFields[j];
        const b = normalizedWords(valueB);
        for (let y = 0; y <= b.length - 12; y++) {
          if (shingles.has(b.slice(y, y + 12).join(" "))) {
            duplicateFieldPair = `${nameA} and ${nameB}`;
            break outer;
          }
        }
      }
    }
    if (duplicateFieldPair) hints.push(`Repeated long text detected across ${duplicateFieldPair}; duplicate static lore can waste context`);

    const entries = sc?.lorebook?.entries || sc?.lorebook_entries || sc?.lorebookEntries;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const name = cleanText(entry?.name || entry?.title || "Lorebook entry");
        const rawKeywords = entry?.keywords ?? entry?.keys ?? entry?.key;
        const keywords = Array.isArray(rawKeywords)
          ? rawKeywords.map(value => cleanText(typeof value === "string" ? value : value?.name || value?.keyword || "")).filter(Boolean)
          : (typeof rawKeywords === "string" ? rawKeywords.split(",").map(cleanText).filter(Boolean) : []);
        if (!keywords.length) continue;
        const folded = keywords.map(value => value.toLowerCase());
        if (new Set(folded).size !== folded.length) hints.push(`${name}: duplicate Lorebook keywords`);
        if (keywords.length > 12) hints.push(`${name}: ${keywords.length} Lorebook keywords`);
        if (keywords.some(value => value.length < 2)) hints.push(`${name}: very short Lorebook keyword`);
      }
    }
    return [...new Set(hints)];
  }

  function auditFieldInfo(fields, verified = {}) {
    const result = {};
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      const text = cleanText(fields?.[key] || "");
      result[key] = {
        available: !!text,
        verified: !!text || verified?.[key] === true,
        chars: text.length,
        tokens: estimateTokens(text) || 0
      };
    }
    return result;
  }

  function editorControlValue(holder, selectors = []) {
    if (!(holder instanceof Element)) return "";
    for (const selector of selectors) {
      const control = holder.querySelector(selector);
      if (!control) continue;
      const value = "value" in control ? control.value : control.textContent;
      return cleanText(value || "");
    }
    const control = holder.querySelector("textarea,input[type='text'],input:not([type]),select");
    return cleanText(control ? (("value" in control ? control.value : control.textContent) || "") : "");
  }

  function parseOwnerEditor(html, botId = "") {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const pageText = cleanText(doc.body?.textContent || "").toLowerCase();
    const scripted = extractFromScripts(
      doc,
      String(botId || "").trim().toLowerCase()
    ) || {};
    if (/not allowed to access this page|do not have permission|access denied/.test(pageText)) {
      throw new Error("owner editor access denied");
    }

    const holder = names => {
      for (const name of names) {
        const node = doc.querySelector(`[data-field-name="${name}"]`);
        if (node) return node;
      }
      return null;
    };
    const greetingHolder = holder(["greeting", "first_message", "firstMessage"]);
    const descriptionHolder = holder(["title", "description", "short_description"]);
    const personalityHolder = holder(["persona", "personality", "definition"]);
    const scenarioHolder = holder(["scenario", "context"]);
    const examplesHolder = holder(["dialogue", "example_dialogue", "exampleDialogues"]);
    const tagsHolder = holder(["tags"]);

    const direct = (selectors = []) => {
      for (const selector of selectors) {
        const control = doc.querySelector(selector);
        if (!control) continue;
        return cleanText((("value" in control ? control.value : control.textContent) || ""));
      }
      return "";
    };

    const controlFields = {
      greeting: greetingHolder ? editorControlValue(greetingHolder, ["textarea[name='greeting']", "textarea", "input[name='greeting']"]) : direct(["textarea[name='greeting']", "textarea[name='first_message']"]),
      // SpicyChat currently calls the short public description "Title" in the
      // editor, which is the same field the existing audit/API path labels as
      // Description.
      description: descriptionHolder ? editorControlValue(descriptionHolder, ["textarea[name='title']", "input[name='title']", "textarea[name='description']", "input[name='description']"]) : direct(["textarea[name='title']", "input[name='title']", "textarea[name='description']", "input[name='description']"]),
      personality: personalityHolder ? editorControlValue(personalityHolder, ["textarea[name='persona']", "textarea[name='personality']", "textarea[name='definition']", "textarea"]) : direct(["textarea[name='persona']", "textarea[name='personality']", "textarea[name='definition']"]),
      scenario: scenarioHolder ? editorControlValue(scenarioHolder, ["textarea[name='scenario']", "textarea"]) : direct(["textarea[name='scenario']"]),
      examples: examplesHolder ? editorControlValue(examplesHolder, ["textarea[name='dialogue']", "textarea[name='example_dialogue']", "textarea[name='exampleDialogues']", "textarea"]) : direct(["textarea[name='dialogue']", "textarea[name='example_dialogue']", "textarea[name='exampleDialogues']"])
    };

    // The owner editor can return blank SSR controls before React hydrates
    // their real values. Embedded page state is useful positive evidence.
    const fields = {
      greeting: cleanText(controlFields.greeting || scripted.greeting || ""),
      description: cleanText(controlFields.description || scripted.description || ""),
      personality: cleanText(controlFields.personality || scripted.personality || ""),
      scenario: cleanText(controlFields.scenario || scripted.scenario || ""),
      examples: cleanText(controlFields.examples || scripted.examples || "")
    };

    const tags = [];
    if (tagsHolder) {
      for (const node of tagsHolder.querySelectorAll("button span, [role='button'] span")) {
        const text = cleanText(node.textContent || "");
        if (!text || text.length > 80 || /^(tags?|add|remove|search)$/i.test(text)) continue;
        tags.push(text);
      }
    }

    return {
      ...fields,
      tags: [...new Set(tags)],
      verified: {
        // Non-empty data is positive evidence. A blank SSR control is unknown,
        // not Missing. Explicit creator-cleared blanks come from trusted cache.
        greeting: !!fields.greeting,
        description: !!fields.description,
        personality: !!fields.personality,
        scenario: !!fields.scenario,
        examples: !!fields.examples,
        tags: tags.length > 0
      }
    };
  }

  async function fetchOwnerEditorHtml(botId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const network = DS.diagNetworkStart?.("creation-audit", "GET", `/chatbot/edit/${encodeURIComponent(botId)}`, { transport: "page-html" });
    let networkEnded = false;
    try {
      const response = await fetch(`/chatbot/edit/${encodeURIComponent(botId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal
      });
      DS.diagNetworkEnd?.(network, { status: response.status, ok: response.ok, outcome: response.ok ? "success" : "http" });
      networkEnded = true;
      if (!response.ok) throw new Error(`owner editor HTTP ${response.status}`);
      const html = await response.text();
      if (!html || html.length > MAX_PROFILE_BYTES) throw new Error("owner editor HTML unavailable or too large");
      return parseOwnerEditor(html, botId);
    } catch (error) {
      if (!networkEnded) DS.diagNetworkEnd?.(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-failed" });
      if (error?.name === "AbortError") throw new Error("owner editor HTML timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function mergeAuditFields(primary, fallback) {
    const a = primary && typeof primary === "object" ? primary : {};
    const b = fallback && typeof fallback === "object" ? fallback : {};
    const out = {};
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) {
      out[key] = cleanText(a[key] || b[key] || "");
    }
    if (Array.isArray(a.tags) && a.tags.length) out.tags = a.tags;
    else if (Array.isArray(b.tags)) out.tags = b.tags;
    return out;
  }

  function auditFieldsNeedFallback(fields, requireTags = false, tags = []) {
    if (!fields || typeof fields !== "object") return true;
    const missingField = ["greeting", "description", "personality", "scenario", "examples"]
      .some(key => !cleanText(fields[key] || ""));
    return missingField || (requireTags && !(Array.isArray(tags) && tags.length));
  }

  function parseProfile(html, botId) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const scripted = extractFromScripts(doc, botId) || {};
    const raw = keyList => rawJsonField(html, keyList);
    const fields = {
      greeting: scripted.greeting || raw(["greeting", "first_message", "firstMessage", "initial_message", "initialMessage"]) || sectionText(doc, ["Greeting"]),
      description: scripted.description || raw(["description", "short_description", "shortDescription"]) || sectionText(doc, ["Description"]),
      personality: scripted.personality || raw(["personality", "definition", "background", "system_prompt", "systemPrompt"]) || sectionText(doc, ["Personality", "Personality / definition", "Background/Personality"]),
      scenario: scripted.scenario || raw(["scenario", "context"]) || sectionText(doc, ["Scenario"]),
      examples: scripted.examples || raw(["example_dialogue", "exampleDialogue", "example_dialogues", "exampleDialogues", "mes_example"]) || sectionText(doc, ["Example Dialogue", "Example dialogue", "Examples"]),
      tags: profileTags(doc)
    };
    for (const key of ["greeting", "description", "personality", "scenario", "examples"]) fields[key] = cleanText(fields[key]);
    return fields;
  }

  async function fetchProfileHtml(botId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const network = DS.diagNetworkStart?.("card-token-info", "GET", `/chatbot/${encodeURIComponent(botId)}`, { transport: "profile-html" });
    let networkEnded = false;
    try {
      const response = await fetch(`/chatbot/${encodeURIComponent(botId)}`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "text/html,application/xhtml+xml" },
        signal: controller.signal
      });
      DS.diagNetworkEnd?.(network, { status: response.status, ok: response.ok, outcome: response.ok ? "success" : "http" });
      networkEnded = true;
      if (!response.ok) throw new Error(`profile HTTP ${response.status}`);
      const html = await response.text();
      if (!html || html.length > MAX_PROFILE_BYTES) throw new Error("profile HTML unavailable or too large");
      return parseProfile(html, botId);
    } catch (error) {
      if (!networkEnded) DS.diagNetworkEnd?.(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-failed" });
      if (error?.name === "AbortError") throw new Error("profile HTML timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchProfile(botId, card) {
    const allowDefinition = definitionVisibleFromCard(card);
    const limitToVisibleFields = fields => {
      if (!fields || allowDefinition) return fields;
      return { ...fields, personality: "", scenario: "", examples: "" };
    };
    let apiError = null;
    try {
      return limitToVisibleFields(await fetchProfileApi(botId, card));
    } catch (error) {
      apiError = error;
    }
    try {
      return limitToVisibleFields(await fetchProfileHtml(botId));
    } catch (htmlError) {
      const a = String(apiError?.message || apiError || "API unavailable");
      const h = String(htmlError?.message || htmlError || "profile HTML unavailable");
      throw new Error(`${a}; ${h}`);
    }
  }

  function buildEntry(fields) {
    return {
      greetingTokens: estimateTokens(fields.greeting),
      personalityTokens: estimateTokens(fields.personality),
      scenarioTokens: estimateTokens(fields.scenario),
      examplesTokens: estimateTokens(fields.examples),
      updatedAt: Date.now(),
      source: "character-api-v2"
    };
  }

  function chip(label, value) {
    const span = document.createElement("span");
    span.className = "ds-card-token-chip";
    span.textContent = `${label}: ${value == null ? "unavailable" : `~${Number(value).toLocaleString()}`}`;
    return span;
  }

  function render(card, entry, loading = false) {
    if (!(card instanceof HTMLElement)) return;
    let box = card.querySelector(":scope > .ds-card-token-info");
    if (!box) {
      box = document.createElement("div");
      box.className = "ds-card-token-info";
      DS.markQolOwned?.(box, "card-token-info");
      card.appendChild(box);
    }
    DS.markQolOwned?.(box, "card-token-info");
    const botId = cardBotId(card);

    // Never replace a resolved token result with a temporary loading label for
    // the same bot. SpicyChat can trigger another listing pass while a refresh
    // or cache check is happening, but the already-known values are still more
    // useful than a loading spinner. Tag the box with the bot id so recycled
    // card DOM cannot accidentally keep another bot's values.
    if (loading && box.dataset.dsTokenBotId === botId) {
      const text = cleanText(box.textContent || "");
      const hasResolvedValue = /(?:Greeting|Personality|Scenario|Examples):\s*~[0-9]/i.test(text);
      if (hasResolvedValue) return;
    }

    box.textContent = "";
    box.removeAttribute("title");
    if (botId) box.dataset.dsTokenBotId = botId;
    else delete box.dataset.dsTokenBotId;
    if (loading) {
      const wanted = desiredFieldsForCard(card);
      const node = chip("Greeting", null);
      node.textContent = wanted.personality || wanted.scenario || wanted.examples
        ? "Token info: loading…"
        : "Greeting: loading…";
      box.appendChild(node);
      return;
    }
    if (!entry && botId && state.failureReason.has(botId)) {
      box.title = `Token info retry pending: ${state.failureReason.get(botId)}`;
    }
    const wanted = desiredFieldsForCard(card);
    if (wanted.greeting) box.appendChild(chip("Greeting", entry?.greetingTokens));
    // Only show definition-field chips when the card exposes them and a value
    // was actually found. Greeting remains the universal fallback.
    if (wanted.personality && entry?.personalityTokens != null) box.appendChild(chip("Personality", entry.personalityTokens));
    if (wanted.scenario && entry?.scenarioTokens != null) box.appendChild(chip("Scenario", entry.scenarioTokens));
    if (wanted.examples && entry?.examplesTokens != null) box.appendChild(chip("Examples", entry.examplesTokens));
  }

  async function loadEntry(botId, card) {
    await ensureCache();
    const wanted = desiredFieldsForCard(card);
    const cached = normalizedCacheEntry(state.cache[botId]);
    if (cached && cacheHasDesired(cached, wanted) && freshEnough(cached)) return cached;
    if (state.inFlight.has(botId)) return state.inFlight.get(botId);
    const failedAt = state.failedAt.get(botId) || 0;
    if (Date.now() - failedAt < RETRY_AFTER_MS && cached) return cached;

    const task = (async () => {
      try {
        const fields = await fetchProfile(botId, card);
        // Reuse data QoL already fetched instead of making the archive perform
        // another network request. This is local-only and can be disabled in
        // Local Bot Archive settings.
        try {
          DS.rememberSeenBotData?.(botId, {
            greeting: fields.greeting || "",
            description: fields.description || descriptionFromCard(card) || "",
            personality: fields.personality || "",
            scenario: fields.scenario || "",
            exampleDialogues: fields.examples || ""
          }, archiveMetaFromCard(card, botId));
        } catch {}
        const entry = buildEntry(fields);
        // A response that gave us none of the requested remote fields should
        // not poison the cache as a permanent "unavailable" result. Let it be
        // retried after the short cooldown instead.
        const remoteNeeded = wanted.greeting || wanted.personality || wanted.scenario || wanted.examples;
        const usefulRemote = entry.greetingTokens != null || entry.personalityTokens != null || entry.scenarioTokens != null || entry.examplesTokens != null;
        if (remoteNeeded && !usefulRemote) throw new Error("profile fields not found in current SpicyChat markup");
        state.cache[botId] = entry;
        state.failedAt.delete(botId);
        state.failureReason.delete(botId);
        scheduleCacheWrite();
        return entry;
      } catch (error) {
        state.failedAt.set(botId, Date.now());
        state.failureReason.set(botId, String(error?.message || error || "unknown failure").slice(0, 360));
        DS.runtimeLog?.("warn", "card-token-info", "Could not read token fields from chatbot profile; will retry", {
          botId,
          error: String(error?.message || error)
        });
        return cached || null;
      } finally {
        state.inFlight.delete(botId);
      }
    })();
    state.inFlight.set(botId, task);
    return task;
  }

  function nearViewport(card) {
    try {
      const rect = card.getBoundingClientRect();
      return rect.bottom >= -500 && rect.top <= innerHeight + 900;
    } catch {
      return true;
    }
  }

  function hiddenQueuePauseActive() {
    const cfg = settings();
    return !!document.hidden && cfg.pauseQolInHiddenTabs !== false;
  }

  function enqueue(card) {
    if (!(card instanceof HTMLElement)) return;
    const id = cardBotId(card);
    if (!id || state.queued.has(id)) return;
    state.queued.add(id);
    state.queue.push({ id, card });
    pumpQueue();
  }

  async function pumpQueue() {
    if (hiddenQueuePauseActive()) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.cardTokenHiddenQueuePauses = Number(perf.cardTokenHiddenQueuePauses || 0) + 1;
      return;
    }
    while (state.active < MAX_CONCURRENT && state.queue.length) {
      const item = state.queue.shift();
      if (!item) break;
      state.active += 1;
      (async () => {
        try {
          if (!item.card.isConnected || !enabled()) return;
          await ensureCache();
          const cached = normalizedCacheEntry(state.cache[item.id]);
          if (cached && cacheHasDesired(cached, desiredFieldsForCard(item.card)) && freshEnough(cached)) {
            render(item.card, cached);
            return;
          }
          render(item.card, cached, !cached);
          const entry = await loadEntry(item.id, item.card);
          if (item.card.isConnected && enabled()) {
            if (entry) render(item.card, entry);
            else render(item.card, null);
          }
        } finally {
          state.queued.delete(item.id);
          state.active -= 1;
          pumpQueue();
        }
      })();
    }
  }

  function ensureObserver() {
    if (state.observer || !("IntersectionObserver" in window)) return;
    state.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) enqueue(entry.target);
    }, { rootMargin: "700px 0px" });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && enabled()) pumpQueue();
  }, true);

  DS.removeCardGreetingTokenInfo = function removeCardGreetingTokenInfo() {
    document.querySelectorAll(".ds-card-token-info").forEach(node => node.remove());
    document.querySelectorAll("[data-ds-token-observed]").forEach(node => node.removeAttribute("data-ds-token-observed"));
    state.observer?.disconnect();
    state.observer = null;
    state.queue.length = 0;
    state.queued.clear();
  };

  DS.applyCardGreetingTokenInfo = async function applyCardGreetingTokenInfo() {
    if (!enabled()) return DS.removeCardGreetingTokenInfo();
    await ensureCache();
    ensureObserver();
    // The old greeting-only implementation could stamp unrelated navigation
    // elements (for example /chatbot/create) with a token-observed marker. The
    // current implementation does not use that marker at all, so clean it
    // globally before decorating real UUID-backed bot cards.
    document.querySelectorAll("[data-ds-token-observed]").forEach(node => node.removeAttribute("data-ds-token-observed"));

    const cards = listingCards();
    for (const card of cards) {
      const id = cardBotId(card);
      if (!id) continue;
      const wanted = desiredFieldsForCard(card);
      const cached = normalizedCacheEntry(state.cache[id]);
      if (cached && cacheHasDesired(cached, wanted) && freshEnough(cached)) render(card, cached);
      else render(card, cached, true);
      // Every loaded card now gets a visible token-info state immediately,
      // while actual profile/API work remains viewport-lazy to avoid firing
      // hundreds of requests at once on auto-filled listings.
      if (state.observer) state.observer.observe(card);
      else if (nearViewport(card)) enqueue(card);
    }
  };
})();

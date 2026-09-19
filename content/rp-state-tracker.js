(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORAGE_KEY = "rpStateTrackerData";
  const MODAL_ID = "ds-rp-state-tracker-modal";
  const MESSAGE_SELECTOR = "div[id^='message-']";
  const MAX_ITEMS = 80;
  const MAX_HISTORY = 200;
  const MAX_PENDING = 80;

  const CATEGORY_ORDER = ["location", "worn", "inventory", "status", "stats", "objective", "party", "currency", "custom"];
  const CATEGORY_LABELS = {
    location: "Location",
    worn: "Worn / equipped",
    inventory: "Inventory",
    status: "Status / injuries",
    stats: "Stats",
    objective: "Objectives",
    party: "Party",
    currency: "Currency",
    custom: "Custom"
  };

  let storeCache = null;
  let loadPromise = null;
  let saveTimer = null;

  function clean(value) {
    return String(value ?? "").replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }

  function cleanSingle(value) {
    return clean(value).replace(/\s+/g, " ").trim();
  }

  function hashText(text) {
    let h = 2166136261;
    const value = String(text || "");
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function currentChatScope() {
    const scope = DS.getCurrentChatScope?.();
    if (scope?.key) return scope;
    const fallback = String(DS.chatIdFromHref?.(location.href || "") || "").trim();
    return fallback ? { key: `legacy:${fallback}`, botId: fallback, conversationId: "", persisted: false, legacyKey: fallback, draftKey: "" } : null;
  }

  function migrateScopedEntry(store, scope) {
    if (!store || !scope?.key) return scope?.key || "";
    const key = scope.key;
    if (store[key]) return key;

    // A tracker can start on /chat/<bot> before SpicyChat creates the actual
    // conversation id. Move that temporary state to the persisted conversation
    // exactly once instead of leaving it bot-wide.
    if (scope.persisted && scope.draftKey && scope.draftKey !== key && store[scope.draftKey]) {
      store[key] = store[scope.draftKey];
      delete store[scope.draftKey];
      scheduleSave("Moved RP State Tracker state to this conversation");
      return key;
    }

    // Versions before .127 keyed tracker data by character id. Assign that
    // legacy state only to the first concrete conversation opened after the
    // update, then remove the bot-wide key so other chats start clean.
    if (scope.persisted && scope.legacyKey && scope.legacyKey !== key && store[scope.legacyKey]) {
      store[key] = store[scope.legacyKey];
      delete store[scope.legacyKey];
      scheduleSave("Migrated legacy RP State Tracker state to this conversation");
    }
    return key;
  }

  function currentChatId() {
    const scope = currentChatScope();
    if (!scope?.key) return "";
    return storeCache ? migrateScopedEntry(storeCache, scope) : scope.key;
  }

  function normalizeCategory(value) {
    const key = String(value || "custom").toLowerCase();
    return CATEGORY_ORDER.includes(key) ? key : "custom";
  }

  function normalizeKey(value) {
    return cleanSingle(value).slice(0, 80) || "State";
  }

  function normalizeValue(value) {
    return clean(value).slice(0, 1200);
  }

  function itemIdentity(category, key) {
    return `${normalizeCategory(category)}:${normalizeKey(key).toLowerCase()}`;
  }

  function storyStamp() {
    const snap = DS.getStoryDaySnapshot?.();
    if (!snap) return { storyDay: 0, storyPhase: "unknown", storyCode: "" };
    return {
      storyDay: Number(snap.day) > 0 ? Math.floor(Number(snap.day)) : 0,
      storyPhase: String(snap.phase || "unknown"),
      storyCode: String(snap.code || "")
    };
  }

  function normalizeItem(raw, index = 0) {
    const item = raw && typeof raw === "object" ? raw : {};
    const category = normalizeCategory(item.category);
    const key = normalizeKey(item.key || CATEGORY_LABELS[category] || `State ${index + 1}`);
    const value = normalizeValue(item.value);
    return {
      id: cleanSingle(item.id || itemIdentity(category, key)).slice(0, 180),
      category,
      key,
      value,
      includeInContext: item.includeInContext !== false,
      updatedAt: Number(item.updatedAt) || Date.now(),
      storyDay: Number(item.storyDay) > 0 ? Math.floor(Number(item.storyDay)) : 0,
      storyPhase: cleanSingle(item.storyPhase || "unknown").slice(0, 24) || "unknown",
      storyCode: cleanSingle(item.storyCode || "").slice(0, 24),
      sourceMessageId: cleanSingle(item.sourceMessageId || "").slice(0, 180),
      sourceHash: cleanSingle(item.sourceHash || "").slice(0, 80),
      sourceSnippet: cleanSingle(item.sourceSnippet || "").slice(0, 260),
      origin: ["manual", "auto", "accepted"].includes(item.origin) ? item.origin : "manual"
    };
  }

  function normalizePending(raw, index = 0) {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      id: cleanSingle(item.id || `pending-${index}`).slice(0, 220),
      action: ["set", "remove", "append", "remove-token"].includes(item.action) ? item.action : "set",
      category: normalizeCategory(item.category),
      key: normalizeKey(item.key),
      value: normalizeValue(item.value),
      trigger: cleanSingle(item.trigger || "").slice(0, 220),
      messageId: cleanSingle(item.messageId || "").slice(0, 180),
      sourceHash: cleanSingle(item.sourceHash || "").slice(0, 80),
      sourceSnippet: cleanSingle(item.sourceSnippet || "").slice(0, 260),
      createdAt: Number(item.createdAt) || Date.now()
    };
  }

  function normalizeHistory(raw, index = 0) {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      id: cleanSingle(item.id || `change-${index}`).slice(0, 220),
      action: cleanSingle(item.action || "set").slice(0, 40),
      category: normalizeCategory(item.category),
      key: normalizeKey(item.key),
      before: normalizeValue(item.before),
      after: normalizeValue(item.after),
      storyDay: Number(item.storyDay) > 0 ? Math.floor(Number(item.storyDay)) : 0,
      storyPhase: cleanSingle(item.storyPhase || "unknown").slice(0, 24) || "unknown",
      storyCode: cleanSingle(item.storyCode || "").slice(0, 24),
      sourceMessageId: cleanSingle(item.sourceMessageId || "").slice(0, 180),
      sourceSnippet: cleanSingle(item.sourceSnippet || "").slice(0, 260),
      origin: ["manual", "auto", "accepted"].includes(item.origin) ? item.origin : "manual",
      createdAt: Number(item.createdAt) || Date.now()
    };
  }

  function normalizeEntry(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const items = Array.isArray(source.items) ? source.items.map(normalizeItem).filter(item => item.value) : [];
    const pending = Array.isArray(source.pending) ? source.pending.map(normalizePending).filter(item => item.key) : [];
    const history = Array.isArray(source.history) ? source.history.map(normalizeHistory).slice(-MAX_HISTORY) : [];
    const processed = source.processed && typeof source.processed === "object" ? { ...source.processed } : {};
    const dismissed = source.dismissed && typeof source.dismissed === "object" ? { ...source.dismissed } : {};
    return {
      initialized: source.initialized === true,
      initializedAt: Number(source.initializedAt) || 0,
      boundaryMessageId: cleanSingle(source.boundaryMessageId || "").slice(0, 180),
      boundaryHash: cleanSingle(source.boundaryHash || "").slice(0, 80),
      items: items.slice(-MAX_ITEMS),
      pending: pending.slice(-MAX_PENDING),
      history,
      processed,
      dismissed
    };
  }

  function normalizeStore(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const output = {};
    for (const [chatId, entry] of Object.entries(source)) {
      const id = cleanSingle(chatId);
      if (!id) continue;
      output[id] = normalizeEntry(entry);
    }
    return output;
  }

  async function ensureLoaded() {
    if (storeCache) return storeCache;
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
          const result = await DS.storageGet?.([STORAGE_KEY]);
          storeCache = normalizeStore(result?.[STORAGE_KEY]);
        } catch {
          storeCache = {};
        }
        return storeCache;
      })();
    }
    return loadPromise;
  }

  async function flushSave(label = "Updated RP State Tracker") {
    clearTimeout(saveTimer);
    saveTimer = null;
    const store = normalizeStore(storeCache || {});
    try {
      const beforeResult = await DS.storageGet?.([STORAGE_KEY]);
      const before = normalizeStore(beforeResult?.[STORAGE_KEY]);
      await DS.storageSet?.({ [STORAGE_KEY]: store });
      if (JSON.stringify(before) !== JSON.stringify(store)) {
        await DS.recordLocalChange?.(label, { [STORAGE_KEY]: before }, { [STORAGE_KEY]: store });
      }
    } catch {}
  }

  function scheduleSave(label) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => flushSave(label), 300);
  }

  function roots() {
    if (typeof DS.getLoadedMessageRoots === "function") return DS.getLoadedMessageRoots();
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .filter(root => !root.parentElement?.closest?.(MESSAGE_SELECTOR));
  }

  function messageText(root) {
    if (typeof DS.getCachedMessageText === "function") return clean(DS.getCachedMessageText(root));
    const candidates = Array.from(root.querySelectorAll("div[class*='overflow-wrap'], div[class*='break-words'], span.leading-6"))
      .map(el => clean(el.innerText || el.textContent))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (candidates.length) return candidates[0];
    const clone = root.cloneNode(true);
    clone.querySelectorAll("button, svg, .ds-message-quick-actions, .ds-generation-metadata, .ds-context-keep-button").forEach(el => el.remove());
    return clean(clone.textContent);
  }

  function messageId(root, index = 0) {
    const direct = cleanSingle(String(root?.id || "").replace(/^message-/, ""));
    if (direct) return direct.slice(0, 180);
    return `loaded-${index}-${hashText(messageText(root))}`;
  }

  function ensureEntry(store, id, loadedRoots = roots()) {
    if (store[id]) return store[id];
    const last = loadedRoots[loadedRoots.length - 1];
    const entry = normalizeEntry({
      initialized: true,
      initializedAt: Date.now(),
      boundaryMessageId: last ? messageId(last, loadedRoots.length - 1) : "",
      boundaryHash: last ? hashText(messageText(last)) : "",
      items: [], pending: [], history: [], processed: {}, dismissed: {}
    });
    store[id] = entry;
    scheduleSave("Started RP State Tracker");
    return entry;
  }

  function activeEntrySync() {
    const id = currentChatId();
    if (!id || !storeCache) return null;
    return storeCache[id] || null;
  }

  function labelInfo(rawLabel) {
    const label = cleanSingle(rawLabel).replace(/^[-*#\[\]]+|[-*#\[\]]+$/g, "").trim();
    const lower = label.toLowerCase();
    const table = [
      [/^(?:location|current location|place|where)$/i, "location", "Location"],
      [/^(?:wearing|worn|worn clothing|clothing|outfit|equipped|equipped items?)$/i, "worn", /equip/i.test(lower) ? "Equipped" : "Worn clothing"],
      [/^(?:inventory|items?|carried items?|backpack|bag)$/i, "inventory", "Inventory"],
      [/^(?:status|condition|injury|injuries|status effects?|effects?)$/i, "status", /injur/i.test(lower) ? "Injuries" : "Status"],
      [/^(?:hp|health|mana|stamina|level|xp|experience|stat|stats)$/i, "stats", label || "Stats"],
      [/^(?:objective|objectives|quest|quests|goal|goals|mission|missions)$/i, "objective", /quest/i.test(lower) ? "Quest" : "Objective"],
      [/^(?:party|companions?|team|group)$/i, "party", "Party"],
      [/^(?:gold|credits?|currency|money|coins?|cash)$/i, "currency", label || "Currency"]
    ];
    for (const [regex, category, key] of table) {
      if (regex.test(label)) return { category, key: normalizeKey(key) };
    }
    return { category: "custom", key: normalizeKey(label || "State") };
  }

  function isClearValue(value) {
    return /^(?:none|nothing|clear|empty|n\/?a|not applicable|no|off|removed)$/i.test(cleanSingle(value));
  }

  function structuredDetections(text) {
    const value = String(text || "").replace(/\r\n/g, "\n");
    if (!value.trim()) return [];
    const out = [];
    const seen = new Set();

    const add = (label, rawValue, trigger) => {
      const info = labelInfo(label);
      const val = normalizeValue(rawValue);
      if (!info.key || !val) return;
      const action = isClearValue(val) ? "remove" : "set";
      const sig = `${action}|${info.category}|${info.key.toLowerCase()}|${val.toLowerCase()}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push({ action, category: info.category, key: info.key, value: action === "remove" ? "" : val, trigger: cleanSingle(trigger).slice(0, 220), confidence: "high" });
    };

    for (const rawLine of value.split(/\n+/)) {
      const line = cleanSingle(rawLine).replace(/^[-*•]\s*/, "");
      if (!line || line.length > 1600) continue;

      let match = line.match(/^\[?\s*(?:rp\s+state|current\s+state|state)\s*\]?\s*[:=-]\s*(.+)$/i);
      if (match) {
        const body = match[1];
        const chunks = body.split(/\s*;\s*/).filter(Boolean);
        for (const chunk of chunks) {
          const pair = chunk.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
          if (pair) add(pair[1], pair[2], line);
        }
        continue;
      }

      match = line.match(/^(?:state[.\s]+)([^:=]{1,80})\s*[:=]\s*(.+)$/i);
      if (match) {
        add(match[1], match[2], line);
        continue;
      }

      match = line.match(/^([^:=]{1,50})\s*[:=]\s*(.+)$/);
      if (!match) continue;
      const info = labelInfo(match[1]);
      if (info.category === "custom") continue;
      add(match[1], match[2], line);
    }
    return out.slice(0, 12);
  }

  function assistedDetections(text) {
    const value = cleanSingle(text);
    if (!value || value.length > 5000) return [];
    const subject = "(?:you|\\{\\{user\\}\\}|the player|your character)";
    const rules = [
      [new RegExp(`\\b${subject}\\s+(?:puts?|slips?|pulls?)\\s+on\\s+(.{2,120}?)(?:[.!?]|$)`, "i"), "append", "worn", "Worn clothing"],
      [new RegExp(`\\b${subject}\\s+(?:takes?|pulls?|removes?)\\s+off\\s+(.{2,120}?)(?:[.!?]|$)`, "i"), "remove-token", "worn", "Worn clothing"],
      [new RegExp(`\\b${subject}\\s+(?:picks?\\s+up|receives?|obtains?|acquires?)\\s+(.{2,120}?)(?:[.!?]|$)`, "i"), "append", "inventory", "Inventory"],
      [new RegExp(`\\b${subject}\\s+(?:drops?|discards?|gives?\\s+away|uses?\\s+up|consumes?)\\s+(.{2,120}?)(?:[.!?]|$)`, "i"), "remove-token", "inventory", "Inventory"],
      [new RegExp(`\\b${subject}\\s+(?:arrives?\\s+at|enters?|reaches?)\\s+(.{2,140}?)(?:[.!?]|$)`, "i"), "set", "location", "Location"]
    ];
    const out = [];
    for (const [regex, action, category, key] of rules) {
      const match = value.match(regex);
      if (!match) continue;
      const val = normalizeValue(match[1]).replace(/^["'“”]|["'“”]$/g, "").trim();
      if (!val || val.length < 2) continue;
      out.push({ action, category, key, value: val, trigger: cleanSingle(match[0]).slice(0, 220), confidence: "medium" });
      if (out.length >= 3) break;
    }
    return out;
  }

  function historyPush(entry, change) {
    const stamp = storyStamp();
    entry.history.push(normalizeHistory({
      id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...change,
      ...stamp,
      createdAt: Date.now()
    }));
    entry.history = entry.history.slice(-MAX_HISTORY);
  }

  function findItemIndex(entry, category, key) {
    const id = itemIdentity(category, key);
    return entry.items.findIndex(item => itemIdentity(item.category, item.key) === id);
  }

  function tokenParts(value) {
    return normalizeValue(value).split(/\s*,\s*|\s*;\s*/).map(cleanSingle).filter(Boolean);
  }

  function mergeTokenValue(existing, token) {
    const parts = tokenParts(existing);
    const candidate = cleanSingle(token);
    if (!candidate) return existing;
    if (!parts.some(part => part.toLowerCase() === candidate.toLowerCase())) parts.push(candidate);
    return parts.join(", ");
  }

  function removeTokenValue(existing, token) {
    const candidate = cleanSingle(token).toLowerCase();
    if (!candidate) return existing;
    return tokenParts(existing).filter(part => {
      const lower = part.toLowerCase();
      return lower !== candidate && !lower.includes(candidate) && !candidate.includes(lower);
    }).join(", ");
  }

  function applyChange(entry, change, meta = {}) {
    const category = normalizeCategory(change.category);
    const key = normalizeKey(change.key);
    const index = findItemIndex(entry, category, key);
    const existing = index >= 0 ? entry.items[index] : null;
    const before = existing?.value || "";
    let after = normalizeValue(change.value);
    const action = ["set", "remove", "append", "remove-token"].includes(change.action) ? change.action : "set";

    if (action === "append") after = mergeTokenValue(before, after);
    else if (action === "remove-token") after = removeTokenValue(before, after);
    else if (action === "remove") after = "";

    if (after === before) return false;

    if (!after) {
      if (index < 0) return false;
      entry.items.splice(index, 1);
    } else {
      const stamp = storyStamp();
      const next = normalizeItem({
        ...(existing || {}),
        id: existing?.id || itemIdentity(category, key),
        category,
        key,
        value: after,
        includeInContext: existing ? existing.includeInContext !== false : meta.includeInContext !== false,
        updatedAt: Date.now(),
        ...stamp,
        sourceMessageId: meta.messageId || "",
        sourceHash: meta.sourceHash || "",
        sourceSnippet: meta.sourceSnippet || "",
        origin: meta.origin || "manual"
      });
      if (index >= 0) entry.items[index] = next;
      else entry.items.push(next);
      entry.items = entry.items.slice(-MAX_ITEMS);
    }

    historyPush(entry, {
      action,
      category,
      key,
      before,
      after,
      sourceMessageId: meta.messageId || "",
      sourceSnippet: meta.sourceSnippet || "",
      origin: meta.origin || "manual"
    });
    return true;
  }

  function processMessage(entry, root, index, { force = false } = {}) {
    const id = messageId(root, index);
    const text = messageText(root);
    if (!id || !text) return false;
    const sourceHash = hashText(text);
    if (!force && entry.processed?.[id] === sourceHash) return false;

    let changed = false;
    const structured = structuredDetections(text);
    for (const detected of structured) {
      if (applyChange(entry, detected, {
        messageId: id,
        sourceHash,
        sourceSnippet: text.slice(0, 260),
        origin: "auto"
      })) changed = true;
    }

    const mode = String(DS.state?.settings?.rpStateTrackerMode || "conservative");
    const pendingForMessage = entry.pending.filter(item => item.messageId !== id);
    if (pendingForMessage.length !== entry.pending.length) changed = true;
    entry.pending = pendingForMessage;

    if (mode === "assisted" && !structured.length) {
      const dismissedHash = entry.dismissed?.[id];
      if (dismissedHash !== sourceHash) {
        for (const [pendingIndex, detected] of assistedDetections(text).entries()) {
          entry.pending.push(normalizePending({
            id: `pending-${id}-${pendingIndex}-${hashText(`${detected.action}|${detected.key}|${detected.value}`)}`,
            ...detected,
            messageId: id,
            sourceHash,
            sourceSnippet: text.slice(0, 260),
            createdAt: Date.now()
          }));
          changed = true;
        }
        entry.pending = entry.pending.slice(-MAX_PENDING);
      }
    }

    entry.processed[id] = sourceHash;
    const keys = Object.keys(entry.processed);
    if (keys.length > 700) {
      for (const old of keys.slice(0, keys.length - 600)) delete entry.processed[old];
    }
    return changed;
  }

  function scanRoots(entry, loadedRoots, { all = false } = {}) {
    const mode = String(DS.state?.settings?.rpStateTrackerMode || "conservative");
    let changed = false;
    if (mode === "manual") {
      const last = loadedRoots[loadedRoots.length - 1];
      if (last) {
        const lastId = messageId(last, loadedRoots.length - 1);
        const lastHash = hashText(messageText(last));
        if (lastId && (entry.boundaryMessageId !== lastId || entry.boundaryHash !== lastHash)) {
          entry.boundaryMessageId = lastId;
          entry.boundaryHash = lastHash;
          changed = true;
        }
      }
      if (entry.pending.length) { entry.pending = []; changed = true; }
      return changed;
    }
    if (mode !== "assisted" && entry.pending.length) {
      entry.pending = [];
      changed = true;
    }

    let boundaryIndex = entry.boundaryMessageId ? loadedRoots.findIndex((root, index) => messageId(root, index) === entry.boundaryMessageId) : -1;
    if (all) boundaryIndex = -1;

    for (let index = 0; index < loadedRoots.length; index++) {
      const root = loadedRoots[index];
      const id = messageId(root, index);
      const text = messageText(root);
      const currentHash = hashText(text);
      const boundaryChanged = boundaryIndex === index && entry.boundaryHash && currentHash !== entry.boundaryHash;
      const shouldInspect = all || !!entry.processed[id] || (boundaryIndex >= 0 ? index > boundaryIndex || boundaryChanged : false);
      if (!shouldInspect) continue;
      if (processMessage(entry, root, index, { force: all })) changed = true;
    }

    const last = loadedRoots[loadedRoots.length - 1];
    if (last) {
      const lastId = messageId(last, loadedRoots.length - 1);
      const lastHash = hashText(messageText(last));
      if (lastId && (entry.boundaryMessageId !== lastId || entry.boundaryHash !== lastHash)) {
        entry.boundaryMessageId = lastId;
        entry.boundaryHash = lastHash;
        changed = true;
      }
    }
    return changed;
  }

  async function scanLoadedHistory() {
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return false;
    const loaded = roots();
    const entry = ensureEntry(store, id, loaded);
    entry.processed = {};
    entry.pending = [];
    for (let index = 0; index < loaded.length; index++) processMessage(entry, loaded[index], index, { force: true });
    const last = loaded[loaded.length - 1];
    entry.boundaryMessageId = last ? messageId(last, loaded.length - 1) : "";
    entry.boundaryHash = last ? hashText(messageText(last)) : "";
    await flushSave("Scanned loaded chat for RP state");
    DS.updateQuickPanel?.();
    return true;
  }

  function stateSnapshot() {
    const entry = activeEntrySync();
    if (!entry) return null;
    const items = [...entry.items].sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category), bi = CATEGORY_ORDER.indexOf(b.category);
      return (ai - bi) || a.key.localeCompare(b.key);
    });
    return {
      count: items.length,
      pending: entry.pending.length,
      items,
      history: entry.history,
      story: DS.getStoryDaySnapshot?.() || null
    };
  }

  function buildContextBlock(options = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enableRpStateTracker && !options.force) return "";
    const snap = stateSnapshot();
    if (!snap?.items?.length) return "";
    const maxChars = Math.max(300, Math.min(3000, Number(options.maxChars || settings.rpStateMaxContextChars || 1200) || 1200));
    const active = snap.items.filter(item => item.includeInContext !== false && item.value);
    if (!active.length) return "";

    const parts = [];
    if (snap.story?.code) parts.push(`Storydate ${snap.story.code}`);
    for (const item of active) parts.push(`${item.key}=${cleanSingle(item.value)}`);
    const prefix = "[OOC: Current RP state — keep these current details consistent unless the story changes them: ";
    const suffix = "]";
    let body = "";
    for (const part of parts) {
      const next = body ? `${body}; ${part}` : part;
      if ((prefix.length + next.length + suffix.length) > maxChars) break;
      body = next;
    }
    return body ? `${prefix}${body}${suffix}` : "";
  }

  function sessionStateKey() {
    const chat = currentChatId() || location.pathname || "chat";
    return `ds-qol-rp-state-sent-v1:${encodeURIComponent(chat)}`;
  }

  function getLastInjectedHash() {
    try { return String(sessionStorage.getItem(sessionStateKey()) || ""); } catch { return ""; }
  }

  function markInjected(hash) {
    try { sessionStorage.setItem(sessionStateKey(), String(hash || "")); } catch {}
  }

  function injectionCandidate() {
    const settings = DS.state?.settings || {};
    if (!settings.enableRpStateTracker) return null;
    const mode = ["manual", "changed", "every"].includes(settings.rpStateInjectMode) ? settings.rpStateInjectMode : "changed";
    if (mode === "manual") return null;
    const text = buildContextBlock();
    if (!text) return null;
    const hash = hashText(text);
    if (mode === "changed" && getLastInjectedHash() === hash) return null;
    return { text, hash, mode };
  }

  function findComposer() {
    return document.querySelector("textarea[placeholder='Message...']") || [...document.querySelectorAll("textarea")].find(el => !el.closest?.("[id^='message-']") && String(el.getAttribute("placeholder") || "").toLowerCase().includes("message")) || null;
  }

  function setTextareaValue(textarea, nextValue) {
    if (!textarea) return false;
    const oldValue = String(textarea.value || "");
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
      if (descriptor?.set) descriptor.set.call(textarea, nextValue);
      else textarea.value = nextValue;
      if (textarea._valueTracker?.setValue) textarea._valueTracker.setValue(oldValue);
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
      return true;
    } catch {
      try {
        textarea.value = nextValue;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch { return false; }
    }
  }

  function insertContextIntoDraft() {
    const textarea = findComposer();
    if (!textarea || textarea.disabled) return false;
    const block = buildContextBlock({ force: true });
    if (!block) return false;
    const current = String(textarea.value || "");
    if (current.includes(block)) return true;
    const separator = current.trim() ? (current.endsWith("\n") ? "\n" : "\n\n") : "";
    const next = `${current}${separator}${block}`;
    const maxLength = Number(textarea.getAttribute("maxlength") || 0) || 10000;
    if (next.length > maxLength) return false;
    if (!setTextareaValue(textarea, next)) return false;
    textarea.selectionStart = textarea.selectionEnd = next.length;
    return true;
  }

  function make(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === "className") el.className = value;
      else if (key === "dataset" && value && typeof value === "object") Object.assign(el.dataset, value);
      else if (key in el && !key.startsWith("aria-")) {
        try { el[key] = value; } catch { el.setAttribute(key, value); }
      } else el.setAttribute(key, value);
    }
    if (text) el.textContent = text;
    return el;
  }

  async function addManualItem({ category, key, value, includeInContext = true }) {
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return false;
    const entry = ensureEntry(store, id);
    const changed = applyChange(entry, { action: value ? "set" : "remove", category, key, value }, { origin: "manual", includeInContext });
    const index = findItemIndex(entry, category, key);
    if (index >= 0) entry.items[index].includeInContext = includeInContext !== false;
    if (changed || index >= 0) {
      await flushSave("Updated RP State Tracker manually");
      DS.updateQuickPanel?.();
      return true;
    }
    return false;
  }

  async function setItemInclude(itemId, include) {
    const entry = activeEntrySync();
    if (!entry) return false;
    const item = entry.items.find(value => value.id === itemId);
    if (!item) return false;
    item.includeInContext = !!include;
    item.updatedAt = Date.now();
    await flushSave("Changed RP State context inclusion");
    return true;
  }

  async function openManager() {
    document.getElementById(MODAL_ID)?.remove();
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return;
    let entry = ensureEntry(store, id);

    const modal = make("div", { id: MODAL_ID, className: "ds-tool-modal" });
    const backdrop = make("div", { className: "ds-tool-modal-backdrop" });
    const dialog = make("div", { className: "ds-tool-modal-dialog ds-rp-state-dialog", role: "dialog", "aria-modal": "true", "aria-label": "RP State Tracker" });
    const head = make("div", { className: "ds-tool-modal-head" });
    head.append(make("h2", {}, "RP State Tracker"));
    const close = make("button", { className: "ds-tool-modal-close", type: "button", "aria-label": "Close" }, "×");
    head.append(close);

    const summary = make("div", { className: "ds-rp-state-summary" });
    const summaryMain = make("strong");
    const summarySub = make("span", { className: "ds-qol-small-note" });
    summary.append(summaryMain, summarySub);

    const actions = make("div", { className: "ds-tool-button-row" });
    const scan = make("button", { type: "button" }, "Scan loaded history");
    const copy = make("button", { type: "button" }, "Copy current state");
    const insert = make("button", { type: "button" }, "Insert into draft");
    const reset = make("button", { type: "button", className: "ds-danger" }, "Reset this chat");
    actions.append(scan, copy, insert, reset);

    const addTitle = make("h3", {}, "Add / update state");
    const editor = make("div", { className: "ds-rp-state-editor" });
    const category = make("select", { "aria-label": "State category" });
    for (const cat of CATEGORY_ORDER) category.append(make("option", { value: cat }, CATEGORY_LABELS[cat]));
    const key = make("input", { type: "text", maxlength: "80", placeholder: "e.g. Worn clothing, HP, Current quest" });
    const value = make("textarea", { maxlength: "1200", placeholder: "Current value" });
    const includeLabel = make("label", { className: "ds-rp-state-context-toggle" });
    const include = make("input", { type: "checkbox", checked: true });
    includeLabel.append(include, make("span", {}, "Include in chat context"));
    const save = make("button", { type: "button" }, "Save state");
    const cancelEdit = make("button", { type: "button", hidden: true }, "Cancel edit");
    editor.append(category, key, value, includeLabel, save, cancelEdit);

    const activeTitle = make("h3", {}, "Current state");
    const activeHost = make("div", { className: "ds-rp-state-list" });
    const pendingTitle = make("h3", {}, "Suggested changes");
    const pendingHost = make("div", { className: "ds-rp-state-list" });
    const historyTitle = make("h3", {}, "Recent changes");
    const historyHost = make("div", { className: "ds-rp-state-list" });

    let editingId = "";

    function clearEditor() {
      editingId = "";
      category.value = "custom";
      key.value = "";
      value.value = "";
      include.checked = true;
      save.textContent = "Save state";
      cancelEdit.hidden = true;
    }

    function render() {
      entry = (storeCache || {})[id] || entry;
      const snap = stateSnapshot() || { count: 0, pending: 0, items: [], story: null };
      summaryMain.textContent = `${snap.count} current state item${snap.count === 1 ? "" : "s"}${snap.pending ? ` · ${snap.pending} suggestion${snap.pending === 1 ? "" : "s"}` : ""}`;
      summarySub.textContent = snap.story?.code
        ? `Current Storydate ${snap.story.code}. State changes are stamped with the active Storydate when available.`
        : "State changes stay local to this chat. Enable Internal Day Tracker if you want Storydate stamps.";

      activeHost.replaceChildren();
      if (!entry.items.length) activeHost.append(make("p", { className: "ds-qol-small-note" }, "No current state saved yet."));
      const sorted = [...entry.items].sort((a, b) => (CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)) || a.key.localeCompare(b.key));
      for (const item of sorted) {
        const row = make("div", { className: "ds-rp-state-item" });
        const textWrap = make("div", { className: "ds-rp-state-item-copy" });
        const title = make("strong", {}, item.key);
        const val = make("span", {}, item.value);
        const meta = make("small", {}, `${CATEGORY_LABELS[item.category]}${item.storyCode ? ` · Storydate ${item.storyCode}` : ""}${item.origin === "auto" ? " · Auto" : item.origin === "accepted" ? " · Accepted" : ""}`);
        textWrap.append(title, val, meta);
        const buttons = make("div", { className: "ds-rp-state-item-actions" });
        const contextToggle = make("button", { type: "button", title: item.includeInContext !== false ? "Exclude this item from the injected state block" : "Include this item in the injected state block" }, item.includeInContext !== false ? "Context: On" : "Context: Off");
        const edit = make("button", { type: "button" }, "Edit");
        const del = make("button", { type: "button" }, "Delete");
        contextToggle.addEventListener("click", async () => { await setItemInclude(item.id, item.includeInContext === false); render(); });
        edit.addEventListener("click", () => {
          editingId = item.id;
          category.value = item.category;
          key.value = item.key;
          value.value = item.value;
          include.checked = item.includeInContext !== false;
          save.textContent = "Update state";
          cancelEdit.hidden = false;
          key.focus();
        });
        del.addEventListener("click", async () => {
          applyChange(entry, { action: "remove", category: item.category, key: item.key, value: "" }, { origin: "manual" });
          await flushSave("Removed RP State item");
          if (editingId === item.id) clearEditor();
          DS.updateQuickPanel?.();
          render();
        });
        buttons.append(contextToggle, edit, del);
        row.append(textWrap, buttons);
        activeHost.append(row);
      }

      pendingHost.replaceChildren();
      if (!entry.pending.length) pendingHost.append(make("p", { className: "ds-qol-small-note" }, "No pending suggestions."));
      for (const item of entry.pending) {
        const row = make("div", { className: "ds-rp-state-item" });
        const textWrap = make("div", { className: "ds-rp-state-item-copy" });
        textWrap.append(
          make("strong", {}, `${item.action === "remove-token" ? "Remove from" : item.action === "append" ? "Add to" : "Set"} ${item.key}`),
          make("span", {}, item.value),
          make("small", {}, item.trigger || item.sourceSnippet)
        );
        const buttons = make("div", { className: "ds-rp-state-item-actions" });
        const apply = make("button", { type: "button" }, "Apply");
        const dismiss = make("button", { type: "button" }, "Dismiss");
        apply.addEventListener("click", async () => {
          applyChange(entry, item, { messageId: item.messageId, sourceHash: item.sourceHash, sourceSnippet: item.sourceSnippet, origin: "accepted" });
          entry.pending = entry.pending.filter(value => value.id !== item.id);
          await flushSave("Accepted RP State suggestion");
          DS.updateQuickPanel?.();
          render();
        });
        dismiss.addEventListener("click", async () => {
          if (item.messageId) entry.dismissed[item.messageId] = item.sourceHash;
          entry.pending = entry.pending.filter(value => value.id !== item.id);
          await flushSave("Dismissed RP State suggestion");
          render();
        });
        buttons.append(apply, dismiss);
        row.append(textWrap, buttons);
        pendingHost.append(row);
      }

      historyHost.replaceChildren();
      const history = [...entry.history].slice(-20).reverse();
      if (!history.length) historyHost.append(make("p", { className: "ds-qol-small-note" }, "No changes recorded yet."));
      for (const change of history) {
        const before = change.before ? `“${change.before}” → ` : "";
        const after = change.after ? `“${change.after}”` : "removed";
        const stamp = change.storyCode ? ` · Storydate ${change.storyCode}` : "";
        historyHost.append(make("div", { className: "ds-rp-state-history" }, `${change.key}: ${before}${after}${stamp}`));
      }
    }

    save.addEventListener("click", async () => {
      const rawKey = normalizeKey(key.value);
      const rawValue = normalizeValue(value.value);
      if (!rawKey || !rawValue) return;
      if (editingId) {
        const old = entry.items.find(item => item.id === editingId);
        if (old && itemIdentity(old.category, old.key) !== itemIdentity(category.value, rawKey)) {
          applyChange(entry, { action: "remove", category: old.category, key: old.key }, { origin: "manual" });
        }
      }
      await addManualItem({ category: category.value, key: rawKey, value: rawValue, includeInContext: include.checked });
      clearEditor();
      render();
    });
    cancelEdit.addEventListener("click", clearEditor);
    scan.addEventListener("click", async () => { await scanLoadedHistory(); render(); });
    copy.addEventListener("click", async () => {
      const block = buildContextBlock({ force: true });
      if (!block) { DS.setQuickStatus?.("RP State Tracker has no context-enabled state yet."); return; }
      try { await navigator.clipboard.writeText(block); DS.setQuickStatus?.("Current RP state copied."); }
      catch { DS.setQuickStatus?.("Could not copy current RP state."); }
    });
    insert.addEventListener("click", () => {
      DS.setQuickStatus?.(insertContextIntoDraft() ? "Current RP state added to your draft." : "Could not add RP state to the current draft.");
    });
    reset.addEventListener("click", async () => {
      if (!window.confirm("Reset the RP State Tracker for this chat? Current state, suggestions and local state history for this chat will be removed.")) return;
      delete storeCache[id];
      ensureEntry(storeCache, id, roots());
      await flushSave("Reset RP State Tracker");
      entry = storeCache[id];
      clearEditor();
      DS.updateQuickPanel?.();
      render();
    });
    close.addEventListener("click", () => modal.remove());
    backdrop.addEventListener("click", () => modal.remove());
    modal.addEventListener("keydown", event => { if (event.key === "Escape") modal.remove(); });

    dialog.append(head, summary, actions, addTitle, editor, activeTitle, activeHost, pendingTitle, pendingHost, historyTitle, historyHost);
    modal.append(backdrop, dialog);
    document.documentElement.append(modal);
    clearEditor();
    render();
  }

  DS.applyRpStateTracker = async function applyRpStateTracker() {
    const settings = DS.state?.settings || {};
    if (!settings.enableRpStateTracker || !DS.isSingleChatPage?.()) {
      DS.state.rpStateTrackerWasActive = false;
      document.getElementById(MODAL_ID)?.remove();
      return;
    }
    DS.state.rpStateTrackerWasActive = true;
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return;
    const loaded = roots();
    const entry = ensureEntry(store, id, loaded);
    if (scanRoots(entry, loaded)) scheduleSave("Updated RP State Tracker from chat");
    DS.updateQuickPanel?.();
  };

  DS.removeRpStateTracker = function removeRpStateTracker() {
    document.getElementById(MODAL_ID)?.remove();
    DS.state.rpStateTrackerWasActive = false;
  };

  DS.openRpStateTracker = openManager;
  DS.getRpStateSnapshot = stateSnapshot;
  DS.getRpStateContextBlock = buildContextBlock;
  DS.getRpStateInjectionCandidate = injectionCandidate;
  DS.markRpStateInjected = markInjected;
  DS.scanRpStateLoadedHistory = scanLoadedHistory;
  DS.RP_STATE_TRACKER_KEY = STORAGE_KEY;
})();

(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STORAGE_KEY = "storyDayTrackerData";
  const MODAL_ID = "ds-story-day-tracker-modal";
  const MESSAGE_SELECTOR = "div[id^='message-']";
  const PHASE_ORDER = ["unknown", "morning", "afternoon", "evening", "night"];
  const PHASE_LABELS = {
    unknown: "Unspecified",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    night: "Night"
  };
  const PHASE_CODES = { unknown: 0, morning: 1, afternoon: 2, evening: 3, night: 4 };
  const CODE_PHASES = { 0: "unknown", 1: "morning", 2: "afternoon", 3: "evening", 4: "night" };

  let storeCache = null;
  let loadPromise = null;
  let saveTimer = null;

  function clean(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
  }

  function clampDay(value) {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? Math.max(1, Math.min(99999, n)) : 1;
  }

  function normalizePhase(value) {
    const phase = String(value || "unknown").toLowerCase();
    return PHASE_ORDER.includes(phase) ? phase : "unknown";
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
      scheduleSave("Moved Internal Day Tracker state to this conversation");
      return key;
    }

    // Versions before .127 keyed tracker data by character id. Assign that
    // legacy state only to the first concrete conversation opened after the
    // update, then remove the bot-wide key so other chats start clean.
    if (scope.persisted && scope.legacyKey && scope.legacyKey !== key && store[scope.legacyKey]) {
      store[key] = store[scope.legacyKey];
      delete store[scope.legacyKey];
      scheduleSave("Migrated legacy Internal Day Tracker state to this conversation");
    }
    return key;
  }

  function currentChatId() {
    const scope = currentChatScope();
    if (!scope?.key) return "";
    return storeCache ? migrateScopedEntry(storeCache, scope) : scope.key;
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

  function normalizeEvent(raw, index = 0) {
    const item = raw && typeof raw === "object" ? raw : {};
    const messageId = clean(item.messageId || "").slice(0, 180);
    const slotKey = clean(item.slotKey || "").slice(0, 220);
    const sourceHash = clean(item.sourceHash || "").slice(0, 80);
    const trigger = clean(item.trigger || "").slice(0, 180);
    const note = clean(item.note || "").slice(0, 500);
    return {
      id: clean(item.id || `${item.kind === "manual" ? "manual" : "event"}-${index}`).slice(0, 220),
      kind: ["auto", "manual", "accepted"].includes(item.kind) ? item.kind : "auto",
      messageId,
      slotKey,
      sourceHash,
      order: Math.max(0, Number(item.order) || index + 1),
      deltaDays: Math.max(-99999, Math.min(99999, Math.trunc(Number(item.deltaDays) || 0))),
      setDay: Number(item.setDay) > 0 ? clampDay(item.setDay) : 0,
      phase: normalizePhase(item.phase),
      trigger,
      note,
      confidence: ["high", "medium", "manual"].includes(item.confidence) ? item.confidence : "high",
      createdAt: Number(item.createdAt) || Date.now()
    };
  }

  function normalizePending(raw, index = 0) {
    const item = raw && typeof raw === "object" ? raw : {};
    return {
      id: clean(item.id || `pending-${index}`).slice(0, 220),
      messageId: clean(item.messageId || "").slice(0, 180),
      slotKey: clean(item.slotKey || "").slice(0, 220),
      sourceHash: clean(item.sourceHash || "").slice(0, 80),
      deltaDays: Math.max(-99999, Math.min(99999, Math.trunc(Number(item.deltaDays) || 0))),
      setDay: Number(item.setDay) > 0 ? clampDay(item.setDay) : 0,
      phase: normalizePhase(item.phase),
      trigger: clean(item.trigger || "").slice(0, 180),
      confidence: "medium",
      createdAt: Number(item.createdAt) || Date.now()
    };
  }

  function normalizeEntry(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const events = Array.isArray(source.events) ? source.events.map(normalizeEvent).filter(item => item.id) : [];
    const pending = Array.isArray(source.pending) ? source.pending.map(normalizePending).filter(item => item.id) : [];
    const notes = Array.isArray(source.notes) ? source.notes.map((item, index) => ({
      id: clean(item?.id || `note-${index}`).slice(0, 180),
      day: clampDay(item?.day || 1),
      phase: normalizePhase(item?.phase),
      text: clean(item?.text || "").slice(0, 700),
      createdAt: Number(item?.createdAt) || Date.now()
    })).filter(item => item.text) : [];
    const dismissed = source.dismissed && typeof source.dismissed === "object" ? { ...source.dismissed } : {};
    const maxOrder = events.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
    return {
      initialized: source.initialized === true,
      initializedAt: Number(source.initializedAt) || 0,
      boundaryMessageId: clean(source.boundaryMessageId || "").slice(0, 180),
      boundarySlotKey: clean(source.boundarySlotKey || "").slice(0, 220),
      boundaryHash: clean(source.boundaryHash || "").slice(0, 80),
      startDay: clampDay(source.startDay || 1),
      startPhase: normalizePhase(source.startPhase),
      nextOrder: Math.max(maxOrder + 1, Number(source.nextOrder) || 1),
      events,
      pending,
      notes,
      dismissed
    };
  }

  function normalizeStore(raw) {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const output = {};
    for (const [chatId, entry] of Object.entries(source)) {
      const id = clean(chatId);
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

  async function flushSave(label = "Updated Internal Day Tracker") {
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
    saveTimer = setTimeout(() => flushSave(label), 350);
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

  function directMessageId(root) {
    return clean(String(root?.id || "").replace(/^message-/, "")).slice(0, 180);
  }

  function messageId(root, index = 0) {
    const direct = directMessageId(root);
    if (direct) return direct;
    const text = messageText(root);
    return `loaded-${index}-${hashText(text)}`;
  }

  function messageRole(root) {
    return root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']") ? "bot" : "user";
  }

  // SpicyChat can replace a bot-message DOM id when the same turn is
  // regenerated. Anchor automatic timeline events to the turn slot instead of
  // only the response id so a replacement re-evaluates the existing event.
  function messageSlotKey(loadedRoots, index) {
    const root = loadedRoots?.[index];
    if (!root) return "";
    const role = messageRole(root);
    const direct = directMessageId(root);
    if (role === "user") return direct ? `user:${direct}` : `user-index:${index}`;

    let previousUserId = "";
    let botOrdinal = 0;
    for (let i = index - 1; i >= 0; i--) {
      const candidate = loadedRoots[i];
      if (messageRole(candidate) === "user") {
        previousUserId = directMessageId(candidate) || `index-${i}`;
        break;
      }
      if (messageRole(candidate) === "bot") botOrdinal += 1;
    }
    if (previousUserId) return `bot-after:${previousUserId}:${botOrdinal}`;

    let nextUserId = "";
    let reverseOrdinal = 0;
    for (let i = index + 1; i < loadedRoots.length; i++) {
      const candidate = loadedRoots[i];
      if (messageRole(candidate) === "user") {
        nextUserId = directMessageId(candidate) || `index-${i}`;
        break;
      }
      if (messageRole(candidate) === "bot") reverseOrdinal += 1;
    }
    if (nextUserId) return `bot-before:${nextUserId}:${reverseOrdinal}`;
    return direct ? `bot:${direct}` : `bot-index:${index}`;
  }

  function numberWord(value) {
    const word = String(value || "").toLowerCase();
    const map = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    if (Object.prototype.hasOwnProperty.call(map, word)) return map[word];
    const n = Number(word);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }

  function explicitPhase(text) {
    const value = String(text || "");
    if (/\b(?:morning|dawn|sunrise)\b/i.test(value)) return "morning";
    if (/\b(?:afternoon|midday|noon)\b/i.test(value)) return "afternoon";
    if (/\b(?:evening|sunset|dusk)\b/i.test(value)) return "evening";
    if (/\b(?:night|midnight)\b/i.test(value)) return "night";
    return "unknown";
  }

  function detectStrongTransition(text) {
    const value = clean(text);
    if (!value) return null;

    // Chibs' explicit long-chat notation is treated as a high-confidence anchor.
    // Markdown wrappers are tolerated, e.g. **Day 35:** something happened.
    const storydate = value.match(/(?:^|[.!?])\s*[*_#~`-]*\s*storydate\s+(\d{1,5})\.([0-4])\s*[*_]*\s*(?::|[-–—])?\s*[*_]*\s*(.{0,300})?/i);
    if (storydate) {
      const phase = CODE_PHASES[Number(storydate[2])] || "unknown";
      const note = clean(storydate[3] || "").slice(0, 300);
      return { setDay: clampDay(storydate[1]), deltaDays: 0, phase, trigger: `Storydate ${storydate[1]}.${storydate[2]}`, note, confidence: "high" };
    }

    const dayHeader = value.match(/(?:^|[.!?])\s*[*_#~`-]*\s*day\s+(\d{1,5})\b(?:\s*[,·|]?\s*(morning|afternoon|evening|night))?\s*[*_]*\s*(?::|[-–—])?\s*[*_]*\s*(.{0,300})?/i);
    if (dayHeader) {
      const phase = normalizePhase(dayHeader[2] || "unknown");
      const note = clean(dayHeader[3] || "").slice(0, 300);
      return { setDay: clampDay(dayHeader[1]), deltaDays: 0, phase, trigger: `Day ${dayHeader[1]}${phase !== "unknown" ? ` ${PHASE_LABELS[phase]}` : ""}`, note, confidence: "high" };
    }

    let match = value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:full\s+)?(?:day|days|night|nights)\s+later\b/i);
    if (match) {
      const days = numberWord(match[1]);
      return { setDay: 0, deltaDays: Math.max(1, days), phase: explicitPhase(match[0]), trigger: match[0], confidence: "high" };
    }

    match = value.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a)\s+weeks?\s+later\b/i);
    if (match) {
      const weeks = Math.max(1, numberWord(match[1]));
      return { setDay: 0, deltaDays: weeks * 7, phase: "unknown", trigger: match[0], confidence: "high" };
    }

    const strong = [
      [/\b(?:the\s+)?next\s+morning\b/i, 1, "morning"],
      [/\b(?:the\s+)?following\s+morning\b/i, 1, "morning"],
      [/\b(?:the\s+)?next\s+day\b/i, 1, "unknown"],
      [/\b(?:the\s+)?following\s+day\b/i, 1, "unknown"],
      [/\b(?:the\s+)?next\s+night\b/i, 1, "night"],
      [/\b(?:the\s+)?following\s+night\b/i, 1, "night"],
      [/\bafter\s+(?:sleeping\s+through\s+the\s+night|sleeping\s+all\s+night|a\s+(?:full\s+)?night'?s\s+sleep)\b/i, 1, "morning"],
      [/\bovernight\s+(?:passed|went\s+by|came\s+and\s+went)\b/i, 1, "morning"]
    ];
    for (const [regex, deltaDays, phase] of strong) {
      const found = value.match(regex);
      if (found) return { setDay: 0, deltaDays, phase, trigger: found[0], confidence: "high" };
    }

    // Explicit scene-time details should keep the phase accurate without
    // inventing another day transition. Strong next/following-day wording is
    // handled above first, so e.g. "next morning" still advances the day.
    const phaseRules = [
      [/\b(?:it\s+is|it's|it\s+was|now|currently)\s+(?:early\s+|late\s+)?(morning|afternoon|evening|night)\b/i, 1],
      [/\b(?:later\s+)?(?:this|that)\s+(morning|afternoon|evening|night)\b/i, 1],
      [/\b(morning|afternoon|evening|night)\s+(?:light|sunlight|sky|air)\b/i, 1],
      [/\b(?:at|around)\s+(dawn|sunrise|noon|midday|sunset|dusk|midnight)\b/i, 1]
    ];
    const phaseAlias = { dawn: "morning", sunrise: "morning", noon: "afternoon", midday: "afternoon", sunset: "evening", dusk: "evening", midnight: "night" };
    for (const [regex, group] of phaseRules) {
      const found = value.match(regex);
      if (!found) continue;
      const rawPhase = String(found[group] || "").toLowerCase();
      const phase = normalizePhase(phaseAlias[rawPhase] || rawPhase);
      if (phase !== "unknown") return { setDay: 0, deltaDays: 0, phase, trigger: found[0], confidence: "high" };
    }
    return null;
  }

  function detectAssistedTransition(text) {
    const value = clean(text);
    if (!value) return null;
    const rules = [
      [/\b(?:come|by)\s+morning\b/i, 1, "morning"],
      [/\bat\s+dawn\b/i, 0, "morning"],
      [/\blater\s+that\s+afternoon\b/i, 0, "afternoon"],
      [/\blater\s+that\s+evening\b/i, 0, "evening"],
      [/\blater\s+that\s+night\b/i, 0, "night"],
      [/\bthat\s+evening\b/i, 0, "evening"],
      [/\bthat\s+night\b/i, 0, "night"]
    ];
    for (const [regex, deltaDays, phase] of rules) {
      const found = value.match(regex);
      if (found) return { setDay: 0, deltaDays, phase, trigger: found[0], confidence: "medium" };
    }
    return null;
  }

  function recalc(entry) {
    let day = clampDay(entry?.startDay || 1);
    let phase = normalizePhase(entry?.startPhase);
    const events = [...(entry?.events || [])].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
    for (const event of events) {
      if (event.setDay > 0) day = clampDay(event.setDay);
      else if (event.deltaDays) day = clampDay(day + Number(event.deltaDays || 0));
      if (event.phase && event.phase !== "unknown") phase = normalizePhase(event.phase);
      else if ((event.deltaDays !== 0 || event.setDay > 0) && event.phase === "unknown") phase = "unknown";
    }
    return { day, phase };
  }

  function storydateCode(day, phase) {
    return `${clampDay(day)}.${PHASE_CODES[normalizePhase(phase)] ?? 0}`;
  }

  function formatSnapshot(snapshot) {
    if (!snapshot) return "Storydate —";
    return `Storydate ${snapshot.code} · Day ${snapshot.day}${snapshot.phase !== "unknown" ? ` · ${PHASE_LABELS[snapshot.phase]}` : ""}`;
  }

  function snapshotForEntry(entry) {
    if (!entry) return null;
    const current = recalc(entry);
    return {
      day: current.day,
      phase: current.phase,
      code: storydateCode(current.day, current.phase),
      pending: entry.pending?.length || 0,
      notes: Array.isArray(entry.notes) ? entry.notes : []
    };
  }

  function activeEntrySync() {
    const id = currentChatId();
    if (!id || !storeCache) return null;
    return storeCache[id] || null;
  }

  function getSnapshot() {
    return snapshotForEntry(activeEntrySync());
  }

  function contextLine(options = {}) {
    const settings = DS.state?.settings || {};
    if (!settings.enableStoryDayTracker || settings.storyDayTrackerIncludeInContext === false) return "";
    const snap = getSnapshot();
    if (!snap) return "";
    const yesterday = snap.day - 1;
    const dayBefore = snap.day - 2;
    const tomorrow = snap.day + 1;
    const dayAfter = snap.day + 2;
    const yesterdayText = yesterday >= 1 ? `Day ${yesterday}` : "before tracked Day 1";
    const dayBeforeText = dayBefore >= 1 ? `Day ${dayBefore}` : "before tracked Day 1";
    const lastNightText = yesterday >= 1 ? `Night of Day ${yesterday}` : "before tracked Day 1";
    let line = `Story timeline: Storydate ${snap.code} = Day ${snap.day}${snap.phase !== "unknown" ? `, ${snap.phase}` : ""}. Yesterday=${yesterdayText}; day before yesterday=${dayBeforeText}; last night=${lastNightText}; tonight=Night of Day ${snap.day}; tomorrow=Day ${tomorrow}; day after tomorrow=Day ${dayAfter}.`;
    if (options.includeNotes) {
      const manualNotes = [...snap.notes].map(note => ({
        day: note.day, phase: note.phase, text: note.text, createdAt: note.createdAt
      }));
      const explicitAnchors = (activeEntrySync()?.events || [])
        .filter(event => event.note && event.setDay > 0)
        .map(event => ({ day: event.setDay, phase: event.phase, text: event.note, createdAt: event.createdAt }));
      const notes = [...manualNotes, ...explicitAnchors]
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        .slice(0, 3)
        .reverse();
      if (notes.length) line += ` Timeline anchors: ${notes.map(note => `[Day ${note.day}${note.phase !== "unknown" ? ` ${note.phase}` : ""}] ${note.text}`).join(" | ")}.`;
    }
    return line;
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

  function ensureEntry(store, id, loadedRoots = roots()) {
    if (store[id]) return store[id];
    const last = loadedRoots[loadedRoots.length - 1];
    const entry = normalizeEntry({
      initialized: true,
      initializedAt: Date.now(),
      startDay: 1,
      startPhase: "unknown",
      boundaryMessageId: last ? messageId(last, loadedRoots.length - 1) : "",
      boundarySlotKey: last ? messageSlotKey(loadedRoots, loadedRoots.length - 1) : "",
      boundaryHash: last ? hashText(messageText(last)) : "",
      events: [], pending: [], notes: [], dismissed: {}, nextOrder: 1
    });
    store[id] = entry;
    scheduleSave("Started Internal Day Tracker");
    return entry;
  }

  function upsertAutoEvent(entry, loadedRoots, index, detected) {
    const root = loadedRoots[index];
    const id = messageId(root, index);
    const slotKey = messageSlotKey(loadedRoots, index);
    const text = messageText(root);
    const sourceHash = hashText(text);
    const existingIndex = entry.events.findIndex(event => event.kind !== "manual" && (
      (slotKey && event.slotKey === slotKey) || event.messageId === id
    ));
    if (!detected) {
      if (existingIndex >= 0) {
        entry.events.splice(existingIndex, 1);
        return true;
      }
      return false;
    }
    const existing = existingIndex >= 0 ? entry.events[existingIndex] : null;
    const next = normalizeEvent({
      id: existing?.id || `auto-${id}`,
      kind: existing?.kind === "accepted" ? "accepted" : "auto",
      messageId: id,
      slotKey,
      sourceHash,
      order: existing?.order || entry.nextOrder++,
      deltaDays: detected.deltaDays || 0,
      setDay: detected.setDay || 0,
      phase: detected.phase || "unknown",
      trigger: detected.trigger,
      note: detected.note || "",
      confidence: detected.confidence || "high",
      createdAt: existing?.createdAt || Date.now()
    });
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return false;
    if (existingIndex >= 0) entry.events[existingIndex] = next;
    else entry.events.push(next);
    return true;
  }

  function upsertPending(entry, loadedRoots, index, detected) {
    const root = loadedRoots[index];
    const id = messageId(root, index);
    const slotKey = messageSlotKey(loadedRoots, index);
    const text = messageText(root);
    const sourceHash = hashText(text);
    if (entry.dismissed?.[slotKey || id] === sourceHash || entry.dismissed?.[id] === sourceHash) return false;
    const existingEvent = entry.events.some(event => (slotKey && event.slotKey === slotKey) || event.messageId === id);
    if (existingEvent) {
      const before = entry.pending.length;
      entry.pending = entry.pending.filter(item => !((slotKey && item.slotKey === slotKey) || item.messageId === id));
      return entry.pending.length !== before;
    }
    if (!detected) {
      const before = entry.pending.length;
      entry.pending = entry.pending.filter(item => !((slotKey && item.slotKey === slotKey) || item.messageId === id));
      return entry.pending.length !== before;
    }
    const pendingIndex = entry.pending.findIndex(item => (slotKey && item.slotKey === slotKey) || item.messageId === id);
    const next = normalizePending({ id: `pending-${slotKey || id}`, messageId: id, slotKey, sourceHash, ...detected, createdAt: Date.now() });
    if (pendingIndex >= 0) {
      if (JSON.stringify(entry.pending[pendingIndex]) === JSON.stringify(next)) return false;
      entry.pending[pendingIndex] = next;
    } else entry.pending.push(next);
    return true;
  }

  function scanRoots(entry, loadedRoots, { all = false } = {}) {
    const mode = String(DS.state?.settings?.storyDayTrackerMode || "conservative");
    let changed = false;
    if (mode !== "assisted" && entry.pending.length) {
      entry.pending = [];
      changed = true;
    }
    if (mode === "manual") return changed;
    const existingEventIds = new Set(entry.events.filter(event => event.messageId).map(event => event.messageId));
    const existingEventSlots = new Set(entry.events.filter(event => event.slotKey).map(event => event.slotKey));
    const slotKeys = loadedRoots.map((root, index) => messageSlotKey(loadedRoots, index));
    let boundaryIndex = entry.boundarySlotKey ? slotKeys.indexOf(entry.boundarySlotKey) : -1;
    if (boundaryIndex < 0 && entry.boundaryMessageId) {
      boundaryIndex = loadedRoots.findIndex((root, index) => messageId(root, index) === entry.boundaryMessageId);
    }
    if (all) boundaryIndex = -1;

    for (let index = 0; index < loadedRoots.length; index++) {
      const root = loadedRoots[index];
      const id = messageId(root, index);
      const slotKey = slotKeys[index];
      const text = messageText(root);
      const boundaryChanged = boundaryIndex === index && entry.boundaryHash && hashText(text) !== entry.boundaryHash;
      const shouldInspect = all
        || existingEventIds.has(id)
        || (slotKey && existingEventSlots.has(slotKey))
        || (boundaryIndex >= 0 ? index > boundaryIndex || boundaryChanged : false);
      if (!shouldInspect) continue;
      if (!text) continue;
      const strong = detectStrongTransition(text);
      if (upsertAutoEvent(entry, loadedRoots, index, strong)) changed = true;
      if (mode === "assisted" && !strong) {
        if (upsertPending(entry, loadedRoots, index, detectAssistedTransition(text))) changed = true;
      } else {
        const before = entry.pending.length;
        entry.pending = entry.pending.filter(item => !((slotKey && item.slotKey === slotKey) || item.messageId === id));
        if (entry.pending.length !== before) changed = true;
      }
    }

    const last = loadedRoots[loadedRoots.length - 1];
    if (last) {
      const lastIndex = loadedRoots.length - 1;
      const lastId = messageId(last, lastIndex);
      const lastSlotKey = slotKeys[lastIndex] || messageSlotKey(loadedRoots, lastIndex);
      const lastHash = hashText(messageText(last));
      if (lastId && (entry.boundaryMessageId !== lastId || entry.boundarySlotKey !== lastSlotKey || entry.boundaryHash !== lastHash)) {
        entry.boundaryMessageId = lastId;
        entry.boundarySlotKey = lastSlotKey;
        entry.boundaryHash = lastHash;
        changed = true;
      }
    }
    return changed;
  }

  async function scanLoadedHistory() {
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return;
    const loaded = roots();
    const entry = ensureEntry(store, id, loaded);
    const manual = entry.events
      .filter(event => event.kind === "manual")
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    entry.events = [];
    entry.pending = [];
    entry.nextOrder = 1;
    // Scan in current DOM order. This is explicitly user-requested and is the
    // opt-in path for existing chats where older loaded messages should count.
    for (let index = 0; index < loaded.length; index++) {
      const strong = detectStrongTransition(messageText(loaded[index]));
      if (strong) upsertAutoEvent(entry, loaded, index, strong);
      if (String(DS.state?.settings?.storyDayTrackerMode || "conservative") === "assisted" && !strong) {
        upsertPending(entry, loaded, index, detectAssistedTransition(messageText(loaded[index])));
      }
    }
    // Manual adjustments are current user corrections. Keep them after the
    // rebuilt automatic history so a correction remains authoritative.
    for (const item of manual) {
      entry.events.push(normalizeEvent({ ...item, order: entry.nextOrder++ }));
    }
    const last = loaded[loaded.length - 1];
    entry.boundaryMessageId = last ? messageId(last, loaded.length - 1) : "";
    entry.boundarySlotKey = last ? messageSlotKey(loaded, loaded.length - 1) : "";
    entry.boundaryHash = last ? hashText(messageText(last)) : "";
    await flushSave("Rebuilt Internal Day Tracker from loaded history");
    DS.updateQuickPanel?.({ forceLayout: true });
  }

  async function addManualEvent({ setDay = 0, deltaDays = 0, phase = "unknown", note = "" } = {}) {
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return false;
    const entry = ensureEntry(store, id);
    entry.events.push(normalizeEvent({
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "manual",
      order: entry.nextOrder++,
      setDay,
      deltaDays,
      phase,
      note,
      trigger: note || (setDay ? `Set Day ${setDay}` : `${deltaDays >= 0 ? "+" : ""}${deltaDays} day${Math.abs(deltaDays) === 1 ? "" : "s"}`),
      confidence: "manual",
      createdAt: Date.now()
    }));
    await flushSave("Adjusted Internal Day Tracker");
    DS.updateQuickPanel?.();
    return true;
  }

  async function addTimelineNote(text) {
    const value = clean(text);
    if (!value) return false;
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return false;
    const entry = ensureEntry(store, id);
    const snap = snapshotForEntry(entry);
    entry.notes.push({ id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, day: snap.day, phase: snap.phase, text: value.slice(0, 700), createdAt: Date.now() });
    entry.notes = entry.notes.slice(-80);
    await flushSave("Added Internal Day Tracker anchor");
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
    const dialog = make("div", { className: "ds-tool-modal-dialog ds-story-day-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Internal Day Tracker" });
    const head = make("div", { className: "ds-tool-modal-head" });
    head.append(make("h2", {}, "Internal Day Tracker"));
    const close = make("button", { className: "ds-tool-modal-close", type: "button", "aria-label": "Close" }, "×");
    head.append(close);

    const summary = make("div", { className: "ds-story-day-summary" });
    const currentText = make("strong");
    const subText = make("span", { className: "ds-qol-small-note" });
    summary.append(currentText, subText);

    const manual = make("div", { className: "ds-story-day-controls" });
    const minus = make("button", { type: "button" }, "− Day");
    const plus = make("button", { type: "button" }, "+ Day");
    const dayInput = make("input", { type: "number", min: "1", max: "99999", step: "1", "aria-label": "Story day" });
    const phaseSelect = make("select", { "aria-label": "Story time of day" });
    PHASE_ORDER.forEach(phase => phaseSelect.append(make("option", { value: phase }, PHASE_LABELS[phase])));
    const set = make("button", { type: "button" }, "Set storydate");
    manual.append(minus, plus, dayInput, phaseSelect, set);

    const actions = make("div", { className: "ds-tool-button-row" });
    const scan = make("button", { type: "button" }, "Scan loaded history");
    const undo = make("button", { type: "button" }, "Undo last transition");
    const copy = make("button", { type: "button" }, "Copy context line");
    const reset = make("button", { type: "button", className: "ds-danger" }, "Reset this chat");
    actions.append(scan, undo, copy, reset);

    const noteTitle = make("h3", {}, "Timeline anchor");
    const noteRow = make("div", { className: "ds-story-day-note-row" });
    const noteInput = make("input", { type: "text", maxlength: "700", placeholder: "e.g. Day 35: {{user}} and {{char}} reached the safehouse" });
    const addNote = make("button", { type: "button" }, "Add anchor");
    noteRow.append(noteInput, addNote);

    const pendingTitle = make("h3", {}, "Suggested transitions");
    const pendingHost = make("div", { className: "ds-story-day-list" });
    const historyTitle = make("h3", {}, "Recent timeline");
    const historyHost = make("div", { className: "ds-story-day-list" });

    function render() {
      entry = (storeCache || {})[id] || entry;
      const snap = snapshotForEntry(entry);
      currentText.textContent = formatSnapshot(snap);
      subText.textContent = "Storydate uses day.phase: 0 unspecified, 1 morning, 2 afternoon, 3 evening, 4 night. Example: 35.3 = Day 35 evening.";
      dayInput.value = String(snap.day);
      phaseSelect.value = snap.phase;

      pendingHost.replaceChildren();
      if (!entry.pending.length) pendingHost.append(make("p", { className: "ds-qol-small-note" }, "No pending suggestions."));
      for (const item of [...entry.pending].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))) {
        const row = make("div", { className: "ds-story-day-item" });
        const desc = make("span", {}, `${item.trigger} → ${item.deltaDays ? `+${item.deltaDays} day${item.deltaDays === 1 ? "" : "s"}` : "same day"}${item.phase !== "unknown" ? `, ${PHASE_LABELS[item.phase]}` : ""}`);
        const buttons = make("span", { className: "ds-story-day-item-actions" });
        const apply = make("button", { type: "button" }, "Apply");
        const dismiss = make("button", { type: "button" }, "Dismiss");
        apply.addEventListener("click", async () => {
          const target = entry.pending.find(p => p.id === item.id);
          if (!target) return;
          entry.events.push(normalizeEvent({ ...target, id: `accepted-${target.messageId}`, kind: "accepted", order: entry.nextOrder++, confidence: "medium" }));
          entry.pending = entry.pending.filter(p => p.id !== item.id);
          await flushSave("Accepted Internal Day Tracker suggestion");
          DS.updateQuickPanel?.();
          render();
        });
        dismiss.addEventListener("click", async () => {
          entry.dismissed[item.slotKey || item.messageId] = item.sourceHash;
          entry.pending = entry.pending.filter(p => p.id !== item.id);
          await flushSave("Dismissed Internal Day Tracker suggestion");
          render();
        });
        buttons.append(apply, dismiss);
        row.append(desc, buttons);
        pendingHost.append(row);
      }

      historyHost.replaceChildren();
      const history = [...entry.events].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).slice(-12);
      const notes = [...entry.notes].sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).slice(-8);
      if (!history.length && !notes.length) historyHost.append(make("p", { className: "ds-qol-small-note" }, "No transitions or anchors yet."));
      for (const event of history) {
        const bits = [];
        if (event.setDay) bits.push(`Day ${event.setDay}`);
        else if (event.deltaDays) bits.push(`${event.deltaDays > 0 ? "+" : ""}${event.deltaDays} day${Math.abs(event.deltaDays) === 1 ? "" : "s"}`);
        if (event.phase !== "unknown") bits.push(PHASE_LABELS[event.phase]);
        const label = event.kind === "manual" ? "Manual" : event.kind === "accepted" ? "Accepted" : "Auto";
        historyHost.append(make("div", { className: "ds-story-day-item" }, `${label}: ${bits.join(" · ") || "timeline marker"}${event.trigger ? ` — ${event.trigger}` : ""}${event.note ? ` · ${event.note}` : ""}`));
      }
      for (const item of notes) historyHost.append(make("div", { className: "ds-story-day-item" }, `Anchor · Day ${item.day}${item.phase !== "unknown" ? ` ${item.phase}` : ""}: ${item.text}`));
    }

    minus.addEventListener("click", async () => { await addManualEvent({ deltaDays: -1 }); render(); });
    plus.addEventListener("click", async () => { await addManualEvent({ deltaDays: 1 }); render(); });
    set.addEventListener("click", async () => { await addManualEvent({ setDay: clampDay(dayInput.value), phase: phaseSelect.value }); render(); });
    scan.addEventListener("click", async () => { await scanLoadedHistory(); entry = storeCache[id]; render(); });
    undo.addEventListener("click", async () => {
      if (!entry.events.length) return;
      const latest = [...entry.events].sort((a, b) => Number(b.order || 0) - Number(a.order || 0))[0];
      entry.events = entry.events.filter(item => item.id !== latest.id);
      await flushSave("Undid Internal Day Tracker transition");
      DS.updateQuickPanel?.();
      render();
    });
    copy.addEventListener("click", async () => {
      const text = contextLine({ includeNotes: true });
      if (!text) return;
      try { await navigator.clipboard.writeText(text); DS.setQuickStatus?.("Story timeline context copied."); }
      catch { DS.setQuickStatus?.("Could not copy Story timeline context."); }
    });
    reset.addEventListener("click", async () => {
      if (!window.confirm("Reset the Internal Day Tracker for this chat? Timeline transitions and anchors for this chat will be removed.")) return;
      delete storeCache[id];
      ensureEntry(storeCache, id, roots());
      await flushSave("Reset Internal Day Tracker");
      entry = storeCache[id];
      DS.updateQuickPanel?.();
      render();
    });
    addNote.addEventListener("click", async () => {
      if (await addTimelineNote(noteInput.value)) {
        noteInput.value = "";
        entry = storeCache[id];
        render();
      }
    });
    close.addEventListener("click", () => modal.remove());
    backdrop.addEventListener("click", () => modal.remove());
    modal.addEventListener("keydown", event => { if (event.key === "Escape") modal.remove(); });

    dialog.append(head, summary, manual, actions, noteTitle, noteRow, pendingTitle, pendingHost, historyTitle, historyHost);
    modal.append(backdrop, dialog);
    document.documentElement.append(modal);
    render();
  }

  DS.applyStoryDayTracker = async function applyStoryDayTracker() {
    const settings = DS.state?.settings || {};
    if (!settings.enableStoryDayTracker || !DS.isSingleChatPage?.()) {
      DS.state.storyDayTrackerWasActive = false;
      document.getElementById(MODAL_ID)?.remove();
      return;
    }
    DS.state.storyDayTrackerWasActive = true;
    const store = await ensureLoaded();
    const id = currentChatId();
    if (!id) return;
    const loaded = roots();
    const entry = ensureEntry(store, id, loaded);
    if (scanRoots(entry, loaded)) scheduleSave("Updated Internal Day Tracker from chat transitions");
    DS.updateQuickPanel?.();
  };

  DS.removeStoryDayTracker = function removeStoryDayTracker() {
    document.getElementById(MODAL_ID)?.remove();
    DS.state.storyDayTrackerWasActive = false;
  };

  DS.openStoryDayTracker = openManager;
  DS.getStoryDaySnapshot = getSnapshot;
  DS.getStoryDayContextLine = contextLine;
  DS.scanStoryDayLoadedHistory = scanLoadedHistory;
  DS.STORY_DAY_TRACKER_KEY = STORAGE_KEY;
})();

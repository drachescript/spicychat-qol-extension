(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const KEY = "contextKeeperData";
  const MODAL_ID = "ds-context-keeper-modal";
  const MESSAGE_SELECTOR = "div[id^='message-']";
  const BUTTON_CLASS = "ds-context-keep-button";
  const MAX_DETAIL = 1200;

  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with", "from", "as", "is", "was",
    "are", "were", "be", "been", "being", "it", "this", "that", "these", "those", "he", "she", "they", "them", "his",
    "her", "their", "you", "your", "i", "me", "my", "we", "our", "so", "very", "just", "still", "now", "then"
  ]);

  const CATEGORY_LABELS = {
    identity: "Identity/background",
    relationship: "Relationships/dynamics",
    preference: "Preferences",
    rule: "Rules/boundaries",
    history: "History/routines",
    knowledge: "Knowledge/secrets",
    plans: "Plans/promises",
    ability: "Skills/abilities",
    need: "Needs/triggers",
    location: "Location/scene",
    state: "Current state",
    possession: "Possessions",
    other: "Other continuity"
  };

  const autoState = {
    timer: null,
    running: false,
    route: ""
  };

  function clean(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currentChatId() {
    return DS.chatIdFromHref?.(location.href || "") || location.pathname;
  }

  function normalizeCategory(category) {
    const value = String(category || "other").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value)) return value;
    return value === "plan" ? "plans" : "other";
  }

  function normalize(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const output = {};
    for (const [chatId, entry] of Object.entries(source)) {
      if (!entry || typeof entry !== "object") continue;
      const details = Array.isArray(entry.details) ? entry.details : [];
      const normalizedDetails = [];
      for (let index = 0; index < details.length; index++) {
        const item = details[index];
        const text = clean(typeof item === "string" ? item : item?.text).slice(0, MAX_DETAIL);
        if (!text) continue;
        const detail = {
          id: String(item?.id || `detail-${index}-${Date.now()}`),
          text,
          category: normalizeCategory(item?.category),
          source: String(item?.source || "manual"),
          createdAt: Number(item?.createdAt) || Date.now(),
          score: Number(item?.score) || 0,
          enabled: item?.enabled !== false,
          messageId: clean(item?.messageId || item?.message_id || "").slice(0, 160),
          role: clean(item?.role || item?.speaker || "").slice(0, 40),
          storyDay: Number(item?.storyDay) > 0 ? Math.floor(Number(item.storyDay)) : 0,
          storyPhase: ["morning", "afternoon", "evening", "night", "unknown"].includes(String(item?.storyPhase || "")) ? String(item.storyPhase) : "unknown",
          storydate: clean(item?.storydate || "").slice(0, 40)
        };
        if (normalizedDetails.some(existing => isSimilarText(existing.text, detail.text))) continue;
        normalizedDetails.push(detail);
      }
      output[String(chatId)] = {
        details: normalizedDetails,
        lastRecapAt: Number(entry.lastRecapAt) || 0,
        lastRecapMessageCount: Number(entry.lastRecapMessageCount) || 0,
        lastAutoScanMessageCount: Math.max(0, Number(entry.lastAutoScanMessageCount) || 0),
        lastAutoScanAt: Number(entry.lastAutoScanAt) || 0
      };
    }
    return output;
  }

  async function readStore() {
    const result = await DS.storageGet?.([KEY]);
    return normalize(result?.[KEY]);
  }

  async function writeStore(store, label = "Updated Context Keeper", { recordChange = true } = {}) {
    const beforeResult = await DS.storageGet?.([KEY]);
    const before = normalize(beforeResult?.[KEY]);
    const after = normalize(store);
    await DS.storageSet?.({ [KEY]: after });
    if (recordChange && JSON.stringify(before) !== JSON.stringify(after)) {
      await DS.recordLocalChange?.(label, { [KEY]: before }, { [KEY]: after });
    }
  }

  function roots() {
    return Array.from(document.querySelectorAll(MESSAGE_SELECTOR))
      .filter(root => !root.parentElement?.closest?.(MESSAGE_SELECTOR));
  }

  function messageText(root) {
    if (typeof DS.getCachedMessageText === "function") return DS.getCachedMessageText(root);
    const candidates = Array.from(root.querySelectorAll("div[class*='overflow-wrap'], div[class*='break-words'], span.leading-6"))
      .map(el => clean(el.innerText || el.textContent))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (candidates.length) return candidates[0];
    const clone = root.cloneNode(true);
    clone.querySelectorAll("button, svg, .ds-message-quick-actions, .ds-generation-metadata, .ds-rp-repair-toggle, .ds-context-keep-button").forEach(el => el.remove());
    return clean(clone.textContent);
  }

  function messageIdForRoot(root) {
    return clean(String(root?.id || "").replace(/^message-/, "")).slice(0, 160);
  }

  function messageRoleForRoot(root) {
    return root?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']") ? "AI" : "You";
  }

  function sourceRoot(messageId) {
    const id = clean(messageId);
    if (!id) return null;
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "\$&");
    return document.querySelector(`#message-${escaped}`);
  }

  function jumpToSource(detail) {
    const root = sourceRoot(detail?.messageId);
    if (!root) {
      DS.setQuickStatus?.("That source message is not currently loaded. Load older messages first, then try Jump again.");
      return false;
    }
    try { root.scrollIntoView({ behavior: "smooth", block: "center" }); }
    catch { root.scrollIntoView?.({ block: "center" }); }
    root.classList.add("ds-context-source-highlight");
    setTimeout(() => root.classList.remove("ds-context-source-highlight"), 1800);
    return true;
  }

  function categoryFor(text) {
    const value = clean(text).toLowerCase();
    const groups = [
      ["rule", /\b(rule|boundary|boundaries|must|mustn'?t|never|always has to|not optional|allowed|forbidden|permission|can'?t|cannot|shouldn'?t|safe word|safeword|calls? (?:him|her|them)|address(?:es)? as|don'?t call|do not call|won'?t use (?:that|the) term|stop using|doesn'?t enjoy being|does not enjoy being|being called)\b/i],
      ["need", /\b(trigger(?:s|ed)?|panic|freeze response|ground(?:ing|ed)?|needs? (?:space|quiet|predictability|control|routine)|sensitive to|overwhelm(?:ed|ing)?|noise[- ]cancel(?:ing|ling)|headphones?|unfamiliar places?|predictab(?:le|ility)|feels? (?:safe|unsafe|trapped)|discomfort|calms? (?:him|her|them)|comforted by)\b/i],
      ["identity", /\b(real name|identity|alias|called|name is|works? as|job|occupation|age|years old|from [a-z]|lives? (?:in|with)|roommate|yakuza boss|doctor|surgeon|mechanic|racer|programmer|developer)\b/i],
      ["ability", /\b(skilled|expert|experienced|trained|training|talent|ability|abilities|capable|proficient|elite[- ]level|professional|legendary status|mechanical experience|motorcycle control|riding skills?|coding abilities?|built an? (?:antivirus|program|system)|decompiles?|decrypts?|firearms?|shooting range|assemble and disassemble)\b/i],
      ["relationship", /\b(friend|best friend|girlfriend|boyfriend|wife|husband|lover|partner|dating|married|sister|brother|mother|father|roommate|trusts?|distrusts?|loves?|hates?|dynamic|belongs? to|ownership|together|relationship|commitment|committed|grow old|long[- ]term|only person|first person|protect(?:s|ive)?|cherish)\b/i],
      ["preference", /\b(likes?|dislikes?|prefers?|favorite|favourite|enjoys?|doesn'?t like|does not like|hates?|would rather|choice|requested?|asks? for|chooses?|ordered?|food|drink|music|color|colour|exactly what (?:he|she|they|i) like|water bottle|breakfast|pancakes?|coffee|milk|spaghetti|fried eggs?)\b/i],
      ["history", /\b(for \d+ years?|\d+ years?|used to|previously|before they|before he|before she|in the past|grew up|since childhood|since (?:he|she|they|i) (?:was|were)|earliest memories|learned from|history|habit|routine|usually|normally|always|every (?:day|night|morning|week)|friend (?:died|was killed)|survived the crash)\b/i],
      ["knowledge", /\b(knows?|doesn'?t know|didn'?t know|told|secret|hid(?:den|e|ing)?|revealed?|learned?|realized?|aware|unaware|found out|remembers?|forgot|recognizes?|identified|memorized)\b/i],
      ["plans", /\b(promised?|agreed?|plan(?:ned|s)?|tomorrow|tonight|later|meet(?:ing)?|will|going to|supposed to|goal|intend(?:s|ed)?|next time|after this|first date|release plan|vow(?:s|ed)?|pledge(?:s|d)?)\b/i],
      ["location", /\b(at the|in the|inside|outside|staying|hotel|house|room|garage|forest|city|school|office|hospital|basement|apartment|dock|river|park|location|ramen shop|botanical gardens?)\b/i],
      ["state", /\b(injured?|hurt|wound(?:ed)?|broken|bleeding|tired|exhausted|angry|afraid|sick|pregnant|missing|dead|alive|unconscious|awake|sore|asleep|sleeping|relaxed|calm)\b/i],
      ["possession", /\b(has|have|holding|carrying|owns?|gave|took|stole|key|keycard|weapon|phone|ring|letter|item|wears?|keeps?|katana|gaming setup|motorcycle|bike)\b/i]
    ];
    for (const [category, re] of groups) if (re.test(value)) return category;
    return "other";
  }

  function tokens(text) {
    return new Set(clean(text).toLowerCase()
      .replace(/[^a-z0-9'’-]+/g, " ")
      .split(/\s+/g)
      .map(token => token.replace(/^['’]+|['’]+$/g, ""))
      .filter(token => token.length > 2 && !STOP_WORDS.has(token)));
  }

  function isSimilarText(a, b) {
    const left = clean(a).toLowerCase();
    const right = clean(b).toLowerCase();
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.length > 35 && right.length > 35 && (left.includes(right) || right.includes(left))) return true;

    const aTokens = tokens(left);
    const bTokens = tokens(right);
    if (!aTokens.size || !bTokens.size) return false;
    let common = 0;
    for (const token of aTokens) if (bTokens.has(token)) common++;
    const union = aTokens.size + bTokens.size - common;
    const jaccard = union ? common / union : 0;
    const smallerCoverage = common / Math.min(aTokens.size, bTokens.size);
    return jaccard >= 0.64 || (common >= 5 && smallerCoverage >= 0.78);
  }

  function hasPersistentCue(value) {
    return /\b(prefers?|favorite|favourite|enjoys?|likes?|dislikes?|hates?|always|never|usually|normally|habit|routine|for \d+ years?|\d+ years?|since childhood|since (?:he|she|they|i) (?:was|were)|grew up|learned from|promised?|agreed?|committed|commitment|relationship|partner|married|dating|trusts?|secret|identity|skill|skilled|experienced|trained|trigger|boundary|doesn'?t enjoy|does not enjoy|needs? (?:space|quiet|predictability|control|routine)|safe|unsafe|protective|long[- ]term|grow old|first date)\b/i.test(value);
  }

  function scoreSentence(text) {
    const value = clean(text);
    if (value.length < 18 || value.length > 520) return 0;

    const category = categoryFor(value);
    const base = {
      identity: 7,
      relationship: 7,
      preference: 6,
      rule: 8,
      history: 7,
      knowledge: 6,
      plans: 6,
      ability: 7,
      need: 8,
      location: 3,
      state: 2,
      possession: 3,
      other: 0
    }[category] || 0;

    let score = base;
    const persistent = hasPersistentCue(value);

    if (/\b(never|always|usually|normally|before|after|only|first|last|for \d+ years?|\d+ years?|since childhood)\b/i.test(value)) score += 2;
    if (/\b(prefers?|favorite|favourite|enjoys?|likes?|promised?|agreed?|trusts?|married|dating|partner|secret|identity|habit|routine|boundary|trigger|skilled|experienced)\b/i.test(value)) score += 2;
    if (/\b(don'?t call|do not call|won'?t use (?:that|the) term|stop immediately|stop using|thank you for correcting|doesn'?t enjoy being|does not enjoy being)\b/i.test(value)) score += 4;
    if (/\b[A-Z][a-z]{2,}(?:[-’'][A-Z]?[a-z]+)?\b/.test(value)) score += 1;
    if (/\b(is|was|has|had|knows|told|promised|agreed|needs|likes|prefers|loves|trusts|works|built|owns)\b/i.test(value)) score += 1;

    if (/\?$/.test(value)) score -= 2;
    if (/^(what|why|how|where|when|who)\b/i.test(value)) score -= 2;

    const transientPhysical = /\b(breath|eyes?|gaze|fingers?|hands?|body|hips?|thighs?|lips?|mouth|chest|heartbeat|shudder|trembl|whimper|moan|walks?|sits?|stands?|leans?|nods?|smiles?|grins?|swallows?|blush|pulse|kisses?|kissed|bites?|biting|grips?|gripping|wraps?|pressing|convuls|climax|arousal|scrub top|against (?:a|the) wall)\b/i.test(value);
    const sceneMoment = /\b(during (?:intimacy|their kiss|the moment)|in (?:a|this) moment|right now|at that moment|currently|shifts? her weight|pulling .* closer|leans? in|whispers?|winks?|sets? .* on .* plate)\b/i.test(value);
    if (transientPhysical && !persistent) score -= 5;
    if (sceneMoment && !persistent) score -= 3;

    const dynamicOnly = category === "relationship" && /\b(dominant|dominance|submissive|submission|surrender|claim(?:s|ed)?|possessive)\b/i.test(value);
    if (dynamicOnly && transientPhysical && !/\b(dynamic|relationship|prefers?|likes?|always|private|public|partner|commitment)\b/i.test(value)) score -= 4;

    if (category === "state" && !/\b(still|ongoing|chronic|remains?|currently has|missing|dead|alive)\b/i.test(value)) score -= 2;
    if (/\b(the room|the river|the leaves|sunlight|wind|atmosphere|clearing)\b/i.test(value) && category === "location") score -= 2;
    if (/\b(last one to|search party|light is going to be perfect|what's the plan)\b/i.test(value)) score -= 3;

    return Math.max(0, score);
  }

  function splitSentences(text) {
    const normalized = String(text || "").replace(/\n+/g, " ");
    return normalized
      .split(/(?<=[.!?])\s+(?=[A-Z0-9*\[(])|\s*[;]\s*/g)
      .map(value => clean(value.replace(/^\*+|\*+$/g, "")))
      .filter(Boolean);
  }

  function scanRoots(messageRoots, minScore = 5, limit = 60) {
    const candidates = [];
    for (const root of messageRoots || []) {
      for (const sentence of splitSentences(messageText(root))) {
        const score = scoreSentence(sentence);
        if (score < minScore) continue;
        if (candidates.some(item => isSimilarText(item.text, sentence))) continue;
        candidates.push({
          text: sentence.slice(0, MAX_DETAIL),
          category: categoryFor(sentence),
          score,
          messageId: messageIdForRoot(root),
          role: messageRoleForRoot(root)
        });
      }
    }
    return candidates
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
      .slice(0, limit);
  }

  function scanLoaded() {
    return scanRoots(roots(), 5, 60);
  }

  function autoSensitivityThreshold() {
    const mode = String(DS.state?.settings?.contextKeeperAutoSensitivity || "balanced");
    if (mode === "strict") return 8;
    if (mode === "broad") return 4;
    return 6;
  }

  function autoCaptureEvery() {
    return Math.max(1, Math.min(20, Number(DS.state?.settings?.contextKeeperAutoEveryMessages) || 4));
  }

  function autoCaptureCap() {
    return Math.max(20, Math.min(300, Number(DS.state?.settings?.contextKeeperAutoMaxDetails) || 120));
  }

  function trimAutomaticDetails(details, maxAutomatic) {
    const list = Array.isArray(details) ? details : [];
    const auto = list.filter(detail => detail?.source === "auto");
    if (auto.length <= maxAutomatic) return list;
    const keepAutoIds = new Set([...auto]
      .sort((a, b) => detailPriority(b) - detailPriority(a) || Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, maxAutomatic)
      .map(detail => detail.id));
    return list.filter(detail => detail?.source !== "auto" || keepAutoIds.has(detail.id));
  }

  async function runAutomaticCapture() {
    if (autoState.running) return;
    const cfg = DS.state?.settings || {};
    if (!cfg.enabled || !cfg.enableContextKeeper || cfg.contextKeeperAutoCapture === false || !DS.isSingleChatPage?.()) return;
    autoState.running = true;
    try {
      const messageRoots = roots();
      const messageCount = messageRoots.length;
      if (!messageCount) return;

      const store = await readStore();
      const id = currentChatId();
      const entry = store[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0, lastAutoScanMessageCount: 0, lastAutoScanAt: 0 };
      const every = autoCaptureEvery();
      const lastCount = Math.max(0, Number(entry.lastAutoScanMessageCount) || 0);
      const delta = Math.max(0, messageCount - lastCount);
      if (lastCount > 0 && delta < every) return;
      if (lastCount === 0 && messageCount < every) return;

      // Only inspect the newest small batch. This avoids rescanning a long loaded
      // history and also avoids treating manually loaded old messages as a fresh
      // automatic-capture pass.
      const batchSize = Math.min(messageCount, Math.max(every, Math.min(12, delta || every)));
      const candidates = scanRoots(messageRoots.slice(-batchSize), autoSensitivityThreshold(), 24);
      const story = DS.getStoryDaySnapshot?.() || null;
      let added = 0;

      for (const candidate of candidates) {
        const text = clean(candidate.text).slice(0, MAX_DETAIL);
        if (!text || entry.details.some(detail => isSimilarText(detail.text, text))) continue;
        entry.details.push({
          id: `detail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          text,
          category: normalizeCategory(candidate.category || categoryFor(text)),
          source: "auto",
          score: Number(candidate.score) || scoreSentence(text),
          enabled: true,
          messageId: clean(candidate.messageId || "").slice(0, 160),
          role: clean(candidate.role || "").slice(0, 40),
          storyDay: Number(story?.day || 0),
          storyPhase: story?.phase || "unknown",
          storydate: clean(story?.code || "").slice(0, 40),
          createdAt: Date.now()
        });
        added++;
      }

      entry.details = trimAutomaticDetails(entry.details, autoCaptureCap());
      entry.lastAutoScanMessageCount = messageCount;
      entry.lastAutoScanAt = Date.now();
      store[id] = entry;
      await writeStore(store, "Context Keeper automatic capture", { recordChange: false });
      if (added) DS.setQuickStatus?.(`Context Keeper kept ${added} new continuity detail${added === 1 ? "" : "s"}.`);
    } finally {
      autoState.running = false;
    }
  }

  function scheduleAutomaticCapture() {
    const cfg = DS.state?.settings || {};
    const route = `${location.pathname}${location.search}`;
    if (autoState.route !== route) {
      autoState.route = route;
      clearTimeout(autoState.timer);
      autoState.timer = null;
    }
    if (!cfg.enabled || !cfg.enableContextKeeper || cfg.contextKeeperAutoCapture === false || !DS.isSingleChatPage?.()) {
      clearTimeout(autoState.timer);
      autoState.timer = null;
      return;
    }
    clearTimeout(autoState.timer);
    autoState.timer = setTimeout(() => {
      autoState.timer = null;
      runAutomaticCapture().catch(error => DS.runtimeLog?.("warn", "context-keeper", "Automatic capture failed", error));
    }, 1200);
  }

  function make(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "className") el.className = value;
      else if (key === "type") el.type = value;
      else if (key === "checked") el.checked = !!value;
      else el.setAttribute(key, value);
    }
    if (text) el.textContent = text;
    return el;
  }

  async function addDetail(text, { category = "", source = "manual", score = 0, enabled = true, messageId = "", role = "" } = {}) {
    const value = clean(text).slice(0, MAX_DETAIL);
    if (!value) return false;
    const store = await readStore();
    const id = currentChatId();
    const entry = store[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0 };
    if (entry.details.some(detail => isSimilarText(detail.text, value))) return false;
    entry.details.push({
      id: `detail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: value,
      category: normalizeCategory(category || categoryFor(value)),
      source,
      score: Number(score) || scoreSentence(value),
      enabled: enabled !== false,
      messageId: clean(messageId).slice(0, 160),
      role: clean(role).slice(0, 40),
      createdAt: Date.now()
    });
    store[id] = entry;
    await writeStore(store);
    return true;
  }

  async function addManyDetails(values, { source = "manual" } = {}) {
    const store = await readStore();
    const id = currentChatId();
    const entry = store[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0 };
    let added = 0;
    let skipped = 0;

    for (const value of values || []) {
      const item = value && typeof value === "object" ? value : { text: value };
      const text = clean(item.text).slice(0, MAX_DETAIL);
      if (!text) continue;
      if (entry.details.some(detail => isSimilarText(detail.text, text))) {
        skipped++;
        continue;
      }
      const itemSource = clean(item.source || source || "manual") || "manual";
      const story = DS.getStoryDaySnapshot?.() || null;
      entry.details.push({
        id: `detail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        text,
        category: normalizeCategory(item.category || categoryFor(text)),
        source: itemSource,
        score: Number(item.score) || (itemSource === "memory" ? Math.max(8, scoreSentence(text)) : scoreSentence(text)),
        enabled: item.enabled !== false,
        messageId: clean(item.messageId || item.message_id || "").slice(0, 160),
        role: clean(item.role || item.speaker || "").slice(0, 40),
        storyDay: Number(item.storyDay) > 0 ? Math.floor(Number(item.storyDay)) : Number(story?.day || 0),
        storyPhase: item.storyPhase || story?.phase || "unknown",
        storydate: clean(item.storydate || story?.code || "").slice(0, 40),
        createdAt: Number(item.createdAt) || Date.now()
      });
      added++;
    }

    if (added) {
      store[id] = entry;
      await writeStore(store);
    }
    return { added, skipped };
  }

  function recapMode() {
    const mode = String(DS.state?.settings?.contextKeeperRecapSize || "balanced");
    return ["compact", "balanced", "full"].includes(mode) ? mode : "balanced";
  }

  function detailPriority(detail) {
    const sourceBonus = { manual: 6, memory: 6, selection: 5, message: 4, auto: 3, scan: 2 }[detail.source] || 1;
    const categoryBonus = {
      identity: 6,
      relationship: 6,
      rule: 6,
      history: 5,
      preference: 5,
      knowledge: 5,
      plans: 5,
      ability: 5,
      need: 6,
      possession: 3,
      state: 2,
      location: 2,
      other: 1
    }[detail.category] || 1;
    return Number(detail.score || 0) + sourceBonus + categoryBonus;
  }

  function detailsForRecap(details) {
    const enabled = (details || []).filter(detail => detail.enabled !== false);
    const mode = recapMode();
    const limits = {
      compact: { count: 6, chars: 1700 },
      balanced: { count: 12, chars: 3300 },
      full: { count: 30, chars: 7000 }
    }[mode];

    const ranked = [...enabled].sort((a, b) =>
      detailPriority(b) - detailPriority(a) || Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    const selected = [];
    let chars = 0;
    for (const detail of ranked) {
      if (selected.length >= limits.count) break;
      const cost = detail.text.length + 4;
      if (selected.length && chars + cost > limits.chars) continue;
      selected.push(detail);
      chars += cost;
    }
    return selected.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  function recapText(details) {
    const chosen = detailsForRecap(details);
    const grouped = new Map();
    for (const detail of chosen) {
      const category = detail.category || "other";
      if (!grouped.has(category)) grouped.set(category, []);
      const dayPrefix = detail.storyDay ? `[Day ${detail.storyDay}${detail.storyPhase && detail.storyPhase !== "unknown" ? ` ${detail.storyPhase}` : ""}] ` : "";
      grouped.get(category).push(`${dayPrefix}${detail.text.replace(/[.;]+$/g, "")}`);
    }
    const parts = [];
    for (const [category, values] of grouped) {
      parts.push(`${CATEGORY_LABELS[category] || CATEGORY_LABELS.other}: ${values.join("; ")}`);
    }
    const timeline = DS.getStoryDayContextLine?.({ includeNotes: true }) || "";
    const body = [timeline, parts.join(" | ")].filter(Boolean).join(" | ");
    return {
      chosen,
      text: `[OOC: Continuity reminder — ${body}. Please keep these established details consistent.]`
    };
  }

  async function insertRecap(details) {
    const active = (details || []).filter(detail => detail.enabled !== false);
    const timelineOnly = DS.getStoryDayContextLine?.({ includeNotes: true }) || "";
    if (!active.length && !timelineOnly) {
      DS.setQuickStatus?.("Context Keeper has no recap-enabled details or Storydate timeline for this chat yet.");
      return false;
    }
    const recap = recapText(details);
    if (!recap.chosen.length && !timelineOnly) return false;
    const ok = DS.insertTextIntoComposer?.(recap.text, { appendSpacing: true }) || DS.insertOocText?.(recap.text);
    if (!ok) return false;
    const store = await readStore();
    const id = currentChatId();
    const entry = store[id] || { details: [] };
    entry.lastRecapAt = Date.now();
    entry.lastRecapMessageCount = roots().length;
    store[id] = entry;
    await writeStore(store);
    DS.setQuickStatus?.(recap.chosen.length
      ? `Context recap inserted with ${recap.chosen.length} detail${recap.chosen.length === 1 ? "" : "s"}${timelineOnly ? " + Storydate timeline" : ""}.`
      : "Storydate timeline recap inserted.");
    return true;
  }

  async function openManager() {
    document.getElementById(MODAL_ID)?.remove();
    const store = await readStore();
    const id = currentChatId();
    let entry = store[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0 };
    let candidates = [];

    const modal = make("div", { id: MODAL_ID, className: "ds-tool-modal" });
    const backdrop = make("div", { className: "ds-tool-modal-backdrop" });
    const dialog = make("div", { className: "ds-tool-modal-dialog ds-context-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Context Keeper" });
    const head = make("div", { className: "ds-tool-modal-head" });
    head.append(make("h2", {}, "Context Keeper"));
    const close = make("button", { type: "button", className: "ds-tool-modal-close" }, "×");
    head.append(close);

    const note = make("p", { className: "ds-tool-note" }, "Local continuity helper. Automatic capture keeps strong long-term facts locally; manual scans remain review-only. Saved details do not use chat tokens until you insert/send an OOC recap.");
    const status = make("p", { className: "ds-tool-status" });
    const topActions = make("div", { className: "ds-tool-actions" });
    const scan = make("button", { type: "button" }, "Scan loaded chat");
    const addTop = make("button", { type: "button" }, "Add top 5");
    const insert = make("button", { type: "button" }, "Insert OOC recap");
    topActions.append(scan, addTop, insert);

    const manual = make("div", { className: "ds-tool-editor" });
    const manualText = make("textarea", { rows: "3", placeholder: "Add an important continuity detail manually..." });
    const manualCategory = make("select", { "aria-label": "Category for manually added Context Keeper detail" });
    manualCategory.append(make("option", { value: "auto" }, "Category: Auto-detect"));
    for (const [value, label] of Object.entries(CATEGORY_LABELS)) manualCategory.append(make("option", { value }, `Category: ${label}`));
    const addManual = make("button", { type: "button" }, "Add detail");
    manual.append(manualText, manualCategory, addManual);

    const savedTitle = make("h3", {}, "Saved details");
    const savedFilters = make("div", { className: "ds-context-saved-filters" });
    const savedSearch = make("input", { type: "search", placeholder: "Search saved continuity...", "aria-label": "Search saved Context Keeper details" });
    const categoryFilter = make("select", { "aria-label": "Filter Context Keeper by category" });
    [["all", "All categories"], ...Object.entries(CATEGORY_LABELS)].forEach(([value, label]) => {
      const option = make("option", { value }, label);
      categoryFilter.append(option);
    });
    const sourceFilter = make("select", { "aria-label": "Filter Context Keeper by source" });
    [["all", "All sources"], ["manual", "Manual"], ["selection", "Selection"], ["message", "Message"], ["memory", "Memory"], ["auto", "Automatic"], ["scan", "Scan"]].forEach(([value, label]) => {
      sourceFilter.append(make("option", { value }, label));
    });
    const savedTools = make("div", { className: "ds-tool-actions" });
    const enableAll = make("button", { type: "button" }, "Use all in recap");
    const removeDisabled = make("button", { type: "button" }, "Remove excluded");
    const removeAll = make("button", { type: "button", className: "ds-danger" }, "Remove all");
    const copyRecap = make("button", { type: "button" }, "Copy OOC recap");
    savedTools.append(enableAll, removeDisabled, removeAll, copyRecap);
    savedFilters.append(savedSearch, categoryFilter, sourceFilter);
    const savedList = make("div", { className: "ds-tool-list" });
    const suggestionTitle = make("h3", {}, "Scan suggestions");
    const suggestionList = make("div", { className: "ds-tool-list" });

    async function refreshEntry() {
      const next = await readStore();
      entry = next[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0 };
      renderSaved();
      renderStatus();
    }

    function renderStatus() {
      const nowCount = roots().length;
      const since = entry.lastRecapAt ? Math.max(0, nowCount - (entry.lastRecapMessageCount || 0)) : 0;
      const enabled = entry.details.filter(detail => detail.enabled !== false).length;
      const automatic = entry.details.filter(detail => detail.source === "auto").length;
      const preview = recapText(entry.details).text;
      const approxTokens = preview ? Math.max(1, Math.round(preview.length / 4)) : 0;
      const recapInfo = `Recap: ${recapMode()} · about ${approxTokens.toLocaleString("en-US")} token${approxTokens === 1 ? "" : "s"} if inserted now.`;
      status.textContent = entry.lastRecapAt
        ? `${entry.details.length} saved (${enabled} used, ${automatic} automatic). Last recap was inserted about ${since} loaded message${since === 1 ? "" : "s"} ago. ${recapInfo}`
        : `${entry.details.length} saved (${enabled} used, ${automatic} automatic). No recap inserted yet. ${recapInfo}`;
    }

    function renderSaved() {
      savedList.replaceChildren();
      if (!entry.details.length) {
        savedList.append(make("p", { className: "ds-tool-empty" }, "No continuity details saved for this chat yet."));
        return;
      }
      const query = clean(savedSearch.value).toLowerCase();
      const categoryWanted = String(categoryFilter.value || "all");
      const sourceWanted = String(sourceFilter.value || "all");
      const visibleDetails = entry.details.filter(detail => {
        if (query && !clean(detail.text).toLowerCase().includes(query)) return false;
        if (categoryWanted !== "all" && String(detail.category || "other") !== categoryWanted) return false;
        if (sourceWanted !== "all" && String(detail.source || "manual") !== sourceWanted) return false;
        return true;
      });
      if (!visibleDetails.length) {
        savedList.append(make("p", { className: "ds-tool-empty" }, "No saved details match these filters."));
        return;
      }
      visibleDetails.forEach(detail => {
        const card = make("div", { className: "ds-tool-item" });
        const meta = make("div", { className: "ds-context-item-meta" });
        const badge = make("span", { className: "ds-context-category" }, detail.category || "other");
        const sourceBadge = make("span", { className: "ds-context-source" }, `source: ${detail.source || "manual"}${detail.role ? ` · ${detail.role}` : ""}`);
        const includeLabel = make("label", { className: "ds-context-include" });
        const include = make("input", { type: "checkbox", checked: detail.enabled !== false });
        includeLabel.append(include, document.createTextNode("Use in recap"));
        meta.append(badge, sourceBadge, includeLabel);
        const value = make("div", { className: "ds-tool-item-text" }, detail.text);
        const actions = make("div", { className: "ds-tool-actions" });
        const edit = make("button", { type: "button" }, "Edit");
        const jump = detail.messageId ? make("button", { type: "button" }, "Jump") : null;
        const memory = make("button", { type: "button" }, "Memory");
        const remove = make("button", { type: "button", className: "ds-danger" }, "Remove");
        include.addEventListener("change", async () => {
          const latest = await readStore();
          const found = latest[id]?.details?.find(item => item.id === detail.id);
          if (found) found.enabled = include.checked;
          await writeStore(latest);
          await refreshEntry();
        });
        edit.addEventListener("click", async () => {
          const nextText = window.prompt("Edit continuity detail", detail.text);
          if (nextText === null || !clean(nextText)) return;
          const latest = await readStore();
          const target = latest[id];
          if (!target) return;
          const found = target.details.find(item => item.id === detail.id);
          if (found) {
            found.text = clean(nextText).slice(0, MAX_DETAIL);
            found.category = categoryFor(found.text);
            found.score = scoreSentence(found.text);
          }
          await writeStore(latest);
          await refreshEntry();
        });
        jump?.addEventListener("click", () => jumpToSource(detail));
        memory.addEventListener("click", async () => {
          if (typeof DS.prepareSpicyChatMemory !== "function") {
            DS.setQuickStatus?.("SpicyChat Memory preparation is not available on this page yet.");
            return;
          }
          memory.disabled = true;
          const result = await DS.prepareSpicyChatMemory(detail.text);
          memory.disabled = false;
          if (!result?.prepared && !result?.copied) {
            DS.setQuickStatus?.("Could not prepare or copy this Context Keeper detail for SpicyChat Memory.");
          }
        });
        remove.addEventListener("click", async () => {
          const latest = await readStore();
          if (latest[id]) latest[id].details = latest[id].details.filter(item => item.id !== detail.id);
          await writeStore(latest);
          await refreshEntry();
        });
        actions.append(edit);
        if (jump) actions.append(jump);
        actions.append(memory, remove);
        card.append(meta, value, actions);
        savedList.append(card);
      });
    }

    function renderSuggestions() {
      suggestionList.replaceChildren();
      if (!candidates.length) {
        suggestionList.append(make("p", { className: "ds-tool-empty" }, "Run a scan to find durable continuity details in currently loaded messages."));
        addTop.disabled = true;
        return;
      }
      addTop.disabled = false;
      candidates.forEach(candidate => {
        const card = make("div", { className: "ds-tool-item" });
        const badge = make("span", { className: "ds-context-category" }, candidate.category);
        const value = make("div", { className: "ds-tool-item-text" }, candidate.text);
        const add = make("button", { type: "button" }, "Add");
        add.addEventListener("click", async () => {
          const added = await addDetail(candidate.text, {
            category: candidate.category,
            source: "scan",
            score: candidate.score,
            messageId: candidate.messageId || "",
            role: candidate.role || ""
          });
          if (added) {
            candidate.added = true;
            add.disabled = true;
            add.textContent = "Added";
            await refreshEntry();
          } else {
            add.disabled = true;
            add.textContent = "Already saved/similar";
          }
        });
        card.append(badge, value, add);
        suggestionList.append(card);
      });
    }

    savedSearch.addEventListener("input", renderSaved);
    categoryFilter.addEventListener("change", renderSaved);
    sourceFilter.addEventListener("change", renderSaved);
    enableAll.addEventListener("click", async () => {
      const latest = await readStore();
      const target = latest[id];
      if (!target?.details?.length) return;
      target.details.forEach(detail => { detail.enabled = true; });
      await writeStore(latest, "Enabled all Context Keeper recap details");
      await refreshEntry();
    });
    removeDisabled.addEventListener("click", async () => {
      const disabled = entry.details.filter(detail => detail.enabled === false).length;
      if (!disabled) { DS.setQuickStatus?.("Context Keeper has no excluded details to remove."); return; }
      if (!window.confirm(`Remove ${disabled} excluded Context Keeper detail${disabled === 1 ? "" : "s"}?`)) return;
      const latest = await readStore();
      if (latest[id]) latest[id].details = latest[id].details.filter(detail => detail.enabled !== false);
      await writeStore(latest, "Removed excluded Context Keeper details");
      await refreshEntry();
    });
    removeAll.addEventListener("click", async () => {
      const count = entry.details.length;
      if (!count) { DS.setQuickStatus?.("Context Keeper has no saved details to remove."); return; }
      if (!window.confirm(`Remove all ${count} Context Keeper detail${count === 1 ? "" : "s"} from this chat? This cannot be undone from Context Keeper.`)) return;
      const latest = await readStore();
      if (latest[id]) latest[id].details = [];
      await writeStore(latest, "Removed all Context Keeper details");
      candidates = [];
      await refreshEntry();
      renderSuggestions();
      DS.setQuickStatus?.("Removed all Context Keeper details for this chat.");
    });
    copyRecap.addEventListener("click", async () => {
      const recap = recapText(entry.details);
      const timelineOnly = DS.getStoryDayContextLine?.({ includeNotes: true }) || "";
      if (!recap.chosen.length && !timelineOnly) { DS.setQuickStatus?.("Context Keeper has no recap-enabled details or Storydate timeline to copy."); return; }
      let ok = false;
      try { await navigator.clipboard.writeText(recap.text); ok = true; } catch {}
      if (!ok) {
        try {
          const area = make("textarea");
          area.value = recap.text;
          area.style.position = "fixed"; area.style.left = "-9999px";
          document.body.append(area); area.select(); ok = document.execCommand("copy"); area.remove();
        } catch {}
      }
      DS.setQuickStatus?.(ok ? "Context Keeper OOC recap copied." : "Could not copy Context Keeper recap.");
    });

    scan.addEventListener("click", () => {
      candidates = scanLoaded().filter(candidate => !entry.details.some(detail => isSimilarText(detail.text, candidate.text)));
      renderSuggestions();
      status.textContent = `Found ${candidates.length} reviewable suggestion${candidates.length === 1 ? "" : "s"} in ${roots().length} currently loaded messages.`;
    });
    addTop.addEventListener("click", async () => {
      const top = candidates.filter(candidate => !candidate.added).slice(0, 5);
      const result = await addManyDetails(top.map(item => ({
        text: item.text,
        category: item.category,
        score: item.score,
        source: "scan",
        messageId: item.messageId || "",
        role: item.role || ""
      })), { source: "scan" });
      top.forEach(item => { item.added = true; });
      await refreshEntry();
      renderSuggestions();
      status.textContent = `Added ${result.added} top suggestion${result.added === 1 ? "" : "s"}${result.skipped ? `; ${result.skipped} already saved/similar` : ""}.`;
    });
    insert.addEventListener("click", async () => {
      if (await insertRecap(entry.details)) modal.remove();
    });
    addManual.addEventListener("click", async () => {
      const value = clean(manualText.value);
      if (!value) return;
      const selectedCategory = String(manualCategory.value || "auto");
      const category = selectedCategory === "auto" ? categoryFor(value) : normalizeCategory(selectedCategory);
      const added = await addDetail(value, { category, source: "manual", score: Math.max(8, scoreSentence(value)) });
      if (added) {
        manualText.value = "";
        await refreshEntry();
      }
    });
    close.addEventListener("click", () => modal.remove());
    backdrop.addEventListener("click", () => modal.remove());
    modal.addEventListener("keydown", event => { if (event.key === "Escape") modal.remove(); });

    dialog.append(head, note, status, topActions, manual, savedTitle, savedFilters, savedTools, savedList, suggestionTitle, suggestionList);
    modal.append(backdrop, dialog);
    document.documentElement.append(modal);
    renderSaved();
    renderSuggestions();
    renderStatus();
  }

  function ensureMessageButtons() {
    if (!DS.state?.settings?.enableContextKeeper || DS.state?.settings?.contextKeeperMessageButtons === false || !DS.isSingleChatPage?.()) {
      if (DS.state.contextKeeperWasActive) {
        document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
        document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-context-keeper-ready]`).forEach(root => delete root.dataset.dsContextKeeperReady);
      }
      DS.state.contextKeeperWasActive = false;
      return;
    }
    DS.state.contextKeeperWasActive = true;
    document.querySelectorAll(`${MESSAGE_SELECTOR}:not([data-ds-context-keeper-ready='1'])`).forEach(root => {
      if (root.querySelector(`.${BUTTON_CLASS}`)) { root.dataset.dsContextKeeperReady = "1"; return; }
      const text = messageText(root);
      if (!text) return;
      const button = make("button", { type: "button", className: BUTTON_CLASS, title: "Remember this message for Context Keeper" }, "Keep");
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        const current = messageText(root);
        const added = await addDetail(current, {
          category: categoryFor(current),
          source: "message",
          score: Math.max(6, scoreSentence(current)),
          messageId: messageIdForRoot(root),
          role: messageRoleForRoot(root)
        });
        button.textContent = added ? "Kept" : "Saved/similar";
        button.classList.add("ds-context-kept");
        setTimeout(() => { if (document.contains(button)) button.textContent = "Keep"; }, 1600);
      });
      const dropdown = root.querySelector("button[aria-label='message-dropdown']");
      const holder = dropdown?.closest?.(".relative") || dropdown?.parentElement || null;
      const target = root.querySelector(".ds-message-quick-actions") || holder || root;
      if (holder && target === holder && dropdown && dropdown.parentElement === holder) {
        holder.insertBefore(button, dropdown);
      } else {
        target.append(button);
      }
      root.dataset.dsContextKeeperReady = "1";
    });
  }

  DS.openContextKeeper = openManager;
  DS.addContextKeeperDetails = addManyDetails;
  DS.applyContextKeeper = function applyContextKeeper() {
    ensureMessageButtons();
    scheduleAutomaticCapture();
  };
  DS.removeContextKeeper = function removeContextKeeper() {
    if (!DS.state.contextKeeperWasActive && !document.getElementById(MODAL_ID)) return;
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
    document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-context-keeper-ready]`).forEach(root => delete root.dataset.dsContextKeeperReady);
    document.getElementById(MODAL_ID)?.remove();
    clearTimeout(autoState.timer);
    autoState.timer = null;
    DS.state.contextKeeperWasActive = false;
  };
  DS.normalizeContextKeeperData = normalize;
})();

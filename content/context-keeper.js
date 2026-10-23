// No optional feature initialization on a tab whose QoL switch is paused.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const KEY = "contextKeeperData";
  const MODAL_ID = "ds-context-keeper-modal";
  const MESSAGE_SELECTOR = "div[id^='message-']";
  const BUTTON_CLASS = "ds-context-keep-button";
  const MAX_DETAIL = 1200;
  let activeRecall = { chatId: "", details: [], ready: false };
  let recallReadPending = false;

  const STOP_WORDS = new Set([
    "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at", "for", "with", "from", "as", "is", "was",
    "are", "were", "be", "been", "being", "it", "this", "that", "these", "those", "he", "she", "they", "them", "his",
    "her", "their", "you", "your", "i", "me", "my", "we", "our", "so", "very", "just", "still", "now", "then"
  ]);

  const CATEGORY_LABELS = {
    identity: "Identity/background",
    relationship: "Relationships/dynamics",
    growth: "Character development",
    npc: "Recurring characters/NPCs",
    event: "Major story events",
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
    return DS.getCurrentChatScope?.()?.key || location.pathname; // True conversation scope; legacy bot-keyed details remain untouched.
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
          pinned: item?.pinned === true,
          needsReview: item?.needsReview === true,
          supersededBy: clean(item?.supersededBy || "").slice(0, 120),
          supersedes: (Array.isArray(item?.supersedes) ? item.supersedes : [item?.supersedes]).filter(Boolean).slice(0, 20).map(value => clean(value).slice(0, 120)),
          updatedAt: Number(item?.updatedAt || 0),
          messageId: clean(item?.messageId || item?.message_id || "").slice(0, 160),
          role: clean(item?.role || item?.speaker || "").slice(0, 40),
          storyDay: Number(item?.storyDay) > 0 ? Math.floor(Number(item.storyDay)) : 0,
          storyPhase: ["morning", "afternoon", "evening", "night", "unknown"].includes(String(item?.storyPhase || "")) ? String(item.storyPhase) : "unknown",
          storydate: clean(item?.storydate || "").slice(0, 40)
        };
        if (normalizedDetails.some(existing =>
          !existing.supersededBy && !existing.supersedes?.length &&
          !detail.supersededBy && !detail.supersedes.length &&
          !possibleConflict(existing.text, detail.text) && isSimilarText(existing.text, detail.text))) continue;
        normalizedDetails.push(detail);
      }
      output[String(chatId)] = {
        details: normalizedDetails,
        lastRecapAt: Number(entry.lastRecapAt) || 0,
        lastRecapMessageCount: Number(entry.lastRecapMessageCount) || 0,
        lastAutoScanMessageCount: Math.max(0, Number(entry.lastAutoScanMessageCount) || 0),
        lastAutoScanAt: Number(entry.lastAutoScanAt) || 0,
        revisions: Object.fromEntries(Object.entries(entry.revisions && typeof entry.revisions === "object" ? entry.revisions : {}).slice(-300).filter(([key, value]) => key && typeof value === "string"))
      };
    }
    return output;
  }

  async function readStore() {
    const result = await DS.storageGet?.([KEY]);
    return normalize(result?.[KEY]);
  }

  function rememberActive(store) {
    const id = currentChatId();
    activeRecall = { chatId: id, details: [...(store?.[id]?.details || [])], ready: true };
  }

  function prepareRecall() {
    const id = currentChatId();
    if (activeRecall.chatId === id && activeRecall.ready || recallReadPending) return;
    activeRecall = { chatId: id, details: [], ready: false };
    recallReadPending = true;
    readStore().then(store => { if (currentChatId() === id) rememberActive(store); })
      .catch(() => {})
      .finally(() => { recallReadPending = false; });
  }

  // Serialize storage writes and avoid an extra write when the normalized data is unchanged.
  // This also keeps the before/after audit snapshots in the same confirmed order.
  let writeChain = Promise.resolve();
  function writeStore(store, label = "Updated Context Keeper", { recordChange = true } = {}) {
    const after = normalize(store);
    const work = writeChain.catch(() => {}).then(async () => {
      const beforeResult = await DS.storageGet?.([KEY]);
      const before = normalize(beforeResult?.[KEY]);
      if (JSON.stringify(before) === JSON.stringify(after)) return false;
      const ok = await DS.storageSet?.({ [KEY]: after });
      if (ok === false) throw new Error("Context Keeper storage write failed");
      if (recordChange) await DS.recordLocalChange?.(label, { [KEY]: before }, { [KEY]: after });
      rememberActive(after);
      return true;
    });
    writeChain = work.catch(() => {});
    return work;
  }
  function fingerprint(text) {
    let hash = 2166136261;
    for (const c of String(text || "")) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
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
      ["growth", /\b(became|becoming|changed|change of heart|learned to trust|trust (?:grew|deepened)|began to trust|no longer (?:fears?|hates?|distrusts?)|forgave|forgiven|reconciled|overcame|grew closer|grew apart|relationship (?:changed|evolved)|started opening up|began opening up|developed feelings)\b/i],
      ["npc", /\b(npc|side character|recurring character|met (?:a|the) (?:guard|merchant|captain|innkeeper|doctor|neighbor|neighbour)|introduced (?:him|her|them)self|joined (?:the|our) (?:party|group))\b/i],
      ["event", /\b(betrayal|betrayed|rescued|escaped|discovered|revelation|reunited|lost (?:his|her|their) life|battle ended|confession|confessed|was killed|died|wedding|married|mission completed)\b/i],
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

  // Deliberately narrow, review-only hints. These are NOT semantic certainty:
  // avoid making automatic changes based on language heuristics.
  const CONFLICT_CUES = [
    [/\b(?:trusts?|trusted)\b/i, /\b(?:distrusts?|distrusted|does not trust|no longer trusts?)\b/i],
    [/\b(?:likes?|enjoys?)\b/i, /\b(?:dislikes?|hates?|does not like)\b/i],
    [/\b(?:alive|survived)\b/i, /\b(?:dead|died|killed)\b/i],
    [/\b(?:friends?|allies)\b/i, /\b(?:enemies|enemy|rivals?)\b/i],
    [/\b(?:married|spouses?)\b/i, /\b(?:divorced|separated)\b/i]
  ];
  function possibleConflict(a, b) {
    const left = clean(a), right = clean(b);
    if (!left || !right || left === right) return false;
    const opposing = CONFLICT_CUES.some(([positive, negative]) =>
      (positive.test(left) && negative.test(right)) || (negative.test(left) && positive.test(right)));
    if (!opposing) return false;
    const polarity = new Set(["trust", "trusts", "trusted", "distrust", "distrusts", "distrusted", "like", "likes", "enjoys", "dislike", "dislikes", "hate", "hates", "alive", "dead", "survived", "died", "killed", "friend", "friends", "allies", "enemy", "enemies", "rival", "rivals", "married", "spouse", "spouses", "divorced", "separated"]);
    const aWords = [...tokens(left)].filter(word => !polarity.has(word));
    const bWords = tokens(right);
    return aWords.filter(word => bWords.has(word)).length >= 2;
  }

  function possibleConflicts(details) {
    const current = (details || []).filter(row => row.enabled !== false && !row.needsReview && !row.supersededBy).slice(-150);
    const found = [];
    for (let i = 0; i < current.length && found.length < 12; i++) {
      for (let j = i + 1; j < current.length && found.length < 12; j++) {
        if (!possibleConflict(current[i].text, current[j].text)) continue;
        const olderFirst = Number(current[i].createdAt || 0) <= Number(current[j].createdAt || 0);
        found.push(olderFirst ? [current[i], current[j]] : [current[j], current[i]]);
      }
    }
    return found;
  }

  function hasPersistentCue(value) {
    return /\b(became|forgave|reconciled|overcame|developed feelings|betrayed|confessed|died|reunited|prefers?|favorite|favourite|enjoys?|likes?|dislikes?|hates?|always|never|usually|normally|habit|routine|for \d+ years?|\d+ years?|since childhood|since (?:he|she|they|i) (?:was|were)|grew up|learned from|promised?|agreed?|committed|commitment|relationship|partner|married|dating|trusts?|secret|identity|skill|skilled|experienced|trained|trigger|boundary|doesn'?t enjoy|does not enjoy|needs? (?:space|quiet|predictability|control|routine)|safe|unsafe|protective|long[- ]term|grow old|first date)\b/i.test(value);
  }

  function scoreSentence(text) {
    const value = clean(text);
    if (value.length < 18 || value.length > 520) return 0;

    const category = categoryFor(value);
    const base = {
      identity: 7,
      relationship: 7,
      growth: 7,
      npc: 6,
      event: 6,
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
    if (!cfg.enabled || !cfg.enableContextKeeper || cfg.contextKeeperAutoCapture !== true || !DS.isSingleChatPage?.()) return;
    autoState.running = true;
    const scanChatId = currentChatId();
    try {
      const messageRoots = roots();
      const messageCount = messageRoots.length;
      if (!messageCount) return;

      const store = await readStore();
      // Never attribute messages from the previous chat to a new route after
      // an asynchronous storage read or a React conversation switch.
      if (!scanChatId || scanChatId !== currentChatId()) return;
      const id = scanChatId;
      const entry = store[id] || { details: [], lastRecapAt: 0, lastRecapMessageCount: 0, lastAutoScanMessageCount: 0, lastAutoScanAt: 0 };
      const every = autoCaptureEvery();
      const lastCount = Math.max(0, Number(entry.lastAutoScanMessageCount) || 0);
      const delta = Math.max(0, messageCount - lastCount);
      // A regeneration can replace content without adding a DOM message. Track a
      // small newest-message window by stable ID + fingerprint instead of count alone.
      const latestRoots = messageRoots.slice(-Math.max(12, every));
      const revisions = entry.revisions || (entry.revisions = {});
      const changed = latestRoots.filter(root => {
        const id = messageIdForRoot(root);
        return id && revisions[id] !== fingerprint(messageText(root));
      });
      if (lastCount > 0 && delta < every && !changed.length) return;
      if (lastCount === 0 && messageCount < every) return;
      const batchSize = Math.min(messageCount, Math.max(every, Math.min(12, delta || every)));
      const changedRoots = changed.length ? changed : messageRoots.slice(-batchSize);
      for (const root of changedRoots) {
        const id = messageIdForRoot(root);
        if (!id) continue;
        const updated = fingerprint(messageText(root));
        if (revisions[id] && revisions[id] !== updated) {
          // Never discard a saved fact silently. Mark prior automatic facts from
          // the regenerated/edited message for review until the user confirms.
          for (const detail of entry.details) {
            if (detail.source === "auto" && detail.messageId === id) {
              detail.needsReview = true;
              detail.enabled = false;
            }
          }
        }
        delete revisions[id];
        revisions[id] = updated;
      }
      entry.revisions = Object.fromEntries(Object.entries(revisions).slice(-300));
      const candidates = scanRoots(changedRoots, autoSensitivityThreshold(), 24);
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
          pinned: false,
          needsReview: false,
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
      // A second route check protects the chat identity while candidate
      // extraction runs. A later scan will pick up this chat on return.
      if (id !== currentChatId() || !DS.state?.settings?.enableContextKeeper) return;
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
    if (!cfg.enabled || !cfg.enableContextKeeper || cfg.contextKeeperAutoCapture !== true || !DS.isSingleChatPage?.()) {
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

  async function addManyDetails(values, { source = "manual", expectedChatId = "" } = {}) {
    // Explicit Archive restore callers pin the exact conversation. A route
    // change during the asynchronous storage read must not import into a
    // newly opened conversation, even if the bot ID happens to be identical.
    if (expectedChatId && currentChatId() !== expectedChatId)
      throw new Error("Conversation changed before Context Keeper import.");
    const store = await readStore();
    const id = expectedChatId || currentChatId();
    if (expectedChatId && currentChatId() !== expectedChatId)
      throw new Error("Conversation changed during Context Keeper import.");
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
        pinned: item.pinned === true,
        needsReview: item.needsReview === true,
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
      if (expectedChatId && currentChatId() !== expectedChatId)
        throw new Error("Conversation changed before saving recovered facts.");
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
    if (detail.pinned) return 1000 + sourceBonus + Number(detail.score || 0);
    const categoryBonus = {
      identity: 6,
      relationship: 6,
      growth: 6,
      npc: 4,
      event: 5,
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
    const enabled = (details || []).filter(detail => detail.enabled !== false && !detail.needsReview && !detail.supersededBy);
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

  // Independent local recall: no native Memories API, no Memory Manager dependency.
  // The composer integration requests this synchronously, after a cached storage read.
  DS.getContextKeeperSendCandidate = function getContextKeeperSendCandidate(draft = "") {
    const cfg = DS.state?.settings || {};
    if (!cfg.enabled || !cfg.enableContextKeeper || !cfg.contextKeeperAutoRecall || !DS.isSingleChatPage?.()) return null;
    const id = currentChatId();
    if (activeRecall.chatId !== id || !activeRecall.ready) { prepareRecall(); return null; }
    const enabled = activeRecall.details.filter(x => x.enabled !== false && !x.needsReview && !x.supersededBy);
    if (!enabled.length) return null;
    const selected = [];
    const relevantRecall = cfg.contextKeeperRelevantRecall === true;
    // Reuse the user's outgoing draft; never scan the whole DOM in the send path.
    const words = relevantRecall ? tokens(draft) : new Set(clean(draft).toLowerCase().match(/[a-z]{4,}/g) || []);
    const ranked = enabled.map(detail => {
      const hits = [...tokens(detail.text)].filter(word => words.has(word)).length;
      const dynamic = detail.category === "location" || detail.category === "state";
      const penalty = dynamic && !detail.pinned && hits === 0 ? 12 : 0;
      const topicBoost = relevantRecall ? Math.min(hits, 6) * 12 : Math.min(hits, 5) * 4;
      return { detail, hits, rank: detailPriority(detail) + topicBoost - penalty };
    }).sort((a,b) => b.rank - a.rank || Number(b.detail.createdAt||0)-Number(a.detail.createdAt||0));
    const budget = [450,900,1400].includes(Number(cfg.contextKeeperRecallMaxChars)) ? Number(cfg.contextKeeperRecallMaxChars) : 900;
    const lead = "[OOC: Remember these established continuity details: ";
    const tail = ". Keep the roleplay consistent.]";
    let used = lead.length + tail.length;
    const usedCategories = new Map();
    for (const { detail, hits } of ranked) {
      // Favor coverage across the ongoing scene, relationships, and established
      // boundaries, without suppressing pinned facts or a strong topical match.
      if (relevantRecall && !detail.pinned && hits === 0 && (usedCategories.get(detail.category) || 0) >= 2) continue;
      const candidate = clean(detail.text).replace(/[.;]+$/g, "");
      const cost = candidate.length + (selected.length ? 2 : 0);
      if (used + cost > budget) continue;
      selected.push(candidate); used += cost;
      usedCategories.set(detail.category, (usedCategories.get(detail.category) || 0) + 1);
      if (selected.length >= 12) break;
    }
    return selected.length ? { directive: lead + selected.join("; ") + tail, count: selected.length } : null;
  };

  async function insertRecap(details) {
    const active = (details || []).filter(detail => detail.enabled !== false && !detail.needsReview && !detail.supersededBy);
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

    const note = make("p", { className: "ds-tool-note" }, "Standalone local memories, independent of native Memory Manager. Saved facts cost no tokens until a manual recap or optional automatic recall is included with a message.");
    const status = make("p", { className: "ds-tool-status" });
    const topActions = make("div", { className: "ds-tool-actions" });
    const scan = make("button", { type: "button" }, "Scan loaded chat");
    const apiScan = make("button", { type: "button" }, "Scan up to 10k messages (API)");
    const stopApiScan = make("button", { type: "button" }, "Stop scan");
    stopApiScan.disabled = true;
    const addTop = make("button", { type: "button" }, "Add top 5");
    const insert = make("button", { type: "button" }, "Insert OOC recap");
    topActions.append(scan, apiScan, stopApiScan, addTop, insert);

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
    const reviewFilter = make("select", { "aria-label": "Filter Context Keeper by review status" });
    [["all", "All review statuses"], ["review", "Needs review"], ["active", "Included in recap"], ["excluded", "Excluded from recap"], ["past", "Past versions"]].forEach(([value, label]) => {
      reviewFilter.append(make("option", { value }, label));
    });
    const savedTools = make("div", { className: "ds-tool-actions" });
    const enableAll = make("button", { type: "button" }, "Use all in recap");
    const removeDisabled = make("button", { type: "button" }, "Remove excluded");
    const removeAll = make("button", { type: "button", className: "ds-danger" }, "Remove all");
    const copyRecap = make("button", { type: "button" }, "Copy OOC recap");
    const evolveSelected = make("button", { type: "button" }, "Update selected fact");
    const consolidateSelected = make("button", { type: "button" }, "Consolidate selected");
    const reviewConflicts = make("button", { type: "button" }, "Review possible conflicts");
    const selectAll = make("button", { type: "button" }, "Select filtered");
    const selectNone = make("button", { type: "button" }, "Clear selection");
    const bulkPin = make("button", { type: "button" }, "Pin selected");
    const bulkUnpin = make("button", { type: "button" }, "Unpin selected");
    const bulkExclude = make("button", { type: "button" }, "Exclude selected");
    const bulkInclude = make("button", { type: "button" }, "Include selected");
    const bulkReview = make("button", { type: "button" }, "Mark selected reviewed");
    const bulkDelete = make("button", { type: "button", className: "ds-danger" }, "Delete selected");
    const bulkCategory = make("select", { "aria-label": "Move selected continuity details to category" });
    bulkCategory.append(make("option", { value: "" }, "Move selected to…"));
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) bulkCategory.append(make("option", { value: key }, label));
    const exportJson = make("button", { type: "button" }, "Export JSON");
    const importJson = make("button", { type: "button" }, "Import JSON…");
    const selectedDetails = new Set();
    savedTools.append(selectAll, selectNone, evolveSelected, consolidateSelected, reviewConflicts, bulkPin, bulkUnpin, bulkExclude, bulkInclude, bulkReview, bulkCategory, bulkDelete, exportJson, importJson, enableAll, removeDisabled, removeAll, copyRecap);
    savedFilters.append(savedSearch, categoryFilter, sourceFilter, reviewFilter);
    const savedList = make("div", { className: "ds-tool-list" });
    const conflictList = make("div", { className: "ds-tool-list" });
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
      const enabled = entry.details.filter(detail => detail.enabled !== false && !detail.needsReview && !detail.supersededBy).length;
      const review = entry.details.filter(detail => detail.needsReview).length;
      const past = entry.details.filter(detail => detail.supersededBy).length;
      const automatic = entry.details.filter(detail => detail.source === "auto").length;
      const preview = recapText(entry.details).text;
      const approxTokens = preview ? Math.max(1, Math.round(preview.length / 4)) : 0;
      const recapInfo = `Recap: ${recapMode()} · about ${approxTokens.toLocaleString("en-US")} token${approxTokens === 1 ? "" : "s"} if inserted now.`;
      status.textContent = entry.lastRecapAt
        ? `${entry.details.length} saved (${enabled} used, ${automatic} automatic${review ? `, ${review} need review` : ""}${past ? `, ${past} past versions` : ""}). Last recap was inserted about ${since} loaded message${since === 1 ? "" : "s"} ago. ${recapInfo}`
        : `${entry.details.length} saved (${enabled} used, ${automatic} automatic${review ? `, ${review} need review` : ""}${past ? `, ${past} past versions` : ""}). No recap inserted yet. ${recapInfo}`;
    }

    function renderSaved() {
      savedList.replaceChildren();
      const ids = new Set(entry.details.map(item => item.id));
      for (const selected of selectedDetails) if (!ids.has(selected)) selectedDetails.delete(selected);
      if (!entry.details.length) {
        savedList.append(make("p", { className: "ds-tool-empty" }, "No continuity details saved for this chat yet."));
        return;
      }
      const query = clean(savedSearch.value).toLowerCase();
      const categoryWanted = String(categoryFilter.value || "all");
      const sourceWanted = String(sourceFilter.value || "all");
      const reviewWanted = String(reviewFilter.value || "all");
      const visibleDetails = entry.details.filter(detail => {
        if (query && !clean(detail.text).toLowerCase().includes(query)) return false;
        if (categoryWanted !== "all" && String(detail.category || "other") !== categoryWanted) return false;
        if (sourceWanted !== "all" && String(detail.source || "manual") !== sourceWanted) return false;
        if (reviewWanted === "past" && !detail.supersededBy) return false;
        if (reviewWanted !== "past" && detail.supersededBy) return false;
        if (reviewWanted === "review" && !detail.needsReview) return false;
        if (reviewWanted === "active" && (detail.enabled === false || detail.needsReview)) return false;
        if (reviewWanted === "excluded" && detail.enabled !== false && !detail.needsReview && !detail.supersededBy) return false;
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
        const selectLabel = make("label", { className: "ds-context-include" });
        const checked = make("input", { type: "checkbox", checked: selectedDetails.has(detail.id) });
        selectLabel.append(checked, document.createTextNode("Select"));
        checked.addEventListener("change", () => { if (checked.checked) selectedDetails.add(detail.id); else selectedDetails.delete(detail.id); });
        const includeLabel = make("label", { className: "ds-context-include" });
        const include = make("input", { type: "checkbox", checked: detail.enabled !== false && !detail.needsReview && !detail.supersededBy });
        include.disabled = !!detail.supersededBy;
        includeLabel.append(include, document.createTextNode("Use in recap"));
        meta.append(selectLabel, badge, sourceBadge, includeLabel);
        if (detail.supersededBy) meta.append(make("span", { className: "ds-context-category" }, "Past version — kept for history"));
        if (detail.pinned) meta.append(make("span", { className: "ds-context-category" }, "Pinned"));
        if (detail.needsReview) meta.append(make("span", { className: "ds-context-category" }, "Needs review — excluded from recall"));
        const value = make("div", { className: "ds-tool-item-text" }, detail.text);
        const actions = make("div", { className: "ds-tool-actions" });
        const edit = make("button", { type: "button" }, "Edit");
        edit.disabled = !!detail.supersededBy;
        const pin = make("button", { type: "button" }, detail.pinned ? "Unpin" : "Pin");
        pin.disabled = !!detail.supersededBy;
        pin.addEventListener("click", async () => {
          const latest = await readStore(); const found = latest[id]?.details?.find(item => item.id === detail.id);
          if (!found) return;
          found.pinned = !found.pinned;
          await writeStore(latest); await refreshEntry();
        });
        const review = detail.needsReview ? make("button", { type: "button" }, "Confirm and include") : null;
        review?.addEventListener("click", async () => {
          const latest = await readStore(); const found = latest[id]?.details?.find(item => item.id === detail.id);
          if (!found) return;
          found.needsReview = false;
          found.enabled = true;
          await writeStore(latest, "Reviewed Context Keeper detail"); await refreshEntry();
        });
        const jump = detail.messageId ? make("button", { type: "button" }, "Jump") : null;
        const remove = make("button", { type: "button", className: "ds-danger" }, "Remove");
        include.addEventListener("change", async () => {
          const latest = await readStore();
          const found = latest[id]?.details?.find(item => item.id === detail.id);
          if (found && !found.supersededBy) { found.enabled = include.checked; if (include.checked) found.needsReview = false; }
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
        remove.addEventListener("click", async () => {
          const latest = await readStore();
          if (latest[id]) latest[id].details = latest[id].details.filter(item => item.id !== detail.id);
          await writeStore(latest);
          await refreshEntry();
        });
        actions.append(edit, pin);
        if (DS.state?.settings?.enableChatLorebookManager && !detail.supersededBy) {
          const toLocal=make("button", { type: "button" }, "To local Lorebook");
          toLocal.title="Open this fact in the local entry editor for review. Does not write a native Lorebook.";
          toLocal.addEventListener("click",()=>{
            if(!DS.openChatLorebookManager?.(detail.text))status.textContent="Enable Chat Lorebook Manager in QoL Settings first.";
          });
          actions.append(toLocal);
        }
        if (review) actions.append(review);
        if (jump) actions.append(jump);
        actions.append(remove);
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

    function selectedRows() { return entry.details.filter(detail => selectedDetails.has(detail.id)); }
    async function bulkEdit(mode, argument = "") {
      const chosen = selectedRows();
      if (!chosen.length) { status.textContent = "Select continuity details first."; return; }
      if (mode === "delete" && !window.confirm(`Delete ${chosen.length} selected continuity details?`)) return;
      const latest = await readStore(); const target = latest[id]; if (!target) return;
      const wanted = new Set(chosen.map(detail => detail.id));
      if (mode === "delete") target.details = target.details.filter(detail => !wanted.has(detail.id));
      else for (const detail of target.details) {
        if (!wanted.has(detail.id)) continue;
        if (detail.supersededBy && mode !== "delete") continue;
        if (mode === "pin") detail.pinned = true;
        if (mode === "unpin") detail.pinned = false;
        if (mode === "exclude") detail.enabled = false;
        if (mode === "include") { detail.enabled = true; detail.needsReview = false; }
        if (mode === "category") detail.category = normalizeCategory(argument);
        if (mode === "review" && detail.needsReview) { detail.needsReview = false; detail.enabled = true; }
      }
      if (mode === "delete") selectedDetails.clear();
      await writeStore(latest, `Context Keeper bulk ${mode}`);
      await refreshEntry();
    }
    async function saveEvolvedDetail(previous, replacement, sources) {
      const text = clean(replacement).slice(0, MAX_DETAIL);
      if (!text) return false;
      const latest = await readStore();
      const target = latest[id];
      if (!target || currentChatId() !== id) return false;
      const old = (sources || []).map(source => target.details.find(row => row.id === source.id)).filter(row => row && !row.supersededBy);
      if (old.length !== sources.length || target.details.some(row => !old.includes(row) && !row.supersededBy && isSimilarText(row.text, text))) return false;
      const now = Date.now();
      const story = DS.getStoryDaySnapshot?.() || null;
      const next = {
        id: `detail-${now}-${Math.random().toString(36).slice(2, 7)}`,
        text, category: old.length === 1 ? old[0].category : normalizeCategory(previous?.category || "history"),
        source: "manual", score: Math.max(8, scoreSentence(text)), enabled: true,
        pinned: old.some(row => row.pinned), needsReview: false,
        supersedes: old.map(row => row.id), updatedAt: now, createdAt: now,
        messageId: "", role: "", storyDay: Number(story?.day || 0),
        storyPhase: story?.phase || "unknown", storydate: clean(story?.code || "").slice(0, 40)
      };
      for (const row of old) { row.supersededBy = next.id; row.enabled = false; row.pinned = false; }
      target.details.push(next); await writeStore(latest, "Updated Context Keeper continuity");
      selectedDetails.clear(); await refreshEntry(); return true;
    }
    evolveSelected.addEventListener("click", async () => {
      const chosen = selectedRows();
      if (chosen.length !== 1 || chosen[0].supersededBy) { status.textContent = "Select one current fact to update. Past versions remain in history."; return; }
      const nextText = window.prompt("Write the CURRENT version of this fact. The old version will remain in Past versions.", chosen[0].text);
      if (nextText === null || !clean(nextText) || clean(nextText) === chosen[0].text) return;
      const result = await saveEvolvedDetail(chosen[0], nextText, chosen);
      status.textContent = result ? "Fact updated. Previous version is saved in Past versions." : "Could not update this fact; check for a duplicate or changed chat.";
    });
    consolidateSelected.addEventListener("click", async () => {
      const chosen = selectedRows();
      if (chosen.length < 2 || chosen.length > 12 || chosen.some(row => row.supersededBy)) {
        status.textContent = "Select 2–12 current details to consolidate. Past versions cannot be merged again."; return;
      }
      const suggestion = chosen.map(row => row.text).join("; ").slice(0, MAX_DETAIL);
      const nextText = window.prompt("Review and write one concise fact that preserves what matters. Previous details will stay in Past versions.", suggestion);
      if (nextText === null || !clean(nextText)) return;
      if (!window.confirm(`Archive these ${chosen.length} details as past versions and keep your reviewed summary?`)) return;
      const result = await saveEvolvedDetail({ category: chosen[0].category }, nextText, chosen);
      status.textContent = result ? `Consolidated ${chosen.length} details into one current memory; originals remain in Past versions.` : "Consolidation not saved; check for a duplicate or changed chat.";
    });
    function renderConflictReview() {
      conflictList.replaceChildren();
      const pairs = possibleConflicts(entry.details);
      if (!pairs.length) {
        conflictList.append(make("p", { className: "ds-tool-empty" }, "No obvious conflicting active facts found. This only checks a few word pairs, not every possible contradiction."));
        return;
      }
      for (const [older, newer] of pairs) {
        const card = make("div", { className: "ds-tool-item" });
        card.append(make("div", { className: "ds-tool-item-text" }, `Earlier: ${older.text}`));
        card.append(make("div", { className: "ds-tool-item-text" }, `Later: ${newer.text}`));
        const resolve = make("button", { type: "button" }, "Keep later; archive earlier");
        resolve.addEventListener("click", async () => {
          if (!window.confirm("This is only a possible contradiction. Keep the later fact active and move the earlier one to Past versions?")) return;
          const latest = await readStore();
          if (currentChatId() !== id) return;
          const a = latest[id]?.details?.find(row => row.id === older.id);
          const b = latest[id]?.details?.find(row => row.id === newer.id);
          if (!a || !b || a.supersededBy || b.supersededBy) return;
          a.supersededBy = b.id; a.enabled = false; a.pinned = false;
          b.supersedes = [...new Set([...(b.supersedes || []), a.id])].slice(-20);
          await writeStore(latest, "Reviewed Context Keeper continuity conflict");
          await refreshEntry(); renderConflictReview();
        });
        card.append(resolve); conflictList.append(card);
      }
    }
    reviewConflicts.addEventListener("click", () => {
      renderConflictReview();
      status.textContent = "Possible conflicts are suggestions only. Nothing changes unless you confirm an individual pair.";
    });
    selectAll.addEventListener("click", () => {
      const query = clean(savedSearch.value).toLowerCase();
      for (const detail of entry.details) if ((!query || detail.text.toLowerCase().includes(query))
        && (reviewFilter.value === "past" ? !!detail.supersededBy : !detail.supersededBy)
        && (categoryFilter.value === "all" || detail.category === categoryFilter.value)
        && (sourceFilter.value === "all" || detail.source === sourceFilter.value)
        && (reviewFilter.value === "all" || (reviewFilter.value === "review" && detail.needsReview)
          || (reviewFilter.value === "active" && detail.enabled !== false && !detail.needsReview && !detail.supersededBy)
          || (reviewFilter.value === "excluded" && (detail.enabled === false || detail.needsReview))
          || (reviewFilter.value === "past" && !!detail.supersededBy))) selectedDetails.add(detail.id);
      renderSaved();
    });
    selectNone.addEventListener("click", () => { selectedDetails.clear(); renderSaved(); });
    bulkPin.addEventListener("click", () => bulkEdit("pin"));
    bulkUnpin.addEventListener("click", () => bulkEdit("unpin"));
    bulkExclude.addEventListener("click", () => bulkEdit("exclude"));
    bulkInclude.addEventListener("click", () => bulkEdit("include"));
    bulkReview.addEventListener("click", () => bulkEdit("review"));
    bulkDelete.addEventListener("click", () => bulkEdit("delete"));
    bulkCategory.addEventListener("change", () => { if (bulkCategory.value) void bulkEdit("category", bulkCategory.value); bulkCategory.value = ""; });
    exportJson.addEventListener("click", () => {
      const chosen = selectedDetails.size ? selectedRows() : entry.details;
      const payload = { format: "spicychat-qol-context-keeper", version: 1, exportedAt: new Date().toISOString(), details: chosen };
      DS.downloadTextFile?.(JSON.stringify(payload, null, 2), `context-keeper-${Date.now()}.json`, "application/json;charset=utf-8", { requestPermission: true });
    });
    importJson.addEventListener("click", () => {
      const input = make("input", { type: "file", accept: ".json,application/json" }); input.hidden = true;
      input.addEventListener("change", async () => {
        const file = input.files?.[0]; input.remove(); if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          if (data?.format !== "spicychat-qol-context-keeper" || !Array.isArray(data.details)) throw Error("Not a Context Keeper export");
          const values = data.details.slice(0, 1000).map(row => ({ ...row, source: "manual", enabled: row.enabled !== false }));
          if (!window.confirm(`Import up to ${values.length} continuity details into THIS chat? Similar entries will be skipped; the source file won't be changed.`)) return;
          const result = await addManyDetails(values, { source: "manual" });
          await refreshEntry(); status.textContent = `Imported ${result.added}; skipped ${result.skipped} duplicates.`;
        } catch (error) { status.textContent = `Import failed: ${error?.message || error}`; }
      }, { once: true });
      document.body.append(input); input.click();
    });

    savedSearch.addEventListener("input", renderSaved);
    categoryFilter.addEventListener("change", renderSaved);
    sourceFilter.addEventListener("change", renderSaved);
    reviewFilter.addEventListener("change", renderSaved);
    enableAll.addEventListener("click", async () => {
      const latest = await readStore();
      const target = latest[id];
      if (!target?.details?.length) return;
      target.details.forEach(detail => { if (!detail.needsReview && !detail.supersededBy) detail.enabled = true; });
      await writeStore(latest, "Enabled reviewed Context Keeper details");
      await refreshEntry();
    });
    removeDisabled.addEventListener("click", async () => {
      const disabled = entry.details.filter(detail => detail.enabled === false && !detail.supersededBy).length;
      if (!disabled) { DS.setQuickStatus?.("Context Keeper has no excluded details to remove."); return; }
      if (!window.confirm(`Remove ${disabled} excluded Context Keeper detail${disabled === 1 ? "" : "s"}?`)) return;
      const latest = await readStore();
      if (latest[id]) latest[id].details = latest[id].details.filter(detail => detail.enabled !== false || detail.supersededBy);
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

    const apiScanState = { cancel: false, running: false };
    apiScan.addEventListener("click", async () => {
      if (apiScanState.running || typeof (DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage) !== "function") {
        status.textContent = "Authenticated chat-history API is unavailable."; return;
      }
      const route = location.pathname.match(/^\/chat\/([^/?#]+)\/([^/?#]+)/i);
      if (!route) { status.textContent = "Save/open an established chat first."; return; }
      apiScanState.running = true; apiScanState.cancel = false; apiScan.disabled = true; stopApiScan.disabled = false;
      const op = DS.diagOperationStart?.("context-keeper", "manual-api-history-scan", { maxPages: 100 });
      let pages = 0, scanned = 0, lastId = "", pageSize = 100; const seen = new Set(); const suggestions = new Map();
      try {
        for (; pages < 100 && !apiScanState.cancel; pages++) {
          if (!DS.isSingleChatPage?.() || location.pathname !== `/chat/${route[1]}/${route[2]}`) break;
          let response;
          try { response = await (DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage)(route[1], route[2], { limit: pageSize, lastId }); }
          catch (error) {
            if (pages === 0 && [400, 404, 413, 422].includes(Number(error?.httpStatus || 0))) {
              pageSize = 50;
              response = await (DS.fetchChatHistoryPageShared || DS.fetchChatHistoryPage)(route[1], route[2], { limit: pageSize, lastId });
            } else throw error;
          }
          const rows = response?.data?.messages;
          if (!Array.isArray(rows)) throw Error("Chat history returned no message list");
          if (!rows.length) break;
          for (const row of rows) {
            const messageId = String(row?.id || "");
            if (!messageId || seen.has(messageId)) continue;
            seen.add(messageId); scanned++;
            const role = String(row?.role || "");
            for (const sentence of splitSentences(row?.content || row?.text || row?.message || "")) {
              const score = scoreSentence(sentence);
              if (score < 5 || suggestions.size >= 250) continue;
              const key = fingerprint(sentence.toLocaleLowerCase());
              if (suggestions.has(key)) continue;
              suggestions.set(key, { text: sentence.slice(0, MAX_DETAIL), category: categoryFor(sentence), score, messageId, role });
            }
          }
          status.textContent = `Reading conversation… ${scanned} messages across ${pages + 1} API pages. Suggestions are review-only.`;
          const oldest = rows[rows.length - 1]; const next = String(oldest?.id || "");
          if (oldest?.prev_id == null && Object.hasOwn(oldest, "prev_id")) break;
          if (rows.length < pageSize || !next || next === lastId) break;
          lastId = next;
          await new Promise(resolve => setTimeout(resolve, 60));
        }
        candidates = [...suggestions.values()].sort((a,b) => b.score-a.score).filter(c => !entry.details.some(d => isSimilarText(d.text,c.text))).slice(0, 250);
        renderSuggestions();
        status.textContent = `${apiScanState.cancel ? "Stopped" : "Read"} ${scanned} messages in ${pages + 1} pages; ${candidates.length} suggestions to review. No changes were auto-saved.`;
        DS.diagOperationEnd?.(op, { scanned, changed: candidates.length, outcome: apiScanState.cancel ? "cancelled" : "done", meta: { pages: pages + 1 } });
      } catch (error) {
        status.textContent = `History scan stopped: ${error?.message || error}. Local details are safe.`;
        DS.diagOperationEnd?.(op, { scanned, errors: 1, outcome: "failed" });
      } finally { apiScanState.running = false; apiScan.disabled = false; stopApiScan.disabled = true; }
    });
    stopApiScan.addEventListener("click", () => { apiScanState.cancel = true; stopApiScan.disabled = true; });
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
    close.addEventListener("click", () => { apiScanState.cancel = true; modal.remove(); });
    backdrop.addEventListener("click", () => { apiScanState.cancel = true; modal.remove(); });
    modal.addEventListener("keydown", event => { if (event.key === "Escape") modal.remove(); });

    dialog.append(head, note, status, topActions, manual, savedTitle, savedFilters, savedTools, savedList, conflictList, suggestionTitle, suggestionList);
    modal.append(backdrop, dialog);
    document.documentElement.append(modal);
    // Offered only after verified PRIVATE bot + owned, private attached Lorebook.
    DS.offerPrivateLorebookAction?.(dialog, topActions)?.catch?.(() => {});
    renderSaved();
    renderSuggestions();
    renderStatus();
  }

  function placeMessageKeepButton(root, button) {
    if (!(root instanceof Element) || !(button instanceof Element)) return;

    const dropdown = root.querySelector("button[aria-label='message-dropdown']");
    const holder = dropdown?.closest?.(".relative") || dropdown?.parentElement || null;
    if (!holder) {
      // Native toolbar may temporarily mount without the three-dot control.
      // Keep the action beside the header rather than putting it into message text.
      const header = root.querySelector("a[aria-label='chatbot-profile']")?.closest?.(".flex") ||
        root.querySelector("button[aria-label='message-dropdown']")?.parentElement || null;
      if (header && button.parentElement !== header) header.append(button);
      else if (!header && button.parentElement !== root) root.append(button);
      return;
    }

    // Keep Context Keeper OUTSIDE message-options' quick-action bar. That bar is
    // intentionally rebuilt with replaceChildren() when SpicyChat rerenders a
    // message toolbar, which used to delete Keep while leaving this message's
    // ready marker behind. As a sibling, Keep survives quick-action rebuilds.
    const dropdownWrapper = dropdown?.parentElement;
    if (dropdownWrapper && dropdownWrapper.parentElement === holder) {
      if (button.parentElement !== holder || button.nextSibling !== dropdownWrapper) {
        holder.insertBefore(button, dropdownWrapper);
      }
    } else if (button.parentElement !== holder) {
      holder.append(button);
    }
  }

  function ensureMessageButtonForRoot(root) {
    if (!(root instanceof Element) || !root.isConnected || DS.isMessageEditPending?.(root)) return false;
    if (!DS.state?.settings?.enableContextKeeper || DS.state?.settings?.contextKeeperMessageButtons !== true || !DS.isSingleChatPage?.()) return false;

    // React can leave an obsolete Keep node behind while replacing the native
    // toolbar. Keep exactly one live button attached to the current dropdown
    // holder and discard stale duplicates from older toolbar instances.
    const buttons = Array.from(root.querySelectorAll(`.${BUTTON_CLASS}`));
    let button = buttons.find(candidate => candidate.isConnected) || null;
    buttons.forEach(candidate => { if (candidate !== button) candidate.remove(); });

    if (!button) {
      const text = messageText(root);
      if (!text) return false;
      button = make("button", { type: "button", className: BUTTON_CLASS, title: "Remember this message for Context Keeper" }, "Keep");
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
    }

    placeMessageKeepButton(root, button);
    root.dataset.dsContextKeeperReady = "1";
    return true;
  }

  function ensureMessageButtons() {
    if (!DS.state?.settings?.enableContextKeeper || DS.state?.settings?.contextKeeperMessageButtons !== true || !DS.isSingleChatPage?.()) {
      if (DS.state.contextKeeperWasActive) {
        document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
        document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-context-keeper-ready]`).forEach(root => delete root.dataset.dsContextKeeperReady);
      }
      DS.state.contextKeeperWasActive = false;
      return;
    }
    DS.state.contextKeeperWasActive = true;

    // First process genuinely new/unready messages. Then repair a small
    // visible/newest set even while Message Lane is active. The repair pass
    // must explicitly bypass lane restriction: toolbar-only React rerenders
    // can remove Keep from a message that is not one of the current dirty roots.
    const pending = DS.getMessageEnhancerRoots?.({ readyAttribute: "data-ds-context-keeper-ready", readyValue: "1", newest: 24, margin: 1400 })
      || Array.from(document.querySelectorAll(`${MESSAGE_SELECTOR}:not([data-ds-context-keeper-ready='1'])`));
    const repair = DS.getMessageEnhancerRoots?.({ forceLazy: true, newest: 12, margin: 1000, respectLane: false })
      || Array.from(document.querySelectorAll(MESSAGE_SELECTOR)).slice(-12);
    const roots = Array.from(new Set([...(pending || []), ...(repair || [])]));
    roots.forEach(root => {
      DS.repairMessageToolbarForRoot?.(root);
      ensureMessageButtonForRoot(root);
    });
  }

  // Small repair watchdog for toolbar-only React rerenders. It checks only the
  // visible/newest message set and does no Context Keeper capture work.
  let messageButtonRepairTimer = 0;
  function scheduleMessageButtonRepair(delay = 450) {
    clearTimeout(messageButtonRepairTimer);
    messageButtonRepairTimer = window.setTimeout(() => {
      messageButtonRepairTimer = 0;
      if (document.hidden) return;
      ensureMessageButtons();
    }, Math.max(150, Number(delay) || 450));
  }

  // The optional message toolbar must not wake a repair timer when its toggle
  // is off. This also keeps full builds quiet for Memory Manager users.
  function messageButtonsWanted() {
    const settings = DS.state?.settings || {};
    return settings.enabled === true && settings.enableContextKeeper === true
      && settings.contextKeeperMessageButtons === true && DS.isSingleChatPage?.();
  }
  let messageButtonWatchdog = 0;
  let messageButtonListenersInstalled = false;
  let recallListenerInstalled = false;
  const onMessageButtonsPageShow = () => { if (messageButtonsWanted()) scheduleMessageButtonRepair(450); };
  const onMessageButtonsVisible = () => { if (!document.hidden && messageButtonsWanted()) scheduleMessageButtonRepair(450); };
  const onRecallStorageChanged = changes => {
    if (!changes?.[KEY] || !DS.state?.settings?.enableContextKeeper) return;
    rememberActive(normalize(changes[KEY].newValue));
  };
  function syncContextKeeperListeners() {
    const wanted = messageButtonsWanted();
    if (wanted && !messageButtonListenersInstalled) {
      window.addEventListener("pageshow", onMessageButtonsPageShow, true);
      document.addEventListener("visibilitychange", onMessageButtonsVisible, true);
      messageButtonListenersInstalled = true;
    } else if (!wanted && messageButtonListenersInstalled) {
      window.removeEventListener("pageshow", onMessageButtonsPageShow, true);
      document.removeEventListener("visibilitychange", onMessageButtonsVisible, true);
      messageButtonListenersInstalled = false;
    }
    const recallWanted = DS.state?.settings?.enabled === true && DS.state?.settings?.enableContextKeeper === true;
    try {
      if (recallWanted && !recallListenerInstalled) {
        chrome.storage?.onChanged?.addListener(onRecallStorageChanged);
        recallListenerInstalled = true;
      } else if (!recallWanted && recallListenerInstalled) {
        chrome.storage?.onChanged?.removeListener(onRecallStorageChanged);
        recallListenerInstalled = false;
      }
    } catch {}
  }
  function syncMessageButtonWatchdog() {
    syncContextKeeperListeners();
    const wanted = messageButtonsWanted();
    if (wanted && !messageButtonWatchdog) {
      messageButtonWatchdog = window.setInterval(() => {
        if (messageButtonsWanted() && !document.hidden) scheduleMessageButtonRepair(300);
      }, 7000);
    } else if (!wanted && messageButtonWatchdog) {
      clearInterval(messageButtonWatchdog);
      messageButtonWatchdog = 0;
      clearTimeout(messageButtonRepairTimer);
      messageButtonRepairTimer = 0;
    }
  }
  DS.openContextKeeper = openManager;
  DS.addContextKeeperDetails = addManyDetails;
  DS.ensureContextKeeperMessageButtonForRoot = ensureMessageButtonForRoot;
  DS.applyContextKeeper = function applyContextKeeper() {
    syncMessageButtonWatchdog();
    if (DS.state?.settings?.enableContextKeeper) prepareRecall();
    ensureMessageButtons();
    scheduleAutomaticCapture();
  };
  DS.removeContextKeeper = function removeContextKeeper() {
    // A disabled feature must remove its subscriptions, even if it has no UI.
    if (messageButtonListenersInstalled) {
      window.removeEventListener("pageshow", onMessageButtonsPageShow, true);
      document.removeEventListener("visibilitychange", onMessageButtonsVisible, true);
      messageButtonListenersInstalled = false;
    }
    if (recallListenerInstalled) {
      try { chrome.storage?.onChanged?.removeListener(onRecallStorageChanged); } catch {}
      recallListenerInstalled = false;
    }
    clearInterval(messageButtonWatchdog);
    messageButtonWatchdog = 0;
    clearTimeout(messageButtonRepairTimer);
    messageButtonRepairTimer = 0;
    if (!DS.state.contextKeeperWasActive && !document.getElementById(MODAL_ID)) return;
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => button.remove());
    document.querySelectorAll(`${MESSAGE_SELECTOR}[data-ds-context-keeper-ready]`).forEach(root => delete root.dataset.dsContextKeeperReady);
    document.getElementById(MODAL_ID)?.remove();
    clearTimeout(autoState.timer);
    autoState.timer = null;
    activeRecall = { chatId: "", details: [], ready: false };
    DS.state.contextKeeperWasActive = false;
  };
  DS.normalizeContextKeeperData = normalize;
})();

}

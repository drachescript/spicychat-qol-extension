// Automatic word/tag blocking is independent from manual Quick Block.
// This module is omitted by Custom Lite when auto-blocking is not selected.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !["auto-blocking", "bot-blocking", "cards"].every(id => profile.features.includes(id))) return;

  const AUTO_BLOCK_WORD_EXCEPTIONS_KEY = "autoBlockWordExceptionsV1";
  const AUTO_BLOCK_TAG_EXCEPTIONS_KEY = "autoBlockTagExceptionsV1";
  const AUTO_BLOCK_EXCEPTION_LIMIT = 1000;
  const autoBlockQueue = [];
  const autoBlockQueuedIds = new Set();
  const autoBlockFailureCooldown = new Map();
  let autoBlockPumpRunning = false;
  let autoBlockQueueGeneration = 0;
  const ruleExceptionCache = {
    word: { rulesKey: "", ids: new Map() },
    tag: { rulesKey: "", ids: new Map() }
  };

  function blockedRulesKeyFromValues(values) {
    const normalized = [...new Set((values || []).map(value => {
      let text = String(value || "").trim();
      try { text = text.normalize("NFKC"); } catch {}
      return text.toLocaleLowerCase();
    }).filter(Boolean))].sort();
    let hash = 2166136261;
    const payload = normalized.join("\u001f");
    for (let index = 0; index < payload.length; index += 1) {
      hash ^= payload.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${normalized.length}:${(hash >>> 0).toString(16)}`;
  }

  const ruleSpecs = {
    word: { key: AUTO_BLOCK_WORD_EXCEPTIONS_KEY, setting: "blockedWords", enabled: "autoBlockWordMatches" },
    tag: { key: AUTO_BLOCK_TAG_EXCEPTIONS_KEY, setting: "blockedTags", enabled: "autoBlockTagMatches" }
  };
  function currentRulesKey(kind) {
    return blockedRulesKeyFromValues(DS.state?.settings?.[ruleSpecs[kind].setting] || []);
  }
  function normalizeExceptionEntries(value) {
    if (!value || typeof value !== "object") return new Map();
    const source = Array.isArray(value) ? value.map(id => [id, Date.now()]) : Object.entries(value);
    const entries = new Map();
    for (const [idValue, atValue] of source) {
      const id = String(idValue || "").trim().toLowerCase();
      if (id) entries.set(id, Number(atValue || 0) || Date.now());
    }
    return entries;
  }
  async function loadRuleExceptions(kind) {
    const spec = ruleSpecs[kind];
    const rulesKey = currentRulesKey(kind);
    if (ruleExceptionCache[kind].rulesKey === rulesKey) return ruleExceptionCache[kind].ids;
    let stored = null;
    try { stored = (await DS.storageGet?.([spec.key]))?.[spec.key] || null; } catch {}
    const ids = stored?.rulesKey === rulesKey ? normalizeExceptionEntries(stored.ids) : new Map();
    ruleExceptionCache[kind] = { rulesKey, ids };
    if (stored && stored.rulesKey !== rulesKey) {
      DS.storageSet?.({ [spec.key]: { version: 1, rulesKey, ids: {} } }).catch?.(() => {});
    }
    return ids;
  }
  async function persistRuleExceptions(kind, ids) {
    const rulesKey = currentRulesKey(kind);
    const trimmed = [...ids.entries()]
      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
      .slice(0, AUTO_BLOCK_EXCEPTION_LIMIT);
    ruleExceptionCache[kind] = { rulesKey, ids: new Map(trimmed) };
    await DS.storageSet?.({
      [ruleSpecs[kind].key]: { version: 1, rulesKey, ids: Object.fromEntries(trimmed) }
    });
  }

  try {
    chrome.storage?.onChanged?.addListener?.((changes, areaName) => {
      if (areaName !== "local") return;
      for (const kind of Object.keys(ruleSpecs)) {
        const key = ruleSpecs[kind].key;
        if (!changes?.[key]) continue;
        const stored = changes[key]?.newValue || null;
        const rulesKey = currentRulesKey(kind);
        ruleExceptionCache[kind] = {
          rulesKey,
          ids: stored?.rulesKey === rulesKey ? normalizeExceptionEntries(stored.ids) : new Map()
        };
      }
    });
  } catch {}

  // Keep this established entry point: Unblock buttons call it already.
  // A manual unblock protects matching word AND tag rules independently.
  DS.rememberAutoBlockWordException = async function rememberAutoBlockWordException(idValue) {
    const id = String(idValue || "").trim().toLowerCase();
    if (!id) return false;
    let saved = false;
    for (const kind of Object.keys(ruleSpecs)) {
      if (currentRulesKey(kind).startsWith("0:")) continue;
      try {
        const ids = await loadRuleExceptions(kind);
        ids.set(id, Date.now());
        await persistRuleExceptions(kind, ids);
        saved = true;
      } catch {}
    }
    return saved;
  };

  function autoBlockFavoriteProtected(card, id) {
    const settings = DS.state?.settings || {};
    if (!settings.protectFavoritesFromBlocking) return false;
    if (DS.isFavoriteBotsPage?.()) return true;
    if (DS.state?.favoriteBotIdSet?.has?.(id)) return true;
    return !!card?.querySelector?.("button[aria-label='unfavorite'], button[aria-label*='unfavorite' i]");
  }

  function autoBlockingEnabled(settings) {
    return !!settings.enabled && !!settings.blockCards &&
      (!!settings.autoBlockWordMatches || !!settings.autoBlockTagMatches);
  }

  async function runAutoBlockQueue() {
    if (autoBlockPumpRunning) return;
    autoBlockPumpRunning = true;
    try {
      while (autoBlockQueue.length) {
        const job = autoBlockQueue.shift();
        const id = String(job?.id || "").trim().toLowerCase();
        if (!id) continue;
        const generation = autoBlockQueueGeneration;
        try {
          const settings = DS.state?.settings || {};
          if (!autoBlockingEnabled(settings)) continue;
          if (DS.state?.blockedBotIdSet?.has?.(id)) continue;
          if (autoBlockFavoriteProtected(job.card, id) || DS.isMyCreationsPage?.()) continue;
          let word = !!job.word && !!settings.autoBlockWordMatches && currentRulesKey("word") === job.wordRulesKey;
          let tag = !!job.tag && !!settings.autoBlockTagMatches && currentRulesKey("tag") === job.tagRulesKey;
          // Treat each rule exemption separately: disabling an exempt word
          // should not suppress an independently eligible tag rule.
          if (word && (await loadRuleExceptions("word")).has(id)) word = false;
          if (tag && (await loadRuleExceptions("tag")).has(id)) tag = false;
          if (!word && !tag) continue;
          // Cards may be recycled as listing pages update while the queue waits
          // on storage; do not block a different bot using an old rule match.
          const currentId = String(DS.botIdFromHref?.(job.anchor?.href || "") || DS.chatIdFromHref?.(job.anchor?.href || "") || "").trim().toLowerCase();
          if (generation !== autoBlockQueueGeneration || !autoBlockingEnabled(DS.state?.settings || {}) ||
              !job.anchor?.isConnected || !job.card?.isConnected || currentId !== id ||
              typeof DS.blockBotFromCard !== "function") continue;
          if (DS.state?.blockedBotIdSet?.has?.(id) || autoBlockFavoriteProtected(job.card, id)) continue;
          // Same ID is not sufficient: a card can receive a different title or
          // tags while pending in the queue. Avoid persisting stale rule hits.
          const verified = DS.getVerifiedCardAutoBlockMatches?.(job.card);
          const normalizeHit = hit => String(hit || "").normalize("NFKC").toLocaleLowerCase().trim();
          if (!verified) continue;
          word = word && !!verified.word && normalizeHit(verified.word.raw) === normalizeHit(job.word);
          tag = tag && !!verified.tag && normalizeHit(verified.tag.raw) === normalizeHit(job.tag);
          if (!word && !tag) continue;

          const result = await DS.blockBotFromCard(job.card, job.anchor, {
            source: word ? "blocked-word" : "blocked-tag",
            blockedWord: word ? job.word : "",
            blockedTag: tag ? job.tag : "",
            blockedWordRulesKey: word ? job.wordRulesKey : "",
            blockedTagRulesKey: tag ? job.tagRulesKey : "",
            autoBlockedByWord: word,
            autoBlockedByTag: tag
          });
          if (result?.ok) {
            const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
            if (word) perf.autoBlockedWordBots = Number(perf.autoBlockedWordBots || 0) + 1;
            if (tag) perf.autoBlockedTagBots = Number(perf.autoBlockedTagBots || 0) + 1;
          } else {
            autoBlockFailureCooldown.set(id, Date.now() + 30000);
          }
        } catch {
          autoBlockFailureCooldown.set(id, Date.now() + 30000);
        } finally {
          // A stopped queue may already have been restarted with this ID.
          if (generation === autoBlockQueueGeneration) autoBlockQueuedIds.delete(id);
        }
        if (autoBlockQueue.length) await new Promise(resolve => setTimeout(resolve, 120));
      }
    } finally {
      autoBlockPumpRunning = false;
    }
  }

  DS.queueAutoBlockRuleMatch = function queueAutoBlockRuleMatch(card, anchor, matches = {}) {
    const settings = DS.state?.settings || {};
    if (!autoBlockingEnabled(settings)) return false;
    const word = settings.autoBlockWordMatches ? String(matches.word?.raw || "").trim().slice(0, 240) : "";
    const tag = settings.autoBlockTagMatches ? String(matches.tag?.raw || "").trim().slice(0, 240) : "";
    if (!word && !tag) return false;
    const id = String(DS.botIdFromHref?.(anchor?.href || "") || DS.chatIdFromHref?.(anchor?.href || "") || "").trim().toLowerCase();
    if (!id || DS.state?.blockedBotIdSet?.has?.(id) || autoBlockQueuedIds.has(id)) return false;
    if (Number(autoBlockFailureCooldown.get(id) || 0) > Date.now()) return false;
    if (autoBlockFavoriteProtected(card, id) || DS.isMyCreationsPage?.()) return false;
    autoBlockQueuedIds.add(id);
    autoBlockQueue.push({ id, card, anchor, word, tag, wordRulesKey: currentRulesKey("word"), tagRulesKey: currentRulesKey("tag") });
    queueMicrotask(() => { runAutoBlockQueue().catch(() => {}); });
    return true;
  };

  // Compatibility for code that calls the old word-only queue.
  DS.queueAutoBlockWordMatch = function queueAutoBlockWordMatch(card, anchor, match = null) {
    return DS.queueAutoBlockRuleMatch(card, anchor, { word: match });
  };

  DS.stopAutoBlockRules = function stopAutoBlockRules() {
    autoBlockQueueGeneration += 1;
    autoBlockQueue.length = 0;
    autoBlockQueuedIds.clear();
  };
})();
}

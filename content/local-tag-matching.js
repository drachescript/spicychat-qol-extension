(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ALLOWED = new Set(["title", "description", "greeting", "personality", "scenario", "examples"]);
  const checked = new Map();
  const publicFailures = new Map();
  let lastRun = 0;
  let running = false;
  let rulesSignature = "";
  let cursor = 0;

  function clean(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function safePhrase(value) {
    const phrase = clean(value);
    if (!phrase || phrase.length > 100) return null;
    const star = phrase.endsWith("*");
    const plain = star ? phrase.slice(0, -1) : phrase;
    if (plain.length < 3) return null;
    const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}${star ? "[\\p{L}\\p{N}]*" : ""}(?=$|[^\\p{L}\\p{N}])`, "iu");
    } catch { return null; }
  }
  function parseRules(text) {
    const output = [];
    for (const line of String(text || "").split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith("#")) continue;
      const at = raw.indexOf("=>");
      const colon = raw.indexOf(":", at + 2);
      if (at < 1 || colon < 0) continue;
      const tag = clean(raw.slice(0, at));
      if (!tag || tag.length > 40) continue;
      const fields = raw.slice(at + 2, colon).split(",").map(f => clean(f).toLowerCase());
      const set = new Set(fields.map(f => f === "example" || f === "dialogue" ? "examples" : f).filter(f => ALLOWED.has(f)));
      const patterns = raw.slice(colon + 1).split(",").map(safePhrase).filter(Boolean);
      if (set.size && patterns.length) output.push({ tag, fields: [...set], patterns });
    }
    return output.slice(0, 100);
  }
  function matched(fields, rule) {
    return rule.fields.some(field => rule.patterns.some(pattern => pattern.test(String(fields[field] || ""))));
  }
  function pickFields(card, cache) {
    const stored = cache?.fields && typeof cache.fields === "object" ? cache.fields : cache || {};
    return {
      title: clean(DS.getCardTitle?.(card) || stored.title || stored.name || ""),
      description: clean(DS.getCardDescriptionText?.(card) || stored.description || ""),
      greeting: String(stored.greeting || ""),
      personality: String(stored.personality || ""),
      scenario: String(stored.scenario || ""),
      examples: String(stored.exampleDialogues || stored.examples || "")
    };
  }
  async function archived(ids) {
    if (typeof DS.largeStorageGetRecords === "function") {
      try { return await DS.largeStorageGetRecords(DS.BOT_ARCHIVE_KEY || "botArchive", ids) || {}; } catch {}
    }
    const raw = await DS.storageGet?.([DS.BOT_ARCHIVE_KEY || "botArchive"]) || {};
    return raw[DS.BOT_ARCHIVE_KEY || "botArchive"]?.meta || {};
  }
  function collect() {
    const all = DS.collectCards?.() || [];
    const found = [], seen = new Set();
    for (const { card, anchor } of all) {
      const id = String(DS.botIdFromHref?.(anchor?.href || "") || "").toLowerCase();
      if (!id || seen.has(id) || !card?.isConnected) continue;
      seen.add(id); found.push({ id, card });
    }
    return found;
  }
  function allowedHere() {
    const path = String(location.pathname || "");
    if (/^\/(?:my-creations|chatbot\/edit|lorebook\/edit|personas)(?:\/|$)/i.test(path)) return false;
    if (DS.isSingleChatPage?.() || DS.isBotProfilePage?.()) return false;
    return true;
  }

  DS.applyLocalTagMatching = async function applyLocalTagMatching() {
    const s = DS.state?.settings || {};
    if (!s.enabled || !s.localTagMatchEnabled || !allowedHere() || running) return;
    if (Date.now() - lastRun < 6000) return;
    lastRun = Date.now();
    const text = String(s.localTagMatchRules || "");
    const signature = text + "|public:" + (s.localTagMatchFetchPublic === true);
    if (signature !== rulesSignature) { checked.clear(); cursor = 0; rulesSignature = signature; }
    const rules = parseRules(text);
    if (!rules.length) return;
    const all = collect();
    if (!all.length) return;
    const batch = [];
    for (let n = 0; n < Math.min(all.length, 45); n++) {
      const item = all[(cursor + n) % all.length];
      const previous = checked.get(item.id);
      const visibleKey = clean(DS.getCardTitle?.(item.card)) + "|" + clean(DS.getCardDescriptionText?.(item.card));
      if (previous?.signature === signature && previous?.visibleKey === visibleKey && Date.now() - previous.when < 60000) continue;
      batch.push({ ...item, visibleKey });
      if (batch.length >= 24) break;
    }
    cursor = (cursor + 24) % all.length;
    if (!batch.length) return;
    running = true;
    try {
      const snapshots = await archived(batch.map(item => item.id));
      const added = new Map();
      let publicReads = 0;
      for (const item of batch) {
        const cache = snapshots[item.id];
        const fields = pickFields(item.card, cache);
        let matching = rules.filter(rule => matched(fields, rule));
        const needsDetails = rules.some(rule => rule.fields.some(field => !["title", "description"].includes(field)));
        if (s.localTagMatchFetchPublic === true && needsDetails &&
            publicReads < 3 && typeof DS.fetchPublicCharacterFieldsDetailed === "function" &&
            Date.now() - Number(publicFailures.get(item.id) || 0) >= 5 * 60 * 1000 &&
            rules.some(rule => !matching.includes(rule) && rule.fields.some(field => !fields[field]))) {
          publicReads++;
          try {
            const live = await DS.fetchPublicCharacterFieldsDetailed(item.id);
            if (live?.ok && live.fields) {
              for (const [key, value] of Object.entries(live.fields)) {
                const mapped = key === "exampleDialogues" ? "examples" : key;
                if (ALLOWED.has(mapped) && !fields[mapped]) fields[mapped] = String(value || "");
              }
              matching = rules.filter(rule => matched(fields, rule));
            } else publicFailures.set(item.id, Date.now());
          } catch { publicFailures.set(item.id, Date.now()); }
        }
        if (matching.length) added.set(item.id, { tags: matching.map(rule => rule.tag), fields });
        checked.set(item.id, { signature, visibleKey: item.visibleKey, when: Date.now() });
      }
      if (!added.size) return;
      const key = DS.BOT_ORGANIZER_KEY || "botOrganization";
      const stored = await DS.storageGet?.([key]);
      const current = stored?.[key] && typeof stored[key] === "object" ? stored[key] : (DS.state.botOrganization || {});
      const next = { collections: Array.isArray(current.collections) ? current.collections : [], meta: { ...(current.meta || {}) } };
      let updates = 0;
      for (const [id, info] of added) {
        const previous = next.meta[id] || {};
        const before = Array.isArray(previous.tags) ? previous.tags : [];
        const tags = [...new Set([...before, ...info.tags])].slice(0, 40);
        if (tags.length === before.length) continue;
        const item = batch.find(entry => entry.id === id);
        next.meta[id] = {
          ...previous, id,
          name: clean(previous.name || info.fields.title || id),
          tags, updatedAt: Date.now()
        };
        if (item?.card) next.meta[id].image ||= DS.getCardImageUrl?.(item.card) || "";
        updates++;
      }
      if (updates) {
        await DS.saveBotOrganization?.(next);
        DS.scheduleRun?.({ priority: "slow", source: "local-tags-matched" });
      }
    } finally {
      running = false;
    }
  };
})();

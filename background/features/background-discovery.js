"use strict";

// Feature-owned background helpers: discovery. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeRandomChatId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function secureBackgroundRandomInt(maxExclusive) {
  const max = Math.floor(Number(maxExclusive) || 0);
  if (max <= 1) return 0;
  try {
    const limit = Math.floor(0x100000000 / max) * max;
    const values = new Uint32Array(1);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
  } catch {
    return Math.floor(Math.random() * max);
  }
}

function shuffleBackgroundRandom(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = secureBackgroundRandomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomChatDocument(doc) {
  const id = normalizeRandomChatId(doc?.character_id);
  if (!id) return null;
  return {
    id,
    name: String(doc?.name || doc?.title || "").trim().slice(0, 180),
    creator: String(doc?.creator_username || "").trim().slice(0, 180),
    tags: Array.isArray(doc?.tags) ? doc.tags.map(tag => String(tag || "").trim()).filter(Boolean).slice(0, 80) : [],
    avatarUrl: String(doc?.avatar_url || "").trim(),
    isNsfw: doc?.is_nsfw === true,
    href: `https://spicychat.ai/chat/${id}`
  };
}

function randomChatHomeQueryFromUrl(rawUrl) {
  let q = "*";
  try {
    const url = new URL(String(rawUrl || "https://spicychat.ai/"));
    for (const [key, value] of url.searchParams.entries()) {
      if (/\[query\]$/i.test(key) && String(value || "").trim()) {
        q = String(value).trim().slice(0, 250);
        break;
      }
    }
  } catch {}
  return q || "*";
}

async function typesenseMultiSearch(searches, timeoutMs = 8000, apiKey = EXACT_MESSAGE_TYPESENSE_KEY, diagnosticFeature = "typesense") {
  const controller = new AbortController();
  const network = qolBackgroundNetworkStart(diagnosticFeature, "POST", EXACT_MESSAGE_TYPESENSE_URL, { searches: Array.isArray(searches) ? searches.length : 0 });
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000));
  try {
    const response = await fetch(EXACT_MESSAGE_TYPESENSE_URL, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": String(apiKey || EXACT_MESSAGE_TYPESENSE_KEY)
      },
      body: JSON.stringify({ searches })
    });
    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      return { ok: false, status: response.status, error: `Typesense returned HTTP ${response.status}.` };
    }
    const data = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    return { ok: true, data };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-error" });
    return { ok: false, status: error?.name === "AbortError" ? "timeout" : "network-error", error: error?.message || String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function getLorebookTypesenseConfig({ force = false } = {}) {
  const now = Date.now();
  const cached = lorebookTypesenseConfigCache;
  if (!force && cached?.lorebookKey && cached?.entryKey && now - Number(cached.fetchedAt || 0) < LOREBOOK_TYPESENSE_CONFIG_TTL_MS) {
    return { ok: true, ...cached, cached: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const network = qolBackgroundNetworkStart("lorebook-status", "GET", SPICYCHAT_APPLICATION_CONFIG_URL, { purpose: "typesense-config" });
  try {
    const response = await fetch(SPICYCHAT_APPLICATION_CONFIG_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "x-app-id": "spicychat",
        "x-guest-userid": LOREBOOK_CONFIG_GUEST_ID,
        "x-country": "US",
        "x-platform": "WEB",
        "x-platform-os": "DESKTOP"
      }
    });
    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      throw new Error(`SpicyChat application config returned HTTP ${response.status}.`);
    }
    const payload = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    const config = payload?.typesenseConfig && typeof payload.typesenseConfig === "object" ? payload.typesenseConfig : {};
    const next = {
      fetchedAt: now,
      lorebookKey: String(config.apiKeyLorebook || "").trim(),
      entryKey: String(config.apiKeyLorebookEntries || "").trim(),
      lorebookCollection: String(config.collectionNameLorebook || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION).trim() || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION,
      entryCollection: String(config.collectionNameLorebookEntries || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION).trim() || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION
    };
    if (!next.lorebookKey) throw new Error("SpicyChat application config did not provide apiKeyLorebook.");
    lorebookTypesenseConfigCache = next;
    return { ok: true, ...next, cached: false };
  } catch (error) {
    if (network) qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "error" });
    if (cached?.lorebookKey) {
      return { ok: true, ...cached, cached: true, stale: true, warning: error?.message || String(error) };
    }
    return {
      ok: false,
      status: error?.name === "AbortError" ? "timeout" : "config-error",
      error: error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePublicLorebookId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id) ? id : "";
}

function cleanPublicLorebookList(value) {
  const raw = Array.isArray(value) ? value : (typeof value === "string" ? value.split(/[,;|]/g) : []);
  return [...new Set(raw.map(item => String(item || "").replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function publicLorebookIndexDocument(doc) {
  if (!doc || typeof doc !== "object") return null;
  const id = normalizePublicLorebookId(doc.lorebook_id || doc.lorebookId || doc.id);
  if (!id) return null;
  return {
    id,
    name: String(doc.name || doc.title || "").replace(/\s+/g, " ").trim().slice(0, 300),
    description: String(doc.description || "").replace(/\s+/g, " ").trim().slice(0, 8000),
    creator: String(doc.creator_username || doc.creatorUsername || "").replace(/\s+/g, " ").trim().slice(0, 300),
    creatorId: String(doc.creator_user_id || doc.creatorUserId || "").trim(),
    image: String(doc.avatar_url || doc.avatarUrl || doc.image || "").trim().slice(0, 3000),
    tags: cleanPublicLorebookList(doc.tags).slice(0, 120),
    visibility: String(doc.visibility || "").trim().slice(0, 80),
    status: String(doc.status || "").trim().slice(0, 80),
    entryCount: Math.max(0, Number(doc.num_entries ?? doc.numEntries ?? doc.entries_count ?? 0) || 0),
    version: Math.max(0, Number(doc.version || 0) || 0),
    numAttachedCharacters: Math.max(0, Number(doc.numAttachedCharacters ?? doc.num_attached_characters ?? 0) || 0),
    createdAt: String(doc.createdAt || doc.created_at || "").trim(),
    updatedAt: String(doc.updatedAt || doc.updated_at || "").trim(),
    isNsfw: doc.is_nsfw === true || doc.isNsfw === true,
    avatarIsNsfw: doc.avatar_is_nsfw === true || doc.avatarIsNsfw === true,
    profileUrl: `https://spicychat.ai/lorebook/${id}`
  };
}

async function checkPublicLorebookIndexBatch(message) {
  const ids = [...new Set((Array.isArray(message?.ids) ? message.ids : [])
    .map(normalizePublicLorebookId)
    .filter(Boolean))].slice(0, 60);
  if (!ids.length) return { ok: true, results: [] };

  const config = await getLorebookTypesenseConfig();
  if (!config?.ok || !config.lorebookKey) {
    return { ok: false, status: config?.status || "config-error", error: config?.error || "Could not load the current public Lorebook search key." };
  }

  const searches = ids.map(id => ({
    collection: config.lorebookCollection || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION,
    q: "*",
    query_by: PUBLIC_LOREBOOK_TYPESENSE_QUERY_BY,
    filter_by: `lorebook_id:=${id}`,
    per_page: 1
  }));
  const response = await typesenseMultiSearch(searches, 10000, config.lorebookKey, "lorebook-status");
  if (!response.ok) return response;
  const buckets = Array.isArray(response.data?.results) ? response.data.results : [];
  const results = [];
  for (let index = 0; index < ids.length; index += 1) {
    const requestedId = ids[index];
    const bucket = buckets[index];
    if (bucket?.error) {
      results.push({ id: requestedId, found: false, meta: null, error: String(bucket.error || "Typesense query failed.") });
      continue;
    }
    const doc = bucket?.hits?.[0]?.document;
    const meta = publicLorebookIndexDocument(doc);
    results.push({ id: requestedId, found: !!meta, meta: meta || null });
  }
  return {
    ok: true,
    results,
    source: `typesense:${config.lorebookCollection || PUBLIC_LOREBOOK_TYPESENSE_COLLECTION}`,
    configCached: !!config.cached
  };
}

function normalizePublicLorebookEntry(doc) {
  if (!doc || typeof doc !== "object") return null;
  const id = String(doc.id || doc.entry_id || doc.entryId || "").trim();
  const keywords = cleanPublicLorebookList(doc.keywords || doc.keys || doc.keywords_list || []);
  const secondaryKeywords = cleanPublicLorebookList(doc.secondaryKeywords || doc.secondary_keywords || doc.secondary_keys || []);
  const numberOrNull = value => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    id,
    name: String(doc.name || doc.title || "").replace(/\s+/g, " ").trim().slice(0, 500),
    keywords,
    secondaryKeywords,
    content: String(doc.content || doc.text || ""),
    version: doc.version ?? "",
    createdAt: String(doc.createdAt || doc.created_at || "").trim(),
    updatedAt: String(doc.updatedAt || doc.updated_at || "").trim(),
    priority: numberOrNull(doc.priority ?? doc.sortPriority ?? doc.sort_priority),
    sortPriority: numberOrNull(doc.sortPriority ?? doc.sort_priority ?? doc.priority),
    status: String(doc.status || "").trim().slice(0, 120),
    enabled: doc.enabled !== false,
    constant: doc.constant === true,
    selective: doc.selective === true,
    caseSensitive: doc.caseSensitive === true || doc.case_sensitive === true,
    probability: numberOrNull(doc.probability),
    depth: numberOrNull(doc.depth),
    role: String(doc.role || doc.position || "").trim().slice(0, 120),
    isNsfw: doc.is_nsfw === true || doc.isNsfw === true
  };
}

async function fetchPublicLorebookRecovery(message) {
  const lorebookId = normalizePublicLorebookId(message?.lorebookId);
  if (!lorebookId) return { ok: false, status: "invalid-id", error: "Missing or invalid Lorebook UUID." };
  const expectedCount = Math.max(0, Number(message?.expectedCount || 0) || 0);

  const config = await getLorebookTypesenseConfig();
  if (!config?.ok || !config.entryKey) {
    return { ok: false, status: config?.status || "config-error", error: config?.error || "Could not load the current public Lorebook-entry search key." };
  }

  const pageSize = 250;
  const maxPages = 100;
  const filterFields = ["lorebook_id", "lorebookId"];
  const queryFields = [PUBLIC_LOREBOOK_ENTRY_TYPESENSE_QUERY_BY, "name"];
  let lastError = "";
  let emptySuccess = null;

  for (const filterField of filterFields) {
    for (const queryBy of queryFields) {
      const entries = [];
      let found = null;
      let complete = false;
      let failed = false;

      for (let page = 1; page <= maxPages; page += 1) {
        const search = {
          collection: config.entryCollection || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION,
          q: "*",
          query_by: queryBy,
          page,
          per_page: pageSize,
          filter_by: `${filterField}:=${lorebookId}`
        };
        const response = await typesenseMultiSearch([search], 12000, config.entryKey, "lorebook-recovery");
        if (!response?.ok) {
          lastError = response?.error || `Public Lorebook-entry search failed (${response?.status || "unknown"}).`;
          failed = true;
          break;
        }

        const bucket = Array.isArray(response.data?.results) ? response.data.results[0] : null;
        if (bucket?.error) {
          lastError = String(bucket.error || "Public Lorebook-entry query failed.");
          failed = true;
          break;
        }

        if (found === null && Number.isFinite(Number(bucket?.found))) found = Math.max(0, Number(bucket.found));
        const docs = Array.isArray(bucket?.hits) ? bucket.hits.map(hit => hit?.document).filter(Boolean) : [];
        for (const doc of docs) {
          const normalized = normalizePublicLorebookEntry(doc);
          if (normalized) entries.push(normalized);
        }

        if (docs.length < pageSize || (found !== null && entries.length >= found)) {
          complete = true;
          break;
        }
      }

      if (failed) continue;
      if (!complete) {
        lastError = `Public Lorebook-entry recovery exceeded ${maxPages * pageSize} entries before completing.`;
        continue;
      }

      const result = {
        ok: true,
        lorebookId,
        entries,
        found: found === null ? entries.length : found,
        complete: true,
        source: `typesense:${config.entryCollection || PUBLIC_LOREBOOK_ENTRY_TYPESENSE_COLLECTION}`,
        filterField,
        queryBy
      };
      if (entries.length) return result;
      if (!emptySuccess) emptySuccess = result;
    }
  }

  if (emptySuccess) {
    if (expectedCount > 0) {
      return {
        ok: false,
        status: "empty-recovery",
        error: `Public index reports ${expectedCount} entr${expectedCount === 1 ? "y" : "ies"}, but the public entry collection returned none. The previous recovery copy was kept.`,
        source: emptySuccess.source
      };
    }
    return emptySuccess;
  }

  return {
    ok: false,
    status: "entry-query-failed",
    error: lastError || "Public Lorebook-entry recovery produced no usable result."
  };
}

async function runLorebookStatusHelperCheck(message) {
  const lorebookId = normalizePublicLorebookId(message?.lorebookId);
  if (!lorebookId) return { ok: false, status: "unknown", httpStatus: 0, reason: "Missing or invalid Lorebook UUID." };

  const forceOwnHelper = !!message?.forceOwnHelper;
  const worker = await prepareBotStatusWorker({ forceOwnHelper });
  const tabId = Number(worker?.tabId || 0);
  if (!tabId) return { ok: false, status: "unknown", httpStatus: 0, reason: "Could not create or reuse the signed-in Lorebook Status helper." };

  let response = await runTrackedBotStatusRequest(() => withBackgroundJob("bot-status", {
    ownerTabId: tabId,
    detail: `lorebook:${lorebookId}`,
    maxHoldMs: 28000
  }, async () => {
    const result = await tabsSendMessageWithTimeout(tabId, { type: "DS_LOREBOOK_STATUS_API_CHECK", lorebookId }, 24000);
    if (result?.__dsTimeout) return { ok: false, status: "unknown", httpStatus: 0, reason: "Lorebook Status helper timed out during the authenticated recovery-copy request.", recoveryAttempted: true };
    return result;
  }));

  if (!message?.keepHelper) await releaseBotStatusWorker({ reason: "lorebook-status-normal-release" });
  return response || { ok: false, status: "unknown", httpStatus: 0, reason: "Lorebook Status helper returned no response." };
}

async function pickRandomChatCandidates(message) {
  const scope = String(message?.scope || "home").toLowerCase() === "favorites" ? "favorites" : "home";
  const batchSize = Math.min(40, Math.max(6, Number(message?.batchSize || 24) || 24));
  const excluded = new Set((Array.isArray(message?.excludeIds) ? message.excludeIds : []).map(normalizeRandomChatId).filter(Boolean));
  const includeFields = "character_id,name,title,creator_username,tags,avatar_url,is_nsfw";

  const visibleIds = shuffleBackgroundRandom([...new Set((Array.isArray(message?.visibleIds) ? message.visibleIds : []).map(normalizeRandomChatId).filter(Boolean))])
    .filter(id => !excluded.has(id));

  // On Home / Recommended, prefer the cards SpicyChat actually put in the
  // current listing. We still validate them through the public API, so Random
  // Chat follows that page instead of silently becoming a separate discovery
  // feed. If the page has no cards yet, fall back to a direct discovery query.
  if (scope === "home" && visibleIds.length) {
    const ids = visibleIds.slice(0, Math.max(batchSize, 40));
    const searches = ids.map(id => ({
      collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
      q: "*",
      query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
      filter_by: `application_ids:spicychat && character_id:=${id}`,
      include_fields: includeFields,
      per_page: 1
    }));
    const result = await typesenseMultiSearch(searches, 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
    if (!result.ok) return result;
    const candidates = [];
    for (const item of Array.isArray(result.data?.results) ? result.data.results : []) {
      const normalized = randomChatDocument(item?.hits?.[0]?.document);
      if (normalized && !excluded.has(normalized.id)) candidates.push(normalized);
    }
    return { ok: true, scope, candidates: shuffleBackgroundRandom(candidates).slice(0, batchSize), found: candidates.length, source: "visible-listing-api" };
  }

  if (scope === "favorites") {
    const ids = shuffleBackgroundRandom([...new Set((Array.isArray(message?.favoriteIds) ? message.favoriteIds : []).map(normalizeRandomChatId).filter(Boolean))])
      .filter(id => !excluded.has(id))
      .slice(0, Math.max(batchSize, 30));
    if (!ids.length) return { ok: true, scope, candidates: [], found: 0 };
    const searches = ids.map(id => ({
      collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
      q: "*",
      query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
      filter_by: `application_ids:spicychat && character_id:=${id}`,
      include_fields: includeFields,
      per_page: 1
    }));
    const result = await typesenseMultiSearch(searches, 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
    if (!result.ok) return result;
    const candidates = [];
    for (const item of Array.isArray(result.data?.results) ? result.data.results : []) {
      const doc = item?.hits?.[0]?.document;
      const normalized = randomChatDocument(doc);
      if (normalized && !excluded.has(normalized.id)) candidates.push(normalized);
    }
    return { ok: true, scope, candidates: shuffleBackgroundRandom(candidates).slice(0, batchSize), found: candidates.length };
  }

  const q = randomChatHomeQueryFromUrl(message?.sourceUrl);
  const baseSearch = {
    collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
    q,
    query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
    filter_by: "application_ids:spicychat && tags:![Step-Family]",
    include_fields: includeFields,
    sort_by: "_text_match(buckets: 3):desc,num_messages_24h:desc",
    per_page: 1,
    page: 1
  };
  const meta = await typesenseMultiSearch([baseSearch], 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
  if (!meta.ok) return meta;
  const first = Array.isArray(meta.data?.results) ? meta.data.results[0] : null;
  const found = Math.max(0, Number(first?.found || 0) || 0);
  if (!found) return { ok: true, scope, candidates: [], found: 0, q };

  // Typesense numbered pages have a practical result window. Randomize inside
  // that window instead of opening/rendering helper pages in the browser.
  const perPage = 250;
  const pageCount = Math.max(1, Math.min(168, Math.ceil(found / perPage)));
  const page = secureBackgroundRandomInt(pageCount) + 1;
  const pageResult = await typesenseMultiSearch([{ ...baseSearch, page, per_page: perPage }], 8000, EXACT_MESSAGE_TYPESENSE_KEY, "random-chat");
  if (!pageResult.ok) return pageResult;
  const result = Array.isArray(pageResult.data?.results) ? pageResult.data.results[0] : null;
  const candidates = shuffleBackgroundRandom((Array.isArray(result?.hits) ? result.hits : [])
    .map(hit => randomChatDocument(hit?.document))
    .filter(Boolean)
    .filter(candidate => !excluded.has(candidate.id)))
    .slice(0, batchSize);
  return { ok: true, scope, candidates, found, page, pageCount, q };
}

function normalizeExactMessageBotId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id) ? id : "";
}

async function fetchCharacterIndexMetadata(message) {
  const rawIds = Array.isArray(message?.ids) ? message.ids : [];
  const ids = [...new Set(rawIds.map(normalizeExactMessageBotId).filter(Boolean))].slice(0, EXACT_MESSAGE_MAX_IDS);
  if (!ids.length) return { ok: true, metadata: [], missing: [] };

  const searches = ids.map(id => ({
    collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
    q: "*",
    query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
    filter_by: `application_ids:spicychat && character_id:=${id}`,
    include_fields: "character_id,createdAt,updatedAt",
    per_page: 1
  }));

  const result = await typesenseMultiSearch(searches, 8000, EXACT_MESSAGE_TYPESENSE_KEY, "my-creations-backup");
  if (!result?.ok) {
    return {
      ok: false,
      status: result?.status || "typesense-failed",
      error: result?.error || "SpicyChat character index metadata request failed.",
      metadata: [],
      missing: ids
    };
  }

  const metadata = [];
  const found = new Set();
  const results = Array.isArray(result.data?.results) ? result.data.results : [];
  for (let index = 0; index < results.length; index += 1) {
    const requestedId = ids[index];
    const hit = Array.isArray(results[index]?.hits) ? results[index].hits[0] : null;
    const doc = hit?.document && typeof hit.document === "object" ? hit.document : null;
    const id = normalizeExactMessageBotId(doc?.character_id || requestedId);
    if (!id || !doc) continue;
    metadata.push({
      id,
      createdAt: String(doc.createdAt || doc.created_at || "").trim() || null,
      updatedAt: String(doc.updatedAt || doc.updated_at || "").trim() || null
    });
    found.add(requestedId);
  }

  return {
    ok: true,
    metadata,
    missing: ids.filter(id => !found.has(id)),
    source: `typesense:${EXACT_MESSAGE_TYPESENSE_COLLECTION}`
  };
}

async function fetchExactMessageCounts(message) {
  const rawIds = Array.isArray(message?.ids) ? message.ids : [];
  const ids = [...new Set(rawIds.map(normalizeExactMessageBotId).filter(Boolean))].slice(0, EXACT_MESSAGE_MAX_IDS);
  if (!ids.length) return { ok: true, counts: [], missing: [] };

  const searches = ids.map(id => ({
    collection: EXACT_MESSAGE_TYPESENSE_COLLECTION,
    q: "*",
    query_by: EXACT_MESSAGE_TYPESENSE_QUERY_BY,
    filter_by: `application_ids:spicychat && character_id:=${id}`,
    include_fields: "character_id,num_messages,createdAt",
    per_page: 1
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const network = qolBackgroundNetworkStart("exact-message-counts", "POST", EXACT_MESSAGE_TYPESENSE_URL, { botCount: ids.length });
  try {
    const response = await fetch(EXACT_MESSAGE_TYPESENSE_URL, {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": EXACT_MESSAGE_TYPESENSE_KEY
      },
      body: JSON.stringify({ searches })
    });

    if (!response.ok) {
      qolBackgroundNetworkEnd(network, { status: response.status, ok: false, outcome: "http" });
      return { ok: false, status: response.status, error: `Typesense returned HTTP ${response.status}.`, counts: [] };
    }

    const data = await response.json();
    qolBackgroundNetworkEnd(network, { status: response.status, ok: true, outcome: "success" });
    const counts = [];
    const found = new Set();
    const results = Array.isArray(data?.results) ? data.results : [];
    for (let index = 0; index < results.length; index += 1) {
      const requestedId = ids[index];
      const result = results[index];
      const hit = Array.isArray(result?.hits) ? result.hits[0] : null;
      const doc = hit?.document && typeof hit.document === "object" ? hit.document : null;
      const id = normalizeExactMessageBotId(doc?.character_id || requestedId);
      const count = Number(doc?.num_messages);
      if (!id || !Number.isFinite(count) || count < 0) continue;
      counts.push({
        id,
        count: Math.round(count),
        createdAt: doc?.createdAt ?? null
      });
      found.add(requestedId);
    }

    return {
      ok: true,
      counts,
      missing: ids.filter(id => !found.has(id))
    };
  } catch (error) {
    qolBackgroundNetworkEnd(network, { status: 0, ok: false, outcome: error?.name === "AbortError" ? "timeout" : "network-error" });
    return {
      ok: false,
      status: error?.name === "AbortError" ? "timeout" : "network-error",
      error: error?.name === "AbortError" ? "Typesense lookup timed out." : (error?.message || String(error)),
      counts: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

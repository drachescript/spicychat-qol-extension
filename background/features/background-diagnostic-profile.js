"use strict";

// Feature-owned background helpers: diagnostic-profile. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function diagnosticPageType(url) {
  try {
    const path = new URL(url || "").pathname || "/";
    if (/^\/chat\/[^/]+/i.test(path)) return "chat";
    if (/^\/chatbot\/(?!create(?:\/|$))[^/]+/i.test(path)) return "profile";
    if (path === "/") return "home";
    if (path === "/chats" || path === "/chat" || path.startsWith("/chats/")) return "chat-list";
    if (path.startsWith("/my-creations/")) return "my-creations";
    if (path.startsWith("/favorite-bots")) return "favorites";
    if (path.startsWith("/recommended-bots")) return "recommendations";
    if (path.startsWith("/lorebook")) return "lorebook";
    if (path.startsWith("/creator/")) return "creator";
  } catch {}
  return "other";
}

function diagnosticBotId(url) {
  try {
    const path = new URL(url || "").pathname || "";
    return path.match(/^\/(?:chat|chatbot)\/([^/?#]+)/i)?.[1] || "";
  } catch {
    return "";
  }
}

function diagnosticStoreIds(store) {
  if (Array.isArray(store)) return new Set(store.map(value => String(value || "").trim()).filter(Boolean));
  if (!store || typeof store !== "object") return new Set();
  if (Array.isArray(store.ids)) return new Set(store.ids.map(value => String(value || "").trim()).filter(Boolean));
  return new Set(Object.keys(store.meta || {}));
}

function diagnosticMeta(store, id) {
  if (!store || typeof store !== "object" || !id) return null;
  return store.meta?.[id] || store[id] || null;
}

function diagnosticRecent(store, id) {
  const entries = Array.isArray(store?.entries) ? store.entries : Array.isArray(store) ? store : [];
  return entries.find(entry => String(entry?.id || entry?.botId || "") === id) || null;
}

function diagnosticList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/[,;|\n]/).map(item => item.trim()).filter(Boolean))];
}

function diagnosticIncrement(map, values) {
  for (const value of values || []) {
    const key = String(value || "").trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
}

function diagnosticTopCounts(map, limit = 100) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function diagnosticTitleBotName(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const match = text.match(/^Chat with (.+?) on Spicychat$/i);
  return match ? String(match[1] || "").trim() : "";
}

function diagnosticProfileTitleName(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const chatName = diagnosticTitleBotName(text);
  if (chatName) return chatName;
  return text
    .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
    .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
    .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
    .trim();
}

function diagnosticUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(String(value || "").trim());
}

function diagnosticNamePenalty(value, botId = "") {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) return 1000;
  if (diagnosticUuidLike(text) || (botId && lower === String(botId).toLowerCase())) return 900;
  if (["for you", "chat", "spicychat", "unknown"].includes(lower)) return 700;
  if (/^https?:\/\//i.test(text) || /spicychat\.ai\/chat/i.test(text)) return 700;
  if (text.length > 180) return 120;
  if (text.length > 110) return 70;
  return 0;
}

function diagnosticBestCandidate(candidates, botId = "") {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((item, index) => ({
      value: String(item?.value || "").replace(/\s+/g, " ").trim(),
      source: String(item?.source || ""),
      score: Number(item?.score || 0) - diagnosticNamePenalty(item?.value, botId),
      index
    }))
    .filter(item => item.value)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked[0] || { value: "", source: "", score: 0 };
}

function diagnosticEnrichmentStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : raw;
  return { version: 1, meta: meta && typeof meta === "object" ? meta : {} };
}

function diagnosticHtmlText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function diagnosticMetaFromHtml(html, key) {
  const source = String(html || "");
  const escaped = String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return diagnosticHtmlText(match[1]);
  }
  return "";
}

function diagnosticFindProfileObject(value, id, depth = 0, seen = new Set()) {
  if (!value || typeof value !== "object" || depth > 12 || seen.has(value)) return null;
  seen.add(value);
  const ownId = String(value.id || value.uuid || value.chatbotId || value.chatbot_id || value.characterId || value.character_id || "");
  if (id && ownId === id) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = diagnosticFindProfileObject(child, id, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function diagnosticObjectValue(obj, aliases) {
  if (!obj || typeof obj !== "object") return "";
  for (const alias of aliases) {
    const value = obj[alias];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const text = value.name || value.username || value.handle || value.title || value.value;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return "";
}

function diagnosticObjectList(obj, aliases) {
  if (!obj || typeof obj !== "object") return [];
  for (const alias of aliases) {
    const value = obj[alias];
    const out = [];
    const add = item => {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
      else if (item && typeof item === "object") {
        const text = item.name || item.label || item.title || item.value;
        if (typeof text === "string" && text.trim()) out.push(text.trim());
      }
    };
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "string") value.split(/[,;|]/).forEach(add);
    else add(value);
    if (out.length) return [...new Set(out)];
  }
  return [];
}

function diagnosticProfileObjectFromHtml(html, id) {
  const source = String(html || "");
  const regex = /<script[^>]+(?:type=["']application\/json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let scans = 0;
  while ((match = regex.exec(source)) && scans < 24) {
    scans += 1;
    const raw = String(match[1] || "").trim();
    if (!raw || raw.length > 3500000) continue;
    try {
      const found = diagnosticFindProfileObject(JSON.parse(raw), id);
      if (found) return found;
    } catch {}
  }
  return null;
}

async function diagnosticFetchProfileFallback(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://spicychat.ai/chatbot/${encodeURIComponent(id)}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    const finalUrl = String(response.url || "");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (/\/(login|signin|sign-in|auth)(?:[/?#]|$)/i.test(finalUrl)) throw new Error("SpicyChat login is required");
    const html = await response.text();
    const candidate = diagnosticProfileObjectFromHtml(html, id);
    const title = diagnosticMetaFromHtml(html, "og:title") || diagnosticHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const name = diagnosticObjectValue(candidate, ["name", "title", "characterName", "character_name", "chatbotName", "chatbot_name"]) || diagnosticProfileTitleName(title);
    const challengeDetected = /cf-chl-|cloudflare|checking your browser|just a moment/i.test(html.slice(0, 250000));
    const idPresent = html.toLowerCase().includes(String(id).toLowerCase());
    return {
      name,
      description: diagnosticObjectValue(candidate, ["description", "subtitle", "summary", "shortDescription", "short_description"]) || diagnosticMetaFromHtml(html, "og:description") || diagnosticMetaFromHtml(html, "description"),
      creator: diagnosticObjectValue(candidate, ["creator", "creatorName", "creator_name", "username", "author"]),
      tags: diagnosticObjectList(candidate, ["tags", "tagNames", "tag_names", "chatbotTags", "chatbot_tags", "categories", "keywords"]),
      visibility: diagnosticObjectValue(candidate, ["visibility", "privacy", "status"]),
      image: diagnosticObjectValue(candidate, ["image", "avatar", "avatarUrl", "avatar_url", "imageUrl", "image_url"]) || diagnosticMetaFromHtml(html, "og:image"),
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      _diagnostic: {
        httpStatus: Number(response.status) || 0,
        finalUrl,
        responseBytes: html.length,
        embeddedProfileJson: !!candidate,
        requestedBotIdPresent: idPresent,
        challengeDetected,
        pageTitle: diagnosticHtmlText(title).slice(0, 240),
        responseKind: challengeDetected ? "challenge" : (candidate ? "embedded-profile-json" : (idPresent ? "profile-shell-with-id" : "generic-app-shell"))
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function diagnosticHelperTab() {
  const tabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const ordered = tabs
    .filter(tab => tab?.id && !tab.discarded && tab.status === "complete")
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  for (const tab of ordered) {
    const pong = await tabsSendMessage(tab.id, { type: "DS_TAB_DIAGNOSTIC_PING" });
    if (pong?.ok) return tab;
  }
  return null;
}

function tabCleanupDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function ensureTabCleanupWorker() {
  if (tabCleanupWorkerTabId) {
    const existing = await tabsGet(tabCleanupWorkerTabId);
    if (existing?.id) {
      tabCleanupWorkerTabIds.add(Number(existing.id));
      return { ok: true, tab: existing, reused: true };
    }
    tabCleanupWorkerTabIds.delete(Number(tabCleanupWorkerTabId));
    tabCleanupWorkerTabId = null;
  }

  const created = await tabsCreate({ url: "about:blank", active: false });
  if (!created?.ok || !created.tab?.id) {
    return { ok: false, error: created?.error || "Could not create the temporary analysis tab" };
  }
  tabCleanupWorkerTabId = Number(created.tab.id);
  tabCleanupWorkerTabIds.add(tabCleanupWorkerTabId);
  return { ok: true, tab: created.tab, reused: false };
}

async function closeTabCleanupWorker() {
  const id = Number(tabCleanupWorkerTabId) || 0;
  tabCleanupWorkerTabId = null;
  if (!id) return { ok: true, closed: false };
  tabCleanupWorkerTabIds.delete(id);
  const result = await tabsRemove(id);
  return { ok: result.ok, closed: result.ok, error: result.error || "" };
}

async function focusTabCleanupWorker() {
  const id = Number(tabCleanupWorkerTabId) || 0;
  if (!id) return { ok: false, error: "No analysis worker tab is open" };
  const tab = await tabsGet(id);
  if (!tab?.id) return { ok: false, error: "The analysis worker tab is no longer open" };
  if (Number.isFinite(Number(tab.windowId))) await windowsUpdate(tab.windowId, { focused: true });
  return tabsUpdate(tab.id, { active: true });
}

function diagnosticLocalProfileMetadata(storage, id) {
  const archive = diagnosticMeta(storage?.botArchive, id) || {};
  const fields = archive?.fields && typeof archive.fields === "object" ? archive.fields : {};
  const cache = diagnosticMeta(storage?.cardGreetingTokenCache, id) || {};
  const cacheFields = cache?.fields && typeof cache.fields === "object" ? cache.fields : {};
  const tags = [...new Set([
    ...diagnosticList(fields.tags),
    ...diagnosticList(cache.tags)
  ])].slice(0, 60);
  const metadata = {
    id,
    name: String(fields.name || archive.name || "").trim(),
    description: String(fields.description || cacheFields.description?.text || cacheFields.description || "").trim().slice(0, 8000),
    creator: String(fields.creator || archive.creator || "").replace(/^@/, "").trim(),
    tags,
    visibility: String(fields.visibility || archive.visibility || "").trim(),
    image: String(fields.image || archive.image || "").trim(),
    profileUrl: `https://spicychat.ai/chatbot/${id}`
  };
  const usefulFields = [];
  if (metadata.name && diagnosticNamePenalty(metadata.name, id) < 700) usefulFields.push("name");
  if (metadata.description) usefulFields.push("description");
  if (metadata.creator) usefulFields.push("creator");
  if (metadata.tags.length) usefulFields.push("tags");
  const groupingStrength = Number(!!metadata.description) + Number(metadata.tags.length > 0) + Number(!!metadata.creator);
  return { metadata, usefulFields, groupingStrength };
}

async function diagnosticReadWorkerProfile(botId) {
  const id = String(botId || "").trim();
  const worker = await ensureTabCleanupWorker();
  if (!worker.ok || !worker.tab?.id) {
    return { ok: false, error: worker.error || "Could not create the analysis worker tab" };
  }
  const tabId = Number(worker.tab.id);
  const target = `https://spicychat.ai/chatbot/${encodeURIComponent(id)}`;
  const updated = await tabsUpdate(tabId, { url: target, active: false });
  if (!updated?.ok) return { ok: false, error: updated?.error || "Could not navigate the analysis worker tab" };

  const started = Date.now();
  let challengeSince = 0;
  let lastMetadata = null;
  let lastError = "";
  while (Date.now() - started < TAB_CLEANUP_WORKER_TIMEOUT_MS) {
    const tab = await tabsGet(tabId);
    if (!tab?.id) return { ok: false, error: "The analysis worker tab was closed" };
    const url = String(tab.url || tab.pendingUrl || "");
    const onTarget = url.includes(`/chatbot/${id}`);
    if (onTarget && tab.status === "complete") {
      const response = await tabsSendMessage(tabId, { type: "DS_TAB_DIAGNOSTIC_READ_RENDERED_PROFILE", botId: id });
      if (response?.ok && response.metadata) {
        lastMetadata = response.metadata;
        const diag = response.metadata?._diagnostic || {};
        const kind = String(diag.responseKind || "");
        if (diag.challengeDetected || kind === "challenge") {
          if (!challengeSince) challengeSince = Date.now();
          if (Date.now() - challengeSince >= 4500) {
            await focusTabCleanupWorker();
            return {
              ok: false,
              verificationRequired: true,
              workerTabId: tabId,
              metadata: response.metadata,
              error: "SpicyChat verification is blocking the analysis worker. Complete verification in the opened worker tab, then resume analysis."
            };
          }
        } else {
          challengeSince = 0;
          if (kind === "rendered-profile") return { ok: true, metadata: response.metadata, workerTabId: tabId };
          if (kind === "rendered-profile-no-usable-data" && Date.now() - started > 8000) {
            return { ok: true, metadata: response.metadata, workerTabId: tabId };
          }
        }
      } else if (response?.error) {
        lastError = response.error;
      }
    }
    await tabCleanupDelay(400);
  }
  return {
    ok: !!lastMetadata,
    metadata: lastMetadata,
    workerTabId: tabId,
    error: lastError || "Timed out waiting for the rendered SpicyChat profile"
  };
}

async function enrichOpenBotMetadata(botId, options = {}) {
  const id = String(botId || "").trim();
  if (!id) return { ok: false, error: "Missing bot id" };

  const stored = await storageGet([TAB_CLEANUP_ENRICHMENT_KEY, "botArchive", "cardGreetingTokenCache"]);
  const store = diagnosticEnrichmentStore(stored[TAB_CLEANUP_ENRICHMENT_KEY]);
  const cached = store.meta[id];
  const now = Date.now();
  const successMaxAge = 7 * 24 * 60 * 60 * 1000;
  const missMaxAge = 60 * 60 * 1000;
  const cachedAge = cached?.checkedAt ? now - Number(cached.checkedAt) : Infinity;
  const cachedSuccess = cached?.status === "profile-fetched" && Number(cached?.successfulAt) > 0;
  const cacheFromWorker = /rendered profile worker/i.test(String(cached?.source || ""));
  if (!options.force && cachedSuccess && cachedAge < successMaxAge) {
    return { ok: true, cached: true, metadata: cached, error: "" };
  }
  if (!options.force && cacheFromWorker && cached?.checkedAt && cachedAge < missMaxAge && ["no-usable-data", "unavailable"].includes(cached?.status)) {
    return { ok: false, cached: true, metadata: cached, error: cached.lastError || cached.status || "No usable profile data" };
  }

  const local = diagnosticLocalProfileMetadata(stored, id);
  // When QoL already has enough grouping metadata locally, use it immediately
  // instead of opening a network worker just to rediscover the same information.
  if (!options.force && local.groupingStrength >= 2) {
    const metadata = {
      ...local.metadata,
      checkedAt: Date.now(),
      successfulAt: 0,
      status: "local-only",
      usefulFields: local.usefulFields,
      source: "Existing QoL profile/archive data",
      lastError: "",
      diagnostic: { responseKind: "local-only", localGroupingStrength: local.groupingStrength }
    };
    store.meta[id] = metadata;
    await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
    return { ok: true, cached: true, localOnly: true, metadata, error: "" };
  }

  let workerResult;
  try {
    workerResult = await diagnosticReadWorkerProfile(id);
  } catch (error) {
    workerResult = { ok: false, error: error?.message || String(error) };
  }

  if (workerResult?.verificationRequired) {
    const raw = workerResult.metadata || {};
    const metadata = {
      id,
      ...local.metadata,
      checkedAt: Date.now(),
      successfulAt: 0,
      status: "verification-required",
      usefulFields: local.usefulFields,
      source: "Rendered profile worker tab",
      lastError: workerResult.error || "SpicyChat verification is required",
      diagnostic: {
        ...(raw?._diagnostic && typeof raw._diagnostic === "object" ? raw._diagnostic : {}),
        workerTabId: Number(workerResult.workerTabId) || 0
      }
    };
    store.meta[id] = metadata;
    await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
    return { ok: false, cached: false, verificationRequired: true, workerTabId: Number(workerResult.workerTabId) || 0, metadata, error: metadata.lastError };
  }

  const rawMetadata = workerResult?.metadata || {};
  const responseKind = String(rawMetadata?._diagnostic?.responseKind || "");
  const workerUsefulFields = [];
  if (responseKind === "rendered-profile") {
    if (String(rawMetadata.name || "").trim() && diagnosticNamePenalty(rawMetadata.name, id) < 700) workerUsefulFields.push("name");
    if (String(rawMetadata.description || "").trim()) workerUsefulFields.push("description");
    if (String(rawMetadata.creator || "").trim()) workerUsefulFields.push("creator");
    if (diagnosticList(rawMetadata.tags).length) workerUsefulFields.push("tags");
  }

  const metadata = {
    id,
    name: String(rawMetadata.name || local.metadata.name || "").trim(),
    description: String(rawMetadata.description || local.metadata.description || "").trim().slice(0, 8000),
    creator: String(rawMetadata.creator || local.metadata.creator || "").replace(/^@/, "").trim(),
    tags: [...new Set([...diagnosticList(rawMetadata.tags), ...diagnosticList(local.metadata.tags)])].slice(0, 60),
    visibility: String(rawMetadata.visibility || local.metadata.visibility || "").trim(),
    image: String(rawMetadata.image || local.metadata.image || "").trim(),
    profileUrl: String(rawMetadata.profileUrl || local.metadata.profileUrl || `https://spicychat.ai/chatbot/${id}`).trim(),
    checkedAt: Date.now(),
    successfulAt: 0,
    status: "no-usable-data",
    usefulFields: [...new Set([...workerUsefulFields, ...local.usefulFields])],
    source: "Rendered profile worker tab",
    lastError: "",
    diagnostic: {
      ...(rawMetadata?._diagnostic && typeof rawMetadata._diagnostic === "object" ? rawMetadata._diagnostic : {}),
      workerTabId: Number(workerResult?.workerTabId) || 0,
      workerUsefulFields,
      localUsefulFields: local.usefulFields
    }
  };

  if (workerUsefulFields.length) {
    metadata.status = "profile-fetched";
    metadata.successfulAt = metadata.checkedAt;
  } else if (local.groupingStrength > 0) {
    metadata.status = "local-only";
    metadata.lastError = workerResult?.error || "Rendered profile exposed no additional grouping fields; existing QoL metadata was retained";
  } else if (!workerResult?.ok) {
    metadata.status = "failed";
    metadata.lastError = workerResult?.error || "Could not read the rendered bot profile";
  } else {
    metadata.status = "no-usable-data";
    metadata.lastError = `Rendered profile returned ${responseKind || "a page"}, but no usable grouping fields were exposed`;
  }

  store.meta[id] = metadata;
  await storageSet({ [TAB_CLEANUP_ENRICHMENT_KEY]: store });
  return {
    ok: ["profile-fetched", "local-only"].includes(metadata.status),
    cached: false,
    localOnly: metadata.status === "local-only",
    metadata,
    error: metadata.lastError
  };
}

async function collectOpenSpicyChatTabDiagnostic() {
  const allTabs = await tabsQuery({ url: ["https://spicychat.ai/*", "https://www.spicychat.ai/*"] });
  const tabs = allTabs.filter(tab => !tabCleanupWorkerTabIds.has(Number(tab?.id)));
  const storage = await storageGet([
    "settings", "favoriteBots", "laterBots", "recentlySeenBots", "botOrganization",
    "openedChatMeta", "botArchive", "botAvailability", "cardGreetingTokenCache", TAB_CLEANUP_ENRICHMENT_KEY
  ]);
  const favoriteIds = diagnosticStoreIds(storage.favoriteBots);
  const laterIds = diagnosticStoreIds(storage.laterBots);
  const botMap = new Map();
  const otherTabs = [];
  const tagCounts = new Map();
  const creatorCounts = new Map();
  const folderCounts = new Map();
  const personalTagCounts = new Map();
  let snapshotAvailable = 0;
  let discarded = 0;
  let pinned = 0;

  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    const type = diagnosticPageType(url);
    const id = diagnosticBotId(url);
    if (tab.discarded) discarded += 1;
    if (tab.pinned) pinned += 1;

    let snapshot = null;
    // Do not wake discarded tabs just to build a diagnostic report.
    if (tab.id && !tab.discarded && tab.status === "complete") {
      snapshot = await tabsSendMessage(tab.id, { type: "DS_TAB_DIAGNOSTIC_SNAPSHOT" });
      if (snapshot?.ok) snapshotAvailable += 1;
    }

    const tabInfo = {
      tabId: Number(tab.id) || 0,
      windowId: Number(tab.windowId) || 0,
      index: Number(tab.index) || 0,
      active: !!tab.active,
      pinned: !!tab.pinned,
      audible: !!tab.audible,
      muted: !!tab.mutedInfo?.muted,
      discarded: !!tab.discarded,
      status: tab.status || "",
      lastAccessed: Number(tab.lastAccessed) || 0,
      url,
      title: tab.title || "",
      pageType: snapshot?.pageType || type,
      duplicateKey: duplicateTabKey(url, { ...DUPLICATE_TAB_DEFAULTS, duplicateTabChats: true, duplicateTabHome: true, duplicateTabProfiles: true }) || "",
      renderedMessageCount: Number(snapshot?.renderedMessageCount) || 0,
      contentSnapshot: snapshot?.ok ? "available" : (tab.discarded ? "skipped-discarded" : "unavailable")
    };

    const botId = String(snapshot?.botId || id || "").trim();
    if (!botId) {
      otherTabs.push(tabInfo);
      continue;
    }

    const organizer = diagnosticMeta(storage.botOrganization, botId) || {};
    const archive = diagnosticMeta(storage.botArchive, botId) || {};
    const availability = diagnosticMeta(storage.botAvailability, botId) || {};
    const profileCache = diagnosticMeta(storage.cardGreetingTokenCache, botId) || {};
    const enrichment = diagnosticMeta(storage[TAB_CLEANUP_ENRICHMENT_KEY], botId) || {};
    const recent = diagnosticRecent(storage.recentlySeenBots, botId) || {};
    const opened = diagnosticMeta(storage.openedChatMeta, botId) || {};
    const favoriteMeta = diagnosticMeta(storage.favoriteBots, botId) || {};
    const laterMeta = diagnosticMeta(storage.laterBots, botId) || {};

    const titleName = diagnosticTitleBotName(tab.title || "");
    const nameCandidates = [
      { value: snapshot?.botName, source: "loaded page", score: 110 },
      { value: titleName, source: "browser tab title", score: 105 },
      { value: enrichment?.name, source: "profile enrichment", score: 100 },
      { value: favoriteMeta?.name, source: "Favorite history", score: 82 },
      { value: laterMeta?.name, source: "Later", score: 80 },
      { value: archive?.fields?.name, source: "Local Bot Archive", score: 72 },
      { value: archive?.name, source: "Local Bot Archive", score: 70 }
    ];
    const names = [...new Set(nameCandidates.map(item => String(item.value || "").trim()).filter(Boolean))];
    const creators = [...new Set([
      snapshot?.creator?.handle,
      snapshot?.creator?.text,
      enrichment?.creator,
      favoriteMeta?.creator,
      laterMeta?.creator,
      archive?.creator,
      archive?.fields?.creator
    ].map(value => String(value || "").replace(/^@/, "").trim()).filter(Boolean))];
    const tags = [...new Set([
      ...diagnosticList(snapshot?.visibleTags),
      ...diagnosticList(enrichment?.tags),
      ...diagnosticList(profileCache?.tags),
      ...diagnosticList(archive?.fields?.tags)
    ])];
    const folders = diagnosticList(organizer?.collections || organizer?.folders);
    const personalTags = diagnosticList(organizer?.tags);

    let entry = botMap.get(botId);
    if (!entry) {
      entry = {
        id: botId,
        names: [],
        creators: [],
        tags: [],
        _nameCandidates: [],
        identity: {
          bestName: "",
          nameSource: "",
          bestCreator: "",
          creatorSource: "",
          description: "",
          visibility: "",
          image: "",
          enrichedAt: 0
        },
        local: {
          favoriteHistory: favoriteIds.has(botId),
          later: laterIds.has(botId),
          folders,
          personalTags,
          creatorStatus: String(organizer?.status || ""),
          hasPrivateNote: !!String(organizer?.note || "").trim(),
          recentlySeenAt: Number(recent?.lastSeenAt || recent?.seenAt || recent?.at) || 0,
          recentlySeenCount: Number(recent?.visits || recent?.count) || 0,
          openedAt: Number(opened?.lastOpenedAt || opened?.openedAt || opened?.at) || 0,
          savedLocalCopy: !!Object.keys(archive || {}).length,
          archiveCoverage: Array.isArray(archive?.coverage) ? archive.coverage : [],
          availabilityStatus: String(availability?.status || "")
        },
        profileSignals: {
          checkedAt: Number(profileCache?.checkedAt) || 0,
          fields: profileCache?.fields && typeof profileCache.fields === "object" ? profileCache.fields : {},
          enrichedAt: Number(enrichment?.successfulAt) || 0,
          enrichmentCheckedAt: Number(enrichment?.checkedAt) || 0,
          enrichmentStatus: String(enrichment?.status || "not-checked"),
          usefulFields: diagnosticList(enrichment?.usefulFields),
          enrichmentSource: String(enrichment?.source || ""),
          enrichmentError: String(enrichment?.lastError || ""),
          enrichmentDiagnostic: enrichment?.diagnostic && typeof enrichment.diagnostic === "object" ? enrichment.diagnostic : {}
        },
        tabs: []
      };
      botMap.set(botId, entry);
    }

    entry.names = [...new Set([...entry.names, ...names])];
    entry.creators = [...new Set([...entry.creators, ...creators])];
    entry.tags = [...new Set([...entry.tags, ...tags])];
    entry._nameCandidates.push(...nameCandidates);
    if (!entry.identity.description) {
      entry.identity.description = String(
        enrichment?.description ||
        archive?.fields?.description ||
        profileCache?.fields?.description?.text ||
        profileCache?.fields?.description ||
        ""
      ).trim();
    }
    if (!entry.identity.visibility) entry.identity.visibility = String(enrichment?.visibility || archive?.fields?.visibility || archive?.visibility || "").trim();
    if (!entry.identity.image) entry.identity.image = String(enrichment?.image || archive?.fields?.image || archive?.image || "").trim();
    entry.identity.enrichedAt = Math.max(Number(entry.identity.enrichedAt) || 0, Number(enrichment?.successfulAt) || 0);
    entry.tabs.push(tabInfo);
  }

  const bots = [...botMap.values()].sort((a, b) => {
    const aLast = Math.max(0, ...a.tabs.map(tab => Number(tab.lastAccessed) || 0));
    const bLast = Math.max(0, ...b.tabs.map(tab => Number(tab.lastAccessed) || 0));
    return bLast - aLast || String(a.names[0] || a.id).localeCompare(String(b.names[0] || b.id));
  });

  for (const bot of bots) {
    const bestName = diagnosticBestCandidate(bot._nameCandidates, bot.id);
    bot.identity.bestName = bestName.value || diagnosticTitleBotName(bot.tabs?.[0]?.title || "") || bot.names.find(name => !diagnosticNamePenalty(name, bot.id)) || "";
    bot.identity.nameSource = bestName.source || (bot.identity.bestName ? "available metadata" : "");
    bot.identity.bestCreator = String(bot.creators[0] || "").trim();
    bot.identity.creatorSource = bot.identity.bestCreator
      ? (bot.profileSignals.enrichedAt ? "profile enrichment / local metadata" : "local metadata")
      : "";
    delete bot._nameCandidates;
  }

  for (const bot of bots) {
    diagnosticIncrement(tagCounts, bot.tags);
    diagnosticIncrement(creatorCounts, bot.creators.slice(0, 1));
    diagnosticIncrement(folderCounts, bot.local.folders);
    diagnosticIncrement(personalTagCounts, bot.local.personalTags);
  }

  const duplicateGroups = new Map();
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    const key = duplicateTabKey(url, { ...DUPLICATE_TAB_DEFAULTS, duplicateTabChats: true, duplicateTabHome: true, duplicateTabProfiles: true });
    if (!key) continue;
    if (!duplicateGroups.has(key)) duplicateGroups.set(key, 0);
    duplicateGroups.set(key, duplicateGroups.get(key) + 1);
  }

  return {
    format: "spicychat-qol-open-tab-diagnostic",
    version: 3,
    generatedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest?.().version || "unknown",
    privacy: "Contains only open SpicyChat tab metadata and non-secret QoL organization/profile signals. Chat message text, private-note contents, API keys, and non-SpicyChat tabs are excluded.",
    summary: {
      spicychatTabs: tabs.length,
      uniqueBots: bots.length,
      botTabs: bots.reduce((sum, bot) => sum + bot.tabs.length, 0),
      otherSpicyChatTabs: otherTabs.length,
      duplicateGroups: [...duplicateGroups.values()].filter(count => count > 1).length,
      duplicateExtraTabs: [...duplicateGroups.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0),
      pinnedTabs: pinned,
      discardedTabs: discarded,
      contentSnapshotsAvailable: snapshotAvailable,
      botsWithName: bots.filter(bot => bot.names.length).length,
      botsWithResolvedName: bots.filter(bot => bot.identity?.bestName).length,
      botsWithCreator: bots.filter(bot => bot.creators.length).length,
      botsWithTags: bots.filter(bot => bot.tags.length).length,
      botsWithDescription: bots.filter(bot => bot.identity?.description).length,
      botsWithEnrichedProfile: bots.filter(bot => Number(bot.identity?.enrichedAt) > 0).length,
      botsWithLocalProfileData: bots.filter(bot => String(bot.profileSignals?.enrichmentStatus || "") === "local-only").length,
      enrichmentStatusCounts: bots.reduce((counts, bot) => {
        const status = String(bot.profileSignals?.enrichmentStatus || "not-checked");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
      botsWithFolders: bots.filter(bot => bot.local.folders.length).length,
      botsWithPersonalTags: bots.filter(bot => bot.local.personalTags.length).length
    },
    duplicateGuard: {
      enabled: !!storage.settings?.duplicateTabGuardEnabled,
      keepMode: storage.settings?.duplicateTabKeepMode === "existing" ? "existing" : "new",
      chats: storage.settings?.duplicateTabChats !== false,
      home: !!storage.settings?.duplicateTabHome,
      profiles: !!storage.settings?.duplicateTabProfiles
    },
    topicSignals: {
      tags: diagnosticTopCounts(tagCounts),
      creators: diagnosticTopCounts(creatorCounts),
      folders: diagnosticTopCounts(folderCounts),
      personalTags: diagnosticTopCounts(personalTagCounts)
    },
    windows: [...new Set(tabs.map(tab => Number(tab.windowId)).filter(Boolean))].map(windowId => ({
      windowId,
      tabCount: tabs.filter(tab => Number(tab.windowId) === windowId).length,
      botTabCount: bots.reduce((sum, bot) => sum + bot.tabs.filter(tab => Number(tab.windowId) === windowId).length, 0)
    })).sort((a, b) => b.botTabCount - a.botTabCount || a.windowId - b.windowId),
    bots,
    otherTabs
  };
}

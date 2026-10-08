(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const cache = new Map();
  const inFlight = new Map();
  const MAX_AGE = 6 * 60 * 60 * 1000;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function lorebookIdFromHref(href) {
    const match = String(href || "").match(/\/lorebook\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
    return match?.[1] || "";
  }

  function findCard(anchor) {
    let node = anchor;
    let fallback = anchor.parentElement;

    for (let i = 0; node && i < 9; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;
      const text = clean(node.textContent);
      const links = node.querySelectorAll?.("a[href*='/lorebook/']")?.length || 0;
      if (links >= 1 && links <= 3 && text.length >= 12 && text.length < 2200) fallback = node;
      if (String(node.className || "").includes("rounded") && links >= 1 && text.length >= 12) return node;
    }

    return fallback;
  }

  function listField(obj, names) {
    if (!obj || typeof obj !== "object") return [];
    const keys = Object.keys(obj);
    for (const wanted of names) {
      const key = keys.find(candidate => candidate.toLowerCase() === wanted.toLowerCase());
      if (!key || obj[key] == null) continue;
      const value = obj[key];
      const output = [];
      const add = item => {
        if (typeof item === "string" && clean(item)) output.push(clean(item));
        else if (item && typeof item === "object") {
          const text = item.name ?? item.label ?? item.title ?? item.value;
          if (typeof text === "string" && clean(text)) output.push(clean(text));
        }
      };
      if (Array.isArray(value)) value.forEach(add);
      else if (typeof value === "string") value.split(/[,;|]/).forEach(add);
      else add(value);
      return [...new Set(output.filter(Boolean))];
    }
    return [];
  }

  function objectIdMatches(obj, id) {
    const keys = ["id", "lorebookId", "lorebook_id", "bookId", "book_id", "uuid"];
    return keys.some(key => String(obj?.[key] || "").trim() === String(id));
  }

  function scoreObject(obj, id) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
    let score = objectIdMatches(obj, id) ? 8 : 0;
    const tags = listField(obj, ["tags", "tagNames", "tag_names", "lorebookTags", "lorebook_tags", "categories"]);
    if (tags.length) score += 5;
    if (typeof obj.name === "string" || typeof obj.title === "string") score += 1;
    if (obj.entries || obj.lorebookEntries || obj.lorebook_entries) score += 1;
    return score;
  }

  function findLorebookObject(root, id) {
    let best = null;
    let bestScore = 0;
    const seen = new Set();
    const stack = [root];
    let visited = 0;

    while (stack.length && visited < 18000) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      visited++;

      if (!Array.isArray(value)) {
        const score = scoreObject(value, id);
        if (score > bestScore) {
          best = value;
          bestScore = score;
          if (score >= 13) break;
        }
      }

      const values = Array.isArray(value) ? value : Object.values(value);
      for (const child of values) {
        if (child && typeof child === "object") stack.push(child);
      }
    }

    return bestScore >= 5 ? best : null;
  }

  function tagsFromHtml(html, id) {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let best = [];
      for (const script of doc.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__')) {
        const raw = String(script.textContent || "").trim();
        if (!raw || raw.length > 3500000) continue;
        try {
          const obj = findLorebookObject(JSON.parse(raw), id);
          const tags = listField(obj, ["tags", "tagNames", "tag_names", "lorebookTags", "lorebook_tags", "categories"]);
          if (tags.length > best.length) best = tags;
        } catch {}
      }
      return best;
    } catch {
      return [];
    }
  }

  function lorebookPayload(value) {
    if (!value || typeof value !== "object") return null;
    const data = value.data && typeof value.data === "object" && !Array.isArray(value.data) ? value.data : null;
    const directLorebook = value.lorebook && typeof value.lorebook === "object" ? value.lorebook : null;
    const dataLorebook = data?.lorebook && typeof data.lorebook === "object" ? data.lorebook : null;
    if (dataLorebook) {
      return {
        ...dataLorebook,
        entries: dataLorebook.entries ?? data.entries ?? value.entries,
        lorebookEntries: dataLorebook.lorebookEntries ?? data.lorebookEntries ?? value.lorebookEntries,
        lorebook_entries: dataLorebook.lorebook_entries ?? data.lorebook_entries ?? value.lorebook_entries
      };
    }
    if (directLorebook) {
      return {
        ...directLorebook,
        entries: directLorebook.entries ?? value.entries ?? data?.entries,
        lorebookEntries: directLorebook.lorebookEntries ?? value.lorebookEntries ?? data?.lorebookEntries,
        lorebook_entries: directLorebook.lorebook_entries ?? value.lorebook_entries ?? data?.lorebook_entries
      };
    }
    return data || value;
  }
  function normalizeLorebookMeta(value, id = "") {
    const payload = lorebookPayload(value);
    if (!payload || typeof payload !== "object") return null;
    const creator = payload.creator_username || payload.creatorUsername || payload.creator?.username || payload.creator?.name || "";
    const entryCount = Number(payload.num_entries ?? payload.numEntries ?? payload.entries_count ?? payload.entriesCount ?? (Array.isArray(payload.entries) ? payload.entries.length : 0)) || 0;
    return {
      id: clean(payload.id || payload.lorebook_id || payload.lorebookId || id),
      name: clean(payload.name || payload.title || ""),
      description: clean(payload.description || ""),
      creator: clean(creator),
      creatorId: clean(payload.creator_user_id || payload.creatorUserId || payload.creator?.id || ""),
      image: clean(payload.avatar_url || payload.avatarUrl || payload.image || ""),
      tags: listField(payload, ["tags", "tagNames", "tag_names", "lorebookTags", "lorebook_tags", "categories"]),
      visibility: clean(payload.visibility || payload.privacy || ""),
      status: clean(payload.status || ""),
      version: Number(payload.version || 0) || 0,
      entryCount,
      numAttachedCharacters: Number(payload.numAttachedCharacters ?? payload.num_attached_characters ?? 0) || 0,
      createdAt: clean(payload.createdAt || payload.created_at || ""),
      updatedAt: clean(payload.updatedAt || payload.updated_at || ""),
      isNsfw: payload.is_nsfw === true || payload.isNsfw === true,
      avatarIsNsfw: payload.avatar_is_nsfw === true || payload.avatarIsNsfw === true
    };
  }

  function normalizeEntryKeywordList(value) {
    const source = Array.isArray(value) ? value : (typeof value === "string" ? value.split(/[,;|]/g) : []);
    return [...new Set(source.map(item => {
      if (typeof item === "string") return clean(item);
      if (item && typeof item === "object") return clean(item.keyword ?? item.name ?? item.value ?? item.label ?? "");
      return "";
    }).filter(Boolean))];
  }

  function normalizeLorebookEntry(value, index = 0) {
    const entry = value && typeof value === "object" ? value : {};
    const id = clean(entry.id || entry.entry_id || entry.entryId || entry.uuid || entry._id || "");
    const versionRaw = entry.version ?? entry.revision ?? entry.rev ?? "";
    const priorityRaw = entry.priority ?? entry.sortPriority ?? entry.sort_priority ?? entry.order ?? entry.position ?? entry.rank ?? "";
    const content = String(entry.content ?? entry.text ?? entry.value ?? entry.body ?? "");
    const keywords = normalizeEntryKeywordList(entry.keywords ?? entry.keyword ?? entry.keys ?? entry.triggers ?? entry.key ?? []);
    const secondaryKeywords = normalizeEntryKeywordList(entry.secondaryKeywords ?? entry.secondary_keywords ?? entry.secondary_keys ?? []);
    return {
      id: id || `index:${index}`,
      name: clean(entry.name || entry.title || entry.label || entry.comment || ""),
      keywords,
      secondaryKeywords,
      content,
      version: typeof versionRaw === "number" ? versionRaw : clean(versionRaw),
      createdAt: clean(entry.createdAt || entry.created_at || entry.created || ""),
      updatedAt: clean(entry.updatedAt || entry.updated_at || entry.modifiedAt || entry.modified_at || ""),
      priority: typeof priorityRaw === "number" ? priorityRaw : clean(priorityRaw),
      status: clean(entry.status || entry.state || ""),
      enabled: entry.enabled !== false && entry.disabled !== true,
      constant: entry.constant === true,
      selective: entry.selective === true,
      caseSensitive: entry.caseSensitive === true || entry.case_sensitive === true,
      probability: Number.isFinite(Number(entry.probability)) ? Number(entry.probability) : null,
      depth: Number.isFinite(Number(entry.depth)) ? Number(entry.depth) : null,
      role: clean(entry.role || entry.position_role || ""),
      isNsfw: entry.is_nsfw === true || entry.isNsfw === true
    };
  }

  function lorebookEntryArray(payload) {
    const candidates = [
      payload?.entries,
      payload?.lorebookEntries,
      payload?.lorebook_entries,
      payload?.items,
      payload?.data?.entries,
      payload?.data?.lorebookEntries,
      payload?.data?.lorebook_entries
    ];
    return candidates.find(Array.isArray) || [];
  }

  function normalizeLorebookRecoveryCopy(value, id = "") {
    const payload = lorebookPayload(value);
    if (!payload || typeof payload !== "object") return null;
    const meta = normalizeLorebookMeta(payload, id);
    if (!meta?.id) return null;
    const entries = lorebookEntryArray(payload).map((entry, index) => normalizeLorebookEntry(entry, index));
    return {
      schema: "spicychat-qol-lorebook-recovery-copy",
      version: 1,
      savedAt: Date.now(),
      lorebook: meta,
      entries
    };
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

  async function fetchIndexedLorebookMetaBatch(ids) {
    const wanted = [...new Set((Array.isArray(ids) ? ids : [])
      .map(id => clean(id).toLowerCase())
      .filter(id => /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)))].slice(0, 60);
    const found = new Map();
    if (!wanted.length) return found;

    try {
      const response = await runtimeMessage({ type: "DS_LOREBOOK_STATUS_PUBLIC_CHECK_BATCH", ids: wanted });
      if (!response?.ok || !Array.isArray(response.results)) return found;
      for (const row of response.results) {
        const id = clean(row?.id).toLowerCase();
        const meta = row?.found && row?.meta && typeof row.meta === "object" ? row.meta : null;
        if (!id || !meta) continue;
        const tags = listField(meta, ["tags", "tagNames", "tag_names", "lorebookTags", "lorebook_tags", "categories"]);
        const normalized = {
          ...meta,
          id: clean(meta.id || id),
          tags
        };
        const previous = cache.get(id) || {};
        cache.set(id, {
          ...previous,
          tags,
          meta: { ...(previous.meta || {}), ...normalized },
          checkedAt: Date.now(),
          indexSource: clean(response.source || "typesense:lorebooks_public")
        });
        found.set(id, normalized);
      }
    } catch {}
    return found;
  }

  async function getTags(id) {
    const saved = cache.get(id);
    if (saved && Date.now() - saved.checkedAt < MAX_AGE && saved.tags?.length) return saved.tags;
    if (inFlight.has(id)) return inFlight.get(id);

    const request = (async () => {
      let tags = [];

      // Public Lorebook cards already have a current scoped Typesense key
      // available through SpicyChat's application config. Prefer that cheap
      // index lookup for complete public tag lists before touching the heavier
      // authenticated Lorebook endpoint.
      try {
        const indexed = await fetchIndexedLorebookMetaBatch([id]);
        tags = indexed.get(clean(id).toLowerCase())?.tags || [];
      } catch {}

      if (!tags.length) {
        try {
          // Use the same authenticated MAIN-world bridge as Lorebook Status.
          // Current SpicyChat rejects this endpoint when QoL sends cookies alone.
          if (typeof DS.fetchLorebookArchiveData === "function") {
            const api = await DS.fetchLorebookArchiveData(id);
            const payload = lorebookPayload(api?.data);
            const meta = normalizeLorebookMeta(payload, id);
            const recoveryCopy = normalizeLorebookRecoveryCopy(payload, id);
            tags = meta?.tags || [];
            cache.set(id, { tags, meta, recoveryCopy, checkedAt: Date.now() });
          }
        } catch {}
      }

      if (!tags.length) {
        try {
          const response = await fetch(`${location.origin}/lorebook/${encodeURIComponent(id)}`, {
            credentials: "include",
            cache: "no-store"
          });
          if (response.ok) tags = tagsFromHtml(await response.text(), id);
        } catch {}
      }

      const previous = cache.get(id) || {};
      cache.set(id, { ...previous, tags, checkedAt: Date.now() });
      return tags;
    })().finally(() => inFlight.delete(id));

    inFlight.set(id, request);
    return request;
  }

  DS.getLorebookTagsForId = getTags;
  DS.getLorebookMetaForId = async function getLorebookMetaForId(id) {
    const key = clean(id).toLowerCase();
    if (!key) return null;
    const saved = cache.get(key);
    if (saved?.meta && Date.now() - Number(saved.checkedAt || 0) < MAX_AGE) return saved.meta;
    await getTags(key);
    return cache.get(key)?.meta || null;
  };

  async function getCurrentOwnLorebookBackupDataApi(lorebookId) {
    const id = clean(lorebookId).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) throw new Error("Invalid Lorebook UUID.");
    if (typeof DS.fetchLorebookArchiveData !== "function") throw new Error("The current Lorebook API bridge is not available.");

    // Do not use the local Lorebook backup/history store here. The bulk backup
    // feature promises the newest live version, so always ask SpicyChat now.
    // The Lorebook endpoint is priority-paged on large books; walk it until the
    // API-reported entry count is satisfied, deduping stable entry UUIDs.
    let cursor = 0;
    let meta = null;
    const entries = [];
    const seen = new Set();
    let expected = 0;

    for (let page = 0; page < 120; page += 1) {
      const api = await DS.fetchLorebookArchiveData(id, page === 0, { lastSortPriority: cursor });
      const payload = lorebookPayload(api?.data);
      const copy = normalizeLorebookRecoveryCopy(payload, id);
      if (!copy?.lorebook?.id) throw new Error("Current Lorebook data could not be normalized.");
      if (!meta) meta = copy.lorebook;
      expected = Math.max(expected, Number(copy.lorebook.entryCount) || 0);

      let added = 0;
      for (const entry of copy.entries || []) {
        const key = clean(entry.id || `${entry.name}:${entry.priority}:${entry.content.length}`, 900).toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        entries.push(entry);
        added += 1;
      }

      if (!expected || entries.length >= expected) break;
      if (!copy.entries.length || !added) break;
      const tail = copy.entries[copy.entries.length - 1];
      const nextCursor = Number(tail?.priority);
      if (!Number.isFinite(nextCursor) || nextCursor === cursor) break;
      cursor = nextCursor;
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    if (!meta) throw new Error("Current Lorebook data could not be read.");
    if (expected && entries.length < expected) {
      const error = new Error(`SpicyChat returned ${entries.length} of ${expected} Lorebook entries; refusing to create an incomplete backup.`);
      error.code = "incomplete-lorebook";
      error.expectedEntries = expected;
      error.receivedEntries = entries.length;
      throw error;
    }

    return {
      schema: "spicychat-qol-lorebook-recovery-copy",
      version: 1,
      savedAt: Date.now(),
      fetchedAt: new Date().toISOString(),
      source: "current-live-api",
      completeness: { details: true, entries: true, entryCountVerified: !expected || entries.length >= expected },
      lorebook: { ...meta, entryCount: expected || entries.length },
      entries
    };
  }

  DS.getCurrentOwnLorebookBackupData = async function getCurrentOwnLorebookBackupData(lorebookId) {
    try {
      return await getCurrentOwnLorebookBackupDataApi(lorebookId);
    } catch (apiError) {
      if (typeof DS.getCurrentOwnLorebookBackupDataFromEditor !== "function") throw apiError;
      try {
        return await DS.getCurrentOwnLorebookBackupDataFromEditor(lorebookId);
      } catch (editorError) {
        const apiMessage = clean(apiError?.message || apiError, 500);
        const editorMessage = clean(editorError?.message || editorError, 500);
        const combined = new Error(`Live API failed: ${apiMessage || "unknown error"}. Editor fallback failed: ${editorMessage || "unknown error"}.`);
        combined.cause = editorError;
        throw combined;
      }
    }
  };

  function findCollapsedTagRow(card) {
    const counters = [...card.querySelectorAll("p, span")].filter(el => /^\+\d+$/.test(clean(el.textContent)));
    for (const counter of counters) {
      const row = counter.parentElement;
      if (!row) continue;
      const textNode = [...row.children].find(el => el !== counter && /,/.test(clean(el.textContent)));
      if (textNode) return { row, textNode, counter };
    }
    return null;
  }

  function tagsFromDom(rowInfo) {
    if (!rowInfo?.row) return [];
    const candidates = [rowInfo.row, ...rowInfo.row.querySelectorAll("[title], [aria-label], [data-tags], [data-tag-names]")];
    let best = [];
    for (const el of candidates) {
      for (const raw of [el.getAttribute?.("data-tags"), el.getAttribute?.("data-tag-names"), el.getAttribute?.("title"), el.getAttribute?.("aria-label")]) {
        const tags = String(raw || "").split(/[,;|]/).map(clean).filter(Boolean);
        if (tags.length > best.length) best = tags;
      }
    }
    return [...new Set(best)];
  }

  function collapsedTagCount(rowInfo) {
    const match = clean(rowInfo?.counter?.textContent).match(/^\+(\d+)$/);
    return match ? Math.max(0, Number(match[1]) || 0) : 0;
  }

  function visibleCollapsedTags(rowInfo) {
    return [...new Set(clean(rowInfo?.textNode?.textContent)
      .split(/[,;|]/g)
      .map(clean)
      .filter(Boolean))];
  }

  function tagListLooksComplete(rowInfo, tags) {
    const list = [...new Set((Array.isArray(tags) ? tags : []).map(clean).filter(Boolean))];
    if (!list.length) return false;
    const hidden = collapsedTagCount(rowInfo);
    const visible = visibleCollapsedTags(rowInfo);
    return hidden <= 0 || list.length >= visible.length + hidden;
  }

  function showExpanded(rowInfo, tags) {
    if (!rowInfo || !tagListLooksComplete(rowInfo, tags)) return false;
    const { row, textNode, counter } = rowInfo;
    if (!textNode.dataset.dsLorebookTagsOriginalText) {
      textNode.dataset.dsLorebookTagsOriginalText = textNode.textContent || "";
      textNode.dataset.dsLorebookTagsOriginalClass = textNode.getAttribute("class") || "";
      textNode.dataset.dsLorebookTagsOriginalStyle = textNode.getAttribute("style") || "";
      counter.dataset.dsLorebookTagsOriginalStyle = counter.getAttribute("style") || "";
    }
    textNode.dataset.dsLorebookTagsExpansionText = "1";
    counter.dataset.dsLorebookTagsExpansionCounter = "1";
    textNode.textContent = [...new Set(tags.map(clean).filter(Boolean))].join(", ");
    textNode.classList.remove("line-clamp-1");
    textNode.style.webkitLineClamp = "unset";
    textNode.style.whiteSpace = "normal";
    textNode.style.overflow = "visible";
    row.classList.add("ds-lorebook-tags-expanded");
    counter.style.display = "none";
    return true;
  }

  function restoreExpandedRows() {
    document.querySelectorAll(".ds-lorebook-tags-expanded").forEach(row => {
      const textNode = row.querySelector("[data-ds-lorebook-tags-expansion-text='1']");
      const counter = row.querySelector("[data-ds-lorebook-tags-expansion-counter='1']");
      if (textNode) {
        textNode.textContent = textNode.dataset.dsLorebookTagsOriginalText || "";
        const cls = textNode.dataset.dsLorebookTagsOriginalClass || "";
        const style = textNode.dataset.dsLorebookTagsOriginalStyle || "";
        if (cls) textNode.setAttribute("class", cls); else textNode.removeAttribute("class");
        if (style) textNode.setAttribute("style", style); else textNode.removeAttribute("style");
        delete textNode.dataset.dsLorebookTagsOriginalText;
        delete textNode.dataset.dsLorebookTagsOriginalClass;
        delete textNode.dataset.dsLorebookTagsOriginalStyle;
        delete textNode.dataset.dsLorebookTagsExpansionText;
      }
      if (counter) {
        const style = counter.dataset.dsLorebookTagsOriginalStyle || "";
        if (style) counter.setAttribute("style", style); else counter.removeAttribute("style");
        delete counter.dataset.dsLorebookTagsOriginalStyle;
        delete counter.dataset.dsLorebookTagsExpansionCounter;
      }
      row.classList.remove("ds-lorebook-tags-expanded");
    });
  }


  async function checkLorebookStatusApi(idValue) {
    const id = clean(idValue).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(id)) {
      return { ok: false, status: "unknown", httpStatus: 0, reason: "Missing or invalid Lorebook UUID.", recoveryAttempted: false };
    }

    if (typeof DS.fetchLorebookArchiveData !== "function") {
      return {
        ok: false,
        status: "unknown",
        httpStatus: 0,
        reason: "Authenticated Lorebook API bridge is not available on this helper tab.",
        recoveryAttempted: true
      };
    }

    try {
      const api = await DS.fetchLorebookArchiveData(id);
      const payload = lorebookPayload(api?.data);
      const meta = normalizeLorebookMeta(payload, id);
      const recoveryCopy = normalizeLorebookRecoveryCopy(payload, id);
      const httpStatus = Number(api?.httpStatus || 200) || 200;

      if (!meta || !meta.id) {
        return {
          ok: false,
          status: "unknown",
          httpStatus,
          reason: "Lorebook API returned HTTP 200 without a usable Lorebook object.",
          recoveryAttempted: true
        };
      }

      cache.set(id, {
        tags: meta.tags || [],
        meta,
        recoveryCopy,
        checkedAt: Date.now()
      });

      const entryCount = Array.isArray(recoveryCopy?.entries) ? recoveryCopy.entries.length : Number(meta.entryCount || 0);
      return {
        ok: true,
        status: "available",
        httpStatus,
        meta,
        recoveryCopy,
        recoveryAttempted: true,
        recoveryAuthSource: String(api?.authSource || ""),
        reason: `Lorebook API confirmed this Lorebook and saved a recovery copy with ${entryCount} entr${entryCount === 1 ? "y" : "ies"}.`
      };
    } catch (error) {
      const httpStatus = Math.max(0, Number(error?.httpStatus || 0) || 0);
      if (httpStatus === 403) {
        return {
          ok: false,
          status: "restricted",
          httpStatus,
          reason: "Lorebook API returned HTTP 403 (private / restricted).",
          recoveryAttempted: true
        };
      }
      if (httpStatus === 404) {
        return {
          ok: false,
          status: "candidate",
          httpStatus,
          reason: "Lorebook API returned HTTP 404. QoL keeps this as an unavailable candidate until deleted/private Lorebook behavior is fully confirmed.",
          recoveryAttempted: true
        };
      }
      if (httpStatus === 401) {
        return {
          ok: false,
          status: "unknown",
          httpStatus,
          reason: "Lorebook recovery request returned HTTP 401 even after using SpicyChat's authenticated request bridge.",
          recoveryAttempted: true
        };
      }
      if (httpStatus === 429) {
        return {
          ok: false,
          status: "unknown",
          httpStatus,
          reason: "Lorebook API rate-limited this recovery request (HTTP 429); retry later.",
          recoveryAttempted: true
        };
      }
      if (httpStatus >= 500) {
        return {
          ok: false,
          status: "unknown",
          httpStatus,
          reason: `Lorebook API returned HTTP ${httpStatus}; retry later.`,
          recoveryAttempted: true
        };
      }
      return {
        ok: false,
        status: "unknown",
        httpStatus,
        reason: error?.message || "Authenticated Lorebook API request failed.",
        recoveryAttempted: true
      };
    }
  }

  chrome.runtime?.onMessage?.addListener?.((message, _sender, sendResponse) => {
    if (message?.type !== "DS_LOREBOOK_STATUS_API_CHECK") return;
    checkLorebookStatusApi(message.lorebookId)
      .then(sendResponse)
      .catch(error => sendResponse({ ok: false, status: "unknown", httpStatus: 0, reason: error?.message || String(error) }));
    return true;
  });


  const editorEntryCache = new Map();
  const editorEntryInFlight = new Map();
  const EDITOR_ENTRY_CACHE_MAX_AGE = 30 * 1000;
  const LOREBOOK_EXPORT_WORKER_PARAM = "dsQolLorebookBackupWorker";

  function isLorebookBackupWorkerPage() {
    try {
      return new URLSearchParams(location.search || "").get(LOREBOOK_EXPORT_WORKER_PARAM) === "1" ||
        document.documentElement?.getAttribute("data-ds-qol-lorebook-backup-worker") === "1";
    } catch {
      return false;
    }
  }

  function editorLorebookIdFromPath(path = location.pathname) {
    const match = String(path || "").match(/^\/lorebook\/edit\/([0-9a-f-]{20,})\/entries(?:\/|$)/i);
    return clean(match?.[1] || "").toLowerCase();
  }

  function editorEntryTitle(rowInfo) {
    const button = rowInfo?.counter?.closest?.("button");
    if (!button) return "";
    const tooltip = [...button.querySelectorAll("[data-tooltip-content]")]
      .map(el => clean(el.getAttribute("data-tooltip-content")))
      .find(Boolean);
    if (tooltip) return tooltip;

    const candidates = [...button.querySelectorAll("p, span")]
      .filter(el => el !== rowInfo.textNode && el !== rowInfo.counter)
      .map(el => clean(el.textContent))
      .filter(text => text && !/^\+\d+$/.test(text));
    return candidates[0] || "";
  }

  function findEditorCollapsedKeywordRows() {
    const rows = [];
    const seen = new Set();
    const counters = [...document.querySelectorAll("p, span")]
      .filter(el => /^\+\d+$/.test(clean(el.textContent)));

    for (const counter of counters) {
      const row = counter.parentElement;
      const button = counter.closest?.("button");
      if (!row || !button || !button.contains(row)) continue;
      const textNode = [...row.children].find(el => el !== counter && clean(el.textContent) && !/^\+\d+$/.test(clean(el.textContent)));
      if (!textNode) continue;
      const key = `${editorEntryTitle({ row, textNode, counter })}|${clean(textNode.textContent)}|${clean(counter.textContent)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ row, textNode, counter, button });
    }
    return rows;
  }

  function entryKeywordScore(entry, rowInfo) {
    const keywords = [...new Set((Array.isArray(entry?.keywords) ? entry.keywords : []).map(clean).filter(Boolean))];
    const visible = visibleCollapsedTags(rowInfo);
    const hidden = collapsedTagCount(rowInfo);
    if (!keywords.length || keywords.length < visible.length + hidden) return -1;

    let score = 0;
    const title = clean(editorEntryTitle(rowInfo)).toLowerCase();
    const entryName = clean(entry?.name).toLowerCase();
    if (title && entryName === title) score += 100;
    else if (title && entryName && (entryName.includes(title) || title.includes(entryName))) score += 20;

    const lowerKeywords = keywords.map(value => value.toLowerCase());
    const lowerVisible = visible.map(value => value.toLowerCase());
    const prefix = lowerVisible.every((value, index) => lowerKeywords[index] === value);
    if (prefix) score += 80 + lowerVisible.length * 4;
    else {
      const allPresent = lowerVisible.every(value => lowerKeywords.includes(value));
      if (!allPresent) return -1;
      score += 35 + lowerVisible.length * 2;
    }

    if (keywords.length === visible.length + hidden) score += 25;
    return score;
  }

  function matchEditorEntry(entries, rowInfo, usedIds) {
    let best = null;
    let bestScore = -1;
    for (const entry of entries || []) {
      const key = clean(entry?.id || `${entry?.name || ""}|${(entry?.keywords || []).join("|")}`);
      if (key && usedIds.has(key)) continue;
      const score = entryKeywordScore(entry, rowInfo);
      if (score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (!best || bestScore < 35) return null;
    const key = clean(best?.id || `${best?.name || ""}|${(best?.keywords || []).join("|")}`);
    if (key) usedIds.add(key);
    return best;
  }

  async function fetchEditorLorebookEntries(lorebookId) {
    const id = clean(lorebookId).toLowerCase();
    const cached = editorEntryCache.get(id);
    if (cached && Date.now() - Number(cached.checkedAt || 0) < EDITOR_ENTRY_CACHE_MAX_AGE) return cached.entries || [];
    if (editorEntryInFlight.has(id)) return editorEntryInFlight.get(id);

    const task = (async () => {
      let entries = [];
      let source = "";

      // Public Lorebooks can use SpicyChat's dedicated Lorebook-entry Typesense
      // collection. This is the same scoped key already used by Lorebook Status,
      // and avoids opening/fetching every entry individually.
      try {
        const indexed = await runtimeMessage({ type: "DS_LOREBOOK_PUBLIC_RECOVERY_FETCH", lorebookId: id, expectedCount: 0 });
        if (indexed?.ok && indexed?.complete && Array.isArray(indexed.entries) && indexed.entries.length) {
          entries = indexed.entries.map((entry, index) => normalizeLorebookEntry(entry, index));
          source = clean(indexed.source || "typesense:lorebook_entries_public");
        }
      } catch {}

      // Private/unindexed owned Lorebooks are not present in the public entry
      // collection. Use the current authenticated API path once for the whole
      // Lorebook. Do NOT call the full backup reader here: that reader is allowed
      // to open an editor fallback, which previously let an automatic keyword
      // expansion recursively spawn another helper while already inside one.
      if (!entries.length) {
        try {
          const copy = await getCurrentOwnLorebookBackupDataApi(id);
          if (Array.isArray(copy?.entries) && copy.entries.length) {
            entries = copy.entries.map((entry, index) => normalizeLorebookEntry(entry, index));
            source = clean(copy.source || "current-live-api");
          }
        } catch {}
      }

      editorEntryCache.set(id, { entries, source, checkedAt: Date.now() });
      return entries;
    })().finally(() => editorEntryInFlight.delete(id));

    editorEntryInFlight.set(id, task);
    return task;
  }

  async function expandEditorKeywordRows(lorebookId) {
    const rows = findEditorCollapsedKeywordRows().filter(rowInfo => !rowInfo.row.classList.contains("ds-lorebook-tags-expanded"));
    if (!rows.length) return;

    const entries = await fetchEditorLorebookEntries(lorebookId);
    if (!entries.length) return;

    const usedIds = new Set();
    for (const rowInfo of rows) {
      const entry = matchEditorEntry(entries, rowInfo, usedIds);
      if (!entry) continue;
      showExpanded(rowInfo, entry.keywords || []);
    }
  }

  DS.applyLorebookTagExpansion = async function applyLorebookTagExpansion() {
    const settings = DS.state?.settings || {};
    const path = String(location.pathname || "");
    const supportedSurface = /^\/lorebooks(?:\/|$)/i.test(path) || /^\/lorebook(?:\/|$)/i.test(path);

    // The persistent bulk-backup helper exists only to collect the requested
    // Details/Entries snapshot. Never let automatic keyword expansion run in
    // that worker: doing so can trigger another live-reader fallback while the
    // helper is already collecting the same Lorebook.
    if (isLorebookBackupWorkerPage()) {
      restoreExpandedRows();
      return;
    }

    // My Lorebooks is deliberately a quiet management surface. Do not turn the
    // expansion option into another automatic scanner there.
    if (!settings.enabled || !settings.lorebookExpandTags || !supportedSurface || /^\/my-creations\/lorebooks(?:\/|$)/i.test(path)) {
      restoreExpandedRows();
      return;
    }

    const editorLorebookId = editorLorebookIdFromPath(path);
    if (editorLorebookId) {
      await expandEditorKeywordRows(editorLorebookId);
      return;
    }

    const anchors = [...document.querySelectorAll("a[href*='/lorebook/']")];
    const work = [];
    const seen = new Set();

    for (const anchor of anchors) {
      const id = lorebookIdFromHref(anchor.href || anchor.getAttribute("href"));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const card = findCard(anchor);
      const rowInfo = card ? findCollapsedTagRow(card) : null;
      if (!rowInfo || rowInfo.row.classList.contains("ds-lorebook-tags-expanded")) continue;
      work.push({ id: id.toLowerCase(), rowInfo });
    }
    if (!work.length) return;

    // First use complete data already embedded in the card DOM, when present.
    const unresolved = [];
    for (const item of work) {
      const localTags = tagsFromDom(item.rowInfo);
      if (showExpanded(item.rowInfo, localTags)) continue;
      const saved = cache.get(item.id);
      if (saved?.tags?.length && showExpanded(item.rowInfo, saved.tags)) continue;
      unresolved.push(item);
    }
    if (!unresolved.length) return;

    // SpicyChat exposes current scoped Lorebook search keys in application
    // config. Query all collapsed cards in one batched Typesense request instead
    // of doing one profile/API request per card.
    await fetchIndexedLorebookMetaBatch(unresolved.map(item => item.id));
    const stillMissing = [];
    for (const item of unresolved) {
      const indexedTags = cache.get(item.id)?.tags || [];
      if (!showExpanded(item.rowInfo, indexedTags)) stillMissing.push(item);
    }

    // Conservative fallback for non-indexed/unlisted cards: at most two heavier
    // authenticated/profile lookups per pass, preserving the old low-work limit.
    await Promise.all(stillMissing.slice(0, 2).map(async item => {
      const tags = await getTags(item.id);
      showExpanded(item.rowInfo, tags);
    }));
  };

  let editorExpansionObserver = null;
  let editorExpansionTimer = null;

  function editorExpansionEnabled() {
    const settings = DS.state?.settings || {};
    // Private/unknown Lorebook editors are intentionally blocked by the
    // Creator Editor privacy guard. Do not keep scheduling a guarded read.
    return !!settings.enabled && !!settings.lorebookExpandTags && !!editorLorebookIdFromPath() &&
      DS.creatorEditorAutoReadAllowed?.() !== false;
  }

  function stopEditorExpansionObserver() {
    editorExpansionObserver?.disconnect();
    editorExpansionObserver = null;
  }

  function scheduleEditorExpansion(delay = 120) {
    clearTimeout(editorExpansionTimer);
    editorExpansionTimer = null;
    if (!editorExpansionEnabled()) {
      stopEditorExpansionObserver();
      restoreExpandedRows();
      return;
    }
    editorExpansionTimer = setTimeout(() => {
      editorExpansionTimer = null;
      // The privacy guard can return undefined instead of a Promise. Catch
      // both synchronous errors and rejected async reads without dereferencing it.
      Promise.resolve().then(() => DS.applyLorebookTagExpansion?.()).catch(() => {});
    }, Math.max(0, delay));
  }

  function ensureEditorExpansionObserver() {
    if (!editorExpansionEnabled() || editorExpansionObserver || !document.body) return;
    editorExpansionObserver = new MutationObserver(mutations => {
      let relevant = false;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        for (const node of mutation.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          const hasCounter = /^\+\d+$/.test(clean(node.textContent)) ||
            [...(node.querySelectorAll?.("p, span") || [])].some(el => /^\+\d+$/.test(clean(el.textContent)));
          if (hasCounter) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
      if (relevant) scheduleEditorExpansion(140);
    });
    editorExpansionObserver.observe(document.body, { childList: true, subtree: true });
  }

  function refreshEditorExpansion() {
    if (!editorExpansionEnabled()) {
      stopEditorExpansionObserver();
      restoreExpandedRows();
      return;
    }
    ensureEditorExpansionObserver();
    scheduleEditorExpansion(80);
  }

  window.addEventListener("popstate", () => setTimeout(refreshEditorExpansion, 80), true);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("a[href], button[data-testid^='tab-']")) {
      setTimeout(refreshEditorExpansion, 120);
    }
  }, true);

  try {
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !DS.hasSettingStorageChanges?.(changes)) return;
      setTimeout(refreshEditorExpansion, 0);
    });
  } catch {}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshEditorExpansion, { once: true });
  } else {
    setTimeout(refreshEditorExpansion, 0);
  }
  setTimeout(refreshEditorExpansion, 400);
  setTimeout(refreshEditorExpansion, 1400);
  setTimeout(refreshEditorExpansion, 3200);

})();

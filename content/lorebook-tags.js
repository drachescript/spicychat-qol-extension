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

  async function getTags(id) {
    const saved = cache.get(id);
    if (saved && Date.now() - saved.checkedAt < MAX_AGE) return saved.tags;
    if (inFlight.has(id)) return inFlight.get(id);

    const request = (async () => {
      let tags = [];
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

  function showExpanded(rowInfo, tags) {
    if (!rowInfo || !tags?.length) return;
    const { row, textNode, counter } = rowInfo;
    textNode.textContent = tags.join(", ");
    textNode.classList.remove("line-clamp-1");
    textNode.style.webkitLineClamp = "unset";
    textNode.style.whiteSpace = "normal";
    textNode.style.overflow = "visible";
    row.classList.add("ds-lorebook-tags-expanded");
    counter.style.display = "none";
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

  DS.applyLorebookTagExpansion = async function applyLorebookTagExpansion() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.lorebookExpandTags) {
      document.querySelectorAll(".ds-lorebook-tags-expanded").forEach(row => row.classList.remove("ds-lorebook-tags-expanded"));
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
      work.push({ id, rowInfo });
    }

    // Keep this deliberately light. The normal QoL slow pass will pick up the
    // rest instead of firing a burst of profile requests on a large lorebook list.
    await Promise.all(work.slice(0, 2).map(async item => {
      const localTags = tagsFromDom(item.rowInfo);
      if (localTags.length > 3) {
        showExpanded(item.rowInfo, localTags);
        return;
      }
      const tags = await getTags(item.id);
      if (tags.length) showExpanded(item.rowInfo, tags);
    }));
  };
})();

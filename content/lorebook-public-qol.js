(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || window.__SPICYCHAT_QOL_PUBLIC_LOREBOOK_V031__) return;
  window.__SPICYCHAT_QOL_PUBLIC_LOREBOOK_V031__ = true;

  const STATUS_KEY = DS.LOREBOOK_STATUS_KEY || "lorebookStatus";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i;
  const processed = new WeakMap();
  const statusCache = new Map();
  const pendingIds = new Set();
  let flushTimer = 0;
  let tagFetchBudgetAt = 0;
  let tagFetchBudget = 0;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const normalize = value => DS.searchableTextForMatching?.(value) || DS.normalize?.(value) || clean(value).toLowerCase();
  const compact = value => normalize(value).replace(/\s+/g, "");
  const list = value => [...new Set((Array.isArray(value) ? value : []).map(clean).filter(Boolean))];

  function onLorebookSurface() {
    const path = String(location.pathname || "");
    // My Creations is a management surface. Do not run public/discovery
    // Lorebook scanners there; the dedicated creator tools remain available.
    if (/^\/my-creations\/lorebooks(?:\/|$)/i.test(path)) return false;
    return /^\/lorebooks(?:\/|$)/i.test(path)
      || /^\/lorebook(?:\/|$)/i.test(path);
  }

  function idFromHref(href) {
    const match = String(href || "").match(/\/lorebook\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
    return match?.[1]?.toLowerCase?.() || "";
  }

  function currentLorebookId() {
    const path = String(location.pathname || "");
    return (path.match(/^\/lorebook\/([0-9a-f-]{20,})(?:\/|$)/i)?.[1]
      || path.match(/^\/lorebook\/edit\/([0-9a-f-]{20,})(?:\/|$)/i)?.[1]
      || "").toLowerCase();
  }

  function currentPageMeta(id) {
    if (!id) return null;
    const root = document.querySelector("main, [role='main']") || document.querySelector("#root") || document.body;
    const name = clean(root?.querySelector("h1")?.textContent || document.title.replace(/\s*[|–-]\s*Spicychat.*$/i, ""));
    const creator = clean(root?.querySelector("a[aria-label='creator'], a[href*='/creator/']")?.textContent || "");
    const image = clean(root?.querySelector("img[alt]")?.currentSrc || root?.querySelector("img[alt]")?.src || "");
    const paragraphs = [...(root?.querySelectorAll?.("p") || [])].map(el => clean(el.textContent)).filter(Boolean);
    const description = paragraphs.filter(text => text !== name && text !== creator && text.length > 12).sort((a,b)=>b.length-a.length)[0] || "";
    return { id, name, creator, description, tags: [], image, entryCount: 0, profileUrl: `${location.origin}/lorebook/${id}` };
  }

  function ruleMatches(text, rawRule) {
    const hay = normalize(text);
    const needle = normalize(rawRule);
    if (!needle) return false;
    if (hay.includes(needle)) return true;
    const cNeedle = compact(rawRule);
    return cNeedle.length >= 3 && compact(text).includes(cNeedle);
  }

  function firstRuleMatch(values, rules) {
    const fields = (Array.isArray(values) ? values : [values]).map(clean).filter(Boolean);
    for (const rule of list(rules)) {
      if (fields.some(field => ruleMatches(field, rule))) return rule;
    }
    return "";
  }

  function findCard(anchor) {
    let node = anchor;
    let fallback = anchor?.parentElement || null;
    for (let i = 0; node && i < 9; i += 1, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;
      const links = node.querySelectorAll?.("a[href*='/lorebook/']")?.length || 0;
      const text = clean(node.textContent);
      if (links >= 1 && links <= 4 && text.length >= 8 && text.length < 2600) fallback = node;
      const cls = String(node.className || "");
      if (links >= 1 && /rounded-xl|rounded-lg/.test(cls) && text.length >= 8) return node;
    }
    return fallback;
  }

  function titleFor(card, anchor) {
    return clean(anchor?.getAttribute("title") || anchor?.textContent || card?.querySelector("a[title][href*='/lorebook/']")?.getAttribute("title") || card?.querySelector("img[alt]")?.getAttribute("alt") || "");
  }

  function creatorFor(card) {
    const creator = card?.querySelector("a[aria-label='creator'], a[href*='/creator/']");
    return clean(creator?.querySelector("[title]")?.getAttribute("title") || creator?.textContent || creator?.getAttribute("href")?.split("/creator/")[1] || "");
  }

  function descriptionFor(card, title, creator) {
    const candidates = [...(card?.querySelectorAll?.("p") || [])]
      .map(el => clean(el.textContent))
      .filter(text => text && text !== title && text !== creator && text !== creator.replace(/^@/, "") && !/^\d+$/.test(text));
    return candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  function visibleTagsFor(card) {
    const out = [];
    const add = value => {
      const text = clean(value);
      if (!text || text.length > 80 || /^\+\d+$/.test(text)) return;
      out.push(text);
    };
    card?.querySelectorAll?.("[data-tag], [data-tags], [data-tag-name], [data-tag-names]").forEach(el => {
      add(el.getAttribute("data-tag"));
      String(el.getAttribute("data-tags") || el.getAttribute("data-tag-names") || "").split(/[,;|]/).forEach(add);
      add(el.getAttribute("data-tag-name"));
    });
    card?.querySelectorAll?.("[title]").forEach(el => {
      const title = clean(el.getAttribute("title"));
      if (/tag/i.test(String(el.className || "")) && title) add(title);
    });
    return [...new Set(out)];
  }

  function entryCountFor(card) {
    for (const el of card?.querySelectorAll?.("p, span") || []) {
      const text = clean(el.textContent);
      if (!/^\d{1,6}$/.test(text)) continue;
      if (el.parentElement?.querySelector?.("svg.lucide-book-open, svg[class*='lucide-book-open']")) return Number(text) || 0;
    }
    return 0;
  }

  function cardMeta(card, anchor) {
    const id = idFromHref(anchor?.href || anchor?.getAttribute?.("href") || "");
    const name = titleFor(card, anchor);
    const creator = creatorFor(card);
    const description = descriptionFor(card, name, creator);
    const tags = visibleTagsFor(card);
    const img = card?.querySelector?.("img");
    return {
      id,
      name,
      creator,
      description,
      tags,
      image: clean(img?.currentSrc || img?.src || ""),
      entryCount: entryCountFor(card),
      profileUrl: id ? `${location.origin}/lorebook/${id}` : ""
    };
  }

  function effectiveRules(settings) {
    const normal = settings.applyBotBlockingToLorebooks === true && settings.blockCards === true;
    return {
      words: normal ? list(settings.blockedWords) : [],
      tags: normal ? list(settings.blockedTags) : [],
      creators: normal ? list(settings.blockedCreators) : [],
      ids: new Set(list(settings.lorebookBlockedIds).map(v => v.toLowerCase()))
    };
  }

  function blockReason(meta, settings) {
    const rules = effectiveRules(settings);
    if (rules.ids.has(meta.id)) return `blocked lorebook id: ${meta.id}`;
    const word = firstRuleMatch([meta.name, meta.description], rules.words);
    if (word) return `blocked lorebook word: ${word}`;
    const creator = firstRuleMatch([meta.creator], rules.creators);
    if (creator) return `blocked lorebook creator: ${creator}`;
    const cachedTags = statusCache.get(meta.id)?.tags || [];
    const tag = firstRuleMatch([...(meta.tags || []), ...cachedTags], rules.tags);
    if (tag) return `blocked lorebook tag: ${tag}`;
    return "";
  }

  function hideTarget(card) {
    if (!card) return null;

    // Public Lorebook cards are wrapped in a one-child grid cell. Hiding only
    // the inner rounded card leaves the grid cell behind as an empty hole, so
    // later cards cannot move up. Match the normal bot-card behavior and hide
    // the direct grid item whenever it is safe to do so.
    const wrapper = card.parentElement;
    const grid = wrapper?.parentElement;
    if (
      wrapper &&
      grid &&
      wrapper.children.length === 1 &&
      grid.classList?.contains("grid") &&
      wrapper.querySelectorAll?.("a[href*='/lorebook/']")?.length >= 1
    ) {
      return wrapper;
    }

    return card;
  }

  function restoreLorebookHides() {
    document.querySelectorAll("[data-ds-reason^='lorebook:block']").forEach(el => DS.unhideElement?.(el));
  }

  async function explicitlyBlock(meta, card) {
    const settings = DS.state?.settings || {};
    const ids = list(settings.lorebookBlockedIds).map(v => v.toLowerCase());
    if (!ids.includes(meta.id)) ids.push(meta.id);
    await DS.saveSettingsPatch?.({ lorebookBlockedIds: ids });
    const record = statusCache.get(meta.id) || {};
    statusCache.set(meta.id, { ...record, ...meta, blockedAt: Date.now(), lastSeen: Date.now() });
    pendingIds.add(meta.id);
    scheduleFlush();
    DS.hideElement?.(hideTarget(card), "lorebook:block:explicit");
    DS.setQuickStatus?.(`Blocked Lorebook: ${meta.name || meta.id}`);
  }

  function ensureBlockButton(card, anchor, meta, settings) {
    const old = card.querySelector?.(".ds-lorebook-block-button");
    if (settings.showLorebookBlockButtons !== true || settings.lorebookBlockingEnabled !== true) {
      old?.remove();
      return;
    }
    if (old) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-lorebook-block-button";
    button.textContent = "×";
    button.title = "Block this Lorebook in QoL";
    button.setAttribute("aria-label", "Block this Lorebook");
    button.setAttribute("data-ds-owned", "1");
    Object.assign(button.style, {
      position: "absolute", top: "6px", right: "42px", zIndex: "12",
      width: "28px", height: "28px", borderRadius: "999px", border: "0",
      background: "rgba(0,0,0,.58)", color: "white", fontSize: "22px",
      lineHeight: "24px", cursor: "pointer", padding: "0"
    });
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      explicitlyBlock(meta, card).catch(() => DS.setQuickStatus?.("Could not save that Lorebook block."));
    }, true);
    card.appendChild(button);
  }

  function diffSnapshot(previous, current) {
    const fields = ["name", "creator", "description", "image", "entryCount", "visibility", "status", "version", "numAttachedCharacters"];
    const changes = [];
    for (const field of fields) {
      const before = previous?.[field] ?? "";
      const after = current?.[field] ?? "";
      if (String(before) !== String(after) && String(before || "")) changes.push({ field, before, after });
    }
    const beforeTags = list(previous?.tags).sort();
    const afterTags = list(current?.tags).sort();
    if (afterTags.length && JSON.stringify(beforeTags) !== JSON.stringify(afterTags) && beforeTags.length) {
      changes.push({ field: "tags", before: beforeTags, after: afterTags });
    }
    return changes;
  }

  function remember(meta) {
    if (!meta.id || !UUID_RE.test(meta.id)) return;
    const now = Date.now();
    const previous = statusCache.get(meta.id) || null;
    const merged = {
      ...(previous || {}),
      ...meta,
      tags: meta.tags?.length ? meta.tags : list(previous?.tags),
      firstSeen: Number(previous?.firstSeen || now),
      lastSeen: now,
      history: Array.isArray(previous?.history) ? previous.history.slice(-99) : []
    };
    const changes = previous ? diffSnapshot(previous, merged) : [];
    if (changes.length) merged.history.push({ at: now, changes });
    const material = !previous || changes.length || now - Number(previous?.lastSeen || 0) > 5 * 60 * 1000;
    statusCache.set(meta.id, merged);
    if (material) {
      pendingIds.add(meta.id);
      scheduleFlush();
    }
  }

  async function loadExisting(ids) {
    const wanted = [...new Set(ids.filter(id => UUID_RE.test(id) && !statusCache.has(id)))];
    if (!wanted.length) return;
    try {
      const response = await new Promise(resolve => chrome.runtime.sendMessage({ type: "DS_LARGE_STORAGE_GET_RECORDS", key: STATUS_KEY, ids: wanted }, resolve));
      if (!response?.ok) return;
      for (const [id, value] of Object.entries(response.records || {})) if (value && typeof value === "object") statusCache.set(id, value);
    } catch {}
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => flush().catch(() => {}), 450);
  }

  async function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    const ids = [...pendingIds];
    pendingIds.clear();
    if (!ids.length) return;
    const entries = {};
    for (const id of ids) if (statusCache.has(id)) entries[id] = statusCache.get(id);
    try {
      const response = await new Promise(resolve => chrome.runtime.sendMessage({ type: "DS_LARGE_STORAGE_MERGE", key: STATUS_KEY, entries }, resolve));
      if (!response?.ok) ids.forEach(id => pendingIds.add(id));
    } catch { ids.forEach(id => pendingIds.add(id)); }
  }

  async function hydrateMissingTags(items, settings) {
    const tagRules = effectiveRules(settings).tags;
    if (!tagRules.length || typeof DS.getLorebookTagsForId !== "function") return;
    const now = Date.now();
    if (now - tagFetchBudgetAt > 15000) { tagFetchBudgetAt = now; tagFetchBudget = 2; }
    if (tagFetchBudget <= 0) return;
    const work = items.filter(item => !item.meta.tags.length && !(statusCache.get(item.meta.id)?.tags || []).length).slice(0, tagFetchBudget);
    tagFetchBudget -= work.length;
    await Promise.all(work.map(async item => {
      const tags = list(await DS.getLorebookTagsForId(item.meta.id));
      if (!tags.length) return;
      item.meta.tags = tags;
      if (typeof DS.getLorebookMetaForId === "function") {
        try {
          const apiMeta = await DS.getLorebookMetaForId(item.meta.id);
          if (apiMeta) Object.assign(item.meta, apiMeta, { id: item.meta.id, profileUrl: item.meta.profileUrl });
        } catch {}
      }
      remember(item.meta);
      const reason = blockReason(item.meta, settings);
      if (reason) DS.hideElement?.(hideTarget(item.card), `lorebook:block:${reason}`);
    }));
  }

  DS.isPublicLorebookExplorePage = function isPublicLorebookExplorePage() {
    return /^\/lorebooks\/explore(?:\/|$)/i.test(String(location.pathname || ""));
  };

  DS.getPublicLorebookHideTarget = hideTarget;
  DS.getPublicLorebookCardMeta = function getPublicLorebookCardMeta(card, anchor) {
    return cardMeta(card, anchor);
  };
  DS.getPublicLorebookBlockReason = function getPublicLorebookBlockReason(meta) {
    const settings = DS.state?.settings || {};
    if (settings.lorebookBlockingEnabled !== true) return "";
    return blockReason(meta || {}, settings);
  };

  DS.applyPublicLorebookQoL = async function applyPublicLorebookQoL() {
    if (!onLorebookSurface()) {
      restoreLorebookHides();
      document.querySelectorAll(".ds-lorebook-block-button").forEach(el => el.remove());
      await DS.applyLorebookTagExpansion?.();
      return;
    }
    const settings = DS.state?.settings || {};
    if (!settings.enabled) return;
    const active = settings.lorebookBlockingEnabled === true
      || settings.showLorebookBlockButtons === true
      || settings.lorebookTrackHistory === true
      || settings.lorebookExpandTags === true
      || list(settings.lorebookBlockedIds).length > 0;
    if (!active) {
      restoreLorebookHides();
      document.querySelectorAll(".ds-lorebook-block-button").forEach(el => el.remove());
      await DS.applyLorebookTagExpansion?.();
      return;
    }

    const anchors = [...document.querySelectorAll("a[href*='/lorebook/']")]
      .filter(anchor => idFromHref(anchor.href || anchor.getAttribute("href")));
    const unique = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const id = idFromHref(anchor.href || anchor.getAttribute("href"));
      if (!id || seen.has(id)) continue;
      const card = findCard(anchor);
      if (!card) continue;
      seen.add(id);
      unique.push({ id, anchor, card });
    }

    const currentId = currentLorebookId();
    await loadExisting([...unique.map(item => item.id), ...(currentId ? [currentId] : [])]);
    const processedItems = [];
    for (const item of unique) {
      const meta = cardMeta(item.card, item.anchor);
      const fingerprint = JSON.stringify([meta.name, meta.creator, meta.description, meta.entryCount, meta.tags]);
      if (processed.get(item.card) !== fingerprint) processed.set(item.card, fingerprint);
      if (settings.lorebookTrackHistory === true) remember(meta);
      ensureBlockButton(item.card, item.anchor, meta, settings);
      const target = hideTarget(item.card);
      const reason = settings.lorebookBlockingEnabled === true ? blockReason(meta, settings) : "";
      if (reason) DS.hideElement?.(target, `lorebook:block:${reason}`);
      else if (String(target?.dataset?.dsReason || "").startsWith("lorebook:block")) DS.unhideElement?.(target);
      processedItems.push({ ...item, meta });
    }

    if (currentId && !seen.has(currentId)) {
      const meta = currentPageMeta(currentId);
      if (meta) {
        if (typeof DS.getLorebookMetaForId === "function") {
          try {
            const apiMeta = await DS.getLorebookMetaForId(currentId);
            if (apiMeta) Object.assign(meta, apiMeta, { id: currentId, profileUrl: `${location.origin}/lorebook/${currentId}` });
          } catch {}
        } else if (typeof DS.getLorebookTagsForId === "function") {
          try { meta.tags = list(await DS.getLorebookTagsForId(currentId)); } catch {}
        }
        if (settings.lorebookTrackHistory === true) remember(meta);
      }
    }

    await hydrateMissingTags(processedItems, settings);
    await DS.applyLorebookTagExpansion?.();
  };

  chrome.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "local") return;
    if (!Object.keys(changes || {}).some(key => key.startsWith(DS.GRANULAR_SETTING_PREFIX || "dsSettingV1:"))) return;
    setTimeout(() => DS.applyPublicLorebookQoL?.(), 60);
  });
})();

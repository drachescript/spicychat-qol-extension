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

  async function getTags(id) {
    const saved = cache.get(id);
    if (saved && Date.now() - saved.checkedAt < MAX_AGE) return saved.tags;
    if (inFlight.has(id)) return inFlight.get(id);

    const request = (async () => {
      try {
        const response = await fetch(`${location.origin}/lorebook/${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store"
        });
        if (!response.ok) return [];
        const tags = tagsFromHtml(await response.text(), id);
        cache.set(id, { tags, checkedAt: Date.now() });
        return tags;
      } catch {
        return [];
      } finally {
        inFlight.delete(id);
      }
    })();

    inFlight.set(id, request);
    return request;
  }

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

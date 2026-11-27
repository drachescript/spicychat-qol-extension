if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const BUTTON_ID = "ds-wiki-lorebook-import";
  const MODAL_ID = "ds-wiki-lorebook-modal";
  const IMPORT_META_KEY = "wikiLorebookImports";
  const MAX_LINKS = 100;
  const MAX_CRAWL_PAGES = 60;
  const MAX_PREVIEW_ENTRIES = 300;

  let currentPage = null;
  let pages = [];
  let entries = [];
  let failedEntries = [];
  let busy = false;

  function clean(value, max = 20000) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max);
  }

  function unique(values, limit = 100) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(values) ? values : []) {
      const value = clean(raw, 3000);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= Math.max(1, Number(limit) || 100)) break;
    }
    return out;
  }

  function normalizedPath() {
    return String(location.pathname || "")
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  function routeInfo() {
    const path = normalizedPath();
    const match = path.match(/^\/lorebook\/edit\/([^/]+)\/entries$/i) || path.match(/^\/lorebook\/([^/]+)\/edit\/entries$/i);
    if (!match) return null;
    // Route detection already proves this is the Entries tab. The importer
    // also checks routeInfo().page before writing; omitting it made every
    // legitimate Entries-tab import falsely report that the page changed.
    return { id: clean(decodeURIComponent(match[1]), 200), page: "entries" };
  }

  function enabled() {
    const settings = DS.state?.settings || {};
    return settings.enabled !== false && !!settings.enableWikiLorebookImporter;
  }

  function el(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(text, className = "") {
    const node = el("button", className, text);
    node.type = "button";
    return node;
  }

  function setStatus(text, tone = "") {
    const host = document.querySelector(`#${MODAL_ID} [data-ds-wiki-status]`);
    if (!host) return;
    host.textContent = text || "";
    host.dataset.tone = tone || "";
  }

  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message || "Extension worker did not respond." });
          resolve(response || { ok: false, error: "No response from extension worker." });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function safeUrl(value, base = location.href) {
    try {
      const url = new URL(String(value || "").trim(), base);
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";
      return url;
    } catch {
      return null;
    }
  }

  async function fetchWikiUrl(urlValue, { askPermission = false } = {}) {
    const url = safeUrl(urlValue);
    if (!url) return { ok: false, error: "Enter a valid http:// or https:// page URL." };

    if (askPermission) {
      const permission = await runtimeMessage({ type: "DS_WIKI_REQUEST_PERMISSION", url: url.href });
      if (!permission?.ok) {
        return { ok: false, permissionDenied: true, error: permission?.error || `Site access was not granted for ${url.host}.` };
      }
    }
    const result = await runtimeMessage({ type: "DS_WIKI_FETCH", url: url.href });
    return result || { ok: false, error: "Could not fetch that page." };
  }

  function textOf(node, max = 20000) {
    return clean(node?.textContent || "", max);
  }

  function removeNoise(root, { keepReferences = false, removed = null } = {}) {
    if (!root?.querySelectorAll) return;
    const selectors = [
      "script", "style", "noscript", "iframe", "svg", "canvas", "form",
      "nav", "footer", "aside", "[role='navigation']", "[role='complementary']",
      ".mw-editsection", ".mw-jump-link", ".toc", "#toc", ".vector-toc", ".page-side-tools",
      ".wds-global-navigation", ".global-navigation", ".rail-module", ".right-rail-wrapper",
      ".article-table-of-contents", ".page-footer", ".page__right-rail", ".community-header-wrapper",
      ".navbox", ".navigation-not-searchable", ".catlinks", ".page-header__categories",
      ".printfooter", ".authority-control", ".metadata", ".ambox", ".hatnote", ".shortdescription",
      ".reference", "sup.reference", ".mw-cite-backlink", ".mw-cite-backlink a",
      ".gallery", ".wikia-gallery", ".gallerybox", ".portable-infobox .pi-image", ".pi-navigation",
      ".comments", "#comments", ".article-comments", ".discussion-tools", ".social-share",
      ".page-actions-menu", ".page-header__actions", ".article-footer", ".license-description",
      ".template-documentation", ".dablink", ".sistersitebox", ".portal", ".noprint",
      "[class*='advert']", "[id*='advert']", "[class*='cookie']", "[id*='cookie']",
      "[class*='newsletter']", "[class*='related-pages']", "[class*='recommended']"
    ];
    if (!keepReferences) selectors.push(".mw-references-wrap", ".reflist", ".references-small", "ol.references");
    for (const selector of selectors) {
      try {
        root.querySelectorAll(selector).forEach(node => {
          if (Array.isArray(removed)) {
            const value = textOf(node, 3000);
            if (value && value.length >= 3) removed.push(`${selector}: ${value}`);
          }
          node.remove();
        });
      } catch {}
    }
  }

  function detectKind(doc, url) {
    const host = String(url?.hostname || "").toLowerCase();
    const generator = String(doc.querySelector("meta[name='generator']")?.content || "").toLowerCase();
    if (host.endsWith(".fandom.com") || host === "fandom.com" || doc.querySelector(".portable-infobox, .page-header__title")) return "Fandom";
    if (/mediawiki/.test(generator) || doc.querySelector("#mw-content-text, .mw-parser-output")) return "MediaWiki";
    return "Generic wiki / article";
  }

  function pageTitle(doc, url) {
    const candidates = [
      doc.querySelector(".page-header__title"),
      doc.querySelector("#firstHeading"),
      doc.querySelector(".mw-page-title-main"),
      doc.querySelector("article h1"),
      doc.querySelector("main h1"),
      doc.querySelector("h1")
    ];
    for (const node of candidates) {
      const value = textOf(node, 200).replace(/\s*\[[^\]]+\]\s*$/g, "");
      if (value) return value.slice(0, 120);
    }
    const raw = clean(doc.title, 200).replace(/\s+[|–—-]\s+[^|–—-]{2,80}$/g, "");
    if (raw) return raw.slice(0, 120);
    return decodeURIComponent((url?.pathname || "").split("/").filter(Boolean).pop() || "Wiki article").replace(/[_-]+/g, " ").slice(0, 120);
  }

  function contentRoot(doc) {
    const selectors = [
      ".page__main .mw-parser-output",
      "#mw-content-text .mw-parser-output",
      ".mw-parser-output",
      ".WikiaArticle",
      "article .article-content",
      "article .entry-content",
      "article",
      "main [role='article']",
      "main .content",
      "main",
      "[role='main']",
      ".article-content",
      ".entry-content",
      "#content"
    ];
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      if (node && textOf(node, 100000).length >= 120) return node;
    }
    return doc.body;
  }

  function flattenTable(table) {
    const lines = [];
    for (const row of table.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll(":scope > th, :scope > td")].map(cell => textOf(cell, 1000)).filter(Boolean);
      if (!cells.length) continue;
      if (cells.length === 1) lines.push(cells[0]);
      else lines.push(`${cells[0]}: ${cells.slice(1).join(" | ")}`);
      if (lines.length >= 30) break;
    }
    return clean(lines.join("\n"), 8000);
  }

  function infoboxText(root) {
    const box = root.querySelector(".portable-infobox, table.infobox, .infobox, [class*='infobox']");
    if (!box) return "";
    const clone = box.cloneNode(true);
    removeNoise(clone);
    if (clone.tagName === "TABLE") return flattenTable(clone);
    const lines = [];
    for (const row of clone.querySelectorAll(".pi-item, .pi-data, tr, dl")) {
      const label = textOf(row.querySelector(".pi-data-label, th, dt"), 300);
      const value = textOf(row.querySelector(".pi-data-value, td, dd"), 1500);
      if (label && value) lines.push(`${label}: ${value}`);
    }
    return clean(lines.join("\n"), 8000);
  }

  function aliasesFromRoot(root, title, doc = null, url = null) {
    const values = [];
    const add = value => {
      const v = clean(value, 100).replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
      if (!v || v.length < 3 || v.length > 80) return;
      if (!values.some(item => item.toLowerCase() === v.toLowerCase())) values.push(v);
    };
    add(title);
    const firstParagraphs = [...root.querySelectorAll("p")].slice(0, 5);
    for (const p of firstParagraphs) {
      for (const bold of p.querySelectorAll("b, strong")) add(textOf(bold, 100));
    }
    const box = root.querySelector(".portable-infobox, table.infobox, .infobox, [class*='infobox']");
    if (box) {
      for (const row of box.querySelectorAll(".pi-item, .pi-data, tr")) {
        const label = textOf(row.querySelector(".pi-data-label, th"), 100).toLowerCase();
        if (!/(alias|aka|also known|full name|name|other name|nickname)/i.test(label)) continue;
        const value = textOf(row.querySelector(".pi-data-value, td"), 500);
        value.split(/[,;/\n]|\bor\b/i).forEach(add);
      }
    }
    const redirectRoot = doc || root.ownerDocument;
    redirectRoot?.querySelectorAll?.(".mw-redirectedfrom a, .redirectMsg a, .redirectText a, [class*='redirect'] a").forEach(anchor => add(textOf(anchor, 100)));
    const canonical = redirectRoot?.querySelector?.("link[rel='canonical']")?.href;
    const canonicalUrl = safeUrl(canonical || "", url?.href || location.href);
    if (canonicalUrl) add(decodeURIComponent(canonicalUrl.pathname.split("/").filter(Boolean).pop() || "").replace(/_/g, " "));
    return values.slice(0, 12);
  }

  const SKIP_SECTIONS = /^(contents?|references?|sources?|external links?|see also|gallery|navigation|notes?|citations?|footnotes?|further reading|bibliography|appearances?|behind the scenes)$/i;

  function extractSections(root, title, { includeReferences = false } = {}) {
    const clone = root.cloneNode(true);
    const removed = [];
    const info = infoboxText(clone);
    removeNoise(clone, { keepReferences: includeReferences, removed });

    const sections = [];
    let current = { title: "", level: 1, parts: [] };
    let skipping = false;

    const flush = () => {
      const content = clean(current.parts.join("\n\n"), 50000);
      if (content) sections.push({ title: clean(current.title, 120), content });
      current = { title: "", level: 1, parts: [] };
    };

    const nodes = [...clone.querySelectorAll("h2,h3,h4,p,li,blockquote,pre,table")];
    for (const node of nodes) {
      if (node.closest("table") && node.tagName !== "TABLE") continue;
      if (node.matches("h2,h3,h4")) {
        flush();
        const heading = textOf(node, 160).replace(/\[edit\]/gi, "").trim();
        current = { title: heading, level: Number(node.tagName.slice(1)) || 2, parts: [] };
        skipping = !includeReferences && SKIP_SECTIONS.test(heading);
        if (skipping) removed.push(`section skipped: ${heading}`);
        continue;
      }
      if (skipping) continue;
      let value = "";
      if (node.tagName === "TABLE") {
        if (node.matches(".portable-infobox, .infobox, [class*='infobox']")) continue;
        value = flattenTable(node);
      } else if (node.tagName === "LI") {
        value = `• ${textOf(node, 3000)}`;
      } else {
        value = textOf(node, 8000);
      }
      if (!value || value.length < 2) continue;
      if (/^(edit|advertisement)$/i.test(value)) { removed.push(value); continue; }
      const last = current.parts[current.parts.length - 1];
      if (last && last === value) continue;
      current.parts.push(value);
    }
    flush();

    if (info) {
      const intro = sections.find(section => !section.title);
      if (intro) intro.content = clean(`${info}\n\n${intro.content}`, 50000);
      else sections.unshift({ title: "", content: info });
    }

    if (!sections.length) {
      const body = clean(clone.innerText || clone.textContent || "", 50000);
      if (body) sections.push({ title: "", content: body });
    }

    return {
      sections: sections.filter(section => section.content.length >= 20 || section.title).slice(0, 100),
      removedText: clean(unique(removed, 120).join("\n\n"), 24000)
    };
  }

  function discoverLinks(root, baseUrl) {
    const base = safeUrl(baseUrl);
    if (!base) return [];
    const found = new Map();
    const ignoredPath = /(?:\/|^)(?:Special|File|Image|Template|Help|Talk|User|User_talk|Portal|Module|MediaWiki):/i;
    for (const anchor of root.querySelectorAll("a[href]")) {
      const text = textOf(anchor, 120);
      if (!text || text.length < 2) continue;
      const url = safeUrl(anchor.getAttribute("href"), base.href);
      if (!url || url.origin !== base.origin || url.href === base.href) continue;
      if (ignoredPath.test(decodeURIComponent(url.pathname))) continue;
      if (/\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|webm)$/i.test(url.pathname)) continue;
      if (/\/(?:edit|history|discussion|comments)(?:\/|$)/i.test(url.pathname)) continue;
      if (/[?&](?:action|oldid|diff|veaction)=/i.test(url.search)) continue;
      url.search = "";
      const categoryMember = !!anchor.closest(".category-page__members,.category-page__member,#mw-pages,.mw-category,.category-members,.CategoryTreeItem");
      const key = url.href.toLowerCase();
      if (!found.has(key)) found.set(key, { url: url.href, title: text, categoryMember });
      else if (categoryMember) found.get(key).categoryMember = true;
      if (found.size >= MAX_LINKS) break;
    }
    return [...found.values()];
  }

  function markdownToArticle(source, title) {
    const esc = value => String(value || "").replace(/[&<>]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[ch]));
    const out = [`<article><h1>${esc(title)}</h1>`];
    let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${esc(para.join(" "))}</p>`); para = []; } };
    for (const raw of String(source || "").split(/\r?\n/)) {
      const line = raw.trim();
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) { flush(); out.push(`<h${Math.min(4, heading[1].length + 1)}>${esc(heading[2])}</h${Math.min(4, heading[1].length + 1)}>`); continue; }
      const bullet = line.match(/^[-*+]\s+(.+)$/);
      if (bullet) { flush(); out.push(`<p>• ${esc(bullet[1])}</p>`); continue; }
      if (!line) { flush(); continue; }
      para.push(line);
    }
    flush(); out.push("</article>");
    return out.join("");
  }

  function parseWikiPage(markup, sourceUrl, options = {}) {
    const url = safeUrl(sourceUrl) || new URL("https://example.invalid/");
    const looksLikeHtml = /<\s*(?:html|body|article|main|div|p|h1|h2|table)\b/i.test(String(markup || ""));
    const fallbackTitle = decodeURIComponent((url.pathname || "").split("/").filter(Boolean).pop() || "Pasted article").replace(/[_-]+/g, " ").slice(0, 120) || "Pasted article";
    const html = looksLikeHtml ? String(markup || "") : markdownToArticle(String(markup || ""), fallbackTitle);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const root = contentRoot(doc);
    const title = pageTitle(doc, url);
    const kind = detectKind(doc, url);
    const aliases = aliasesFromRoot(root, title, doc, url);
    const extracted = extractSections(root, title, options);
    const links = discoverLinks(root, url.href);
    return { url: url.href, finalUrl: url.href, title, kind, aliases, sections: extracted.sections, removedText: extracted.removedText, links, fetchedAt: Date.now() };
  }

  function splitText(text, maxChars) {
    const source = clean(text, 50000);
    if (!source || source.length <= maxChars) return [source].filter(Boolean);
    const out = [];
    let rest = source;
    while (rest.length > maxChars && out.length < 30) {
      let cut = rest.lastIndexOf("\n\n", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = rest.lastIndexOf(". ", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = rest.lastIndexOf(" ", maxChars);
      if (cut < Math.floor(maxChars * 0.55)) cut = maxChars;
      out.push(clean(rest.slice(0, cut + (rest.slice(cut, cut + 2) === ". " ? 1 : 0)), maxChars + 50));
      rest = rest.slice(cut + (rest[cut] === "." ? 1 : 0)).trim();
    }
    if (rest) out.push(rest);
    return out.filter(Boolean);
  }

  function keywordList(page, sectionTitle = "") {
    const values = [];
    const add = value => {
      const v = clean(value, 80).replace(/[|]+/g, " ").trim();
      if (v.length < 3 || v.length > 80) return;
      if (!values.some(item => item.toLowerCase() === v.toLowerCase())) values.push(v);
    };
    add(page.title);
    (page.aliases || []).forEach(add);
    if (sectionTitle && !/^(history|overview|description|personality|appearance|abilities|powers|relationships|trivia)$/i.test(sectionTitle)) add(sectionTitle);
    const titleWords = String(page.title || "").split(/[^\p{L}\p{N}'-]+/u).filter(word => word.length >= 4 && !/^(the|and|with|from|into|that|this|wiki)$/i.test(word));
    titleWords.slice(0, 4).forEach(add);
    return values.slice(0, 12);
  }

  function entryName(pageTitleValue, sectionTitle, part, partsCount, mode) {
    let base = clean(pageTitleValue, 50) || "Wiki entry";
    if (mode !== "page" && sectionTitle) base = `${base} — ${clean(sectionTitle, 34)}`;
    if (partsCount > 1) base = `${base} ${part}/${partsCount}`;
    if (base.length <= 50) return base;
    const suffix = partsCount > 1 ? ` ${part}/${partsCount}` : "";
    return `${base.slice(0, Math.max(1, 50 - suffix.length)).trim()}${suffix}`.slice(0, 50);
  }

  function buildEntries(pageList, opts) {
    const mode = opts.mode || "sections";
    const maxChars = Math.max(600, Math.min(1950, Number(opts.maxChars) || 1800));
    const result = [];

    for (const page of pageList) {
      if (mode === "page") {
        const combined = page.sections.map(section => section.title ? `${section.title}\n${section.content}` : section.content).join("\n\n");
        const chunks = splitText(combined, Math.max(maxChars, 1200));
        chunks.forEach((content, index) => result.push({
          id: `${page.url}#page-${index}`,
          checked: true,
          name: entryName(page.title, "", index + 1, chunks.length, "page"),
          keywords: keywordList(page),
          content,
          sourceUrl: page.url,
          pageTitle: page.title,
          section: "",
          kind: page.kind
        }));
        continue;
      }

      for (const section of page.sections) {
        const chunks = mode === "auto" ? splitText(section.content, maxChars) : [clean(section.content, 50000)];
        chunks.filter(Boolean).forEach((content, index) => result.push({
          id: `${page.url}#${section.title || "intro"}-${index}`,
          checked: true,
          name: entryName(page.title, section.title, index + 1, chunks.length, "sections"),
          keywords: keywordList(page, section.title),
          content: content.length > 2000 ? content.slice(0, 2000) : content,
          sourceUrl: page.url,
          pageTitle: page.title,
          section: section.title,
          kind: page.kind
        }));
      }
    }

    const seen = new Map();
    for (const item of result) {
      const original = item.name;
      const key = original.toLowerCase();
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      if (count > 1) {
        const suffix = ` (${count})`;
        item.name = `${original.slice(0, 50 - suffix.length).trim()}${suffix}`;
      }
    }

    return result.slice(0, MAX_PREVIEW_ENTRIES);
  }

  function optionValues() {
    const modal = document.getElementById(MODAL_ID);
    return {
      mode: modal?.querySelector("[data-ds-wiki-split]")?.value || "sections",
      maxChars: Number(modal?.querySelector("[data-ds-wiki-max]")?.value) || 1800,
      includeReferences: !!modal?.querySelector("[data-ds-wiki-references]")?.checked,
      duplicatePolicy: modal?.querySelector("[data-ds-wiki-duplicates]")?.value || "skip"
    };
  }

  function refreshEntriesFromPages() {
    entries = buildEntries(pages, optionValues());
    renderEntryPreview();
  }

  function renderLinkList() {
    const modal = document.getElementById(MODAL_ID);
    const host = modal?.querySelector("[data-ds-wiki-links]");
    const summary = modal?.querySelector("[data-ds-wiki-link-summary]");
    if (!host || !summary) return;
    host.replaceChildren();
    const links = currentPage?.links || [];
    const categoryCount = links.filter(item => item.categoryMember).length;
    summary.textContent = links.length ? `${links.length} internal page${links.length === 1 ? "" : "s"} found${categoryCount ? ` · ${categoryCount} category member${categoryCount === 1 ? "" : "s"}` : ""}.` : "No usable same-site article links were found.";
    for (const item of links) {
      const label = el("label", "ds-wiki-link-row");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.dataset.url = item.url;
      if (item.categoryMember) check.dataset.categoryMember = "1";
      const text = el("span", "", item.title || item.url);
      const small = el("small", "", item.url);
      label.append(check, el("span", "ds-wiki-link-text"));
      label.lastElementChild.append(text, small);
      host.append(label);
    }
  }

  function renderEntryPreview() {
    const modal = document.getElementById(MODAL_ID);
    const host = modal?.querySelector("[data-ds-wiki-entries]");
    const summary = modal?.querySelector("[data-ds-wiki-entry-summary]");
    if (!host || !summary) return;
    host.replaceChildren();
    summary.textContent = entries.length ? `${entries.length} Lorebook entr${entries.length === 1 ? "y" : "ies"} ready to review.` : "Fetch or paste a page to build a preview.";

    entries.forEach((item, index) => {
      const card = el("article", "ds-wiki-entry-card");
      const top = el("div", "ds-wiki-entry-top");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = item.checked !== false;
      check.addEventListener("change", () => { item.checked = check.checked; });
      const number = el("strong", "", `#${index + 1}`);
      const state = item.updateState || previewExistingState(item);
      item.updateState = state;
      const source = el("small", "", `${item.kind} · ${item.pageTitle}${item.section ? ` · ${item.section}` : ""} · ${state}`);
      source.dataset.state = state;
      top.append(check, number, source);

      const nameLabel = el("label", "ds-wiki-field");
      nameLabel.append(el("span", "", "Entry name"));
      const name = document.createElement("input");
      name.type = "text";
      name.maxLength = 50;
      name.value = item.name;
      name.addEventListener("input", () => { item.name = clean(name.value, 50); });
      nameLabel.append(name);

      const keywordsLabel = el("label", "ds-wiki-field");
      keywordsLabel.append(el("span", "", "Keywords (max 12)"));
      const keywords = document.createElement("input");
      keywords.type = "text";
      keywords.value = item.keywords.join(", ");
      keywords.addEventListener("input", () => {
        item.keywords = [...new Set(keywords.value.split(/[,;\n]/g).map(value => clean(value, 80)).filter(value => value.length >= 3))].slice(0, 12);
      });
      keywordsLabel.append(keywords);

      const contentLabel = el("label", "ds-wiki-field");
      contentLabel.append(el("span", "", `Content · ${item.content.length.toLocaleString()} chars${item.content.length > 2000 ? " · TOO LONG" : ""}`));
      const content = document.createElement("textarea");
      content.rows = 7;
      content.value = item.content;
      content.addEventListener("input", () => {
        item.content = clean(content.value, 24000);
        contentLabel.firstElementChild.textContent = `Content · ${item.content.length.toLocaleString()} chars${item.content.length > 2000 ? " · TOO LONG" : ""}`;
      });
      contentLabel.append(content);

      const foot = el("div", "ds-wiki-entry-source");
      const sourceLink = el("span", "", item.sourceUrl);
      const remove = button("Remove", "ds-wiki-small-button");
      remove.addEventListener("click", () => {
        entries.splice(index, 1);
        renderEntryPreview();
      });
      foot.append(sourceLink, remove);
      card.append(top, nameLabel, keywordsLabel, contentLabel, foot);
      host.append(card);
    });
  }

  function nativeSetValue(input, value) {
    if (!input) return;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value || "") }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function waitFor(check, timeout = 5000, interval = 50) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        let value = null;
        try { value = check(); } catch {}
        if (value) return resolve(value);
        if (Date.now() - started >= timeout) return reject(new Error("SpicyChat did not open the Lorebook entry editor in time."));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function entryModalParts() {
    const visible = [...document.querySelectorAll("textarea[name='content']")].filter(node => node.isConnected && node.offsetParent !== null);
    if (visible.length !== 1) return null;
    const content = visible[0];
    const form = content.closest("form");
    const names = [...(form?.querySelectorAll("input[name='name']") || [])].filter(node => node.isConnected && node.offsetParent !== null);
    if (!form || names.length !== 1) return null;
    const name = names[0];
    let root = form.parentElement;
    for (let i = 0; root && i < 6; i += 1, root = root.parentElement) {
      if (root.querySelector("button[aria-label='Cancel'],button[aria-label='Update']") || [...root.querySelectorAll("button")].some(node => /^(cancel|update|create|add|save)$/i.test(textOf(node, 40)))) break;
    }
    const keyword = [...form.querySelectorAll("input")].find(input => input !== name && /keyword|tag|maximum\s*12/i.test(String(input.placeholder || ""))) || [...form.querySelectorAll("input")].find(input => input !== name);
    return { root: root || form.parentElement, form, name, keyword, content };
  }

  async function addKeyword(input, keyword, guard = null, draft = null) {
    if (!input || input.disabled) return false;
    let manual=false;
    const mark=e=>{if(e.isTrusted && entryModalParts()?.root?.contains(e.target))manual=true;};
    const events=['input','change','click','keydown','submit'];
    if(guard)for(const type of events)document.addEventListener(type,mark,true);
    const check=()=>{guard?.();if(manual)throw Error('Manual entry interaction during keyword recovery. Review the open form; no automatic write sent.');};
    try {
    nativeSetValue(input, keyword);
    input.focus();
    await new Promise(resolve => setTimeout(resolve, 25));
    if (guard) {
      const until = Date.now()+1200;
      let recovered = false;
      for (let attempt=0; attempt<13; attempt++) {
        check();
        const current = entryModalParts();
        if (current && draft) {
          const chips=JSON.stringify(exactTransferKeywords(current).sort());
          const before=JSON.stringify([...draft.keywords].sort());
          const after=JSON.stringify([...draft.keywords,keyword].sort());
          if (current.name.value!==draft.name || current.content.value!==draft.content || (chips!==before && chips!==after)) throw Error('Native keyword draft changed. Review the open form; no write sent.');
          if (chips===after && !current.keyword?.value) return true;
          if (chips===before && current.keyword?.isConnected && !current.keyword.disabled && current.keyword.value===keyword) {
            input=current.keyword; recovered=true; break;
          }
          if (current.keyword?.value && current.keyword.value!==keyword) throw Error('Native keyword text changed. Review the open form; no write sent.');
        } else if (!draft && input.isConnected && input.value===keyword && current?.keyword===input) {recovered=true;break;}
        if(Date.now()>=until)break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!recovered)throw Error('Native keyword input unavailable or changed. Review the open form; no write sent.');
    }
    check();
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
    await new Promise(resolve => setTimeout(resolve, 65));
    if (guard && draft) {
      const expected={...draft,keywords:[...draft.keywords,keyword]};
      for(let attempt=0;attempt<12;attempt++) {
        check();const current=entryModalParts();
        if(verifyCreateFields(current,expected))return true;
        if(current && (current.name.value!==draft.name || current.content.value!==draft.content || (current.keyword?.value && current.keyword.value!==keyword)))throw Error('Native keyword draft changed after Enter. No write sent.');
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw Error('Native keyword was not confirmed after Enter. No write sent; review the open form.');
    }
    return true;
    } finally { if(guard)for(const type of events)document.removeEventListener(type,mark,true); }
  }

  function findSubmitButton(parts) {
    const buttons = [...(parts?.root?.querySelectorAll("button") || [])].filter(node => !node.disabled && node.getAttribute("aria-disabled") !== "true");
    return buttons.find(node => /^(create|add|add entry|save)$/i.test(textOf(node, 60)) || /^(create|add|save)$/i.test(String(node.getAttribute("aria-label") || "")))
      || buttons.find(node => /lorebook:modal\.entry\.action\.(?:create|add|save)/i.test(node.querySelector("[data-translate-key]")?.getAttribute("data-translate-key") || ""));
  }

  function exactTransferKeywords(parts) {
    const clear = parts.root?.querySelector("button[aria-label='Clear all tags']");
    return [...(parts.form?.querySelectorAll("button") || [])]
      .filter(button => button !== clear && !/clear all/i.test(button.getAttribute("aria-label") || ""))
      .filter(button => button.querySelector("svg.lucide-x,svg[class*='lucide-x']"))
      .map(button => String(button.textContent || "").trim()).filter(Boolean);
  }
  // React can replace the form between IndexedDB checkpointing and the
  // native click. Reacquire only a unique, exact, still-unsaved create form.
  function verifyCreateFields(parts, item) {
    return !!parts?.form?.isConnected && parts.form.contains(parts.name) && parts.form.contains(parts.content) &&
      parts.name.value === item.name && parts.content.value === item.content &&
      !String(parts.keyword?.value || '').trim() &&
      JSON.stringify(exactTransferKeywords(parts).sort()) === JSON.stringify([...item.keywords].sort());
  }
  function verifiedCreateSubmit(parts, item, add) {
    if (!verifyCreateFields(parts, item)) return null;
    // Do not adopt an Update form or a QoL button as a replacement Create.
    if ([...parts.root.querySelectorAll('button')].some(b => b.offsetParent !== null &&
      /^(update|update entry)$/i.test(String(b.getAttribute('aria-label') || textOf(b, 60)).trim()))) return null;
    const button = findSubmitButton(parts);
    return button && button !== add && button.isConnected && button.offsetParent !== null &&
      !button.disabled && button.getAttribute('aria-disabled') !== 'true' &&
      !button.closest('[data-ds-owned], [id^="ds-"]') ? button : null;
  }
  async function recoverCreateSubmit(item, add, checkTarget, manuallyChanged, readParts = entryModalParts, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms))) {
    const deadline = now() + 4000;
    for (let attempt = 0; attempt < 41; attempt++) {
      checkTarget();
      if (manuallyChanged()) throw Error('Manual editor interaction during checkpoint; review the open entry and check the saved job before resuming.');
      const current = readParts();
      if (current && !verifyCreateFields(current, item)) throw Error('Native create fields changed; review and close the unsaved form before resuming.');
      const button = verifiedCreateSubmit(current, item, add);
      if (button) return {parts:current, button};
      if (now() >= deadline) break;
      await sleep(100);
    }
    throw Error('Native create form or Save button unavailable; review and close the unsaved form before resuming.');
  }
  // Only use this wait for the native importer. Timers in hidden tabs can
  // run much later than requested. Allow bounded background grace without
  // treating a replaced form as evidence of a successful write.
  async function waitImportUi(check, durable, timeout=6000) {
    const started=Date.now();let last=started,active=0;
    while(true){
      durable.checkTarget();
      const at=Date.now();if(!document.hidden)active+=Math.min(at-last,1000);last=at;
      if(at-started>=300000)throw Error('Native editor did not become ready; saved progress retained.');
      const value=check();if(value)return value;
      if(active>=timeout)throw Error('Native editor did not become ready; saved progress retained.');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
  async function waitAfterConfirmedWrite(durable,expectedCount=null) {
    durable.phase?.('preparing-next-entry');
    await waitImportUi(()=>{
      if([...document.querySelectorAll("textarea[name='content']")].some(n=>n.isConnected&&n.offsetParent!==null))return false;
      // Native post-save GET is allowed to finish normally. Wait on the local
      // count rather than sending our own GET or reopening the editor early.
      return expectedCount===null||nativeExistingEntryTotal()===expectedCount;
    },durable,20000);
    await new Promise(resolve=>setTimeout(resolve,100));
    durable.checkTarget();
  }
  async function createSpicyEntry(item, transfer = null, durable = null) {
    const checkTarget = () => {
      if (durable) durable.checkTarget();
      if (transfer && (routeInfo()?.id !== transfer.id || routeInfo()?.page !== "entries" || transfer.cancelled())) throw new Error("Lorebook changed or transfer cancelled; no further entry submitted.");
    };
    checkTarget();
    if ((transfer || durable) && [...document.querySelectorAll("textarea[name='content']")].some(node=>node.offsetParent!==null)) throw new Error("An entry editor is already open. Review and close the unsaved form before resuming; no write sent.");
    durable?.phase?.('opening-native-editor');
    const getAdd=()=>{const b=document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']") || [...document.querySelectorAll("button")].find(node => /^add entry$/i.test(textOf(node,50)));return b?.isConnected&&!b.disabled&&b.offsetParent!==null&&b.getAttribute('aria-disabled')!=='true'&&!b.closest('[data-ds-owned], [id^="ds-"]')?b:null;};
    const add = durable ? await waitImportUi(getAdd,durable,5000) : getAdd();
    if (!add) throw new Error("Could not find SpicyChat's Add Entry button.");
    checkTarget();
    if(durable&&[...document.querySelectorAll("textarea[name='content']")].some(n=>n.offsetParent!==null))throw Error('An entry editor opened while waiting; review it before resuming. No write sent.');
    if(durable&&getAdd()!==add)throw Error('Native Add Entry button changed; resume from the saved checkpoint. No write sent.');
    const beforeCount=durable?nativeExistingEntryTotal():null;
    add.click();
    const parts = durable ? await waitImportUi(entryModalParts,durable,5000) : await waitFor(() => entryModalParts(), 5000);
    durable?.phase?.('preparing-form');
    checkTarget();
    if ((transfer || durable) && (!parts.form.contains(parts.name) || !parts.form.contains(parts.content) ||
        parts.name.value.trim() || parts.content.value.trim() || exactTransferKeywords(parts).length)) {
      throw new Error("Expected an empty Add Entry editor; no fields were changed.");
    }
    nativeSetValue(parts.name, transfer || durable ? item.name : clean(item.name, 50));
    nativeSetValue(parts.content, transfer || durable ? item.content : clean(item.content, 24000));
    const enteredKeywords = [];
    for (const keyword of item.keywords.slice(0, 12)) {
      checkTarget();
      const current = entryModalParts();
      if (durable) {
        if (!verifyCreateFields(current,{...item,keywords:enteredKeywords})) throw Error('Native create draft changed while entering keywords. Review the open form; no write sent.');
        await addKeyword(current.keyword, keyword, checkTarget, {...item,keywords:enteredKeywords});
      } else {
        if (transfer && current?.content !== parts.content) throw new Error("Native entry editor changed; transfer stopped.");
        await addKeyword(parts.keyword, keyword);
      }
      enteredKeywords.push(keyword);
    }
    checkTarget();
    if (transfer && (entryModalParts()?.content !== parts.content || parts.name.value !== item.name || parts.content.value !== item.content ||
        JSON.stringify(exactTransferKeywords(parts).sort()) !== JSON.stringify([...item.keywords].sort()))) {
      throw new Error("Native entry fields could not be verified exactly. Review the open form; nothing was submitted for this entry.");
    }
    if (durable && !verifyCreateFields(entryModalParts(), item)) throw Error('Native entry fields could not be verified. No write submitted; review and close the open form before resuming.');
    const submit = findSubmitButton(durable ? entryModalParts() : parts);
    if (transfer && (!submit || submit === add)) throw new Error("Native Create/Save button unavailable. Review the open entry; no submit sent.");
    if (!submit && !durable) {
      const cancel = parts.root?.querySelector("button[aria-label='Cancel']") || [...(parts.root?.querySelectorAll("button") || [])].find(node => /^cancel$/i.test(textOf(node, 30)));
      cancel?.click();
      throw new Error("The entry form opened, but QoL could not find its Create/Save button. SpicyChat may have changed the form.");
    }
    let oldContent = parts.content;
    checkTarget();
    if (durable) {
      // A real user edit/save during the asynchronous checkpoint cannot be
      // attributed to this importer. Keep an uncertain checkpoint if touched.
      let manual = false, clicked = false, checkpointed = false;
      const mark = event => {
        if (!event.isTrusted) return;
        const current = entryModalParts();
        const target = event.target;
        if (current?.root?.contains(target) || parts.root?.contains(target)) manual = true;
      };
      const events = ['input','change','click','submit','keydown'];
      for (const type of events) document.addEventListener(type, mark, true);
      try {
        durable.phase?.('validating-form');
        await durable.beforeSubmit("create", item); checkpointed = true;
        const recovered = await recoverCreateSubmit(item, add, checkTarget, () => manual);
        // Final synchronous validation, including after the await above.
        checkTarget();
        const fresh = entryModalParts();
        if (manual || fresh?.form !== recovered.parts.form || verifiedCreateSubmit(fresh,item,add) !== recovered.button)
          throw Error('Native create form changed again; review and close the unsaved form before resuming.');
        if (fresh.content !== parts.content || recovered.button !== submit) durable.formRecovered?.();
        oldContent = fresh.content;
        durable.armSubmit?.();
        clicked = true;
        recovered.button.click();
        durable.saveClicked?.();
        durable.phase?.('awaiting-response');
      } catch(e) {
        if (checkpointed && !clicked && !manual) await durable.notSent?.();
        throw e;
      } finally {
        for (const type of events) document.removeEventListener(type, mark, true);
      }
    } else { checkTarget(); submit.click(); }
    if(durable){
      // Commit the verified server receipt independently of React closing the
      // form. Once committed, a UI wait can never resend this source entry.
      await durable.confirmWrite('created');
      await waitAfterConfirmedWrite(durable,beforeCount===null?null:beforeCount+1);
      return;
    }
    await waitFor(() => !document.contains(oldContent) || !oldContent.offsetParent, 6000).catch(() => {
      const current = entryModalParts();
      if (current?.content === oldContent) throw new Error(`SpicyChat did not finish saving “${item.name}”.`);
      return true;
    });
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  function parseNativeEntryCounter(text) {
    const match = /^([\d,]+)\s*\/\s*([\d,]+)/.exec(String(text || '').trim());
    if (!match) return null;
    const count = Number(match[1].replace(/,/g,'')), limit = Number(match[2].replace(/,/g,''));
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(limit) || count < 0 || limit < 1 || count > limit || count > 5000) return null;
    // 5,000 is also the current durable storage guard. Native smaller limits win.
    return {count, limit:Math.min(limit,5000)};
  }
  function nativeEntryCounter() {
    const header = document.querySelector("[data-testid='EntriesListServer-Header']");
    return parseNativeEntryCounter(header?.querySelector('[data-translate-key="lorebook:entries.count"]')?.textContent);
  }
  function nativeExistingEntryTotal() { return nativeEntryCounter()?.count ?? null; }

  async function ensureAllExistingEntriesLoaded(operation, onProgress, canContinue = () => true) {
    // Without this, Skip existing only checks the first 100 loaded rows and
    // a re-import into a larger Lorebook can accidentally create duplicates.
    const started = Date.now();
    while (nativeExistingEntryTotal() === null) {
      if (operation.cancelled || !canContinue()) return false;
      if (Date.now() - started > 12000) throw new Error("Could not read SpicyChat's current entry count; import stopped before any write.");
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const maxBatches = 55;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const expected = nativeExistingEntryTotal();
      const rows = existingEntryRows();
      if (operation.cancelled || !canContinue()) return false;
      if (routeInfo()?.id !== operation.id || routeInfo()?.page !== "entries") return false;
      if (expected === null) throw new Error("SpicyChat's entry count disappeared; no import started.");
      if (rows.length >= expected) return true;
      const root = document.querySelector("[data-testid='EntriesListServer-Header']")?.parentElement;
      const load = [...(root?.querySelectorAll("button[type='button']") || [])].find(button =>
        /^load more(?: entries)?$/i.test(textOf(button, 80)) && button.offsetParent !== null
      );
      const sentinel = !load ? root?.querySelector("[data-testid='EntriesListServer-Sentinel']") : null;
      if (!load && (!sentinel?.isConnected || sentinel.closest("[data-testid='EntriesListServer']") !== root)) {
        throw new Error(`Only ${rows.length}/${expected} existing entries are loaded. Native pagination is unavailable; no import started to avoid duplicates.`);
      }
      const previous = rows.length;
      onProgress?.({ loadingExisting: true, current: previous, totalExisting: expected, completed: 0 });
      if (load && !load.disabled) load.click();
      else if (sentinel) {
        // SpicyChat replaced Load More with an intersection sentinel. Advance
        // its own list, never assume the first 100 rows are the full book.
        sentinel.scrollIntoView({ behavior: "auto", block: "end", inline: "nearest" });
      }
      const deadline = Date.now() + 20000;
      while (existingEntryRows().length <= previous) {
        if (operation.cancelled || !canContinue()) return false;
        if (routeInfo()?.id !== operation.id || routeInfo()?.page !== "entries") return false;
        if (Date.now() > deadline) throw new Error(`SpicyChat did not load more existing entries after ${previous}; nothing imported.`);
        await new Promise(resolve => setTimeout(resolve, 160));
      }
    }
    throw new Error("Too many existing-entry pages to verify; no import started.");
  }

  function existingEntryRows() {
    const root = document.querySelector("[data-testid='EntriesListServer-Header']")?.parentElement;
    if (!root) return [];
    return [...root.querySelectorAll("button[type='button']")].filter(button => {
      if (button.closest(`#${MODAL_ID},#ds-qol-panel,.ds-lorebook-entry-toggle-wrap,.ds-lb-row-tools`)) return false;
      // Native entry cards can have very short content; never infer rows from content length.
      if (!button.classList.contains("w-full") || !button.classList.contains("items-start") ||
          !button.classList.contains("justify-between") || button.dataset.testid) return false;
      return !!button.querySelector("[data-tooltip-content] > p.text-label-md, p.text-label-md.line-clamp-1");
    });
  }

  function existingEntryName(row) {
    const ps = [...(row?.querySelectorAll("p") || [])];
    return clean(ps.find(p => /line-clamp-1/.test(String(p.className || "")) && clean(p.textContent, 80))?.textContent || ps[0]?.textContent, 50);
  }

  function existingEntryContent(row) {
    const ps = [...(row?.querySelectorAll("p") || [])];
    return clean(ps.filter(p => clean(p.textContent, 5000).length > 30).sort((a,b)=>clean(b.textContent,5000).length-clean(a.textContent,5000).length)[0]?.textContent, 24000);
  }

  function findExistingRowByName(name) {
    const wanted = clean(name, 50).toLowerCase();
    return existingEntryRows().find(row => existingEntryName(row).toLowerCase() === wanted) || null;
  }

  function simpleHash(value) {
    let hash = 2166136261;
    const text = clean(value, 24000);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function previewExistingState(item) {
    const row = findExistingRowByName(item.name);
    if (!row) return "new";
    const current = existingEntryContent(row);
    return clean(current, 24000) === clean(item.content, 24000) ? "unchanged" : "changed";
  }

  async function clearKeywords(parts) {
    const clear = parts?.form?.querySelector("button[aria-label='Clear all tags']") || parts?.root?.querySelector("button[aria-label='Clear all tags']");
    if (clear) { clear.click(); await new Promise(resolve => setTimeout(resolve, 70)); }
  }

  function currentModalKeywords(parts) {
    return [...(parts?.form?.querySelectorAll("button") || [])]
      .filter(button => button.querySelector("svg.lucide-x,svg[class*='lucide-x']"))
      .map(button => clean(button.textContent, 80))
      .filter(Boolean)
      .slice(0, 12);
  }

  async function updateSpicyEntry(row, item, mode = "replace", durable = null) {
    durable?.checkTarget();
    durable?.phase?.('opening-native-editor');
    row.click();
    const parts = durable ? await waitImportUi(entryModalParts,durable,5000) : await waitFor(() => entryModalParts(), 5000);
    durable?.phase?.('preparing-form');
    const currentContent = clean(parts.content.value, 24000);
    const currentKeywords = currentModalKeywords(parts);
    const nextContent = mode === "merge"
      ? (currentContent.includes(clean(item.content, 2000)) ? currentContent : clean(`${currentContent}\n\n${item.content}`, 2000))
      : clean(item.content, 2000);
    const nextKeywords = mode === "merge"
      ? [...new Set([...currentKeywords, ...(item.keywords || [])].map(v => clean(v, 80)).filter(Boolean))].slice(0, 12)
      : (item.keywords || []).slice(0, 12);
    nativeSetValue(parts.name, clean(item.name, 50));
    nativeSetValue(parts.content, nextContent);
    await clearKeywords(parts);
    for (const keyword of nextKeywords) await addKeyword(parts.keyword, keyword);
    const submit = [...(parts.root?.querySelectorAll("button") || [])].find(node => !node.disabled && /^(update|save)$/i.test(textOf(node, 60)))
      || parts.root?.querySelector("button[aria-label='Update']");
    if (!submit) throw new Error(`Could not find Update for “${item.name}”.`);
    const oldContent = parts.content;
    if (durable) {
      durable.checkTarget();
      if(entryModalParts()?.content!==parts.content||parts.name.value!==item.name||parts.content.value!==nextContent||JSON.stringify(exactTransferKeywords(parts).sort())!==JSON.stringify([...nextKeywords].sort()))throw Error('Native update fields could not be verified. No write submitted.');
      let manual=false, checkpointed=false, clicked=false;
      const events=['input','change','click','submit','keydown'];
      const mark=e=>{if(e.isTrusted&&(parts.root?.contains(e.target)||entryModalParts()?.root?.contains(e.target)))manual=true;};
      for(const type of events)document.addEventListener(type,mark,true);
      try{
        durable.phase?.('validating-form');
        await durable.beforeSubmit("update", {...item,content:nextContent,keywords:nextKeywords});checkpointed=true;
        durable.checkTarget();
        if(manual||!submit.isConnected||entryModalParts()?.content!==parts.content||submit.disabled||parts.name.value!==item.name||parts.content.value!==nextContent||JSON.stringify(exactTransferKeywords(parts).sort())!==JSON.stringify([...nextKeywords].sort()))throw Error('Native update form changed before submission. Review the open entry before resuming.');
        durable.armSubmit?.();clicked=true;submit.click();durable.saveClicked?.();durable.phase?.('awaiting-response');
      }catch(e){if(checkpointed&&!clicked&&!manual)await durable.notSent?.();throw e;}
      finally{for(const type of events)document.removeEventListener(type,mark,true);}
    }else submit.click();
    if(durable){await durable.confirmWrite(mode==='merge'?'merged':'replaced');await waitAfterConfirmedWrite(durable);return;}
    await waitFor(() => !document.contains(oldContent) || !oldContent.offsetParent, 6000);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  function uniqueDuplicateName(name) {
    const base = clean(name, 50) || "Wiki entry";
    const names = new Set(existingEntryRows().map(existingEntryName).map(v => v.toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i += 1) {
      const suffix = ` (${i})`;
      const candidate = `${base.slice(0, 50 - suffix.length).trim()}${suffix}`;
      if (!names.has(candidate.toLowerCase())) return candidate;
    }
    return `${base.slice(0, 42)} ${Date.now().toString().slice(-6)}`;
  }

  async function importOne(item, duplicatePolicy, durable = null, knownNames = null) {
    if (duplicatePolicy === "add" || (durable && knownNames && !knownNames.has(item.name.toLowerCase()))) {
      await createSpicyEntry(item, null, durable);
      return {action:"created",item};
    }
    const existing = findExistingRowByName(item.name);
    if (!existing) {
      await createSpicyEntry(item, null, durable);
      return { action: "created", item };
    }
    if (duplicatePolicy === "skip") return { action: "skipped", item };
    if (duplicatePolicy === "replace") {
      await updateSpicyEntry(existing, item, "replace", durable);
      return { action: "replaced", item };
    }
    if (duplicatePolicy === "merge") {
      await updateSpicyEntry(existing, item, "merge", durable);
      return { action: "merged", item };
    }
    const duplicate = { ...item, name: uniqueDuplicateName(item.name) };
    await createSpicyEntry(duplicate);
    return { action: "duplicated", item: duplicate };
  }

  async function getImportStore() {
    const info = routeInfo();
    if (!info?.id) return { version: 2, lorebooks: {} };
    const result = await DS.storageGet?.([IMPORT_META_KEY]) || {};
    const store = result[IMPORT_META_KEY] && typeof result[IMPORT_META_KEY] === "object" ? result[IMPORT_META_KEY] : { version: 2, lorebooks: {} };
    if (!store.lorebooks || typeof store.lorebooks !== "object") store.lorebooks = {};
    return store;
  }

  async function loadPreviouslyImportedSources() {
    if (busy) return;
    const info = routeInfo();
    const store = await getImportStore();
    const metaRows = Array.isArray(store.lorebooks?.[info?.id]?.entries) ? store.lorebooks[info.id].entries : [];
    const urls = [...new Set(metaRows.map(row => clean(row.sourceUrl, 3000)).filter(Boolean))].slice(0, MAX_CRAWL_PAGES);
    if (!urls.length) return setStatus("No previous wiki/web source URLs are recorded for this Lorebook yet.", "error");
    busy = true;
    const refreshed = [];
    let failed = 0;
    try {
      for (let i = 0; i < urls.length; i += 1) {
        setStatus(`Checking source ${i + 1}/${urls.length}…`, "busy");
        const response = await fetchWikiUrl(urls[i], { askPermission: true });
        if (!response?.ok) { failed += 1; continue; }
        refreshed.push(parseWikiPage(response.html, response.finalUrl || urls[i], optionValues()));
      }
      pages = refreshed;
      currentPage = refreshed[0] || null;
      entries = buildEntries(refreshed, optionValues()).filter(item => metaRows.some(row => clean(row.sourceUrl,3000) === clean(item.sourceUrl,3000) && clean(row.entryName,50).toLowerCase() === clean(item.name,50).toLowerCase()));
      for (const item of entries) {
        item.checked = previewExistingState(item) !== "unchanged";
        item.updateState = previewExistingState(item);
      }
      const duplicateSelect = document.querySelector(`#${MODAL_ID} [data-ds-wiki-duplicates]`);
      if (duplicateSelect) duplicateSelect.value = "replace";
      renderLinkList();
      renderEntryPreview();
      renderRemovedContent();
      const changed = entries.filter(item => item.updateState === "changed").length;
      const unchanged = entries.filter(item => item.updateState === "unchanged").length;
      setStatus(`Source check complete: ${changed} changed · ${unchanged} unchanged${failed ? ` · ${failed} source fetch failures` : ""}. Changed entries are selected; duplicate handling is set to Replace.`, "success");
    } finally { busy = false; }
  }

  async function retryFailedImports() {
    if (!failedEntries.length || busy) return setStatus("There are no failed entries waiting to retry.", "");
    const retry = failedEntries.map(row => row.item);
    failedEntries = [];
    await importEntries(retry, optionValues().duplicatePolicy, true);
  }

  function selectCategoryMembers() {
    const checks = [...document.querySelectorAll(`#${MODAL_ID} [data-ds-wiki-links] input[data-category-member='1']`)];
    checks.forEach(input => { input.checked = true; });
    setStatus(checks.length ? `Selected ${checks.length} category member page${checks.length === 1 ? "" : "s"}.` : "No category-member links were detected on this page.", checks.length ? "success" : "error");
  }

  function renderRemovedContent() {
    const host = document.querySelector(`#${MODAL_ID} [data-ds-wiki-removed]`);
    const summary = document.querySelector(`#${MODAL_ID} [data-ds-wiki-removed-summary]`);
    if (!host || !summary) return;
    const text = pages.map(page => page.removedText ? `${page.title}\n${page.removedText}` : "").filter(Boolean).join("\n\n---\n\n");
    host.textContent = text || "No removed-content sample is available for the current preview.";
    summary.textContent = text ? `Show removed content (${text.length.toLocaleString()} chars)` : "Show removed content";
  }


  async function saveImportMetadata(imported) {
    const info = routeInfo();
    if (!info?.id || !imported.length) return;
    const store = await getImportStore();
    const book = store.lorebooks[info.id] && typeof store.lorebooks[info.id] === "object" ? store.lorebooks[info.id] : { id: info.id, entries: [] };
    const existing = Array.isArray(book.entries) ? book.entries : [];
    const next = [...existing];
    for (const item of imported) {
      const row = {
        entryName: clean(item.name, 50),
        sourceUrl: clean(item.sourceUrl, 3000),
        pageTitle: clean(item.pageTitle, 200),
        section: clean(item.section, 200),
        kind: clean(item.kind, 80),
        contentHash: simpleHash(item.content),
        importedAt: Date.now()
      };
      const key = `${row.entryName.toLowerCase()}|${row.sourceUrl.toLowerCase()}`;
      const index = next.findIndex(old => `${String(old.entryName || "").toLowerCase()}|${String(old.sourceUrl || "").toLowerCase()}` === key);
      if (index >= 0) next[index] = row;
      else next.push(row);
    }
    book.entries = next.slice(-1500);
    book.lastImportedAt = Date.now();
    store.lorebooks[info.id] = book;
    store.version = 2;
    await DS.storageSet?.({ [IMPORT_META_KEY]: store });
  }

  async function importEntries(selected, duplicatePolicy, isRetry = false) {
    if (busy) return;
    if (!selected.length) return setStatus("Select at least one complete entry first.", "error");
    busy = true;
    const modal = document.getElementById(MODAL_ID);
    modal?.classList.add("ds-wiki-import-running");
    const imported = [];
    const actionCounts = { created: 0, replaced: 0, merged: 0, duplicated: 0, skipped: 0 };
    const failures = [];
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const item = selected[i];
        setStatus(`${isRetry ? "Retrying" : "Importing"} ${i + 1}/${selected.length}: ${item.name}`, "busy");
        try {
          const result = await importOne(item, duplicatePolicy);
          actionCounts[result.action] = (actionCounts[result.action] || 0) + 1;
          if (result.action !== "skipped") imported.push(result.item);
        } catch (error) {
          failures.push({ item, error: error?.message || String(error) });
        }
      }
      failedEntries = failures;
      if (imported.length) await saveImportMetadata(imported);
      const summary = Object.entries(actionCounts).filter(([,count]) => count).map(([action,count]) => `${count} ${action}`).join(" · ");
      setStatus(`${summary || "No changes"}${failures.length ? ` · ${failures.length} failed (use Retry failed)` : ""}. Review the Lorebook normally before leaving the page.`, failures.length ? "error" : "success");
      DS.scheduleRun?.({ priority: "slow", source: "wiki-lorebook-import" });
      setTimeout(() => DS.applyLorebookBackup?.(), 500);
      const retry = document.querySelector(`#${MODAL_ID} [data-ds-wiki-retry]`);
      if (retry) retry.hidden = !failures.length;
    } finally {
      busy = false;
      modal?.classList.remove("ds-wiki-import-running");
    }
  }

  async function importSelected() {
    if (busy) return;
    const selected = entries.filter(item => item.checked !== false && item.name && item.content);
    if (!selected.length) return setStatus("Select at least one complete entry first.", "error");
    const policy = optionValues().duplicatePolicy;
    if (!confirm(`Import ${selected.length} entr${selected.length === 1 ? "y" : "ies"} into this Lorebook?\n\nExisting-name policy: ${policy}. QoL uses SpicyChat's normal entry editor and continues past individual failures.`)) return;
    failedEntries = [];
    await importEntries(selected, policy, false);
  }


  async function fetchMainPage() {
    if (busy) return;
    const modal = document.getElementById(MODAL_ID);
    const input = modal?.querySelector("[data-ds-wiki-url]");
    const url = input?.value?.trim();
    if (!url) return setStatus("Paste a wiki or article URL first.", "error");
    busy = true;
    setStatus("Fetching page…", "busy");
    try {
      const response = await fetchWikiUrl(url, { askPermission: true });
      if (!response?.ok) {
        const message = response?.error || "Could not fetch that page.";
        const blocked = response?.permissionDenied || response?.requiresPermission || [401, 403, 429].includes(Number(response?.status)) || /failed to fetch|network|blocked|cors|access/i.test(message);
        const hint = blocked
          ? " That site may block extension fetches. Paste the page text or HTML below instead."
          : " You can still paste the page text or HTML below.";
        setStatus(`${message}${hint}`, "error");
        return;
      }

      try {
        currentPage = parseWikiPage(response.html, response.finalUrl || url, optionValues());
      } catch (error) {
        setStatus(`QoL fetched the page, but could not build a Lorebook preview: ${error?.message || String(error)}. You can still paste the page text or HTML below.`, "error");
        return;
      }

      pages = [currentPage];
      if (input && response.finalUrl && input.value !== response.finalUrl) input.value = response.finalUrl;
      renderLinkList();
      refreshEntriesFromPages();
      renderRemovedContent();
      setStatus(`${currentPage.kind}: ${currentPage.title} · ${currentPage.sections.length} section${currentPage.sections.length === 1 ? "" : "s"} · ${currentPage.links.length} internal links found.`, "success");
    } catch (error) {
      setStatus(`QoL could not finish the page fetch: ${error?.message || String(error)}. You can still paste the page text or HTML below.`, "error");
    } finally {
      busy = false;
    }
  }

  async function usePastedContent() {
    const modal = document.getElementById(MODAL_ID);
    const pasted = modal?.querySelector("[data-ds-wiki-paste]")?.value || "";
    const url = modal?.querySelector("[data-ds-wiki-url]")?.value || "https://pasted.local/wiki-article";
    if (clean(pasted, 500000).length < 30) return setStatus("Paste some article text or HTML first.", "error");
    try {
      currentPage = parseWikiPage(pasted, safeUrl(url)?.href || "https://pasted.local/wiki-article", optionValues());
      pages = [currentPage];
      renderLinkList();
      refreshEntriesFromPages();
      renderRemovedContent();
      setStatus(`Built a preview from pasted content: ${currentPage.title}.`, "success");
    } catch (error) {
      setStatus(error?.message || String(error), "error");
    }
  }

  async function fetchSelectedLinks() {
    if (busy || !currentPage) return;
    const modal = document.getElementById(MODAL_ID);
    const selected = [...(modal?.querySelectorAll("[data-ds-wiki-links] input[type='checkbox']:checked") || [])]
      .map(input => input.dataset.url)
      .filter(Boolean)
      .slice(0, MAX_CRAWL_PAGES);
    if (!selected.length) return setStatus("Select at least one linked page first.", "error");
    busy = true;
    const known = new Set(pages.map(page => page.url));
    let added = 0;
    try {
      for (let i = 0; i < selected.length; i += 1) {
        const url = selected[i];
        if (known.has(url)) continue;
        setStatus(`Fetching linked page ${i + 1}/${selected.length}…`, "busy");
        const response = await fetchWikiUrl(url, { askPermission: false });
        if (!response?.ok) continue;
        const page = parseWikiPage(response.html, response.finalUrl || url, optionValues());
        pages.push(page);
        known.add(page.url);
        added += 1;
      }
      refreshEntriesFromPages();
      renderRemovedContent();
      setStatus(`Added ${added} linked page${added === 1 ? "" : "s"} to the preview. ${pages.length} source page${pages.length === 1 ? "" : "s"} total.`, "success");
    } finally {
      busy = false;
    }
  }

  function selectLinks(value) {
    document.querySelectorAll(`#${MODAL_ID} [data-ds-wiki-links] input[type='checkbox']`).forEach(input => { input.checked = value; });
  }

  function openModal() {
    if (!enabled() || !routeInfo()) return;
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.hidden = false;
      return;
    }

    modal = el("div", "ds-wiki-lorebook-modal");
    modal.id = MODAL_ID;
    const panel = el("div", "ds-wiki-lorebook-panel");
    const header = el("div", "ds-wiki-modal-header");
    const heading = el("div");
    heading.append(el("h2", "", "Wiki / Web Lorebook Importer"), el("p", "", "Fetch a wiki/article, review what QoL extracted, then add selected entries through SpicyChat's normal Lorebook form."));
    const close = button("×", "ds-wiki-close");
    close.setAttribute("aria-label", "Close Wiki Lorebook Importer");
    close.addEventListener("click", () => { if (!busy) modal.hidden = true; });
    header.append(heading, close);

    const source = el("section", "ds-wiki-section");
    source.append(el("h3", "", "1. Source"));
    const urlRow = el("div", "ds-wiki-url-row");
    const url = document.createElement("input");
    url.type = "url";
    url.placeholder = "https://example.fandom.com/wiki/Character";
    url.dataset.dsWikiUrl = "1";
    const fetchBtn = button("Fetch page", "ds-wiki-primary");
    fetchBtn.addEventListener("click", fetchMainPage);
    urlRow.append(url, fetchBtn);
    source.append(urlRow);
    source.append(el("p", "ds-wiki-hint", "QoL asks for access only to the site you choose. Fandom and MediaWiki layouts get dedicated cleanup; other wikis/articles use the generic parser."));

    const pasteDetails = document.createElement("details");
    pasteDetails.className = "ds-wiki-paste-details";
    const pasteSummary = document.createElement("summary");
    pasteSummary.textContent = "Page blocks fetching? Paste article text, Markdown, or HTML instead";
    const paste = document.createElement("textarea");
    paste.rows = 5;
    paste.placeholder = "Paste article text, Markdown, or HTML here…";
    paste.dataset.dsWikiPaste = "1";
    const pasteBtn = button("Build preview from pasted content", "ds-wiki-small-button");
    pasteBtn.addEventListener("click", usePastedContent);
    pasteDetails.append(pasteSummary, paste, pasteBtn);
    source.append(pasteDetails);
    const removedDetails = document.createElement("details");
    removedDetails.className = "ds-wiki-paste-details";
    const removedSummary = document.createElement("summary"); removedSummary.textContent = "Show removed content"; removedSummary.dataset.dsWikiRemovedSummary = "1";
    const removedPre = document.createElement("pre"); removedPre.dataset.dsWikiRemoved = "1"; removedPre.textContent = "No removed-content sample is available yet.";
    removedDetails.append(removedSummary, removedPre);
    source.append(removedDetails);

    const options = el("section", "ds-wiki-section");
    options.append(el("h3", "", "2. Split & cleanup"));
    const optionGrid = el("div", "ds-wiki-options-grid");
    const splitLabel = el("label", "ds-wiki-field");
    splitLabel.append(el("span", "", "Create entries"));
    const split = document.createElement("select");
    split.dataset.dsWikiSplit = "1";
    [["sections", "By wiki section (recommended)"], ["page", "One entry per page"], ["auto", "By section + split long sections"]].forEach(([value, label]) => {
      const opt = document.createElement("option"); opt.value = value; opt.textContent = label; split.append(opt);
    });
    splitLabel.append(split);
    const maxLabel = el("label", "ds-wiki-field");
    maxLabel.append(el("span", "", "Long-section target (characters)"));
    const max = document.createElement("input");
    max.type = "number"; max.min = "600"; max.max = "1950"; max.step = "50"; max.value = "1800"; max.dataset.dsWikiMax = "1";
    maxLabel.append(max);
    const dupLabel = el("label", "ds-wiki-field");
    dupLabel.append(el("span", "", "If an entry name already exists"));
    const duplicates = document.createElement("select");
    duplicates.dataset.dsWikiDuplicates = "1";
    [["skip","Skip existing (safest)"],["replace","Replace existing"],["merge","Merge content + keywords"],["duplicate","Create a duplicate copy"]].forEach(([value,label]) => { const opt=document.createElement("option"); opt.value=value; opt.textContent=label; duplicates.append(opt); });
    dupLabel.append(duplicates);
    const refs = el("label", "ds-wiki-check");
    const refsCheck = document.createElement("input"); refsCheck.type = "checkbox"; refsCheck.dataset.dsWikiReferences = "1";
    refs.append(refsCheck, el("span", "", "Keep References / Sources sections"));
    optionGrid.append(splitLabel, maxLabel, dupLabel, refs);
    options.append(optionGrid);
    [split, max, refsCheck].forEach(control => control.addEventListener("change", () => {
      if (!pages.length) return;
      if (currentPage) {
        // Reparse is only required when References/Sources inclusion changes.
        if (control === refsCheck) setStatus("Reference-section choice applies the next time a page is fetched or pasted.", "");
      }
      refreshEntriesFromPages();
    }));

    const crawl = el("section", "ds-wiki-section");
    crawl.append(el("h3", "", "3. Optional linked pages"));
    const linkSummary = el("p", "ds-wiki-hint", "Fetch a page first to discover same-site article links.");
    linkSummary.dataset.dsWikiLinkSummary = "1";
    const linkTools = el("div", "ds-wiki-link-tools");
    const selectAll = button("Select all", "ds-wiki-small-button");
    const selectCategory = button("Select category members", "ds-wiki-small-button");
    const selectNone = button("Select none", "ds-wiki-small-button");
    const fetchSelected = button("Fetch selected pages", "ds-wiki-small-button");
    selectAll.addEventListener("click", () => selectLinks(true));
    selectCategory.addEventListener("click", selectCategoryMembers);
    selectNone.addEventListener("click", () => selectLinks(false));
    fetchSelected.addEventListener("click", fetchSelectedLinks);
    linkTools.append(selectAll, selectCategory, selectNone, fetchSelected);
    const links = el("div", "ds-wiki-link-list");
    links.dataset.dsWikiLinks = "1";
    crawl.append(linkSummary, linkTools, links);

    const preview = el("section", "ds-wiki-section ds-wiki-preview-section");
    preview.append(el("h3", "", "4. Preview"));
    const entrySummary = el("p", "ds-wiki-hint", "Fetch or paste a page to build a preview.");
    entrySummary.dataset.dsWikiEntrySummary = "1";
    const previewTools = el("div", "ds-wiki-link-tools");
    const checkAll = button("Select all entries", "ds-wiki-small-button");
    const uncheckAll = button("Select none", "ds-wiki-small-button");
    const checkUpdates = button("Check imported sources for updates", "ds-wiki-small-button");
    checkAll.addEventListener("click", () => { entries.forEach(item => item.checked = true); renderEntryPreview(); });
    uncheckAll.addEventListener("click", () => { entries.forEach(item => item.checked = false); renderEntryPreview(); });
    checkUpdates.addEventListener("click", loadPreviouslyImportedSources);
    previewTools.append(checkAll, uncheckAll, checkUpdates);
    const entryHost = el("div", "ds-wiki-entry-list");
    entryHost.dataset.dsWikiEntries = "1";
    preview.append(entrySummary, previewTools, entryHost);

    const footer = el("div", "ds-wiki-modal-footer");
    const status = el("p", "ds-wiki-status");
    status.dataset.dsWikiStatus = "1";
    const retryBtn = button("Retry failed", "ds-wiki-small-button");
    retryBtn.dataset.dsWikiRetry = "1"; retryBtn.hidden = true; retryBtn.addEventListener("click", retryFailedImports);
    const importBtn = button("Import selected entries", "ds-wiki-primary");
    importBtn.addEventListener("click", importSelected);
    footer.append(status, retryBtn, importBtn);

    panel.append(header, source, options, crawl, preview, footer);
    modal.append(panel);
    modal.addEventListener("click", event => {
      if (event.target === modal && !busy) modal.hidden = true;
    });
    document.body.append(modal);
    renderLinkList();
    renderEntryPreview();
    renderRemovedContent();
  }

  function findToolbarAnchor() {
    return document.querySelector("[data-testid='EntriesCreateHeader-AddEntryButton']")?.parentElement || document.querySelector("[data-testid='EntriesCreateHeader']");
  }

  function ensureButton() {
    if (!enabled() || !routeInfo()) {
      document.getElementById(BUTTON_ID)?.remove();
      document.getElementById(MODAL_ID)?.remove();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;
    const anchor = findToolbarAnchor();
    if (!anchor) return;
    const btn = button("Import from wiki / web", "ds-wiki-lorebook-launch");
    btn.id = BUTTON_ID;
    btn.dataset.dsWikiLorebookImport = "1";
    btn.addEventListener("click", openModal);
    anchor.append(btn);
  }

  DS.importLorebookEntryBatch = async function importLorebookEntryBatch(rawEntries, options = {}) {
    const route = routeInfo();
    if (!route?.id) throw new Error("Open the Lorebook Entries tab before importing a Lorebook backup.");
    if (busy) throw new Error("Another Lorebook import is already running.");

    const duplicatePolicy = ["skip", "replace", "merge", "duplicate", ...(options.durable ? ["add"] : [])].includes(String(options.duplicatePolicy || ""))
      ? String(options.duplicatePolicy)
      : "skip";
    const source = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries || {});
    const preserve = options.preserveTransferText === true;
    if (preserve && (duplicatePolicy !== "skip" || !source.length || source.length > 500 || source.some(entry => !entry ||
        typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 50 ||
        typeof entry.content !== "string" || !entry.content.trim() || entry.content.length > 2000 ||
        !Array.isArray(entry.keywords) || !entry.keywords.length || entry.keywords.length > 12 ||
        entry.keywords.some(k => typeof k !== "string" || !k.trim() || k.length > 80)))) {
      throw new Error("Clipboard transfer requires valid entries and Skip existing. No writes sent.");
    }
    const items = options.durable ? source.map(entry=>({name:entry.name,content:entry.content,keywords:[...entry.keywords]})) : preserve ? source.map(entry => ({name: entry.name, content: entry.content, keywords: [...entry.keywords]})) : source.map((entry, index) => ({
      name: clean(entry?.name || `Imported entry ${index + 1}`, 50),
      content: clean(entry?.content, 24000),
      keywords: unique(Array.isArray(entry?.keywords) ? entry.keywords : String(entry?.keywords || "").split(/[,;\n]/g), 12)
    })).filter(item => item.name && item.content);
    if (!items.length) throw new Error("That file does not contain any usable Lorebook entries.");

    const counts = { total: items.length, created: 0, skipped: 0, replaced: 0, merged: 0, duplicated: 0,
      failed: 0, completed: 0, cancelled: false, paused: false, nextIndex: 0, stopReason: "" };
    const startIndex = Math.max(0, Math.min(items.length, Math.trunc(Number(options.startIndex) || 0)));
    const operation = { cancelled: false, id: route.id };
    const tracing = !!DS.isDiagnosticTraceActive?.("normal");
    const traceToken = tracing ? DS.diagOperationStart?.("lorebook-import", "native-entry-batch", {
      entryCount: items.length, duplicatePolicy, resumed: startIndex > 0
    }) : null;
    let existingListMs = 0;
    let nativeWriteMs = 0;
    let traceOutcome = "error";
    DS.activeLorebookEntryImport = operation;
    busy = true;
    try {
      // Load/verify every existing name before choosing Skip/Merge/Replace.
      // This also makes interrupted imports safe to re-import when there are
      // more than 100 current entries.
      const existingListStartedAt = Date.now();
      const canContinue = () => !options.signal?.aborted && (!preserve || options.transferAllowed?.() !== false);
      const verified=options.durable && ['add','skip'].includes(duplicatePolicy) && options.verifiedExisting;
      const useVerified=!!verified && canContinue() && routeInfo()?.id===operation.id &&
        !document.querySelector("[data-testid='EntriesListServer-SearchInput']")?.value?.trim() &&
        nativeExistingEntryTotal()===verified.count && Array.isArray(verified.names) && verified.names.length===verified.count;
      const existingListReady = useVerified || await ensureAllExistingEntriesLoaded(operation, options.onProgress, canContinue);
      existingListMs = Date.now() - existingListStartedAt;
      if (!existingListReady) {
        counts.cancelled = !!operation.cancelled;
        counts.paused = !operation.cancelled;
        counts.stopReason = operation.cancelled ? "Cancelled before entry import." : "Lorebook changed before the import could start.";
        options.onProgress?.({ ...counts, stopped: true });
        traceOutcome = counts.cancelled ? "cancelled" : "paused";
        return counts;
      }
      // Keep a complete, stable name set. React may reset its mounted cards
      // to the first page after a Create, so consulting the DOM alone for each
      // subsequent item could miss pre-existing names that were loaded earlier.
      const knownNames = new Set((useVerified ? verified.names : existingEntryRows().map(existingEntryName)).filter(Boolean).map(name => name.toLowerCase()));
      if (options.durable) {
        const total=nativeExistingEntryTotal();
        const additions=duplicatePolicy==='add' ? items.length-startIndex : new Set(items.slice(startIndex).map(item=>item.name.toLowerCase()).filter(name=>!knownNames.has(name))).size;
        const limit=nativeEntryCounter()?.limit;
        if (total===null || !limit) throw Error('Could not verify the native Lorebook entry limit. Nothing else submitted.');
        if (total+additions>limit) throw Error(`Import would exceed the ${limit.toLocaleString()} entry Lorebook limit. Nothing else submitted.`);
        await options.durable.baseline(total);
      }
      for (let index = startIndex; index < items.length; index += 1) {
        counts.nextIndex = index;
        if (operation.cancelled || !canContinue()) {
          counts.cancelled = true;
          counts.stopReason = "Cancelled before the next entry.";
          break;
        }
        if (routeInfo()?.id !== operation.id || routeInfo()?.page !== "entries") {
          counts.paused = true;
          counts.stopReason = "Lorebook changed; import paused before another write.";
          break;
        }
        const item = items[index];
        let committedAction=null;
        try {
          const key = preserve ? clean(item.name, 50).toLowerCase() : item.name.toLowerCase();
          let result;
          if (knownNames.has(key) && duplicatePolicy === "skip") {
            result = { action: "skipped", item };
          } else {
            // If a matching card disappeared after a React refresh, never
            // mistake it for a new entry under Merge/Replace/Duplicate.
            if (duplicatePolicy !== "add" && knownNames.has(key) && !findExistingRowByName(item.name)) {
              if (!options.durable || !await ensureAllExistingEntriesLoaded(operation,options.onProgress,canContinue) || !findExistingRowByName(item.name)) throw new Error(`Matching entry “${item.name}” is no longer loaded. Refresh and review before continuing.`);
            }
            const writeStartedAt = Date.now();
            try {
              if (preserve) {
                // Skip a matching name even if a new card appeared during the import.
                if (findExistingRowByName(item.name)) result = { action: "skipped", item };
                else {
                  await createSpicyEntry(item, { id: operation.id, cancelled: () => operation.cancelled || !canContinue() || !!document.querySelector("[data-testid='EntriesListServer-SearchInput']")?.value?.trim() });
                  result = { action: "created", item };
                }
              } else {
                const durable=options.durable ? {
                  checkTarget:()=>{if(operation.cancelled||!canContinue()||routeInfo()?.id!==operation.id||routeInfo()?.page!=="entries"||document.querySelector("[data-testid='EntriesListServer-SearchInput']")?.value?.trim())throw Error('Import paused before the next native write.');},
                  beforeSubmit:(kind,entry)=>options.durable.beforeSubmit(index,kind,entry),notSent:()=>options.durable.notSent(),
                  armSubmit:()=>options.durable.armSubmit(),saveClicked:()=>options.durable.saveClicked?.(),formRecovered:()=>options.durable.formRecovered?.(),
                  phase:p=>options.durable.phase?.(p,index),
                  confirmWrite:async action=>{await options.durable.commit(index,action);committedAction=action;counts.nextIndex=index+1;}
                } : null;
                result = await importOne(item, duplicatePolicy, durable, knownNames);
              }
            }
            finally { nativeWriteMs += Date.now() - writeStartedAt; }
          }
          const action = String(result?.action || "");
          if (options.durable && !committedAction) await options.durable.commit(index, action);
          if (action === "created") knownNames.add(key);
          if (Object.prototype.hasOwnProperty.call(counts, action)) counts[action] += 1;
          counts.completed++;
          counts.nextIndex = index + 1;
        } catch (error) {
          // A post-commit UI interruption must never describe the already
          // confirmed creation as a failed write or rewind its cursor.
          if(committedAction){
            counts[committedAction]++;counts.completed++;counts.nextIndex=index+1;
            counts.paused=true;counts.stopReason='Saved entry confirmed; native editor not ready for the next entry.';
            try{options.onError?.(Error(counts.stopReason),item,index);}catch{}
            break;
          }
          counts.failed += 1;
          if (typeof options.onError === "function") {
            try { options.onError(error, item, index); } catch {}
          }
          const detail = String(error?.message || error || "");
          const status = Number(error?.httpStatus || error?.status || 0);
          if (options.durable || preserve || [401, 403, 408, 409, 425, 429].includes(status) || status >= 500 ||
              /rate.limit|too many requests|auth|token|ambiguous|unverified|cannot confirm|timed out|network|no longer loaded/i.test(detail)) {
            counts.paused = true;
            counts.stopReason = status === 429 ? "SpicyChat rate limited this import (HTTP 429)." :
              `Uncertain entry result; review before resuming: ${detail.slice(0, 150)}`;
            break;
          }
          // The previously attempted entry may still have been saved.
          // Do not automatically retry it or mark it completed.
        }
        if (typeof options.onProgress === "function") {
          try { options.onProgress({ ...counts, current: item.name }); } catch {}
        }
      }
      if ((counts.paused || counts.cancelled) && typeof options.onProgress === "function") {
        try { options.onProgress({ ...counts, current: "", stopped: true }); } catch {}
      }
      traceOutcome = counts.paused ? "paused" : counts.cancelled ? "cancelled" : counts.failed ? "partial" : "complete";
    } finally {
      if (traceToken) DS.diagOperationEnd?.(traceToken, {
        outcome: traceOutcome,
        counts: { scanned: counts.completed + counts.failed, changed: counts.created + counts.replaced + counts.merged + counts.duplicated, skipped: counts.skipped, errors: counts.failed },
        meta: { entryCount: items.length, duplicatePolicy, existingListMs, nativeWriteMs,
          completed: counts.completed, attemptedWrites: counts.created + counts.replaced + counts.merged + counts.duplicated + counts.failed,
          paused: counts.paused, cancelled: counts.cancelled }
      });
      if (DS.activeLorebookEntryImport === operation) DS.activeLorebookEntryImport = null;
      busy = false;
    }
    return counts;
  };

  DS.cancelLorebookEntryImport = function cancelLorebookEntryImport() {
    if (!DS.activeLorebookEntryImport) return false;
    DS.activeLorebookEntryImport.cancelled = true;
    return true;
  };

  DS.removeWikiLorebookImporter = function removeWikiLorebookImporter() {
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById(MODAL_ID)?.remove();
  };

  DS.applyWikiLorebookImporter = function applyWikiLorebookImporter() {
    ensureButton();
  };
})();

}

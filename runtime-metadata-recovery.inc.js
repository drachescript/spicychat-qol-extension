/* BEGIN BOT METADATA RECOVERY CAPTURE */
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS || DS.__botMetadataRecoveryCaptureLoaded) return;
  DS.__botMetadataRecoveryCaptureLoaded = true;

  const KEY = "botDiscoveryIndexV1";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const GENERIC = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot",
    "for you", "recommended for you", "chatbot under review", "character under review",
    "under review", "private chatbot", "deleted chatbot", "unavailable", "not available",
    "404", "404 not found", "not found", "page not found", "error", "error loading chatbot"
  ]);
  const clean = value => String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();

  function goodName(value, id = "") {
    let text = clean(value);
    if (!text) return "";
    const lower = text.toLowerCase();
    if (lower === String(id || "").toLowerCase() || GENERIC.has(lower)) return "";
    if (/^(?:for you|recommended for you|chatbot under review|character under review|404(?: not found)?|not found|page not found)(?:\b|[.!…])/i.test(text)) return "";
    text = text
      .replace(/^chat with\s+/i, "")
      .replace(/\s+(?:on|[-–—]\s*)spicychat(?:\.ai)?\s*$/i, "")
      .trim();
    return text && !GENERIC.has(text.toLowerCase()) ? text.slice(0, 180) : "";
  }

  function currentBotId() {
    const match = String(location.pathname || "").match(/^\/(?:chatbot|chat)\/([0-9a-f-]{36})(?:\/|$)/i);
    const id = String(match?.[1] || "").toLowerCase();
    return UUID_RE.test(id) ? id : "";
  }

  function metaContent(selector) {
    return clean(document.querySelector(selector)?.getAttribute?.("content") || "");
  }

  function parseJsonLdName(id) {
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const value = JSON.parse(node.textContent || "{}");
        const rows = Array.isArray(value) ? value : [value];
        for (const row of rows) {
          const name = goodName(row?.name, id);
          if (name) return name;
        }
      } catch {}
    }
    return "";
  }

  function visibleName(id) {
    const candidates = [
      document.querySelector("main h1"),
      document.querySelector("main h2"),
      document.querySelector("header h1"),
      document.querySelector("header h2"),
      document.querySelector("[data-testid*='character-name' i]"),
      document.querySelector("[data-testid*='chatbot-name' i]")
    ].filter(Boolean);
    for (const node of candidates) {
      const name = goodName(node.textContent, id);
      if (name) return name;
    }

    const og = goodName(metaContent('meta[property="og:title"]'), id);
    if (og) return og;
    const title = goodName(document.title, id);
    if (title) return title;
    return parseJsonLdName(id);
  }

  function currentCreator() {
    const anchor = document.querySelector("a[href*='/creator/']");
    const visible = clean(anchor?.textContent || "").replace(/^@/, "");
    if (visible) return visible;
    try {
      const slug = new URL(anchor?.href || "", location.origin).pathname.match(/^\/creator\/([^/?#]+)/i)?.[1] || "";
      return slug ? decodeURIComponent(slug) : "";
    } catch { return ""; }
  }

  function currentImage() {
    const og = metaContent('meta[property="og:image"]');
    if (og) return og;
    const image = document.querySelector("main img[src*='cdn.nd-api.com'], header img[src*='cdn.nd-api.com']");
    return clean(image?.currentSrc || image?.src || "");
  }

  function currentDescription() {
    const og = metaContent('meta[property="og:description"]');
    if (og && !/spicychat/i.test(og.replace(/AI chatbot/ig, ""))) return og.slice(0, 1200);
    return clean(metaContent('meta[name="description"]')).slice(0, 1200);
  }

  function getLocal(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(chrome.runtime.lastError ? {} : (value || {}))); }
      catch { resolve({}); }
    });
  }

  function setLocal(value) {
    return new Promise(resolve => {
      try { chrome.storage.local.set(value, () => resolve(!chrome.runtime.lastError)); }
      catch { resolve(false); }
    });
  }

  async function captureCurrentPage() {
    const id = currentBotId();
    if (!id) return;

    const name = visibleName(id);
    const creator = currentCreator();
    const image = currentImage();
    const description = currentDescription();
    if (!name && !creator && !image && !description) return;

    const stored = await getLocal([KEY]);
    const source = stored[KEY] && typeof stored[KEY] === "object" ? stored[KEY] : {};
    const meta = source.meta && typeof source.meta === "object" ? { ...source.meta } : { ...source };
    const previous = meta[id] && typeof meta[id] === "object" ? meta[id] : {};

    // Quality-aware merge: a blank/error/placeholder value never replaces good
    // historical metadata. A real value from a rendered chat/profile may repair
    // a bad old record.
    const previousName = goodName(previous.name, id);
    const next = {
      ...previous,
      id,
      name: name || previousName || "",
      creator: creator || clean(previous.creator),
      image: image || clean(previous.image),
      description: description || clean(previous.description),
      profileUrl: `${location.origin}/chatbot/${id}`,
      chatUrl: /^\/chat\//i.test(location.pathname || "")
        ? `${location.origin}${location.pathname}`
        : clean(previous.chatUrl),
      lastSeenAt: Date.now(),
      source: /^\/chatbot\//i.test(location.pathname || "") ? "profile" : "chat"
    };

    const before = JSON.stringify({
      name: previousName,
      creator: clean(previous.creator),
      image: clean(previous.image),
      description: clean(previous.description),
      profileUrl: clean(previous.profileUrl),
      chatUrl: clean(previous.chatUrl)
    });
    const after = JSON.stringify({
      name: next.name,
      creator: next.creator,
      image: next.image,
      description: next.description,
      profileUrl: next.profileUrl,
      chatUrl: next.chatUrl
    });
    if (before === after && Date.now() - Number(previous.lastSeenAt || 0) < 30 * 60 * 1000) return;

    meta[id] = next;
    const rows = Object.values(meta).sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0));
    for (const row of rows.slice(2500)) {
      const rowId = clean(row?.id).toLowerCase();
      if (rowId && rowId !== id) delete meta[rowId];
    }
    await setLocal({ [KEY]: { meta } });
  }

  let routeTimer = 0;
  const schedule = (delay = 300) => {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => captureCurrentPage().catch(() => {}), delay);
  };

  schedule(700);
  setTimeout(() => schedule(0), 2400);
  window.addEventListener("popstate", () => schedule(350), true);
  window.addEventListener("pageshow", () => schedule(300), true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule(250);
  }, true);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("a[href]")) schedule(650);
  }, true);
})();
/* END BOT METADATA RECOVERY CAPTURE */

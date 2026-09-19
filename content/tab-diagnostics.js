(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || !chrome?.runtime?.onMessage) return;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();

  function pageType() {
    const path = location.pathname || "/";
    if (/^\/chat\/[^/]+/i.test(path)) return "chat";
    if (/^\/chatbot\/(?!create(?:\/|$))[^/]+/i.test(path)) return "profile";
    if (path === "/" || path === "") return "home";
    if (path === "/chats" || path === "/chat" || path.startsWith("/chats/")) return "chat-list";
    if (path.startsWith("/my-creations/")) return "my-creations";
    if (path.startsWith("/favorite-bots")) return "favorites";
    if (path.startsWith("/recommended-bots")) return "recommendations";
    if (path.startsWith("/lorebook")) return "lorebook";
    if (path.startsWith("/creator/")) return "creator";
    return "other";
  }

  function routeBotId() {
    return clean(DS.botIdFromHref?.(location.href) || DS.chatIdFromHref?.(location.href) || "");
  }

  function firstText(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = clean(el?.textContent);
      if (value) return value;
    }
    return "";
  }

  function firstHref(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.href) return el.href;
    }
    return "";
  }

  function currentBotName() {
    return clean(
      DS.getCurrentBotName?.() ||
      firstText([
        "a[aria-label='chatbot-profile'] h1",
        "a[aria-label='chatbot-profile'] [class*='font-bold']",
        "main h1",
        "[data-testid*='Chatbot'] h1"
      ])
    );
  }

  function creatorInfo() {
    const anchor = document.querySelector("a[href*='/creator/']");
    if (!anchor) return null;
    const text = clean(anchor.textContent);
    let handle = "";
    try { handle = decodeURIComponent(new URL(anchor.href, location.origin).pathname.split("/creator/")[1] || "").split("/")[0]; } catch {}
    return { text, handle: clean(handle), href: anchor.href || "" };
  }

  function visibleTags() {
    const values = [];
    const seen = new Set();
    const add = value => {
      const item = clean(value);
      if (!item || item.length > 80) return;
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(item);
    };

    document.querySelectorAll("a[href*='/tag/'], a[href*='/tags/']").forEach(el => add(el.textContent));
    document.querySelectorAll("[data-testid*='tag'] button, [data-testid*='Tag'] button").forEach(el => add(el.textContent));
    return values.slice(0, 40);
  }

  function profileHref(id) {
    if (!id) return firstHref(["a[aria-label='chatbot-profile']", "a[href*='/chatbot/']"]);
    const anchors = [...document.querySelectorAll("a[href*='/chatbot/']")];
    const match = anchors.find(anchor => clean(DS.botIdFromHref?.(anchor.href)) === id);
    return match?.href || firstHref(["a[aria-label='chatbot-profile']"]);
  }

  function renderedMessageCount() {
    if (!DS.isSingleChatPage?.()) return 0;
    const ids = new Set();
    document.querySelectorAll("[id^='message-']").forEach(el => {
      if (el.id) ids.add(el.id);
    });
    return ids.size;
  }


  function metaContent(doc, selectors) {
    for (const selector of selectors) {
      const value = clean(doc.querySelector(selector)?.getAttribute("content") || "");
      if (value) return value;
    }
    return "";
  }

  function profileName(value) {
    return clean(value)
      .replace(/\s+-\s+Explore this AI Chatbot on Spicychat.*$/i, "")
      .replace(/\s+-\s+AI(?: Sex)? Chatbot(?:\s*\|\s*Spicychat)? .*$/i, "")
      .replace(/\s*[|\-–—]\s*Spicychat.*$/i, "")
      .trim();
  }

  function jsonLdMeta(doc, id) {
    const result = { description: "", creator: "", image: "" };
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = String(script.textContent || "").trim();
      if (!raw || raw.length > 500000) continue;
      try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const url = String(item.url || "");
          if (id && url && !url.includes(`/chatbot/${id}`)) continue;
          if (!result.description && item.description) result.description = clean(item.description);
          const author = item.author;
          if (!result.creator) result.creator = clean(typeof author === "string" ? author : author?.name || author?.username || "");
          const image = item.image;
          if (!result.image) result.image = clean(typeof image === "string" ? image : image?.url || image?.contentUrl || "");
        }
      } catch {}
    }
    return result;
  }

  function visibleDescription(doc) {
    const tagsHost = doc.querySelector('[data-testid="TagSuggestion"]');
    const parent = tagsHost?.parentElement;
    if (parent) {
      const children = [...parent.children];
      const start = children.indexOf(tagsHost);
      for (let i = start + 1; i < children.length; i += 1) {
        const child = children[i];
        if (!child.matches?.("p")) continue;
        const text = clean(child.textContent || "");
        if (text) return text;
      }
    }
    return metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]']);
  }

  function profileTags(doc) {
    const values = [];
    const seen = new Set();
    const add = value => {
      const text = clean(value);
      if (!text || text.length > 100) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      values.push(text);
    };
    doc.querySelectorAll('[data-testid^="TagSuggestionItem-"], a[aria-label^="tag-"], a[href*="/tag/"], a[href*="/tags/"]').forEach(node => add(node.textContent));
    return values.slice(0, 60);
  }

  function profileVisibility(doc) {
    for (const candidate of doc.querySelectorAll("span, p, div")) {
      const text = clean(candidate.textContent || "").toLowerCase();
      if (["public", "unlisted", "private"].includes(text)) return text[0].toUpperCase() + text.slice(1);
    }
    return "";
  }

  function profileMetadataFromHtml(html, id, diagnostics = {}) {
    const rawHtml = String(html || "");
    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    const jsonLd = jsonLdMeta(doc, id);
    const creatorAnchor = doc.querySelector('a[aria-label="creator-profile"], a[href*="/creator/"]');
    let creator = clean(creatorAnchor?.textContent || jsonLd.creator || "").replace(/^@/, "");
    if (!creator && creatorAnchor?.href) {
      try { creator = decodeURIComponent(new URL(creatorAnchor.href, location.origin).pathname.split("/creator/")[1] || "").split("/")[0]; } catch {}
    }
    const name = profileName(doc.querySelector("h1")?.textContent || "") || profileName(doc.title || "");
    const description = visibleDescription(doc) || jsonLd.description || "";
    const image = clean(
      doc.querySelector('img[alt="avatar image"]')?.getAttribute("src") ||
      metaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
      jsonLd.image || ""
    );
    const requestedBotIdPresent = rawHtml.toLowerCase().includes(String(id || "").toLowerCase());
    const challengeDetected = /cf-chl-|cloudflare|checking your browser|just a moment/i.test(rawHtml.slice(0, 250000));
    const tags = profileTags(doc);
    return {
      name,
      description: String(description || "").slice(0, 8000),
      creator,
      tags,
      visibility: profileVisibility(doc),
      image,
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      _diagnostic: {
        ...diagnostics,
        responseBytes: rawHtml.length,
        requestedBotIdPresent,
        challengeDetected,
        pageTitle: clean(doc.title || "").slice(0, 240),
        responseKind: challengeDetected ? "challenge" : (requestedBotIdPresent ? "profile-shell-with-id" : "generic-app-shell")
      }
    };
  }

  function profileMetadataFromCurrentDocument(botId) {
    const id = clean(botId);
    const rawBody = clean(document.body?.innerText || "").slice(0, 12000);
    const challengeDetected = /checking your browser|just a moment|verify you are human|cloudflare|security verification/i.test(`${document.title || ""} ${rawBody}`);
    const routeId = routeBotId();
    const routeMatches = !!id && routeId === id && pageType() === "profile";
    const jsonLd = jsonLdMeta(document, id);
    const creatorAnchor = document.querySelector('a[aria-label="creator-profile"], a[href*="/creator/"]');
    let creator = clean(creatorAnchor?.textContent || jsonLd.creator || "").replace(/^@/, "");
    if (!creator && creatorAnchor?.href) {
      try { creator = decodeURIComponent(new URL(creatorAnchor.href, location.origin).pathname.split("/creator/")[1] || "").split("/")[0]; } catch {}
    }
    const name = profileName(document.querySelector("h1")?.textContent || "") || profileName(document.title || "");
    const description = visibleDescription(document) || jsonLd.description || "";
    const tags = profileTags(document);
    const image = clean(
      document.querySelector('img[alt="avatar image"]')?.getAttribute("src") ||
      metaContent(document, ['meta[property="og:image"]', 'meta[name="twitter:image"]']) ||
      jsonLd.image || ""
    );
    const useful = [name, description, creator, image, ...(tags || [])].some(Boolean);
    return {
      name,
      description: String(description || "").slice(0, 8000),
      creator,
      tags,
      visibility: profileVisibility(document),
      image,
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      _diagnostic: {
        finalUrl: location.href,
        routeBotId: routeId,
        routeMatches,
        challengeDetected,
        requestedBotIdPresent: routeMatches || location.pathname.includes(id),
        pageTitle: clean(document.title || "").slice(0, 240),
        readyState: document.readyState,
        responseKind: challengeDetected
          ? "challenge"
          : (routeMatches && useful ? "rendered-profile" : (routeMatches ? "rendered-profile-no-usable-data" : "wrong-route"))
      }
    };
  }

  async function enrichProfile(botId) {
    const id = clean(botId);
    if (!id) throw new Error("Missing bot id");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${location.origin}/chatbot/${encodeURIComponent(id)}`, {
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
      return profileMetadataFromHtml(html, id, {
        httpStatus: Number(response.status) || 0,
        finalUrl
      });
    } finally {
      clearTimeout(timer);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "DS_TAB_DIAGNOSTIC_PING") {
      sendResponse({ ok: true, pageType: pageType(), at: Date.now() });
      return false;
    }

    if (message?.type === "DS_TAB_DIAGNOSTIC_READ_RENDERED_PROFILE") {
      try {
        const metadata = profileMetadataFromCurrentDocument(message.botId);
        sendResponse({ ok: true, metadata });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
      return false;
    }

    if (message?.type === "DS_TAB_DIAGNOSTIC_ENRICH_ONE") {
      enrichProfile(message.botId)
        .then(metadata => sendResponse({ ok: true, metadata }))
        .catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }

    if (message?.type !== "DS_TAB_DIAGNOSTIC_SNAPSHOT") return false;

    const id = routeBotId();
    const creator = creatorInfo();
    sendResponse({
      ok: true,
      pageType: pageType(),
      botId: id,
      botName: currentBotName(),
      creator,
      profileHref: profileHref(id),
      visibleTags: visibleTags(),
      renderedMessageCount: renderedMessageCount(),
      documentTitle: clean(document.title),
      visibilityState: document.visibilityState || "",
      collectedAt: Date.now()
    });
    return false;
  });
})();

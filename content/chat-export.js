if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }


  function cleanMessageText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\u200b/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function cleanInline(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function norm(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function classText(el) {
    return String(el?.getAttribute?.("class") || "");
  }

  function isVisible(el) {
    if (!el) return false;

    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function qsa(selector, root = document) {
    return DS.qsa ? DS.qsa(selector, root) : Array.from(root.querySelectorAll(selector));
  }

  async function waitFor(getter, timeoutMs = 2000, intervalMs = 80) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const value = getter();
        if (value) return value;
      } catch {}
      await DS.sleep(intervalMs);
    }
    return null;
  }

  function isInsideMessage(el) {
    return !!el.closest("[id^='message-']");
  }

  function ignoredArea(el, { allowInsideMessage = false } = {}) {
    if (!allowInsideMessage && isInsideMessage(el)) return true;

    return !!el.closest(
      [
        "#ds-qol-panel",
        "#ds-chat-export-modal",
        "nav",
        "aside",
        "script",
        "style",
        "noscript",
        "svg",
        "select",
        "textarea",
        "input",
        "[data-testid='LocaleSelector']",
        "[data-testid='GetPremiumButton']",
        "[data-testid='FloatingUpgradeCta']",
        "[aria-label='theme']",
        "[aria-label='Globe-button']",
        "[aria-label='login']",
        "[aria-label='Sign In']",
        "[aria-label='Sign Out']",
        "[data-announcekit-mode]"
      ].join(", ")
    );
  }

  function looksLikeUiText(text) {
    const value = norm(text);

    if (!value) return true;

    const exact = new Set([
      "home",
      "chats",
      "my personas",
      "create",
      "chatbot",
      "lorebook",
      "group",
      "voice",
      "my creations",
      "chatbots",
      "lorebooks",
      "groups",
      "voices",
      "favorites",
      "recommendations",
      "leaderboard",
      "blocked creators",
      "subscribe",
      "help",
      "sign in",
      "sign out",
      "terms",
      "privacy",
      "refunds",
      "reporting",
      "guidelines",
      "support",
      "affiliates",
      "true supporter",
      "get premium",
      "premium",
      "upgrade",
      "copy",
      "edit",
      "report",
      "regenerate",
      "continue",
      "rate",
      "listen",
      "cancel",
      "done",
      "save",
      "remove",
      "start new chat",
      "share chatbot",
      "view saved chats",
      "remove messages",
      "clone conversation",
      "change title",
      "set voice",
      "unlock custom voices",
      "generation settings",
      "en",
      "de",
      "fr",
      "es",
      "it",
      "pt",
      "nl",
      "pl",
      "ru",
      "ja",
      "ko",
      "zh"
    ]);

    if (exact.has(value)) return true;

    return (
      value.includes("web version:") ||
      value.includes("download spicychat") ||
      value.includes("context limit reached") ||
      value.includes("i'm all in") ||
      value.includes("im all in") ||
      value.includes("get premium") ||
      value.includes("subscribe now") ||
      value.includes("spicychat is powered by ai") ||
      value.includes("all conversations are fictional") ||
      value.includes("you are not registered") ||
      value.includes("register/upgrade plan") ||
      value.includes("terms privacy refunds") ||
      value.includes("narrow by tag") ||
      value.includes("search tags") ||
      value.includes("include exclude") ||
      value.includes("select the first message to remove")
    );
  }

  function getRoot() {
    return (
      document.querySelector("[data-testid='ChatPage']") ||
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body
    );
  }

  function getBotName() {
    if (typeof DS.getCurrentBotName === "function") {
      const name = cleanText(DS.getCurrentBotName());
      if (name) return name;
    }

    const h1 = cleanText(document.querySelector("a[aria-label='chatbot-profile'] h1, h1")?.textContent);
    if (h1 && !looksLikeUiText(h1)) return h1;

    const title = cleanText(document.title)
      .replace(/^Chat with\s+/i, "")
      .replace(/\s+on\s+Spicychat.*$/i, "")
      .replace(/\s*[-|]\s*SpicyChat.*$/i, "")
      .replace(/\s*[-|]\s*Spicychat.*$/i, "");

    return title || "Bot";
  }

  function getMessageRoots() {
    const root = getRoot();

    return qsa("div[id^='message-']", root)
      .filter(el => !el.parentElement?.closest?.("div[id^='message-']"))
      .filter(el => cleanText(el.textContent).length > 0)
      .sort((a, b) => {
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
  }

  function findMessageTextContainer(bubble) {
    const candidates = qsa("div, p", bubble)
      .filter(isVisible)
      .filter(el => {
        const cls = classText(el).toLowerCase();
        return cls.includes("overflow-wrap") || cls.includes("whitespace-pre-wrap") || cls.includes("break-words") || cls.includes("prose");
      })
      .filter(el => cleanText(el.textContent).length > 0)
      .sort((a, b) => cleanText(b.textContent).length - cleanText(a.textContent).length);

    // SpicyChat has changed the message-text classes a few times. The bubble is
    // still a useful fallback because buttons and other controls are ignored by
    // the text reader below.
    return candidates[0] || bubble || null;
  }

  function findMessageBubble(root) {
    const candidates = qsa("div", root)
      .filter(isVisible)
      .filter(el => {
        const cls = classText(el);
        if (!cls.includes("rounded")) return false;
        if (!findMessageTextContainer(el)) return false;
        if (el.closest("#ds-qol-panel, #ds-chat-export-modal")) return false;
        return true;
      })
      .sort((a, b) => {
        const at = cleanText(a.textContent).length;
        const bt = cleanText(b.textContent).length;
        return at - bt;
      });

    return candidates[0] || null;
  }

  function extractNodeText(node, { allowHiddenDirectives = false } = {}) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) return DS.getOriginalChatDisplayNodeText?.(node) ?? node.nodeValue ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node;
    const tag = el.tagName.toLowerCase();

    if (["script", "style", "noscript", "svg", "button", "select", "input", "textarea"].includes(tag)) {
      return "";
    }

    if (!allowHiddenDirectives && !isVisible(el)) return "";
    if (tag === "br") return "\n";

    const inner = Array.from(el.childNodes)
      .map(child => extractNodeText(child, { allowHiddenDirectives }))
      .join("");
    const text = cleanText(inner);

    if (!text) return "";

    if (tag === "pre") return `\n\n\`\`\`\n${inner.trim()}\n\`\`\`\n\n`;
    if (tag === "code") return `\`${cleanInline(inner)}\``;
    if (tag === "q") return `"${cleanInline(inner)}"`;
    if (tag === "em" || tag === "i") return `*${cleanInline(inner)}*`;
    if (tag === "strong" || tag === "b") return `**${cleanInline(inner)}**`;
    if (tag === "del" || tag === "s") return `~~${cleanInline(inner)}~~`;

    const cls = classText(el).toLowerCase();
    if (tag === "span" && /(^|\s)italic(\s|$)/.test(cls)) return `*${cleanInline(inner)}*`;
    if (tag === "span" && /(^|\s)(font-bold|font-semibold|font-extrabold)(\s|$)/.test(cls)) return `**${cleanInline(inner)}**`;
    if (tag === "span" && /(^|\s)line-through(\s|$)/.test(cls)) return `~~${cleanInline(inner)}~~`;

    if (tag === "li") return `\n- ${cleanInline(inner)}\n`;
    if (["p", "blockquote"].includes(tag)) return `\n\n${inner.trim()}\n\n`;

    return inner;
  }

  function isDirectiveText(text) {
    const value = norm(text);

    return (
      value.startsWith("directed") ||
      value.startsWith("directive") ||
      value.startsWith("[ooc") ||
      value.startsWith("ooc:") ||
      value.includes("[ooc:")
    );
  }

  function extractDirectiveBlock(block) {
    const aside = block.querySelector("aside");
    const asideText = cleanText(aside?.textContent || "");

    if (asideText) return `[Directive: ${asideText}]`;

    const text = cleanText(block.innerText || block.textContent);
    return text || "";
  }

  function extractMessageText(container, settings) {
    const includeDirectives = !!settings.chatExportIncludeOocDirectives;
    const pieces = [];

    const children = Array.from(container.children).filter(child => {
      if (child.closest(".ds-message-quick-actions")) return false;
      return cleanText(child.textContent).length > 0;
    });

    const blocks = children.length ? children : [container];

    for (const block of blocks) {
      if (!isVisible(block)) continue;
      if (block.closest("button, [role='button']")) continue;

      const hasDirective = !!block.querySelector("aside") || isDirectiveText(block.textContent);

      if (hasDirective) {
        if (!includeDirectives) continue;
        const directive = cleanText(extractDirectiveBlock(block));
        if (directive) pieces.push(directive);
        continue;
      }

      const text = cleanMessageText(extractNodeText(block));
      if (!text) continue;
      if (!includeDirectives && isDirectiveText(text)) continue;
      if (looksLikeUiText(text)) continue;

      pieces.push(text);
    }

    return cleanMessageText(pieces.join("\n\n"));
  }

  function findSpeakerName(root, bubble, textContainer) {
    const botName = getBotName();
    const contentTop = textContainer?.getBoundingClientRect?.().top || Infinity;

    const candidates = qsa("p, span, h1, h2, h3", bubble)
      .filter(isVisible)
      .filter(el => !el.closest("button, [role='button'], svg"))
      .filter(el => el.getBoundingClientRect().top < contentTop - 1)
      .map(el => cleanText(el.textContent))
      .filter(text => text.length > 0 && text.length <= 80)
      .filter(text => !looksLikeUiText(text))
      .filter(text => !/^[A-Z]{1,3}$/.test(text));

    const named = candidates.find(Boolean);
    if (named) return named;

    const cls = classText(bubble);
    const rowText = classText(root.querySelector(".items-center") || root);

    if (cls.includes("bg-blumine") || rowText.includes("justify-between")) return "You";

    return botName;
  }

  function findSpeakerAvatar(root, textContainer) {
    const contentTop = textContainer?.getBoundingClientRect?.().top || Infinity;
    const candidates = qsa("img", root)
      .filter(isVisible)
      .filter(img => img.getBoundingClientRect().top <= contentTop + 4)
      .filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width >= 20 && rect.width <= 96 && rect.height >= 20 && rect.height <= 110;
      });
    return candidates[0]?.src || "";
  }

  function cleanMessageBody(text, speaker, botName) {
    let next = cleanMessageText(text);

    for (const name of [speaker, botName].filter(Boolean)) {
      next = next.replace(new RegExp(`^${escapeRegExp(name)}\\s*:?\\s*`, "i"), "").trim();
    }

    return cleanMessageText(next);
  }

  function rectSnapshot(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  }

  function rectsOverlap(a, b) {
    if (!a || !b || !a.width || !a.height || !b.width || !b.height) return false;
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    if (!width || !height) return false;
    const overlap = width * height;
    const smaller = Math.min(a.width * a.height, b.width * b.height);
    return smaller > 0 && overlap / smaller >= 0.8;
  }

  function extractNodeTextFast(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return DS.getOriginalChatDisplayNodeText?.(node) ?? node.nodeValue ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const el = node;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "svg", "button", "select", "input", "textarea"].includes(tag)) return "";
    if (tag === "br") return "\n";

    const inner = Array.from(el.childNodes).map(extractNodeTextFast).join("");
    if (!cleanText(inner)) return "";
    if (tag === "pre") return `\n\n\`\`\`\n${inner.trim()}\n\`\`\`\n\n`;
    if (tag === "code") return `\`${cleanInline(inner)}\``;
    if (tag === "q") return `"${cleanInline(inner)}"`;
    if (tag === "em" || tag === "i") return `*${cleanInline(inner)}*`;
    if (tag === "strong" || tag === "b") return `**${cleanInline(inner)}**`;
    if (tag === "del" || tag === "s") return `~~${cleanInline(inner)}~~`;

    const cls = classText(el).toLowerCase();
    if (tag === "span" && /(^|\s)italic(\s|$)/.test(cls)) return `*${cleanInline(inner)}*`;
    if (tag === "span" && /(^|\s)(font-bold|font-semibold|font-extrabold)(\s|$)/.test(cls)) return `**${cleanInline(inner)}**`;
    if (tag === "span" && /(^|\s)line-through(\s|$)/.test(cls)) return `~~${cleanInline(inner)}~~`;
    if (tag === "li") return `\n- ${cleanInline(inner)}\n`;
    if (["p", "blockquote"].includes(tag)) return `\n\n${inner.trim()}\n\n`;
    return inner;
  }

  function extractMessageTextFast(container, settings) {
    const includeDirectives = !!settings.chatExportIncludeOocDirectives;
    const pieces = [];
    const children = Array.from(container.children).filter(child => {
      if (child.closest?.(".ds-message-quick-actions")) return false;
      return cleanText(child.textContent).length > 0;
    });
    const blocks = children.length ? children : [container];

    for (const block of blocks) {
      if (block.closest?.("button, [role='button']")) continue;
      const hasDirective = !!block.querySelector?.("aside") || isDirectiveText(block.textContent);
      if (hasDirective) {
        if (!includeDirectives) continue;
        const aside = cleanText(block.querySelector?.("aside")?.textContent || block.textContent || "");
        if (aside) pieces.push(aside.startsWith("[") ? aside : `[Directive: ${aside}]`);
        continue;
      }
      const text = cleanMessageText(extractNodeTextFast(block));
      if (!text || (!includeDirectives && isDirectiveText(text)) || looksLikeUiText(text)) continue;
      pieces.push(text);
    }
    return cleanMessageText(pieces.join("\n\n"));
  }

  // Keep original image links in exports when SpicyChat exposes them. Do not
  // fetch, embed, or guess media IDs; never collect unrelated profile avatars.
  function safeExportImageUrl(raw) {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) return '';
    try {
      const url = new URL(raw.trim().replace(/&amp;/g, '&'), location.origin);
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return '';
      return url.href;
    } catch { return ''; }
  }

  function imageLikeUrl(raw) {
    try {
      const url = new URL(raw, location.origin);
      return /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[?#])/i.test(url.pathname) ||
        /(?:^|\/)images?\//i.test(url.pathname) ||
        /\b(?:class|type)=avatar/i.test(url.search);
    } catch { return false; }
  }

  function collectExportImageLinks(row = null, text = '', textContainer = null) {
    const urls = [];
    const seen = new Set();
    const add = (raw, knownImage = false) => {
      const url = safeExportImageUrl(raw);
      if (!url || (!knownImage && !imageLikeUrl(url)) || seen.has(url) || urls.length >= 20) return;
      seen.add(url); urls.push(url);
    };
    // A message may contain Markdown images or HTML img tags in its content.
    const content = String(text || '').slice(0, 200000);
    for (const hit of content.matchAll(/!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+[^)]*)?\)/gi)) add(hit[1], true);
    for (const hit of content.matchAll(/<img\b[^>]*\bsrc\s*=\s*['"](https?:\/\/[^'"\s>]+)['"][^>]*>/gi)) add(hit[1], true);
    const mediaFields = ['images', 'image_urls', 'imageUrls', 'image_url', 'imageUrl',
      'attachments', 'attachment', 'media', 'picture', 'pictures'];
    const visit = (value, imageContext = false, depth = 0) => {
      if (depth > 3 || urls.length >= 20) return;
      if (typeof value === 'string') { add(value, imageContext); return; }
      if (Array.isArray(value)) { value.slice(0, 20).forEach(item => visit(item, imageContext, depth + 1)); return; }
      if (!value || typeof value !== 'object') return;
      const type = String(value.type || value.mimeType || value.mime_type || value.content_type || value.contentType || '').toLowerCase();
      // Never label videos/audio/files as images solely because a media key exists.
      if (type && !/(?:image|photo|picture)/.test(type)) return;
      const isImage = imageContext || /(?:image|photo|picture)/.test(type);
      for (const key of ['url','src','imageUrl','image_url','image','href','link']) {
        if (typeof value[key] === 'string') add(value[key], isImage);
      }
      for (const key of mediaFields) if (value[key] != null) visit(value[key], isImage || /image|picture/.test(key), depth + 1);
    };
    if (row && typeof row === 'object') for (const key of mediaFields) {
      if (row[key] != null) visit(row[key], /image|picture/.test(key));
    }
    // Limit DOM lookup to actual message body, excluding chat header/avatar.
    if (textContainer?.querySelectorAll) {
      for (const img of textContainer.querySelectorAll('img[src]')) add(img.currentSrc || img.getAttribute('src'), true);
      for (const link of textContainer.querySelectorAll('a[href]')) add(link.getAttribute('href'), false);
    }
    return urls;
  }

  function collectMessagesFast(settings = DS.state?.settings || {}, rootsOverride = []) {
    const botName = getBotName();
    const messages = [];
    const roots = Array.isArray(rootsOverride) ? rootsOverride.slice() : [];
    roots.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    for (const root of roots) {
      const rawId = String(root?.id || "");
      if (!rawId) continue;
      const bubble = root.querySelector("div[class*='m-[0_10px_0_53px]'], div[class*='m-[0_32px_0_10px]']") ||
        root.querySelector("div[class*='bg-blumine'], div[class~='bg-gray-4']");
      if (!bubble) {
        messages.push(...collectMessages(settings, [root]));
        continue;
      }

      const bubbleClass = classText(bubble);
      const isUser = bubbleClass.includes("m-[0_10px_0_53px]") || bubbleClass.includes("bg-blumine");
      const textContainer = bubble.querySelector("div[class*='overflow-wrap']") || bubble.querySelector("div.flex.flex-col.w-full");
      if (!textContainer) {
        messages.push(...collectMessages(settings, [root]));
        continue;
      }

      const named = cleanText(bubble.querySelector("p")?.textContent || "");
      const speaker = named && !looksLikeUiText(named) ? named : (isUser ? "You" : botName);
      const text = cleanMessageBody(extractMessageTextFast(textContainer, settings), speaker, botName);
      const images = collectExportImageLinks(null, text, textContainer);
      if ((!text && !images.length) || (text && looksLikeUiText(text))) continue;

      messages.push({
        id: rawId.replace(/^message-/, ""),
        speaker,
        text,
        role: isUser ? "user" : "bot",
        avatar: bubble.querySelector("img")?.src || "",
        images
      });
    }
    return messages;
  }

  function collectMessages(settings = DS.state?.settings || {}, rootsOverride = null) {
    const botName = getBotName();
    const seenIds = new Set();
    const renderedCopies = new Map();
    const messages = [];
    const roots = Array.isArray(rootsOverride) ? rootsOverride : getMessageRoots();

    for (const root of roots) {
      const rawId = String(root.id || "");
      if (rawId && seenIds.has(rawId)) continue;
      if (rawId) seenIds.add(rawId);

      const bubble = findMessageBubble(root);
      if (!bubble) continue;

      const textContainer = findMessageTextContainer(bubble);
      if (!textContainer) continue;

      const speaker = findSpeakerName(root, bubble, textContainer);
      const bubbleClass = classText(bubble);
      const isUser = bubbleClass.includes("m-[0_10px_0_53px]") || bubbleClass.includes("bg-blumine") || speaker === "You";
      const text = cleanMessageBody(extractMessageText(textContainer, settings), speaker, botName);
      const images = collectExportImageLinks(null, text, textContainer);

      if ((!text && !images.length) || (text && looksLikeUiText(text))) continue;

      // SpicyChat can briefly render two copies of the same row during a rerender.
      // Only drop copies that occupy the same place on screen. Identical messages
      // later in the conversation are kept.
      const bodyKey = norm(`${speaker}\n${text}`);
      const rect = rectSnapshot(root);
      const copies = renderedCopies.get(bodyKey) || [];
      if (copies.some(copy => (rawId && copy.id === rawId) || rectsOverlap(rect, copy.rect))) continue;
      copies.push({ id: rawId, rect });
      renderedCopies.set(bodyKey, copies);

      messages.push({
        id: rawId.replace(/^message-/, ""),
        speaker,
        text,
        role: isUser ? "user" : "bot",
        avatar: findSpeakerAvatar(root, textContainer),
        images
      });
    }

    return messages;
  }

  function hrefFor(selector) {
    const el = document.querySelector(selector);
    const href = el?.getAttribute?.("href") || "";

    if (!href) return "";

    try {
      return new URL(href, location.origin).href;
    } catch {
      return href;
    }
  }

  function elementBeforeFirstMessage(el, firstMessage) {
    if (!firstMessage || !el) return true;
    return !!(el.compareDocumentPosition(firstMessage) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function collectTopTags(firstMessage) {
    const botName = getBotName();
    const tags = [];
    const seen = new Set();

    qsa("button", getRoot())
      .filter(isVisible)
      .filter(button => elementBeforeFirstMessage(button, firstMessage))
      .filter(button => !ignoredArea(button, { allowInsideMessage: false }))
      .filter(button => !button.getAttribute("aria-label"))
      .forEach(button => {
        const text = cleanText(button.textContent);
        const key = norm(text);
        const loadPreviousKey = button.querySelector("[data-translate-key='chat:page.action.loadPreviousMessages']");

        if (!text || text.length > 40) return;
        if (loadPreviousKey || key === "load previous messages") return;
        if (seen.has(key)) return;
        if (looksLikeUiText(text)) return;
        if (key === norm(botName)) return;

        seen.add(key);
        tags.push(text);
      });

    return tags;
  }

  function collectVisibleIntro(firstMessage, info) {
    const ignored = new Set([
      norm(info.name),
      norm(info.creator),
      ...info.tags.map(norm)
    ]);

    const candidates = qsa("p", getRoot())
      .filter(isVisible)
      .filter(p => elementBeforeFirstMessage(p, firstMessage))
      .filter(p => !ignoredArea(p, { allowInsideMessage: false }))
      .map(p => cleanText(p.textContent))
      .filter(text => text.length >= 12)
      .filter(text => !looksLikeUiText(text))
      .filter(text => !ignored.has(norm(text)))
      .filter(text => !text.startsWith("@"));

    return candidates[0] || "";
  }

  function collectVisibleSection(labelNames, firstMessage) {
    const labels = labelNames.map(norm);

    const labelNodes = qsa("h1, h2, h3, h4, h5, label, p, span, div", getRoot())
      .filter(isVisible)
      .filter(el => elementBeforeFirstMessage(el, firstMessage))
      .filter(el => !ignoredArea(el, { allowInsideMessage: false }))
      .filter(el => {
        const text = norm(el.textContent);
        return labels.includes(text) || labels.some(label => text === `${label}:`);
      });

    for (const labelEl of labelNodes) {
      const labelText = cleanText(labelEl.textContent);
      const parent = labelEl.parentElement;

      const candidates = [
        labelEl.nextElementSibling,
        parent?.querySelector("textarea"),
        parent?.querySelector("[contenteditable='true']"),
        parent?.nextElementSibling,
        parent?.parentElement?.nextElementSibling
      ].filter(Boolean);

      for (const candidate of candidates) {
        if (!isVisible(candidate) || ignoredArea(candidate, { allowInsideMessage: false })) continue;

        const text = cleanText(candidate.value || candidate.innerText || candidate.textContent);
        if (text && text.length > 8 && !looksLikeUiText(text) && !labels.includes(norm(text))) {
          return text;
        }
      }

      const parentText = cleanText(parent?.innerText || parent?.textContent || "");
      if (parentText.length > labelText.length + 12) {
        const text = cleanText(parentText.replace(labelText, ""));
        if (text && !looksLikeUiText(text)) return text;
      }
    }

    return "";
  }

  function collectBotInfo() {
    const firstMessage = getMessageRoots()[0] || null;
    const info = {
      name: getBotName(),
      creator: cleanText(document.querySelector("a[aria-label='creator-profile']")?.textContent || ""),
      chatUrl: location.href,
      profileUrl: hrefFor("a[aria-label='chatbot-profile']"),
      tags: [],
      intro: "",
      description: "",
      personality: "",
      scenario: "",
      lorebook: "",
      definition: ""
    };

    info.tags = collectTopTags(firstMessage);
    info.intro = collectVisibleIntro(firstMessage, info);
    info.description = collectVisibleSection(["description", "bot description", "character description"], firstMessage);
    info.personality = collectVisibleSection(["personality", "character personality"], firstMessage);
    info.scenario = collectVisibleSection(["scenario", "setting"], firstMessage);
    info.lorebook = collectVisibleSection(["lorebook", "lore book", "lore", "world info"], firstMessage);
    info.definition = collectVisibleSection(["definition", "character definition", "bot definition"], firstMessage);

    for (const key of Object.keys(info)) {
      if (Array.isArray(info[key])) continue;
      info[key] = cleanText(info[key]);
    }

    return info;
  }

  async function collectAvailableBotInfo() {
    const visible = collectBotInfo();
    const botId = String(location.pathname.match(/^\/chat\/([^/]+)/)?.[1] || "").trim();
    let remote = null;

    try {
      if (botId && typeof DS.fetchCharacterArchiveData === "function") {
        remote = await DS.fetchCharacterArchiveData(botId);
      }
    } catch {}

    if (!remote) return { ...visible, source: "visible-chat" };

    const pick = (a, b) => cleanText(a || b || "");
    const list = (...values) => [...new Set(values.flat().filter(Boolean).map(item => cleanText(item)).filter(Boolean))];

    return {
      ...visible,
      id: botId || remote.id || "",
      name: pick(remote.name, visible.name),
      creator: pick(remote.creator, visible.creator),
      avatar: pick(remote.avatar, visible.avatar),
      visibility: pick(remote.visibility, visible.visibility),
      createdAt: remote.createdAt || visible.createdAt || null,
      profileUrl: visible.profileUrl || (botId ? `${location.origin}/chatbot/${botId}` : ""),
      tags: list(remote.tags || [], visible.tags || []),
      greeting: pick(remote.greeting, visible.greeting || visible.intro),
      alternateGreetings: Array.isArray(remote.alternateGreetings) ? remote.alternateGreetings : [],
      intro: visible.intro,
      description: pick(remote.description, visible.description),
      personality: pick(remote.personality, visible.personality),
      scenario: pick(remote.scenario, visible.scenario),
      examples: pick(remote.examples, visible.examples),
      lorebook: visible.lorebook,
      definition: pick(remote.personality, visible.definition),
      source: remote.source || "visible-chat"
    };
  }

  function formatBotInfo(botInfo) {
    const lines = ["## Bot info"];

    if (botInfo.name) lines.push(`Name: ${botInfo.name}`);
    if (botInfo.creator) lines.push(`Creator: ${botInfo.creator}`);
    if (botInfo.profileUrl) lines.push(`Profile: ${botInfo.profileUrl}`);
    if (botInfo.tags.length) lines.push(`Tags: ${botInfo.tags.join(", ")}`);
    if (botInfo.createdAt) lines.push(`Created: ${new Date(botInfo.createdAt).toLocaleString()}`);
    if (botInfo.visibility) lines.push(`Visibility: ${botInfo.visibility}`);
    if (botInfo.source) lines.push(`Bot info source: ${botInfo.source}`);

    const blocks = [
      ["Greeting", botInfo.greeting],
      ["Alternate greetings", (botInfo.alternateGreetings || []).join("\n\n---\n\n")],
      ["Visible intro", botInfo.intro],
      ["Description", botInfo.description],
      ["Personality", botInfo.personality],
      ["Scenario", botInfo.scenario],
      ["Example dialogue", botInfo.examples],
      ["Lorebook", botInfo.lorebook],
      ["Definition", botInfo.definition]
    ].filter(([, value]) => value);

    for (const [label, value] of blocks) {
      lines.push(`\n### ${label}\n${value}`);
    }

    return cleanText(lines.join("\n"));
  }

  function formatNumber(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return "";
    return Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function metadataLines(record) {
    if (!record || typeof record !== "object") return [];
    const lines = [];
    if (record.createdAt) {
      const date = new Date(record.createdAt);
      if (!Number.isNaN(date.getTime())) lines.push(date.toLocaleString());
    }
    const requested = cleanInline(record.requestedModel || record.inferenceModel || record.model);
    const engine = cleanInline(record.responseEngine || record.engine);
    if (requested || engine) lines.push(requested && engine && requested.toLowerCase() !== engine.toLowerCase() ? `${requested} → ${engine}` : (engine || requested));
    if (record.elapsedMs != null && Number.isFinite(Number(record.elapsedMs))) lines.push(`${formatNumber(Number(record.elapsedMs) / 1000, 1)}s generation`);
    const settings = record.settings || record.inferenceSettings;
    if (settings && typeof settings === "object") {
      const parts = [];
      const add = (label, value, digits = 2) => { if (value != null && Number.isFinite(Number(value))) parts.push(`${label} ${formatNumber(value, digits)}`); };
      add("Max", settings.maxTokens ?? settings.max_tokens ?? settings.max_new_tokens, 0);
      add("Temp", settings.temperature);
      add("Top P", settings.topP ?? settings.top_p);
      add("Top K", settings.topK ?? settings.top_k, 0);
      add("Repeat", settings.repetitionPenalty ?? settings.repetition_penalty);
      if (parts.length) lines.push(parts.join(" · "));
    }
    return lines;
  }

  async function loadGenerationMetadata() {
    try {
      const key = DS.MESSAGE_GENERATION_METADATA_KEY || "messageGenerationMetadata";
      const result = await DS.storageGet?.(key);
      const store = result?.[key];
      return store && typeof store === "object" && !Array.isArray(store) ? store : {};
    } catch {
      return {};
    }
  }

  function styleSnapshot(el, fallback = {}) {
    if (!el) return { ...fallback };
    try {
      const css = getComputedStyle(el);
      return {
        background: css.backgroundColor || fallback.background || "",
        color: css.color || fallback.color || "",
        borderColor: css.borderColor || fallback.borderColor || "",
        borderWidth: css.borderWidth || fallback.borderWidth || "",
        borderStyle: css.borderStyle || fallback.borderStyle || "",
        borderRadius: css.borderRadius || fallback.borderRadius || "",
        fontFamily: css.fontFamily || fallback.fontFamily || "",
        fontSize: css.fontSize || fallback.fontSize || "",
        lineHeight: css.lineHeight || fallback.lineHeight || "",
        padding: css.padding || fallback.padding || ""
      };
    } catch {
      return { ...fallback };
    }
  }

  function captureAppearanceTemplate() {
    const roots = getMessageRoots();
    let userBubble = null;
    let botBubble = null;
    for (const root of roots) {
      const bubble = findMessageBubble(root);
      if (!bubble) continue;
      const cls = classText(bubble);
      const isUser = cls.includes("m-[0_10px_0_53px]") || cls.includes("bg-blumine");
      if (isUser && !userBubble) userBubble = bubble;
      if (!isUser && !botBubble) botBubble = bubble;
      if (userBubble && botBubble) break;
    }
    const body = styleSnapshot(document.body, { background: "#0b0b0d", color: "#eee" });
    const bot = styleSnapshot(botBubble, { background: "#17171b", color: body.color, borderRadius: "16px" });
    const user = styleSnapshot(userBubble, { background: "#163241", color: body.color, borderRadius: "16px" });
    const inlineCode = document.querySelector("div[id^='message-'] .ds-alt-dialogue, div[id^='message-'] code:not(pre code), div[id^='message-'] blockquote.bg-colorHighlight");
    const code = styleSnapshot(inlineCode, { background: "#24242b", color: body.color, borderRadius: "5px" });
    return { body, bot, user, code, capturedAt: Date.now() };
  }

  // Status dividers may render inside a message row or between message rows.
  // Inspect the currently mounted chat only, and associate each divider with
  // the closest preceding message row in DOM order.
  // This is NOT a full Rulebook state or a replay of unmounted history.
  function collectVisibleRulebookState(messages = []) {
    const root = getRoot();
    const messageRoots = getMessageRoots();
    const dividers = qsa('[data-testid="RulebookStatusDividers"]', root)
      .filter(el => !el.closest('#ds-chat-export-modal, #ds-qol-panel'));
    const events = [];
    // Track actual DOM nodes, not their text: two distinct Story Moments may
    // have identical wording after one message and must remain separate.
    const seenNodes = new Set();
    const positions = new Map((messages || []).map((message, index) => [String(message.id || ''), index + 1]));
    // DOM order is essential: a divider belongs to the most recent message.
    const items = [
      ...messageRoots.map(el => ({ el, isMessage: true })),
      ...dividers.map(el => ({ el, isMessage: false }))
    ].sort((a, b) => a.el === b.el ? 0 :
      (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    let currentMessageId = null;
    for (const item of items) {
      if (item.isMessage) {
        currentMessageId = String(item.el.id || '').replace(/^message-/, '') || null;
        continue;
      }
      const divider = item.el;
      // Multiple Rulebook changes can share one divider; preserve each one.
      const changes = qsa('[data-testid="RulebookStatusDividers-Divider"]', divider);
      const labels = changes.length ? changes : [divider];
      for (const label of labels) {
        const raw = cleanInline(label.textContent);
        if (!raw || raw.length > 2000) continue;
        const type = /\bstory\s+moments?\b/i.test(raw) ? 'story-moments'
          : /\bstory\s+(?:time|clock)\b/i.test(raw) ? 'story-time' : 'other';
        // Guard against the same nested label appearing in multiple container
        // queries, but never collapse distinct updates by text or message ID.
        if (seenNodes.has(label)) continue;
        seenNodes.add(label);
        events.push({
          type,
          text: raw,
          messageId: currentMessageId,
          ...(currentMessageId && positions.has(currentMessageId)
            ? { messageNumber: positions.get(currentMessageId) } : {})
        });
      }
    }
    return {
      source: 'mounted-rulebook-status-dividers',
      capturedAt: new Date().toISOString(),
      coverage: 'currently-mounted-chat-only',
      complete: false,
      mountedMessages: messageRoots.length,
      events
    };
  }

  function plainRulebookState(state) {
    const lines = [
      'Source: Rulebook status updates visible in currently mounted chat messages',
      'Coverage: mounted chat only; API-fetched older messages do not contain these divider events',
      'Complete Rulebook state backup: no',
      `Captured: ${state?.capturedAt || 'unknown'}`
    ];
    const events = Array.isArray(state?.events) ? state.events : [];
    if (!events.length) lines.push('No Rulebook status updates found in mounted chat.');
    for (const event of events) {
      const position = event.messageNumber ? ` #${event.messageNumber}` : '';
      lines.push(`Message${position} [${event.messageId || 'unknown'}] (${event.type}): ${event.text}`);
    }
    return lines.join('\n');
  }

  async function buildExportData(settings, messageOverride = null, captureStatus = null) {
    const messages = Array.isArray(messageOverride) ? messageOverride.map(message => ({ ...message })) : collectMessages(settings);
    const metadata = await loadGenerationMetadata();
    for (const message of messages) {
      const captured = metadata[message.id] || null;
      if (captured && message.createdAt && !captured.createdAt) {
        message.metadata = { ...captured, createdAt: message.createdAt };
      } else if (captured) {
        message.metadata = captured;
      } else {
        message.metadata = message.createdAt ? { createdAt: message.createdAt } : null;
      }
    }
    return {
      exportedAt: new Date().toISOString(),
      chatUrl: location.href,
      botInfo: await collectAvailableBotInfo(),
      rulebook: settings.chatExportIncludeRulebook === true ? (DS.snapshotVisibleRulebook?.() || null) : null,
      rulebookState: settings.chatExportIncludeRulebookState === true ? collectVisibleRulebookState(messages) : null,
      appearanceTemplate: captureAppearanceTemplate(),
      messages,
      olderMessagesAvailable: !!findLoadPreviousMessagesButton(),
      captureStatus: captureStatus ? {...captureStatus,messages:undefined,session:undefined} : null,
      includesOocDirectives: settings.chatExportIncludeOocDirectives === true
    };
  }

  function plainBotInfo(botInfo) {
    const lines = [];
    if (botInfo.name) lines.push(`Name: ${botInfo.name}`);
    if (botInfo.creator) lines.push(`Creator: ${botInfo.creator}`);
    if (botInfo.profileUrl) lines.push(`Profile: ${botInfo.profileUrl}`);
    if (botInfo.tags.length) lines.push(`Tags: ${botInfo.tags.join(", ")}`);
    if (botInfo.createdAt) lines.push(`Created: ${new Date(botInfo.createdAt).toLocaleString()}`);
    if (botInfo.visibility) lines.push(`Visibility: ${botInfo.visibility}`);
    if (botInfo.source) lines.push(`Bot info source: ${botInfo.source}`);
    for (const [label, value] of [["Greeting", botInfo.greeting], ["Alternate greetings", (botInfo.alternateGreetings || []).join("\n\n---\n\n")], ["Visible intro", botInfo.intro], ["Description", botInfo.description], ["Personality", botInfo.personality], ["Scenario", botInfo.scenario], ["Example dialogue", botInfo.examples], ["Lorebook", botInfo.lorebook], ["Definition", botInfo.definition]]) {
      if (value) lines.push(`\n${label}:\n${value}`);
    }
    return lines.join("\n").trim();
  }

  function plainRulebook(rulebook) {
    return [rulebook.name ? `Name: ${rulebook.name}` : "Name: not exposed by visible HUD",
      ...(rulebook.id ? [`ID: ${rulebook.id}`] : []),
      ...(rulebook.status ? [`Status: ${rulebook.status}`] : []),
      `Captured: ${rulebook.capturedAt}`,
      ...rulebook.meters.map(m => `${m.label}: ${m.value ?? "unknown"}`)].join("\n");
  }

  function makePlainText(data, opts) {
    const parts = [`SpicyChat Export`, `Exported: ${new Date(data.exportedAt).toLocaleString()}`, `Chat: ${data.chatUrl}`];
    if (data.captureStatus?.source === "api" && !data.captureStatus.complete) parts.push(`History completeness: unverified (${data.captureStatus.reason || "API capture"}; ${data.captureStatus.rawUniqueCount ?? data.messages.length} unique API rows; ${data.captureStatus.expectedCount || "unknown"} reported).`);
    if (opts.includeBotInfo) parts.push(`BOT INFO\n${plainBotInfo(data.botInfo)}`);
    if (opts.includeRulebook && data.rulebook) parts.push(`RULEBOOK SNAPSHOT (at export, not message history)\n${plainRulebook(data.rulebook)}`);
    if (opts.includeRulebookState && data.rulebookState) parts.push(`RULEBOOK STATE UPDATES (mounted messages only)\n${plainRulebookState(data.rulebookState)}`);
    const messages = data.messages.map((message, index) => {
      const number = opts.numberMessages ? `${index + 1 + Number(opts.offset || 0)}. ` : "";
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      const images = opts.includeImageLinks && message.images?.length
        ? `\nImage links:\n${message.images.map(url => `- ${url}`).join('\n')}` : '';
      return `${number}${message.speaker}${meta.length ? ` [${meta.join(" · ")}]` : ""}\n${message.text}${images}`;
    });
    if (opts.bodyOnly) return messages.join("\n\n");
    parts.push(`MESSAGES\n${messages.join("\n\n") || "No chat messages found."}`);
    return parts.join("\n\n---\n\n");
  }

  function escapeMd(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/([`])/g, "\\$1");
  }

  function makeMarkdown(data, opts) {
    const parts = ["# SpicyChat Export", `- Exported: ${new Date(data.exportedAt).toLocaleString()}`, `- Chat: ${data.chatUrl}`];
    if (data.captureStatus?.source === "api" && !data.captureStatus.complete) parts.push(`- History completeness: unverified (${data.captureStatus.reason || "API capture"}; ${data.captureStatus.rawUniqueCount ?? data.messages.length} unique API rows; ${data.captureStatus.expectedCount || "unknown"} reported).`);
    if (opts.includeBotInfo) {
      parts.push("## Bot info");
      if (data.botInfo.name) parts.push(`**Name:** ${escapeMd(data.botInfo.name)}`);
      if (data.botInfo.creator) parts.push(`**Creator:** ${escapeMd(data.botInfo.creator)}`);
      if (data.botInfo.profileUrl) parts.push(`**Profile:** ${data.botInfo.profileUrl}`);
      if (data.botInfo.tags.length) parts.push(`**Tags:** ${data.botInfo.tags.map(escapeMd).join(", ")}`);
      if (data.botInfo.createdAt) parts.push(`**Created:** ${escapeMd(new Date(data.botInfo.createdAt).toLocaleString())}`);
      if (data.botInfo.visibility) parts.push(`**Visibility:** ${escapeMd(data.botInfo.visibility)}`);
      if (data.botInfo.source) parts.push(`**Bot info source:** ${escapeMd(data.botInfo.source)}`);
      for (const [label, value] of [["Greeting", data.botInfo.greeting], ["Alternate greetings", (data.botInfo.alternateGreetings || []).join("\n\n---\n\n")], ["Visible intro", data.botInfo.intro], ["Description", data.botInfo.description], ["Personality", data.botInfo.personality], ["Scenario", data.botInfo.scenario], ["Example dialogue", data.botInfo.examples], ["Lorebook", data.botInfo.lorebook], ["Definition", data.botInfo.definition]]) {
        if (value) parts.push(`### ${label}\n\n${value}`);
      }
    }
    if (opts.includeRulebook && data.rulebook) parts.push(`## Rulebook snapshot (at export)\n\n${escapeMd(plainRulebook(data.rulebook))}`);
    if (opts.includeRulebookState && data.rulebookState) parts.push(`## Rulebook state updates (mounted messages only)\n\n${escapeMd(plainRulebookState(data.rulebookState))}`);
    parts.push("## Messages");
    const messageStart = parts.length;
    data.messages.forEach((message, index) => {
      const prefix = opts.numberMessages ? `${index + 1 + Number(opts.offset || 0)}. ` : "";
      parts.push(`### ${prefix}${escapeMd(message.speaker)}`);
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      if (meta.length) parts.push(`*${meta.map(escapeMd).join(" · ")}*`);
      parts.push(message.text);
      if (opts.includeImageLinks && message.images?.length)
        parts.push(`Image links:\n${message.images.map(url => `- ${escapeMd(url)}`).join('\n')}`);
    });
    if (!data.messages.length) parts.push("No chat messages found.");
    return (opts.bodyOnly ? parts.slice(messageStart) : parts).join("\n\n");
  }

  function jsonMessageEntry(message, opts, index) {
    return {
      number: opts.numberMessages ? index + 1 : undefined,
      id: message.id || undefined,
      createdAt: message.createdAt || message.metadata?.createdAt || undefined,
      speaker: message.speaker, role: message.role || undefined, text: message.text,
      avatar: opts.includeAvatars ? message.avatar || undefined : undefined,
      images: opts.includeImageLinks && message.images?.length ? message.images : undefined,
      generation: opts.includeGenerationDetails ? message.metadata || undefined : undefined
    };
  }

  function jsonData(data, opts) {
    return JSON.stringify({
      format: "SpicyChat QoL chat export",
      version: 2,
      censored: opts.censored === true ? true : undefined,
      exportedAt: data.exportedAt,
      chatUrl: data.chatUrl,
      bot: opts.includeBotInfo ? data.botInfo : undefined,
      rulebookSnapshot: opts.includeRulebook ? (data.rulebook || undefined) : undefined,
      rulebookState: opts.includeRulebookState ? (data.rulebookState || undefined) : undefined,
      history: data.captureStatus ? {
        source: data.captureStatus.source || undefined,
        requestedSource: data.captureStatus.requestedSource || undefined,
        complete: data.captureStatus.complete === true,
        includesOocDirectives: data.includesOocDirectives === true,
        expectedCount: data.captureStatus.expectedCount || undefined,
        completeness: data.captureStatus.completeness,
        rawUniqueCount: data.captureStatus.rawUniqueCount,
        rawRowsSeen: data.captureStatus.rawRowsSeen,
        rawCountDifference: data.captureStatus.rawCountDifference,
        duplicateRawRows: data.captureStatus.duplicateRawRows,
        missingRawIds: data.captureStatus.missingRawIds,
        filteredCount: data.captureStatus.filteredCount,
        countChanged: data.captureStatus.countChanged,
        messageCount: data.messages.length,
        pages: data.captureStatus.pages || undefined,
        pageLimit: data.captureStatus.limit || undefined,
        elapsedMs: data.captureStatus.elapsedMs || undefined,
        elapsedTimingKind: data.captureStatus.checkpoint ? 'legacy-cumulative-session-wall' : undefined,
        originalRetrievalMs: data.captureStatus.originalRetrievalMs ?? undefined,
        retrievalElapsedMs: data.captureStatus.retrievalElapsedMs ?? undefined,
        currentSessionTimings: data.captureStatus.currentSessionTimings,
        reason: data.captureStatus.reason || undefined,
        nativeClicks: data.captureStatus.clicked || undefined,
        nativeRequests: data.captureStatus.nativeRequests || undefined,
        nativeSuccesses: data.captureStatus.nativeSuccesses || undefined,
        nativeAuthRaces: data.captureStatus.authRaces || undefined,
        nativeAuthRefreshes: data.captureStatus.authRefreshes || undefined,
        nativeResumes: data.captureStatus.resumes || undefined,
        jobId: data.captureStatus.jobId || undefined,
        checkpointAt: data.captureStatus.checkpointAt || undefined,
        lastReportedCount: data.captureStatus.lastReportedCount || undefined,
        headChanged: data.captureStatus.headChanged,
        chainLinksChecked: data.captureStatus.linksChecked,
        chainLinkContradictions: data.captureStatus.chainBreaks,
        verificationEvidence: data.captureStatus.verificationEvidence,
        savedChainAudit: data.captureStatus.savedChainAudit,
        incrementalSnapshot: data.captureStatus.incrementalSnapshot,
        incrementalRuns: data.captureStatus.incrementalRuns,
        initialExpectedCount: data.captureStatus.initialExpectedCount,
        initialRawUniqueCount: data.captureStatus.initialRawUniqueCount,
        requestMs: data.captureStatus.requestMs,
        checkpointMs: data.captureStatus.checkpointMs,
        chainVerificationCpuMs: data.captureStatus.chainVerificationCpuMs,
        checkpointWriteUnconfirmed: data.captureStatus.checkpointWriteUnconfirmed,
        retries: data.captureStatus.retries,
        authRefreshes: data.captureStatus.authRefreshes
      } : undefined,
      messages: data.messages.map((message, index) => jsonMessageEntry(message, opts, index))
    }, null, 2);
  }

  function escapeHtmlText(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function richTextHtml(value) {
    let html = escapeHtmlText(value);

    // The exported message text keeps the same lightweight Markdown markers
    // SpicyChat uses for bold, italics, strike-through and code.
    const fenced = [];
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      const index = fenced.push(`<pre><code>${code.replace(/^\n|\n$/g, "")}</code></pre>`) - 1;
      return `@@DS_CODE_${index}@@`;
    });
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/@@DS_CODE_(\d+)@@/g, (_, index) => fenced[Number(index)] || "");
    return html;
  }

  function cssExportValue(value, fallback) {
    const text = String(value || "").replace(/[{}<>]/g, "").replace(/;+/g, " ").trim();
    return text || fallback;
  }

  function makeHtml(data, opts) {
    const bot = data.botInfo || {};
    const appearance = data.appearanceTemplate || {};
    const bodyStyle = appearance.body || {};
    const botStyle = appearance.bot || {};
    const userStyle = appearance.user || {};
    const codeStyle = appearance.code || {};
    const matched = opts.layout !== "transcript";
    const vars = matched ? `
      --ds-export-page-bg:${cssExportValue(bodyStyle.background, "#0b0b0d")};
      --ds-export-page-text:${cssExportValue(bodyStyle.color, "#eee")};
      --ds-export-font:${cssExportValue(bodyStyle.fontFamily, "system-ui,-apple-system,Segoe UI,sans-serif")};
      --ds-export-font-size:${cssExportValue(bodyStyle.fontSize, "15px")};
      --ds-export-line-height:${cssExportValue(bodyStyle.lineHeight, "1.5")};
      --ds-export-bot-bg:${cssExportValue(botStyle.background, "#17171b")};
      --ds-export-bot-text:${cssExportValue(botStyle.color, bodyStyle.color || "#eee")};
      --ds-export-bot-border:${cssExportValue(botStyle.borderColor, "#292930")};
      --ds-export-bot-border-width:${cssExportValue(botStyle.borderWidth, "1px")};
      --ds-export-bot-border-style:${cssExportValue(botStyle.borderStyle, "solid")};
      --ds-export-bot-radius:${cssExportValue(botStyle.borderRadius, "16px")};
      --ds-export-user-bg:${cssExportValue(userStyle.background, "#163241")};
      --ds-export-user-text:${cssExportValue(userStyle.color, bodyStyle.color || "#fff")};
      --ds-export-user-border:${cssExportValue(userStyle.borderColor, "transparent")};
      --ds-export-user-border-width:${cssExportValue(userStyle.borderWidth, "1px")};
      --ds-export-user-border-style:${cssExportValue(userStyle.borderStyle, "solid")};
      --ds-export-user-radius:${cssExportValue(userStyle.borderRadius, "16px")};
      --ds-export-code-bg:${cssExportValue(codeStyle.background, "#24242b")};
      --ds-export-code-text:${cssExportValue(codeStyle.color, bodyStyle.color || "#eee")};
      --ds-export-code-border:${cssExportValue(codeStyle.borderColor, "transparent")};
      --ds-export-code-radius:${cssExportValue(codeStyle.borderRadius, "5px")};` : "";
    const avatarIndex = new Map();
    const avatarUrls = [];
    if (opts.includeAvatars) {
      for (const message of data.messages) {
        const url = String(message.avatar || "").trim();
        if (!url || avatarIndex.has(url)) continue;
        avatarIndex.set(url, avatarUrls.length);
        avatarUrls.push(url);
      }
    }
    const cssUrl = value => String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/[\r\n]/g, "").replace(/</g, "%3C").replace(/>/g, "%3E");
    const avatarCss = avatarUrls.map((url, index) => `.avatar-${index}{background-image:url("${cssUrl(url)}")}`).join("");
    const infoBlocks = opts.includeBotInfo ? `
      <section class="bot-info">
        <h2>${escapeHtmlText(bot.name || "Bot")}</h2>
        ${bot.creator ? `<p class="muted">${escapeHtmlText(bot.creator)}</p>` : ""}
        ${bot.tags?.length ? `<div class="tags">${bot.tags.map(tag => `<span>${escapeHtmlText(tag)}</span>`).join("")}</div>` : ""}
        ${[["Description", bot.description], ["Personality", bot.personality], ["Scenario", bot.scenario], ["Lorebook", bot.lorebook], ["Definition", bot.definition]].filter(([,v]) => v).map(([label,v]) => `<details><summary>${label}</summary><div>${richTextHtml(v)}</div></details>`).join("")}
      </section>` : "";
    const rulebookBlock = opts.includeRulebook && data.rulebook ? `<section class="bot-info"><h2>Rulebook snapshot (at export)</h2><pre>${escapeHtmlText(plainRulebook(data.rulebook))}</pre></section>` : "";
    const rulebookStateBlock = opts.includeRulebookState && data.rulebookState ? `<section class="bot-info"><h2>Rulebook state updates (mounted messages only)</h2><pre>${escapeHtmlText(plainRulebookState(data.rulebookState))}</pre></section>` : "";
    const messages = data.messages.map((message, index) => {
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      const role = ["user", "human"].includes(String(message.role || "").toLowerCase()) ? "user" : "bot";
      const avatarId = opts.includeAvatars ? avatarIndex.get(String(message.avatar || "").trim()) : undefined;
      const avatar = Number.isInteger(avatarId) ? (opts.streamAvatars
        ? `<span class="avatar" style="${escapeHtmlText(`background-image:url("${cssUrl(message.avatar)}")`)}" aria-hidden="true"></span>`
        : `<span class="avatar avatar-${avatarId}" aria-hidden="true"></span>`) : "";
      const linkedImages = opts.includeImageLinks && message.images?.length
        ? `<div class="message-images">Image links: ${message.images.map((url, i) => `<a href="${escapeHtmlText(url)}" target="_blank" rel="noopener noreferrer">Image ${i + 1}</a>`).join(' · ')}</div>` : '';
      const messageId = escapeHtmlText(message.id || "");
      const createdAt = Number(message.createdAt || message.metadata?.createdAt || 0) || 0;
      return `<article class="message ${matched ? "match" : "transcript"} role-${role}"${messageId ? ` data-message-id="${messageId}"` : ""}${createdAt ? ` data-created-at="${createdAt}"` : ""}>
        <header>${avatar}<div><strong>${opts.numberMessages ? `${index + 1 + Number(opts.offset || 0)}. ` : ""}${escapeHtmlText(message.speaker)}</strong>${meta.length ? `<small>${escapeHtmlText(meta.join(" · "))}</small>` : ""}</div></header>
        <div class="body">${richTextHtml(message.text)}${linkedImages}</div>
      </article>`;
    }).join("\n");
    if (opts.bodyOnly) return messages;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlText(bot.name || "SpicyChat")} chat export</title><style>
      :root{color-scheme:dark;${vars}}*{box-sizing:border-box}body{margin:0;background:${matched ? "var(--ds-export-page-bg)" : "#0b0b0d"};color:${matched ? "var(--ds-export-page-text)" : "#eee"};font:${matched ? "var(--ds-export-font-size)/var(--ds-export-line-height) var(--ds-export-font)" : "15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif"}}main{max-width:900px;margin:auto;padding:28px 18px 60px}h1,h2{margin:.2em 0}.muted,small{color:#aaa}.export-meta{margin-bottom:18px;color:#999}.bot-info{padding:16px;border:1px solid #2b2b31;border-radius:14px;background:#141417;margin-bottom:22px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.tags span{background:#24242b;padding:3px 8px;border-radius:999px;font-size:12px}details{margin-top:8px;border-top:1px solid #2b2b31;padding-top:8px}summary{cursor:pointer}.messages{display:flex;flex-direction:column;gap:14px}.message{break-inside:avoid}.message header{display:flex;gap:10px;align-items:center;margin-bottom:7px}.message header .avatar{width:38px;height:38px;flex:0 0 38px;background-size:cover;background-position:center;border-radius:9px}${avatarCss}.message header div{display:flex;flex-direction:column}.message.match{padding:14px 16px;max-width:min(100%,650px)}.message.match.role-bot{align-self:flex-start;background:var(--ds-export-bot-bg);color:var(--ds-export-bot-text);border:var(--ds-export-bot-border-width) var(--ds-export-bot-border-style) var(--ds-export-bot-border);border-radius:var(--ds-export-bot-radius)}.message.match.role-user{align-self:flex-end;background:var(--ds-export-user-bg);color:var(--ds-export-user-text);border:var(--ds-export-user-border-width) var(--ds-export-user-border-style) var(--ds-export-user-border);border-radius:var(--ds-export-user-radius)}.message.transcript{padding:10px 0;border-bottom:1px solid #24242a;border-radius:0;background:none}.message-images{font-size:.85em;margin-top:8px;overflow-wrap:anywhere}.message-images a{color:#85bdff;text-decoration:underline}.body{white-space:normal;overflow-wrap:anywhere}.body code{padding:.08em .34em;background:var(--ds-export-code-bg,#24242b);color:var(--ds-export-code-text,inherit);border:1px solid var(--ds-export-code-border,transparent);border-radius:var(--ds-export-code-radius,5px);font:inherit;box-decoration-break:clone;-webkit-box-decoration-break:clone}.body pre code{display:block;padding:10px;white-space:pre-wrap}@media print{:root{color-scheme:light}body{background:#fff;color:#111}.bot-info,.message.match{background:#fff!important;color:#111!important;border-color:#ccc!important}.muted,small,.export-meta{color:#555}.tags span{background:#eee}.message.transcript{border-color:#ddd}main{max-width:none;padding:0}}
    </style></head><body><main><h1>SpicyChat Export</h1><div class="export-meta">Exported ${escapeHtmlText(new Date(data.exportedAt).toLocaleString())} · ${escapeHtmlText(data.chatUrl)}</div>${data.captureStatus?.source === "api" && !data.captureStatus.complete ? `<p class="export-meta">${escapeHtmlText(`History completeness: unverified (${data.captureStatus.reason || "API capture"}; ${data.captureStatus.rawUniqueCount ?? data.messages.length} unique API rows; ${data.captureStatus.expectedCount || "unknown"} reported).`)}</p>` : ""}${infoBlocks}${rulebookBlock}${rulebookStateBlock}<section class="messages">${messages || "<p>No chat messages found.</p>"}</section></main></body></html>`;
  }

  function safeBaseName(value) {
    return cleanText(value).replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "spicychat";
  }

  function renderFormat(data, opts) {
    // Only transform an in-memory export copy. Never touch API history or native messages.
    if (opts.censored && typeof DS.censorChatExportText === "function") {
      data = { ...data, messages: (data.messages || []).map(message => ({ ...message,
        text: DS.censorChatExportText(message.text, message.role || message.speaker) })) };
    }
    if (opts.format === "markdown") return { text: makeMarkdown(data, opts), mime: "text/markdown;charset=utf-8", ext: "md" };
    if (opts.format === "json" || opts.format === "json.gz") return { text: jsonData(data, opts), mime: "application/json;charset=utf-8", ext: "json" };
    if (opts.format === "html") return { text: makeHtml(data, opts), mime: "text/html;charset=utf-8", ext: "html" };
    return { text: makePlainText(data, opts), mime: "text/plain;charset=utf-8", ext: "txt" };
  }

  function createCaptureSession(settings, initialMessages = []) {
    const session = {
      settings, byId: new Map(), order: [], orderSet: new Set(), cancelled: false, clicked: 0, stalled: 0,
      nativeStats: { runs: 0, requests: 0, successes: 0, retries: 0, authRaces: 0, authRefreshes: 0, authRefreshTimeouts: 0 }
    };
    for (const message of initialMessages) {
      const id = message.id || `fallback:${message.speaker}:${message.text}`;
      if (!session.byId.has(id)) {
        session.byId.set(id, { ...message, id: message.id || "" });
        session.order.push(id);
        session.orderSet.add(id);
      }
    }
    return session;
  }

  function mergeCapturedMessages(session, rootsOverride = null) {
    const allRoots = getMessageRoots();
    const parseRoots = Array.isArray(rootsOverride) ? rootsOverride : allRoots;
    const current = collectMessages(session.settings, parseRoots);
    const orderSet = session.orderSet instanceof Set ? session.orderSet : (session.orderSet = new Set(session.order));

    for (const message of current) {
      const id = message.id || `fallback:${message.speaker}:${message.text}`;
      session.byId.set(id, { ...message, id: message.id || "" });
    }

    const currentIds = allRoots
      .map(root => String(root?.id || "").replace(/^message-/, ""))
      .filter(id => id && session.byId.has(id));

    for (let i = 0; i < currentIds.length; i++) {
      const id = currentIds[i];
      if (orderSet.has(id)) continue;

      let nextKnown = null;
      for (let j = i + 1; j < currentIds.length; j++) {
        if (orderSet.has(currentIds[j])) {
          nextKnown = currentIds[j];
          break;
        }
      }
      if (nextKnown) {
        session.order.splice(session.order.indexOf(nextKnown), 0, id);
        orderSet.add(id);
        continue;
      }

      let prevKnown = null;
      for (let j = i - 1; j >= 0; j--) {
        if (orderSet.has(currentIds[j])) {
          prevKnown = currentIds[j];
          break;
        }
      }
      if (prevKnown) session.order.splice(session.order.indexOf(prevKnown) + 1, 0, id);
      else session.order.push(id);
      orderSet.add(id);
    }

    for (const message of current) {
      if (message.id) continue;
      const id = `fallback:${message.speaker}:${message.text}`;
      if (orderSet.has(id)) continue;
      session.order.push(id);
      orderSet.add(id);
    }

    return session.order.map(id => session.byId.get(id)).filter(Boolean);
  }

  function capturedMessagesFromSession(session) {
    return session.order.map(id => session.byId.get(id)).filter(Boolean);
  }

  function mergeCapturedNativeBatch(session, roots) {
    const parsed = collectMessagesFast(session.settings, roots);
    const orderSet = session.orderSet instanceof Set ? session.orderSet : (session.orderSet = new Set(session.order));
    const newIds = [];

    for (const message of parsed) {
      const id = message.id || `fallback:${message.speaker}:${message.text}`;
      session.byId.set(id, { ...message, id: message.id || "" });
      if (!orderSet.has(id)) {
        newIds.push(id);
        orderSet.add(id);
      }
    }

    if (newIds.length) session.order.unshift(...newIds);
    return capturedMessagesFromSession(session);
  }

  function beginExportLock() {
    if (DS.state.chatExportLock?.active) return null;
    const lock = { active: true, cancelled: false, url: location.href };
    DS.state.chatExportLock = lock;
    document.documentElement.dataset.dsChatExporting = "1";
    return lock;
  }

  function endExportLock(lock) {
    if (lock && DS.state.chatExportLock === lock) {
      lock.active = false;
      DS.state.chatExportLock = null;
    }
    document.documentElement.removeAttribute("data-ds-chat-exporting");
  }

  function findLoadPreviousMessagesButton({ readyOnly = false } = {}) {
    // Prefer SpicyChat's translation marker so long native exports do not scan
    // every message action button on every readiness check.
    const keyed = document.querySelector("[data-translate-key='chat:page.action.loadPreviousMessages']")?.closest?.("button") || null;
    if (keyed?.isConnected) {
      if (!readyOnly || (!keyed.disabled && keyed.getAttribute("aria-disabled") !== "true")) return keyed;
      return null;
    }

    // Text fallback for markup/localization changes. This is intentionally only
    // used when the stable translation marker is absent.
    return qsa("button").find(button => {
      const text = norm(button.textContent);
      if (!text.includes("load previous messages")) return false;
      if (!readyOnly) return true;
      return !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }) || null;
  }

  function messageRootsFromMutationNode(node) {
    if (!(node instanceof Element)) return [];
    const roots = [];
    if (node.matches?.("div[id^='message-']")) roots.push(node);
    node.querySelectorAll?.("div[id^='message-']").forEach(root => roots.push(root));
    return roots.filter(root => !root.parentElement?.closest?.("div[id^='message-']"));
  }

  function sortMessageRootsInDomOrder(roots) {
    return [...new Set((roots || []).filter(root => root?.isConnected))].sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
  }

  function getUncapturedNativeRoots(knownIds) {
    const root = getRoot();
    const out = [];
    root?.querySelectorAll?.("div[id^='message-']").forEach(message => {
      if (message.parentElement?.closest?.("div[id^='message-']")) return;
      const id = String(message.id || "").replace(/^message-/, "");
      if (!id || knownIds.has(id)) return;
      out.push(message);
    });
    return sortMessageRootsInDomOrder(out);
  }

  function nativeHistoryAttr(name) {
    return Math.max(0, Number(document.documentElement?.getAttribute(name) || 0) || 0);
  }

  function nativeHistoryTelemetry() {
    return {
      requestSeq: nativeHistoryAttr("data-ds-chat-history-main-seq"),
      requestAt: nativeHistoryAttr("data-ds-chat-history-main-at"),
      responseSeq: nativeHistoryAttr("data-ds-chat-history-main-response-seq"),
      responseRequestSeq: nativeHistoryAttr("data-ds-chat-history-main-response-request-seq"),
      responseStatus: nativeHistoryAttr("data-ds-chat-history-main-response-status"),
      responseAt: nativeHistoryAttr("data-ds-chat-history-main-response-at"),
      responseMs: nativeHistoryAttr("data-ds-chat-history-main-response-ms"),
      successes: nativeHistoryAttr("data-ds-chat-history-main-successes"),
      auth401s: nativeHistoryAttr("data-ds-chat-history-main-auth-401s"),
      authAt: nativeHistoryAttr("data-ds-card-token-main-auth-at"),
      hasAuth: document.documentElement?.getAttribute("data-ds-card-token-main-auth") === "1"
    };
  }

  function nativeHistoryRequestSeq() {
    return nativeHistoryTelemetry().requestSeq;
  }

  function nativeHistoryTiming({ attempt = 0, mountedMessages = 0, recentRequestMs = 0 } = {}) {
    const mounted = Math.max(0, Number(mountedMessages || 0));
    const recent = Math.max(0, Number(recentRequestMs || 0));
    const pressureMs = Math.min(18000, Math.floor(mounted / 500) * 2200);
    const networkBase = Math.max(9000, Math.min(22000, recent > 0 ? recent * 4 + 3500 : 9000));
    const retryExtra = Math.min(12000, Math.max(0, Number(attempt || 0)) * 3000);
    return {
      responseTimeoutMs: Math.min(60000, networkBase + pressureMs + retryExtra),
      renderQuietMs: Math.min(2600, 900 + Math.floor(mounted / 500) * 180),
      buttonGoneMs: Math.min(5000, 1800 + Math.floor(mounted / 500) * 250),
      buttonReturnMs: Math.min(10000, 2200 + Math.floor(mounted / 500) * 650),
      readyButtonMs: Math.min(30000, 8000 + pressureMs + retryExtra),
      authRefreshMs: Math.min(30000, 10000 + Math.floor(mounted / 500) * 1200 + retryExtra)
    };
  }

  async function waitForNativeAuthRefresh(afterTs, timeoutMs) {
    const refreshed = await waitFor(() => {
      const state = nativeHistoryTelemetry();
      return state.hasAuth && state.authAt > Number(afterTs || 0) ? state : null;
    }, timeoutMs, 180);
    return refreshed || null;
  }

  function clickAndWaitForNativeBatch(button, knownIds, { synthetic = false, attempt = 0 } = {}) {
    return new Promise(resolve => {
      let finished = false;
      let clicked = false;
      let sawBusyState = false;
      let sawButtonReplacement = false;
      let buttonGoneAt = 0;
      let lastAddedAt = 0;
      let observedRequestSeq = 0;
      let observedResponse = null;
      const before = nativeHistoryTelemetry();
      const added = new Map();
      const mountedMessages = document.querySelectorAll("div[id^='message-']").length;
      const timing = nativeHistoryTiming({ attempt, mountedMessages, recentRequestMs: before.responseMs });

      // Re-query immediately before the click. React replaces this button after
      // each history page, and Native resume/retry must always target the live
      // control rather than a detached element from the previous page.
      let activeButton = findLoadPreviousMessagesButton({ readyOnly: true });
      if (!activeButton && button?.isConnected && !button.disabled && button.getAttribute("aria-disabled") !== "true") activeButton = button;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        try { observer.disconnect(); } catch {}
      };
      const finish = (progressed, extra = {}) => {
        if (finished) return;
        const current = findLoadPreviousMessagesButton();
        const after = nativeHistoryTelemetry();
        cleanup();
        resolve({
          progressed,
          clicked,
          requestObserved: after.requestSeq > before.requestSeq,
          responseObserved: after.responseSeq > before.responseSeq,
          nativeRequestDelta: Math.max(0, after.requestSeq - before.requestSeq),
          nativeSuccessDelta: Math.max(0, after.successes - before.successes),
          nativeAuth401Delta: Math.max(0, after.auth401s - before.auth401s),
          requestSeq: observedRequestSeq || (after.requestSeq > before.requestSeq ? after.requestSeq : 0),
          httpStatus: Number(observedResponse?.responseStatus || 0) || 0,
          responseAt: Number(observedResponse?.responseAt || 0) || 0,
          responseMs: Number(observedResponse?.responseMs || 0) || 0,
          authRace: Number(observedResponse?.responseStatus || 0) === 401,
          sawBusyState,
          sawButtonReplacement,
          buttonGone: !current,
          buttonReady: !!current && !current.disabled && current.getAttribute("aria-disabled") !== "true",
          addedRoots: sortMessageRootsInDomOrder([...added.values()]),
          timing,
          ...extra
        });
      };
      const inspectAdded = node => {
        for (const root of messageRootsFromMutationNode(node)) {
          const id = String(root?.id || "").replace(/^message-/, "");
          if (!id || knownIds.has(id) || added.has(id)) continue;
          added.set(id, root);
          lastAddedAt = Date.now();
        }
      };
      const check = () => {
        if (finished) return;
        const current = findLoadPreviousMessagesButton();
        const telemetry = nativeHistoryTelemetry();
        if (telemetry.requestSeq > before.requestSeq && !observedRequestSeq) observedRequestSeq = telemetry.requestSeq;

        if (observedRequestSeq && telemetry.responseSeq > before.responseSeq && telemetry.responseRequestSeq === observedRequestSeq) {
          observedResponse = telemetry;
          if (telemetry.responseStatus === 401) return finish(false, { authRace: true });
          if (telemetry.responseStatus >= 400 || telemetry.responseStatus === 0) {
            return finish(false, { httpError: telemetry.responseStatus || 0 });
          }
        }

        if (!current) {
          if (!buttonGoneAt) buttonGoneAt = Date.now();
        } else {
          buttonGoneAt = 0;
          if (current !== activeButton) sawButtonReplacement = true;
          if (current.disabled || current.getAttribute("aria-disabled") === "true") sawBusyState = true;
        }

        const now = Date.now();
        const quietFor = lastAddedAt ? now - lastAddedAt : 0;
        const currentReady = !!current && !current.disabled && current.getAttribute("aria-disabled") !== "true";
        const requestObserved = !!observedRequestSeq;
        const responseSucceeded = !!observedResponse && observedResponse.responseStatus >= 200 && observedResponse.responseStatus < 400;

        // New IDs are authoritative progress. On huge DOMs React can take much
        // longer to settle, so the quiet window grows with mounted-message load.
        if (added.size && quietFor >= timing.renderQuietMs && (currentReady || (buttonGoneAt && now - buttonGoneAt >= timing.buttonGoneMs))) {
          return finish(true);
        }

        // A disappearing button is only accepted as the end of active history
        // after a real successful SpicyChat history response, never after a 401.
        if (!added.size && requestObserved && responseSucceeded && buttonGoneAt && now - buttonGoneAt >= timing.buttonGoneMs) {
          return finish(true);
        }
      };

      const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            for (const node of mutation.addedNodes || []) inspectAdded(node);
          }
          if (mutation.type === "attributes") check();
        }
        check();
      });
      observer.observe(getRoot() || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["disabled", "aria-disabled"]
      });

      const pollTimer = setInterval(check, 250);
      const timeoutTimer = setTimeout(() => finish(added.size > 0, { timedOut: true }), timing.responseTimeoutMs);

      clicked = clickPreviousMessagesButton(activeButton, { synthetic });
      if (!clicked) finish(false, { clickFailed: true });
    });
  }


  function clickPreviousMessagesButton(button, { synthetic = false } = {}) {
    if (!button || !button.isConnected) return false;

    try {
      if (synthetic && typeof DS.realClick === "function") {
        DS.realClick(button, { scroll: false });
      } else {
        // Native .click() is the least invasive path for SpicyChat's React
        // handler and does not move the user's scroll position.
        button.click();
      }
      return true;
    } catch {
      return false;
    }
  }


  function chatRouteIds() {
    const parts = location.pathname.split("/").filter(Boolean);
    const chatIndex = parts.indexOf("chat");
    if (chatIndex < 0) return { characterId: "", conversationId: "" };
    return {
      characterId: String(parts[chatIndex + 1] || "").trim().toLowerCase(),
      conversationId: String(parts[chatIndex + 2] || "").trim().toLowerCase()
    };
  }

  function normalizeApiAvatar(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return `${location.origin}${raw}`;
    return `${location.origin}/${raw.replace(/^\/+/, "")}`;
  }

  function apiHistoryMessages(data, settings, fallbackBotName, cachedVisibleBot = null) {
    const rows = Array.isArray(data?.messages) ? data.messages : [];
    const personaName = cleanInline(data?.userPersona?.name || "You") || "You";
    const userAvatar = normalizeApiAvatar(data?.userPersona?.avatar_url || data?.userPersona?.avatarUrl);
    const visibleBot = cachedVisibleBot || collectBotInfo();
    const botName = cleanInline(fallbackBotName || visibleBot?.name || "Bot") || "Bot";
    const botAvatar = normalizeApiAvatar(visibleBot?.avatar || "");

    return rows.map(row => {
      const role = String(row?.role || "").toLowerCase();
      const isUser = role === "user" || role === "human";
      const rawContent = row?.content || row?.text || row?.message || "";
      const text = cleanMessageText(typeof rawContent === 'string' ? rawContent : '');
      const images = collectExportImageLinks(row, typeof rawContent === 'string' ? rawContent : '');
      return {
        id: String(row?.id || "").trim(),
        speaker: isUser ? personaName : botName,
        text,
        avatar: isUser ? userAvatar : botAvatar,
        images,
        createdAt: Number(row?.createdAt || row?.created_at || 0) || null,
        role: role || (isUser ? "user" : "bot")
      };
    }).filter(message => {
      if (!message.text && !message.images?.length) return false;
      if (!settings.chatExportIncludeOocDirectives && !["user", "human", "bot", "assistant", "character"].includes(message.role)) return false;
      return true;
    });
  }

  function apiRowStartsConversation(row) {
    if (!row || typeof row !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(row, "prev_id")) return row.prev_id == null || String(row.prev_id || "").trim() === "";
    if (Object.prototype.hasOwnProperty.call(row, "prevId")) return row.prevId == null || String(row.prevId || "").trim() === "";
    return false;
  }

  function retryableHistoryError(error) {
    const status = Number(error?.httpStatus || 0);
    const kind = String(error?.status || "").toLowerCase();
    return status === 408 || status === 425 || status === 429 || status >= 500 ||
      kind.includes("timeout") || kind.includes("network") || kind.includes("bridge-timeout");
  }

  async function fetchApiHistoryPageWithRetry(characterId, conversationId, options, metrics, lock) {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (lock?.cancelled) throw new Error("cancelled");
      const started = performance.now();
      try {
        const response = await DS.fetchChatHistoryPage(characterId, conversationId, options);
        metrics.requestMs += performance.now() - started;
        metrics.networkMs += Number(response?.elapsedMs || 0);
        metrics.authRefreshes += Number(response?.authRefreshes || 0);
        return response;
      } catch (error) {
        metrics.requestMs += performance.now() - started;
        metrics.authRefreshes += Number(error?.authRefreshes || 0);
        lastError = error;
        if (lock?.stopReason || lock?.cancelled || attempt >= 3 || !retryableHistoryError(error)) throw error;
        metrics.retries++;
        await DS.sleep?.([450, 1000, 2200][attempt] || 2200);
      }
    }
    throw lastError || new Error("chat history API failed");
  }

  function exportEta(started, count, expectedCount) {
    const elapsedMs = Math.max(0, performance.now() - started);
    const total = Math.max(0, Number(expectedCount || 0));
    const done = Math.max(0, Number(count || 0));
    const etaMs = total > done && done > 0 ? Math.max(0, Math.round((elapsedMs / done) * (total - done))) : 0;
    return { elapsedMs: Math.round(elapsedMs), etaMs };
  }

  function formatExportDuration(ms) {
    const seconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }

  async function loadAllMessagesViaApiLegacy({ settings, lock = null, onProgress = null } = {}) {
    const ids = chatRouteIds();
    if (!ids.characterId || typeof DS.fetchChatHistoryPage !== "function") {
      throw new Error("chat history API unavailable");
    }

    const token = DS.diagOperationStart?.("chat-export", "api-history-export", {
      characterId: ids.characterId,
      hasConversationId: !!ids.conversationId
    });
    const started = performance.now();
    const metrics = { requestMs: 0, networkMs: 0, retries: 0, authRefreshes: 0 };
    let chosenLimit = 0;
    let expectedCount = 0;
    let persona = null;
    let pages = 0;
    let lastId = "";
    let reason = "api-complete";
    let reachedStart = false;
    const byId = new Map();
    const orderNewestFirst = [];
    const visibleBot = collectBotInfo() || {};
    const botName = visibleBot.name || "Bot";
    const rawIds = new Set();
    let rawRowsSeen = 0, duplicateRawRows = 0, missingRawIds = 0, countChanged = false;
    const absorb = data => {
      const reported = Math.max(0, Number(data?.num_messages || 0));
      if (reported && expectedCount && reported !== expectedCount) countChanged = true;
      for (const row of Array.isArray(data?.messages) ? data.messages : []) {
        rawRowsSeen++;
        const id = String(row?.id || "").trim();
        if (!id) { missingRawIds++; continue; }
        if (rawIds.has(id)) duplicateRawRows++;
        rawIds.add(id);
      }
      const parsed = apiHistoryMessages(data, settings, botName, visibleBot);
      let added = 0;
      for (const message of parsed) {
        if (!message.id || byId.has(message.id)) continue;
        byId.set(message.id, message);
        orderNewestFirst.push(message.id);
        added++;
      }
      return added;
    };

    try {
      for (const candidate of [200, 100, 50]) {
        try {
          const first = await fetchApiHistoryPageWithRetry(
            ids.characterId,
            ids.conversationId,
            { limit: candidate, lastId: "" },
            metrics,
            lock
          );
          chosenLimit = candidate;
          const data = first?.data || {};
          expectedCount = Math.max(0, Number(data?.num_messages || 0));
          persona = data?.userPersona || null;
          absorb(data);
          pages = 1;
          const rawRows = Array.isArray(data?.messages) ? data.messages : [];
          const oldest = rawRows.at(-1) || null;
          reachedStart = apiRowStartsConversation(oldest);
          lastId = reachedStart ? "" : String(oldest?.id || "").trim();
          onProgress?.({
            source: "api", phase: "fetched", count: byId.size,
            expectedCount, pages, limit: chosenLimit,
            retries: metrics.retries, authRefreshes: metrics.authRefreshes,
            ...exportEta(started, byId.size, expectedCount)
          });
          if (reachedStart) reason = "api-chain-start";
          break;
        } catch (error) {
          const status = Number(error?.httpStatus || 0);
          // Only page-size rejection should move down to a smaller page size.
          // Auth/network failures are retried by the authenticated request path
          // and must not be disguised as a page-size problem.
          if (candidate === 50 || ![400, 404, 413, 422].includes(status)) throw error;
        }
      }

      if (!chosenLimit) throw new Error("chat history API did not accept a page size");

      const seenCursors = new Set();
      while (lastId && !reachedStart) {
        if (lock?.cancelled) {
          reason = "cancelled";
          break;
        }
        if (seenCursors.has(lastId)) {
          reason = "api-cursor-loop";
          break;
        }
        seenCursors.add(lastId);

        const response = await fetchApiHistoryPageWithRetry(
          ids.characterId,
          ids.conversationId,
          { limit: chosenLimit, lastId },
          metrics,
          lock
        );
        const data = response?.data || {};
        if (!expectedCount) expectedCount = Math.max(0, Number(data?.num_messages || 0));
        if (!persona && data?.userPersona) persona = data.userPersona;

        const rawRows = Array.isArray(data?.messages) ? data.messages : [];
        if (!rawRows.length) {
          absorb(data); // record a changed native counter even on the final empty page
          reason = "api-exhausted";
          break;
        }

        const rawBefore = rawIds.size;
        absorb(data);
        pages++;
        if (rawBefore === rawIds.size) { reason = "api-no-progress"; break; }
        const oldest = rawRows.at(-1) || null;
        reachedStart = apiRowStartsConversation(oldest);
        const nextCursor = reachedStart ? "" : String(oldest?.id || "").trim();

        onProgress?.({
          source: "api", phase: "fetched", count: byId.size,
          expectedCount, pages, limit: chosenLimit,
          retries: metrics.retries, authRefreshes: metrics.authRefreshes,
          ...exportEta(started, rawIds.size, expectedCount)
        });

        if (reachedStart) {
          reason = "api-chain-start";
          lastId = "";
          break;
        }
        if (!nextCursor || nextCursor === lastId) {
          reason = "api-cursor-stalled";
          break;
        }
        lastId = nextCursor;
        await DS.sleep?.(0);
      }

      const messages = orderNewestFirst.map(id => byId.get(id)).filter(Boolean).reverse();
      if (reason === "api-complete") reason = "api-cursor-missing";
      const rawCountDifference = expectedCount > 0 ? expectedCount - rawIds.size : null;
      const filteredCount = Math.max(0, rawIds.size - messages.length);
      // An empty page alone proves only that this endpoint returned no more
      // rows. The server counter may include deleted/alternate rows or may
      // differ from the active chain. Do not silently promise completeness.
      const terminal = reachedStart || reason === "api-exhausted";
      const countAgrees = expectedCount > 0 ? rawCountDifference === 0 : reachedStart;
      const complete = reason !== "cancelled" && terminal && countAgrees && !countChanged && !missingRawIds;
      const completeness = complete ? (reachedStart ? "chain-start-count-consistent" : "endpoint-exhausted-count-consistent") : (terminal ? "endpoint-ended-unverified" : "pagination-unverified");
      const reportedDifference = expectedCount > 0 ? expectedCount - messages.length : 0;
      const elapsedMs = Math.round(performance.now() - started);
      const processingMs = Math.max(0, Math.round(elapsedMs - metrics.requestMs));

      const result = {
        messages,
        complete,
        cancelled: reason === "cancelled",
        reason,
        source: "api",
        expectedCount,
        reportedDifference,
        completeness, rawCountDifference, rawRowsSeen, rawUniqueCount: rawIds.size, duplicateRawRows, missingRawIds, filteredCount, countChanged,
        messageCount: messages.length,
        pages,
        limit: chosenLimit,
        persona,
        elapsedMs,
        requestMs: Math.round(metrics.requestMs),
        networkMs: Math.round(metrics.networkMs),
        processingMs,
        retries: metrics.retries,
        authRefreshes: metrics.authRefreshes
      };

      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.chatExportApiRuns = Number(perf.chatExportApiRuns || 0) + 1;
      perf.chatExportApiLastMessages = messages.length;
      perf.chatExportApiLastExpected = expectedCount;
      perf.chatExportApiLastPages = pages;
      perf.chatExportApiLastMs = result.elapsedMs;
      perf.chatExportApiLastNetworkMs = result.networkMs;
      perf.chatExportApiLastRequestMs = result.requestMs;
      perf.chatExportApiLastProcessingMs = result.processingMs;
      perf.chatExportApiLastRetries = result.retries;
      perf.chatExportApiLastAuthRefreshes = result.authRefreshes;
      perf.chatExportApiLastReason = reason;

      DS.diagOperationEnd?.(token, {
        outcome: reason,
        counts: { scanned: messages.length, changed: messages.length, skipped: 0, errors: complete ? 0 : 1 },
        meta: {
          source: "api", pages, limit: chosenLimit, expectedCount,
          reportedDifference, completeness, rawCountDifference, rawRowsSeen, rawUniqueCount: rawIds.size, duplicateRawRows, missingRawIds, filteredCount, countChanged, elapsedMs: result.elapsedMs,
          requestMs: result.requestMs, networkMs: result.networkMs,
          nonRequestWallMs: result.processingMs, timingKind: "non-request-wall-includes-yields", retries: result.retries,
          authRefreshes: result.authRefreshes
        }
      });
      return result;
    } catch (error) {
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.chatExportApiFailures = Number(perf.chatExportApiFailures || 0) + 1;
      perf.chatExportApiLastError = String(error?.message || error || "unknown");
      DS.diagOperationEnd?.(token, {
        outcome: "api-error",
        counts: { scanned: byId.size, changed: byId.size, skipped: 0, errors: 1 },
        extra: {
          source: "api", error: perf.chatExportApiLastError,
          retries: metrics.retries, authRefreshes: metrics.authRefreshes,
          requestMs: Math.round(metrics.requestMs), networkMs: Math.round(metrics.networkMs)
        }
      });
      throw error;
    }
  }

  const EXPORT_DISK_THRESHOLD = 100000;
  const EXPORT_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const exportSameChat = ids => {
    const now = chatRouteIds();
    return now.characterId === ids.characterId && now.conversationId === ids.conversationId;
  };
  function exportCheckpointCall(ids, action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!exportSameChat(ids)) { reject(Error('Conversation changed; checkpoint kept.')); return; }
      let settled = false;
      const finish = (result, error) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error || !result?.ok) reject(Error(String(error || result?.error || 'Checkpoint storage did not respond')));
        else resolve(result);
      };
      const timer = setTimeout(() => finish(null, 'Checkpoint storage timed out; reopen Export to read the last committed page.'), action==='download-status'?3500:30000);
      try {
        const returned = chrome.runtime.sendMessage({type:'DS_CHAT_EXPORT_CHECKPOINT', ...ids, action, ...payload}, result => finish(result, chrome.runtime.lastError?.message));
        if (returned?.then) returned.then(result => finish(result), error => finish(null,error?.message));
      } catch (error) { finish(null,error?.message); }
    });
  }
  function exportSessionSummary(status) {
    const t=status?.currentSessionTimings;
    if(!t)return '';
    const original=Number.isFinite(status.originalRetrievalMs)?formatExportDuration(status.originalRetrievalMs):'not separately recorded in this capture';
    return `Original retrieval: ${original} · ${Number(t.cachedMessagesReused||0).toLocaleString()} cached rows reused · ${Number(t.newlyRetrievedMessages||0).toLocaleString()} new rows · Current verification: ${formatExportDuration(t.currentVerificationMs||0)} · Current retrieval: ${formatExportDuration(t.currentRetrievalMs||0)}${t.currentRestoreMs?` · Local restoration: ${formatExportDuration(t.currentRestoreMs)}`:''}.`;
  }
  function exportProgressText(p) {
    const reported = p.expectedCount ? ` / ${p.expectedCount.toLocaleString()} reported` : ' · native count unavailable';
    const percent = p.expectedCount ? ` · ${Math.min(100,100*p.rawUniqueCount/p.expectedCount).toFixed(1)}%${p.rawUniqueCount >= p.expectedCount ? ' (checking end)' : ''}` : '';
    const eta = p.etaMs > 0 ? ` · ETA ~${formatExportDuration(p.etaMs)}` : '';
    const speed = p.speed > 0 ? ` · ${p.speed.toFixed(0)} messages/s` : '';
    const checkpoint = p.checkpointAt ? ` · saved ${new Date(p.checkpointAt).toLocaleTimeString()}` : '';
    const lastRequest = p.lastRequestAt ? ` · last response ${new Date(p.lastRequestAt).toLocaleTimeString()}` : '';
    return `${p.phaseLabel || 'Fetching'} · ${Number(p.rawUniqueCount || 0).toLocaleString()} unique${reported}${percent} · ${p.pages || 0} pages · ${formatExportDuration(p.currentRunMs ?? p.elapsedMs)} this run${speed}${eta} · ${p.retries || 0} retries · ${p.authRefreshes || 0} auth refreshes${lastRequest}${checkpoint}`;
  }
  function exportProgressPanel(lock) {
    const panel = document.createElement('div');
    panel.id = 'ds-chat-export-progress';
    panel.style.cssText = 'position:fixed;z-index:2147483646;bottom:12px;right:12px;width:min(510px,calc(100vw - 24px));box-sizing:border-box;background:#17191e;color:#f0f0f0;border:1px solid #505965;padding:12px;border-radius:10px;font:13px/1.5 system-ui;box-shadow:0 4px 20px #0008';
    const title = document.createElement('strong'); title.textContent = 'Chat Export — local checkpoint';
    const status = document.createElement('div'); status.setAttribute('role','status'); status.textContent = 'Preparing authenticated export…';
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
    const pause = makeExportButton('ds-export-pause','Pause');
    const partial = makeExportButton('ds-export-partial','Save partial export');
    const cancel = makeExportButton('ds-export-stop','Cancel fetching');
    for (const [button,reason] of [[pause,'paused'],[partial,'partial-requested'],[cancel,'cancelled']]) {
      button.addEventListener('click',()=>{
        lock.stopReason=reason;
        status.textContent='Stopping after the current page is safely saved…';
        for(const child of actions.children) child.disabled=true;
      }); actions.append(button);
    }
    panel.append(title,status,actions); document.getElementById(panel.id)?.remove(); document.documentElement.append(panel);
    return {update:p=>{if(!lock.stopReason) status.textContent=exportProgressText(p);},close:()=>panel.remove()};
  }
  function exportMessageAllowed(message, settings) {
    return settings.chatExportIncludeOocDirectives === true || ['user','human','bot','assistant','character'].includes(message.role);
  }
  function checkpointExportVerification(job) {
    const terminal = ['api-exhausted','api-chain-start'].includes(job.reason);
    const difference = job.expectedCount > 0 ? job.expectedCount-job.rawUniqueCount : null;
    const agrees = difference === 0 || (difference === null && job.reason === 'api-chain-start');
    const chainCoverage=Number(job.rawUniqueCount)>0 && Number(job.linksChecked||0)===Number(job.rawUniqueCount)-1 && (job.rawUniqueCount>1||job.reason==='api-chain-start');
    const complete = terminal && agrees && chainCoverage && !job.countChanged && !job.headChanged && !job.missingRawIds && !job.chainBreaks && !job.incrementalSnapshot;
    let completeness = 'pagination-unverified';
    if (terminal) {
      if (complete) completeness = job.reason === 'api-chain-start' ? 'chain-start-count-consistent' : 'endpoint-exhausted-count-consistent';
      else if (difference < 0) completeness = 'endpoint-ended-extra-api-rows-unverified';
      else if (difference > 0) completeness = 'endpoint-ended-fewer-api-rows-unverified';
      else if (job.incrementalSnapshot) completeness = 'incremental-snapshot-unverified';
      else completeness = 'endpoint-ended-unverified';
    }
    return {complete,completeness,rawCountDifference:difference,terminal,
      verificationEvidence:{pagination:terminal?'terminal':'interrupted',nativeCount:difference===null?'unavailable':difference===0?'agrees':difference<0?'extra-api-rows':'fewer-api-rows',chain:job.chainBreaks?'contradictions':chainCoverage?'all-adjacent-links-checked':job.linksChecked?'partial-link-evidence':'no-link-evidence',nativeCountChanged:!!job.countChanged,headChanged:!!job.headChanged,incrementalSnapshot:!!job.incrementalSnapshot}};
  }
  // Page ranges are stored in chronological segment order. Within each segment
  // the API still supplies newest-first pages. Existing v1 captures need no migration.
  function checkpointSegments(status) {
    const segments=status.pageSegments|| (status.pages?[{first:1,last:status.pages}]:[]);
    let next=1;
    for(const range of segments){
      if(!Number.isSafeInteger(range.first)||!Number.isSafeInteger(range.last)||range.first!==next||range.last<range.first)throw Error('Invalid saved page ordering. Capture retained.');
      next=range.last+1;
    }
    if(next!==status.pages+1)throw Error('Saved page ranges do not cover the capture.');
    return segments;
  }
  function* checkpointPageOrder(status, newestFirst=false){
    const ranges=checkpointSegments(status);
    if(newestFirst){for(let s=ranges.length-1;s>=0;s--)for(let i=ranges[s].first;i<=ranges[s].last;i++)yield i;}
    else{for(const range of ranges)for(let i=range.last;i>=range.first;i--)yield i;}
  }
  // Local evidence audit, not an API scan. No chat content or message IDs leave
  // the report. Raw row numbers are one-based, including rows excluded by export filters.
  async function auditCheckpointChain(status,onProgress=()=>{}){
    const ids=status.checkpointIds, started=performance.now();
    const current=(await exportCheckpointCall(ids,'get')).job;
    if(current?.jobId!==status.jobId||current.revision!==status.revision)throw Error('Saved capture changed. Reopen Export.');
    let checked=0,contradictions=0,missingEvidence=0,earlyStarts=0,duplicateSavedIds=0,ordinal=0,previous=null,cpuMs=0,readMs=0;
    const examples=[],positions=new Map();
    function compare(prev,actual){
      if(!prev||!prev.hasLink)return;
      if(!prev.expected){if(actual)earlyStarts++;return;}
      checked++;
      if(prev.expected===actual?.id)return;
      contradictions++;
      if(examples.length<20)examples.push({from:prev.position,observed:actual?.position||null,expectedId:prev.expected,reason:!actual?'nonempty-previous-link-at-api-end':prev.position.page===actual.position.page?'within-page-previous-id-mismatch':'cross-page-previous-id-mismatch'});
    }
    let pageCount=0;
    for(const page of checkpointPageOrder(status,true)){
      const readStart=performance.now();
      const {page:record}=await exportCheckpointCall(ids,'page',{jobId:status.jobId,page,idsOnly:true});
      readMs+=performance.now()-readStart;
      const t=performance.now();
      if(!Array.isArray(record.rawIds))throw Error('Saved page lacks raw ID evidence.');
      const links=new Map(record.linkEvidence||[]);
      for(let i=0;i<record.rawIds.length;i++){
        const id=String(record.rawIds[i]);
        const position={page,row:i+1,newestFirstOrdinal:++ordinal,oldestFirstRawOrdinal:status.rawUniqueCount-ordinal+1};
        const actual={id,position,hasLink:links.has(id),expected:String(links.get(id)||'').trim()};
        if(positions.has(id))duplicateSavedIds++;else positions.set(id,position);
        compare(previous,actual);
        if(!actual.hasLink)missingEvidence++;
        previous=actual;
      }
      cpuMs+=performance.now()-t;
      if(++pageCount%10===0)onProgress(`Auditing saved links · ${pageCount} / ${status.pages} pages`);
    }
    if(status.reason==='api-exhausted'||status.reason==='api-chain-start')compare(previous,null);
    const located=examples.map(({expectedId,...entry})=>{const expectedLocation=positions.get(expectedId)||null;return {...entry,expectedLocation,expectedTarget:expectedLocation?'present-in-saved-capture':'not-found-in-saved-capture',targetOrder:!expectedLocation?'unknown':expectedLocation.newestFirstOrdinal<=entry.from.newestFirstOrdinal?'same-or-newer-than-link-source':'older-than-link-source'};});
    const report={jobId:status.jobId,pages:pageCount,rawRowsChecked:ordinal,distinctSavedIds:positions.size,duplicateSavedIds,rawCountMatches:ordinal===status.rawUniqueCount,linksChecked:checked,contradictions,originalLinksChecked:status.linksChecked,originalContradictions:status.chainBreaks,missingLinkEvidence:missingEvidence,explicitStartBeforeEnd:earlyStarts,examples:located,examplesOmitted:Math.max(0,contradictions-located.length),verificationWallMs:Math.round(performance.now()-started),pageReadWallMs:Math.round(readMs),comparisonCpuMs:Math.round(cpuMs),scope:'Saved unique-ID positions are one-based, not original response offsets where duplicates were removed. No chat text or message IDs. A mismatch does not establish missing messages or its cause.'};
    const latest=(await exportCheckpointCall(ids,'get')).job;
    if(latest?.jobId!==status.jobId||latest.revision!==status.revision)throw Error('Saved capture changed during audit. Reopen Export.');
    const diag=DS.diagOperationStart?.('chat-export','saved-chain-audit',{jobId:status.jobId});
    const first=located[0];
    DS.diagOperationEnd?.(diag,{outcome:contradictions?'contradictions':'checked',counts:{scanned:checked,errors:contradictions},meta:{...report,examples:undefined,firstFromPage:first?.from.page,firstFromRow:first?.from.row,firstObservedPage:first?.observed?.page,firstObservedRow:first?.observed?.row,firstExpectedPage:first?.expectedLocation?.page,firstExpectedRow:first?.expectedLocation?.row,firstContradictionReason:first?.reason,firstExpectedTarget:first?.expectedTarget}});
    return report;
  }
  // Explicit append-only update. Stage a small bounded batch and publish it in
  // one IDB transaction only after encountering the exact saved head. No prior
  // page is replaced. A rewritten or distant head requires a reviewed fresh capture.
  async function extendSavedCheckpoint(status,settings,onProgress=()=>{}){
    const ids=status.checkpointIds, started=performance.now();
    const current=(await exportCheckpointCall(ids,'get')).job;
    if(current?.jobId!==status.jobId||current.revision!==status.revision||!checkpointExportVerification(current).terminal)throw Error('Open a completed saved capture first.');
    const anchor=String(current.headIds?.[0]||'');
    if(!anchor)throw Error('Saved head unavailable. Capture unchanged.');
    const metrics={requestMs:0,networkMs:0,retries:0,authRefreshes:0}, lock={active:true};
    const staged=[],freshIds=new Set(),seenCursors=new Set();
    let cursor='',found=false,reported=0,countChanged=false,headIds=[],expected='',checked=0,unknownLinks=0,requests=0;
    const bot=collectBotInfo()||{}, limit=current.limit||200;
    const readPrev=row=>String(row?.prev_id??row?.prevId??'').trim();
    const diag=DS.diagOperationStart?.('chat-export','api-history-append',{jobId:current.jobId});
    try{
      // This is an atomic append batch limit, not the full exporter history limit.
      // Never commit a prefix that has not reached the old head.
      for(let i=0;i<25;i++){
        if(!exportSameChat(ids))throw Error('Conversation changed. Capture unchanged.');
        const response=await fetchApiHistoryPageWithRetry(ids.characterId,ids.conversationId,{limit,lastId:cursor},metrics,lock);
        requests++;
        if(!exportSameChat(ids))throw Error('Conversation changed. Capture unchanged.');
        const data=response?.data||{},rows=data.messages;
        if(!Array.isArray(rows)||!rows.length)throw Error('Saved head not reached. Capture unchanged.');
        const count=Math.max(0,Number(data.num_messages||0));
        if(i===0){reported=count;headIds=rows.slice(0,20).map(r=>String(r?.id||'').trim()).filter(Boolean);}
        else if(count&&reported&&count!==reported)countChanged=true;
        const prefix=[];
        for(const row of rows){
          const id=String(row?.id||'').trim();
          if(!id)throw Error('New history contains a row without an ID. Capture unchanged.');
          if(expected){checked++;if(expected!==id)throw Error('New history has a previous-link contradiction. Capture unchanged.');}
          else if(freshIds.size)unknownLinks++;
          if(id===anchor){found=true;break;}
          if(freshIds.has(id))throw Error('New history repeats an ID before the saved head. Capture unchanged.');
          freshIds.add(id);prefix.push(row);expected=readPrev(row);
          if(apiRowStartsConversation(row))throw Error('New history ended before the saved head. Capture unchanged.');
        }
        if(prefix.length){
          const messages=apiHistoryMessages({...data,userPersona:data.userPersona||current.persona,messages:prefix},{...settings,chatExportIncludeOocDirectives:true},bot.name,bot);
          staged.push({rawIds:prefix.map(r=>String(r.id).trim()),messages,cursorBefore:cursor,cursorAfter:String(prefix.at(-1).id).trim(),rawRows:prefix.length,duplicates:0,missing:0,chainBreaks:0,linksChecked:0,lastReportedCount:count,linkEvidence:prefix.filter(r=>Object.hasOwn(r,'prev_id')||Object.hasOwn(r,'prevId')).map(r=>[String(r.id).trim(),readPrev(r)])});
        }
        onProgress(`Checking new history · ${freshIds.size.toLocaleString()} new rows · ${requests} requests`);
        if(found)break;
        const next=String(rows.at(-1)?.id||'').trim();
        if(!next||next===cursor||seenCursors.has(next))throw Error('New history cursor loop. Capture unchanged.');
        seenCursors.add(next);cursor=next;
      }
      if(!found)throw Error('The saved head was not reached within the 25-page atomic append batch. Keep this capture or start a reviewed fresh capture.');
      if(!staged.length){const timings={cachedMessagesReused:current.rawUniqueCount,newlyRetrievedMessages:0,currentRetrievalMs:0,currentVerificationMs:Math.round(performance.now()-started),currentRunMs:Math.round(performance.now()-started)};DS.diagOperationEnd?.(diag,{outcome:'no-new-rows',counts:{scanned:0},meta:{jobId:current.jobId,requests,currentSessionTimings:timings}});return {added:0,status:{...status,currentSessionTimings:timings}};}
      if(countChanged)throw Error('Native count changed during the append. Capture unchanged; retry when the conversation is idle.');
      // Verify against all previously stored IDs, not just the head. This is
      // local storage I/O only. A regenerated branch can otherwise duplicate old IDs.
      let oldRows=0;
      for(const page of checkpointPageOrder(current)){
        const response=await exportCheckpointCall(ids,'page',{jobId:current.jobId,page,idsOnly:true});
        if(!Array.isArray(response.page.rawIds))throw Error('Saved ID evidence unavailable. Capture unchanged.');
        for(const id of response.page.rawIds){if(freshIds.has(String(id)))throw Error('New rows overlap older saved history. Capture unchanged.');oldRows++;}
        if(page%25===0)onProgress(`Checking saved IDs · ${oldRows.toLocaleString()} / ${current.rawUniqueCount.toLocaleString()}`);
      }
      if(oldRows!==current.rawUniqueCount)throw Error('Saved ID count mismatch. Capture unchanged.');
      const addedActive=staged.reduce((n,p)=>n+p.messages.length,0),addedStandard=staged.reduce((n,p)=>n+p.messages.filter(m=>exportMessageAllowed(m,{})).length,0);
      const next={...current,currentSessionTimings:{cachedMessagesReused:current.rawUniqueCount,newlyRetrievedMessages:freshIds.size,currentRetrievalMs:Math.round(metrics.requestMs),currentVerificationMs:Math.max(0,Math.round(performance.now()-started-metrics.requestMs)),currentRunMs:Math.round(performance.now()-started),timingKind:"append verification includes local ID checks and staging"},revision:current.revision+1,pages:current.pages+staged.length,pageSegments:[...checkpointSegments(current),{first:current.pages+1,last:current.pages+staged.length}],rawUniqueCount:current.rawUniqueCount+freshIds.size,rawRowsSeen:current.rawRowsSeen+freshIds.size,allActiveCount:current.allActiveCount+addedActive,standardCount:current.standardCount+addedStandard,headIds,expectedCount:reported||0,lastReportedCount:reported||0,headChanged:false,priorHeadChanged:!!(current.priorHeadChanged||current.headChanged),countChanged:current.countChanged||countChanged,incrementalSnapshot:true,incrementalRuns:Number(current.incrementalRuns||0)+1,initialExpectedCount:current.initialExpectedCount??current.expectedCount,initialRawUniqueCount:current.initialRawUniqueCount??current.rawUniqueCount,linksChecked:current.linksChecked+checked,incrementalMissingLinks:Number(current.incrementalMissingLinks||0)+unknownLinks,checkpointAt:Date.now(),lastRequestAt:Date.now(),elapsedMs:Number(current.elapsedMs||0)+Math.round(performance.now()-started),requestMs:Number(current.requestMs||0)+Math.round(metrics.requestMs),networkMs:Number(current.networkMs||0)+Math.round(metrics.networkMs),retries:Number(current.retries||0)+metrics.retries,authRefreshes:Number(current.authRefreshes||0)+metrics.authRefreshes};
      Object.assign(next,checkpointExportVerification(next));
      const write=performance.now();
      await exportCheckpointCall(ids,'append',{job:next,appendPages:staged});
      const checkpointMs=Math.round(performance.now()-write);
      const n=settings.chatExportIncludeOocDirectives?next.allActiveCount:next.standardCount;
      const result={...next,currentSessionTimings:{...next.currentSessionTimings,currentRunMs:Math.round(performance.now()-started)},checkpoint:true,checkpointIds:ids,diskOnly:true,messages:[],messageCount:n,source:'api',filteredCount:next.rawUniqueCount-n};
      DS.diagOperationEnd?.(diag,{outcome:'appended',counts:{scanned:freshIds.size},meta:{jobId:next.jobId,requests,pages:staged.length,checkpointMs,requestMs:Math.round(metrics.requestMs),elapsedMs:Math.round(performance.now()-started),originalRetrievalMs:next.originalRetrievalMs,...result.currentSessionTimings,completeness:next.completeness}});
      return {added:freshIds.size,status:result};
    }catch(error){DS.diagOperationEnd?.(diag,{outcome:'append-not-confirmed',counts:{errors:1},meta:{jobId:current.jobId,requests,errorKind:String(error?.name||'error')}});throw error;}
  }
  async function loadAllMessagesViaApi({settings,lock=null,onProgress=null,forceNew=false} = {}) {
    const ids=chatRouteIds();
    // Unpersisted chat routes and native wrappers keep their original exporter.
    // No checkpoint can safely be keyed by the bot ID alone.
    if (!EXPORT_UUID.test(ids.characterId) || !EXPORT_UUID.test(ids.conversationId) || !navigator.locks?.request || !globalThis.chrome?.runtime?.id || window.flutter_inappwebview?.callHandler || typeof window._dsRequestExport === 'function') {
      return loadAllMessagesViaApiLegacy({settings,lock,onProgress});
    }
    const runLock=lock || {active:true};
    return navigator.locks.request(`dsq-export:${ids.characterId}:${ids.conversationId}`,{ifAvailable:true},async owned=>{
      if(!owned) throw Error('Another tab is already exporting this conversation.');
      const panel=exportProgressPanel(runLock);
      const started=performance.now();
      const metrics={requestMs:0,networkMs:0,retries:0,authRefreshes:0};
      let checkpointMs=0, verificationMs=0, job=null, diskOnly=false, messages=[], rawIds=new Set(), priorElapsed=0, speedStart=performance.now(), startCount=0, lastProgressAt=0;
      let verified=false, restoreComplete=true;
      let cachedMessagesReused=0, retrievalBase=0, retrievalStarted=started, currentVerificationMs=0,currentRestoreMs=0;
      const currentRetrievalMs=()=>retrievalStarted===null?0:Math.max(0,Math.round(performance.now()-retrievalStarted));
      const sessionTimings=(next)=>({cachedMessagesReused,newlyRetrievedMessages:Math.max(0,Number(next.rawUniqueCount||0)-cachedMessagesReused),currentVerificationMs,currentRestoreMs,currentRetrievalMs:currentRetrievalMs(),currentRunMs:Math.round(performance.now()-started)});
      const visited=new Set();
      const visibleBot=collectBotInfo()||{};
      const token=DS.diagOperationStart?.('chat-export','api-history-export',{hasConversationId:true,durable:true});
      const config={chatExportIncludeOocDirectives:settings.chatExportIncludeOocDirectives===true,chatExportDefaultFormat:settings.chatExportDefaultFormat||'text',chatExportIncludeBotInfo:!!settings.chatExportIncludeBotInfo,chatExportIncludeRulebook:!!settings.chatExportIncludeRulebook,chatExportIncludeRulebookState:!!settings.chatExportIncludeRulebookState,chatExportIncludeGenerationDetails:settings.chatExportIncludeGenerationDetails!==false,chatExportIncludeImageLinks:!!settings.chatExportIncludeImageLinks,chatExportIncludeAvatars:settings.chatExportIncludeAvatars!==false,chatExportNumberMessages:settings.chatExportNumberMessages!==false,chatExportHtmlLayout:settings.chatExportHtmlLayout||'bubbles'};
      const routeGuard=()=>{if(!exportSameChat(ids)) throw Error('Conversation changed; checkpoint kept.');};
      const elapsed=()=>priorElapsed+Math.round(performance.now()-started);
      const activeCount=()=>job ? (settings.chatExportIncludeOocDirectives ? job.allActiveCount : job.standardCount) : 0;
      function emit(phaseLabel, force=false) {
        if(!job) return;
        const speed=(job.rawUniqueCount-startCount)/Math.max(.001,(performance.now()-speedStart)/1000);
        const etaMs=speed>0&&job.expectedCount>job.rawUniqueCount ? Math.round((job.expectedCount-job.rawUniqueCount)*1000/speed):0;
        const p={source:'api',phase:'fetched',phaseLabel,count:activeCount(),rawUniqueCount:job.rawUniqueCount,expectedCount:job.expectedCount,pages:job.pages,retries:job.retries||0,authRefreshes:job.authRefreshes||0,elapsedMs:elapsed(),currentRunMs:Math.round(performance.now()-started),etaMs,speed,checkpointAt:job.checkpointAt,lastRequestAt:job.lastRequestAt,limit:job.limit};
        panel.update(p);onProgress?.(p);
        if(force||performance.now()-lastProgressAt>=5000){
          lastProgressAt=performance.now();
          const t=DS.diagOperationStart?.('chat-export','api-history-progress',{jobId:job.jobId});
          DS.diagOperationEnd?.(t,{outcome:phaseLabel,counts:{scanned:job.rawUniqueCount,changed:activeCount()},meta:{jobId:job.jobId,pages:job.pages,expectedCount:job.expectedCount,duplicateRawRows:job.duplicateRawRows,filteredCount:job.rawUniqueCount-activeCount(),elapsedMs:p.elapsedMs,etaMs,requestMs:Math.round(metrics.requestMs),checkpointMs:Math.round(checkpointMs),retries:p.retries,authRefreshes:p.authRefreshes}});
        }
      }
      async function commit(next,page=null) {
        routeGuard();const t=performance.now();
        const saved={...next,revision:(job?.revision||0)+1,elapsedMs:elapsed(),requestMs:(job?.baseRequestMs||0)+Math.round(metrics.requestMs),networkMs:(job?.baseNetworkMs||0)+Math.round(metrics.networkMs),retries:(job?.baseRetries||0)+metrics.retries,authRefreshes:(job?.baseAuthRefreshes||0)+metrics.authRefreshes,checkpointAt:Date.now(),checkpointMs:(job?.baseCheckpointMs||0)+Math.round(checkpointMs),chainVerificationCpuMs:(job?.baseVerificationMs||0)+Math.round(verificationMs),options:config};
        const timing=sessionTimings(next);
        saved.currentSessionTimings=timing;
        saved.retrievalElapsedMs=Number.isFinite(retrievalBase)?retrievalBase+timing.currentRetrievalMs:null;
        // Existing terminal captures predate split timings; their cumulative
        // elapsedMs may already include reopens. Never invent an original time.
        saved.originalRetrievalMs=next.originalRetrievalMs??(checkpointExportVerification(next).terminal&&Number.isFinite(saved.retrievalElapsedMs)?saved.retrievalElapsedMs:null);
        await exportCheckpointCall(ids,'commit',{job:saved,page});
        checkpointMs+=performance.now()-t;job=saved;
      }
      function setDiskMode(n){if(n>=EXPORT_DISK_THRESHOLD&&!diskOnly){diskOnly=true;messages=[];}}
      function rememberPage(page){
        for(const id of page.rawIds)rawIds.add(id);
        if(page.cursorBefore)visited.add(page.cursorBefore);
        if(!diskOnly)for(const m of page.messages||[])if(exportMessageAllowed(m,settings))messages.push(m);
      }
      function buildPage(data,cursorBefore){
        const rows=Array.isArray(data?.messages)?data.messages:null;
        if(!rows)throw Error('History API returned an invalid messages collection.');
        const newIds=new Set();let duplicates=0,missing=0,chainBreaks=0,linksChecked=0;
        const fresh=[];
        for(const row of rows){
          const id=String(row?.id||'').trim();
          if(!id){missing++;continue;}
          if(rawIds.has(id)||newIds.has(id)){duplicates++;continue;}
          newIds.add(id);fresh.push(row);
        }
        const verifyStart=performance.now();
        // Only count contradictions when an explicit previous-message field exists.
        // API overlaps or omitted links do not prove a broken chain.
        for(let i=0;i+1<fresh.length;i++){
          const row=fresh[i],prev=row.prev_id??row.prevId;
          if(prev!=null&&String(prev).trim()){linksChecked++;if(String(prev)!==String(fresh[i+1]?.id||''))chainBreaks++;}
        }
        const oldest=fresh.at(-1)||null;
        const prevOf=row=>String(row?.prev_id??row?.prevId??'').trim();
        if(job?.lastExpectedPrev&&fresh.length){linksChecked++;if(job.lastExpectedPrev!==String(fresh[0].id))chainBreaks++;}
        if(job?.lastExpectedPrev&&!rows.length){linksChecked++;chainBreaks++;}
        verificationMs+=performance.now()-verifyStart;
        const parsed=apiHistoryMessages({...data,userPersona:data?.userPersona||job?.persona,messages:fresh},{...settings,chatExportIncludeOocDirectives:true},visibleBot.name,visibleBot);
        return {rawIds:[...newIds],messages:parsed,cursorBefore,rawRows:rows.length,duplicates,missing,chainBreaks,linksChecked,lastExpectedPrev:prevOf(oldest),headIds:rows.slice(0,20).map(r=>String(r?.id||'')).filter(Boolean),oldest:rows.at(-1)||null,linkEvidence:fresh.filter(r=>Object.prototype.hasOwnProperty.call(r,'prev_id')||Object.prototype.hasOwnProperty.call(r,'prevId')).map(r=>[String(r.id),prevOf(r)])};
      }
      async function fetchPage(cursor,limit){
        routeGuard();
        const response=await fetchApiHistoryPageWithRetry(ids.characterId,ids.conversationId,{limit,lastId:cursor},metrics,runLock);
        routeGuard();return response?.data||{};
      }
      async function ingest(data,cursor,limit){
        const page=buildPage(data,cursor);
        const reported=Math.max(0,Number(data?.num_messages||0));
        const old=job;
        const base=old||{jobId:crypto.randomUUID(),revision:0,pages:0,rawUniqueCount:0,rawRowsSeen:0,duplicateRawRows:0,missingRawIds:0,allActiveCount:0,standardCount:0,chainBreaks:0,linksChecked:0,headIds:page.headIds,expectedCount:reported,persona:data.userPersona?{name:data.userPersona.name,avatar_url:data.userPersona.avatar_url||data.userPersona.avatarUrl}:null,countChanged:false,headChanged:false,baseRequestMs:0,baseNetworkMs:0,baseRetries:0,baseAuthRefreshes:0};
        const reachedStart=page.rawIds.length>0&&apiRowStartsConversation(page.oldest);
        const nextCursor=reachedStart?'':String(page.oldest?.id||'').trim();
        let reason='fetching';
        if(!page.rawRows) reason='api-exhausted';
        else if(reachedStart)reason='api-chain-start';
        else if(!page.rawIds.length)reason='api-no-progress';
        else if(!nextCursor||nextCursor===cursor||visited.has(nextCursor))reason='api-cursor-loop';
        const countChanged=base.countChanged||!!(reported&&base.expectedCount&&reported!==base.expectedCount);
        const next={...base,limit,pages:base.pages+(page.rawRows?1:0),cursor:reason==='fetching'?nextCursor:(reason==='api-exhausted'||reason==='api-chain-start'?'':cursor),reason,expectedCount:base.expectedCount||reported,lastReportedCount:reported||base.lastReportedCount||base.expectedCount,countChanged,rawUniqueCount:base.rawUniqueCount+page.rawIds.length,rawRowsSeen:base.rawRowsSeen+page.rawRows,duplicateRawRows:base.duplicateRawRows+page.duplicates,missingRawIds:base.missingRawIds+page.missing,chainBreaks:base.chainBreaks+page.chainBreaks,linksChecked:base.linksChecked+page.linksChecked,lastExpectedPrev:page.lastExpectedPrev,allActiveCount:base.allActiveCount+page.messages.length,standardCount:base.standardCount+page.messages.filter(m=>exportMessageAllowed(m,{})).length,lastRequestAt:Date.now()};
        // Avoid committing an empty repeated/stalled page with a cursor that cannot advance.
        const hasPage=page.rawRows>0;
        const record=hasPage?{rawIds:page.rawIds,messages:page.messages,cursorBefore:cursor,cursorAfter:nextCursor,rawRows:page.rawRows,duplicates:page.duplicates,missing:page.missing,chainBreaks:page.chainBreaks,linksChecked:page.linksChecked,lastReportedCount:reported,linkEvidence:page.linkEvidence}:null;
        await commit({...next,...checkpointExportVerification(next)},record);
        setDiskMode(job.rawUniqueCount);
        if(record)rememberPage(record);
        emit(reason==='fetching'?'Fetching':'Verifying history');
      }
      try {
        routeGuard();
        let stored=(await exportCheckpointCall(ids,'get')).job;
        // Every new or resumed invocation makes an authenticated history request.
        // Never return cached transcript content merely because a URL was opened.
        let first=null,limit=stored?.limit||0;
        for(const candidate of [...new Set([limit||200,100,50])]){
          try{first=await fetchPage('',candidate);limit=candidate;break;}
          catch(error){if(candidate===50||![400,404,413,422].includes(Number(error?.httpStatus)))throw error;}
        }
        if(!first||!Array.isArray(first.messages))throw Error('History API did not return a valid first page.');
        if(stored&&forceNew){
          if(!confirm('Start a new capture? This replaces the saved local checkpoint for this conversation only. Save its export first if you need it.'))forceNew=false;
          else {await exportCheckpointCall(ids,'clear',{jobId:stored.jobId,revision:stored.revision});stored=null;}
        }
        if(stored){
          const nowIds=new Set(first.messages.map(m=>String(m?.id||'')).filter(Boolean));
          const head=Array.isArray(stored.headIds)?stored.headIds:[];
          let matched=head.some(id=>nowIds.has(id))||(!head.length&&!nowIds.size&&stored.rawUniqueCount===0);
          // A long conversation may have gained more than one page since the
          // checkpoint. Verify the old head against its own native cursor.
          if(!matched&&head.length>1){
            try{const anchored=await fetchPage(head[0],stored.limit||200);const anchorIds=new Set((anchored.messages||[]).map(m=>String(m?.id||'')));matched=head.slice(1).some(id=>anchorIds.has(id));}catch{}
          }
          if(!matched)throw Error('Saved snapshot could not be matched to the currently authenticated history (head changed). Use Start fresh capture to replace it explicitly. No saved data was deleted.');
          verified=true;priorElapsed=Number(stored.elapsedMs||0);
          cachedMessagesReused=Number(stored.rawUniqueCount||0);
          retrievalBase=Number.isFinite(stored.retrievalElapsedMs)?stored.retrievalElapsedMs:null;
          retrievalStarted=null;currentVerificationMs=Math.round(performance.now()-started);
          const restoreStarted=performance.now();
          job={...stored,baseRequestMs:Number(stored.requestMs||0),baseNetworkMs:Number(stored.networkMs||0),baseRetries:Number(stored.retries||0),baseAuthRefreshes:Number(stored.authRefreshes||0),baseCheckpointMs:Number(stored.checkpointMs||0),baseVerificationMs:Number(stored.chainVerificationCpuMs||0)};
          const currentHead=first.messages.slice(0,20).map(m=>String(m?.id||'')).filter(Boolean);
          const headChanged=job.headChanged||JSON.stringify(currentHead)!==JSON.stringify(head);
          const reported=Number(first.num_messages||0);
          job.headChanged=headChanged;job.countChanged=job.countChanged||!!(reported&&job.expectedCount&&reported!==job.expectedCount);
          setDiskMode(job.rawUniqueCount);
          if(job.pageSegments?.length>1){diskOnly=true;messages=[];}
          startCount=job.rawUniqueCount;speedStart=performance.now();
          emit('Restoring checkpoint',true);
          restoreComplete=false;
          // Restore only IDs for large jobs; message bodies remain on disk.
          const skipDiskRestore=diskOnly&&checkpointExportVerification(job).terminal;
          for(let i=1;!skipDiskRestore&&i<=job.pages;i++){
            const r=await exportCheckpointCall(ids,'page',{jobId:job.jobId,page:i,idsOnly:diskOnly});
            rememberPage(r.page);
            if(i%25===0){routeGuard();await DS.sleep?.(0);}
          }
          if(!skipDiskRestore&&rawIds.size!==job.rawUniqueCount)throw Error('Saved checkpoint ID count mismatch; no data removed.');
          restoreComplete=true;currentRestoreMs=Math.round(performance.now()-restoreStarted);
          startCount=job.rawUniqueCount;speedStart=performance.now();
          const resumeToken=DS.diagOperationStart?.('chat-export','api-history-resume',{jobId:job.jobId});
          DS.diagOperationEnd?.(resumeToken,{outcome:'restored',counts:{scanned:job.rawUniqueCount},meta:{jobId:job.jobId,pages:job.pages}});
          if(!checkpointExportVerification(job).terminal&&job.cursor&&!['api-cursor-loop','api-no-progress'].includes(job.reason))job.reason='fetching';
          // Save new verification evidence, without replacing old fetched pages.
          await commit({...job,...checkpointExportVerification(job)});
          if(job.reason==='fetching')retrievalStarted=performance.now();
        }else{
          verified=true;speedStart=performance.now();
          await ingest(first,'',limit);
        }
        while(job.reason==='fetching'&&job.cursor){
          if(runLock.stopReason||runLock.cancelled){const reason=runLock.stopReason||'cancelled';await commit({...job,reason,...checkpointExportVerification({...job,reason})});break;}
          if(visited.has(job.cursor)){const reason='api-cursor-loop';await commit({...job,reason,...checkpointExportVerification({...job,reason})});break;}
          const cursor=job.cursor;
          const data=await fetchPage(cursor,job.limit);
          await ingest(data,cursor,job.limit);
          await DS.sleep?.(0);
        }
      }catch(error){
        // A failed write may have actually committed before the reply was lost.
        // Do not retry a POST or advance from an uncertain cursor in memory.
        // Opening Export again reads the last authoritative transaction.
        if(!verified||!job||!exportSameChat(ids)){
          DS.diagOperationEnd?.(token,{outcome:'api-error',meta:{errorKind:String(error?.status||error?.name||'checkpoint-error'),pages:job?.pages||0}});
          throw error;
        }
        // Restore the authoritative saved state before offering a partial file.
        const originalError=String(error?.message||error||'export interrupted');
        const latest=await exportCheckpointCall(ids,'get').catch(()=>null);
        if(!latest?.job||latest.job.jobId!==job.jobId)throw Error(`${originalError}. Reopen Export to resume; saved checkpoints have not been cleared.`);
        if(latest.job.revision!==job.revision||!restoreComplete){job=latest.job;diskOnly=true;messages=[];}
        const reason=runLock.stopReason||'api-interrupted';
        const failed={...job,reason,errorKind:String(error?.status||error?.name||'export-error'),lastHttpStatus:Number(error?.httpStatus||0),...checkpointExportVerification({...job,reason})};
        try{await commit(failed);}catch{job={...failed,checkpointWriteUnconfirmed:true};}
        emit('Interrupted — checkpoint retained',true);
      }finally{panel.close();await exportCheckpointCall(ids,'release').catch(()=>{});}
      const verification=checkpointExportVerification(job);
      const n=activeCount();
      const result={...job,...verification,currentSessionTimings:{...(job.currentSessionTimings||sessionTimings(job)),currentRunMs:Math.round(performance.now()-started)},messages:diskOnly?[]:messages.reverse(),diskOnly,checkpoint:true,checkpointIds:ids,messageCount:n,cancelled:['paused','cancelled','partial-requested'].includes(job.reason),source:'api',filteredCount:job.rawUniqueCount-n,reportedDifference:job.expectedCount?job.expectedCount-n:0,processingMs:Math.max(0,elapsed()-Number(job.requestMs||0)),elapsedMs:elapsed(),checkpointMs:(job.baseCheckpointMs||0)+Math.round(checkpointMs),chainVerificationCpuMs:(job.baseVerificationMs||0)+Math.round(verificationMs)};
      // Do not retain a second full message array inside diagnostic metadata.
      const perf=DS.state.runtimePerformance||(DS.state.runtimePerformance={});
      Object.assign(perf,{chatExportApiRuns:Number(perf.chatExportApiRuns||0)+1,chatExportApiLastMessages:n,chatExportApiLastExpected:job.expectedCount,chatExportApiLastPages:job.pages,chatExportApiLastMs:result.currentSessionTimings.currentRunMs,chatExportApiLastNetworkMs:Math.round(metrics.networkMs),chatExportApiLastRequestMs:Math.round(metrics.requestMs),chatExportApiLastProcessingMs:Math.max(0,result.currentSessionTimings.currentRunMs-Math.round(metrics.requestMs)),chatExportApiLastRetries:metrics.retries,chatExportApiLastAuthRefreshes:metrics.authRefreshes,chatExportApiLastReason:job.reason});
      DS.diagOperationEnd?.(token,{outcome:job.reason,counts:{scanned:job.rawUniqueCount,changed:n,errors:verification.complete?0:1},meta:{jobId:job.jobId,pages:job.pages,expectedCount:job.expectedCount,rawUniqueCount:job.rawUniqueCount,duplicateRawRows:job.duplicateRawRows,filteredCount:result.filteredCount,rawCountDifference:verification.rawCountDifference,completeness:verification.completeness,chainBreaks:job.chainBreaks,linksChecked:job.linksChecked,headChanged:job.headChanged,elapsedMs:result.currentSessionTimings.currentRunMs,cumulativeSessionWallMs:result.elapsedMs,elapsedTimingKind:"current-session-wall",originalRetrievalMs:result.originalRetrievalMs,...result.currentSessionTimings,requestMs:Math.round(metrics.requestMs),checkpointMs:Math.round(checkpointMs),chainVerificationCpuMs:Math.round(verificationMs),retries:metrics.retries,authRefreshes:metrics.authRefreshes}});
      return result;
    });
  }

  async function loadExportHistory({ session = null, lock = null, onProgress = null, mode = "", allowFallback = true, forceNew = false } = {}) {
    const settings = session?.settings || DS.state?.settings || {};
    const selected = mode === "native" || mode === "api"
      ? mode
      : (settings.chatExportHistoryMode === "native" ? "native" : "api");

    if (selected === "native") {
      onProgress?.({ source: "dom", phase: "start", count: session ? session.order.length : getMessageRoots().length });
      const domResult = await loadAllPreviousMessages({ session, lock, onProgress });
      return { ...domResult, source: "dom", requestedSource: "native" };
    }

    try {
      const apiResult = await loadAllMessagesViaApi({ settings, lock, onProgress, forceNew });
      if (apiResult.messages.length || apiResult.checkpoint || apiResult.cancelled) return { ...apiResult, requestedSource: "api" };
      throw new Error("API export returned no messages");
    } catch (error) {
      if (!allowFallback || (EXPORT_UUID.test(chatRouteIds().conversationId))) throw error;
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.chatExportDomFallbacks = Number(perf.chatExportDomFallbacks || 0) + 1;
      onProgress?.({ source: "dom", phase: "fallback", count: session ? session.order.length : getMessageRoots().length });
      const domResult = await loadAllPreviousMessages({ session, lock, onProgress });
      return {
        ...domResult,
        source: "dom-fallback",
        requestedSource: "api",
        apiError: String(error?.message || error || "API export failed")
      };
    }
  }

  async function loadAllPreviousMessages({ session = null, lock = null, onProgress = null } = {}) {
    const settings = session?.settings || DS.state?.settings || {};
    const capture = session || createCaptureSession(settings);
    capture.nativeStats ||= { runs: 0, requests: 0, successes: 0, retries: 0, authRaces: 0, authRefreshes: 0, authRefreshTimeouts: 0 };
    capture.nativeStats.runs = Number(capture.nativeStats.runs || 0) + 1;
    let messages = capture.order.length ? capturedMessagesFromSession(capture) : mergeCapturedMessages(capture);

    let retries = Number(capture.nativeStats.retries || 0);
    let nativeRequests = Number(capture.nativeStats.requests || 0);
    let nativeSuccesses = Number(capture.nativeStats.successes || 0);
    let authRaces = Number(capture.nativeStats.authRaces || 0);
    let authRefreshes = Number(capture.nativeStats.authRefreshes || 0);
    let authRefreshTimeouts = Number(capture.nativeStats.authRefreshTimeouts || 0);
    const resumeCount = Math.max(0, Number(capture.nativeStats.runs || 1) - 1);

    onProgress?.({
      count: messages.length, clicked: capture.clicked, phase: resumeCount ? "resume" : "start", source: "dom",
      nativeRequests, nativeSuccesses, authRaces, authRefreshes, resumes: resumeCount
    });

    const ownsHistoryPause = !DS.state.bulkChatHistoryLoadActive;
    if (ownsHistoryPause) {
      DS.state.bulkChatHistoryLoadActive = true;
      DS.state.bulkChatHistoryLoadNeedsRefresh = false;
      DS.setClassState?.(document.documentElement, "ds-qol-history-loading", true);
    }

    document.documentElement.setAttribute("data-ds-chat-export-native-loading", "1");

    const initialMountedMessages = document.querySelectorAll("div[id^='message-']").length;
    const token = DS.diagOperationStart?.("chat-export", "load-older-messages", {
      initialMessages: messages.length, initialMountedMessages, resumeCount,
      priorRequests: nativeRequests, priorSuccesses: nativeSuccesses, priorAuthRaces: authRaces
    });
    const started = performance.now();
    let reason = "complete";
    let parsedRoots = 0;
    let zeroGrowthLoads = 0;

    const persistStats = () => {
      capture.nativeStats.requests = nativeRequests;
      capture.nativeStats.successes = nativeSuccesses;
      capture.nativeStats.retries = retries;
      capture.nativeStats.authRaces = authRaces;
      capture.nativeStats.authRefreshes = authRefreshes;
      capture.nativeStats.authRefreshTimeouts = authRefreshTimeouts;
    };

    const progress = (phase, extra = {}) => {
      persistStats();
      onProgress?.({
        source: "dom", count: messages.length, clicked: capture.clicked, phase,
        retries, nativeRequests, nativeSuccesses, authRaces, authRefreshes,
        authRefreshTimeouts, resumes: resumeCount, ...extra
      });
    };

    const reconcileMounted = roots => {
      const candidates = sortMessageRootsInDomOrder([
        ...(Array.isArray(roots) ? roots : []),
        ...getUncapturedNativeRoots(capture.orderSet)
      ]);
      if (!candidates.length) return 0;
      const before = capture.order.length;
      parsedRoots += candidates.length;
      messages = mergeCapturedNativeBatch(capture, candidates);
      return Math.max(0, capture.order.length - before);
    };

    const currentTiming = attempt => nativeHistoryTiming({
      attempt,
      mountedMessages: document.querySelectorAll("div[id^='message-']").length,
      recentRequestMs: nativeHistoryTelemetry().responseMs
    });
    const waitForAnyButton = (attempt = 0) => {
      const timing = currentTiming(attempt);
      return waitFor(() => findLoadPreviousMessagesButton(), timing.buttonReturnMs, 150);
    };
    const waitForReadyButton = (attempt = 0) => {
      const timing = currentTiming(attempt);
      return waitFor(() => findLoadPreviousMessagesButton({ readyOnly: true }), timing.readyButtonMs, 180);
    };

    try {
      for (let i = 0; i < 1000; i++) {
        if (capture.cancelled || lock?.cancelled) {
          reason = "cancelled";
          break;
        }

        let button = findLoadPreviousMessagesButton();
        if (!button) {
          button = await waitForAnyButton(0);
          if (!button) {
            reconcileMounted([]);
            reason = "complete";
            break;
          }
        }

        if (button.disabled || button.getAttribute("aria-disabled") === "true") {
          button = await waitForReadyButton(0);
          if (!button) {
            reconcileMounted([]);
            reason = findLoadPreviousMessagesButton() ? "stalled" : "complete";
            break;
          }
        }

        const beforeCount = capture.order.length;
        let loadState = null;
        let authRefreshTimedOut = false;
        let nonAuthHttpError = 0;

        for (let attempt = 0; attempt < 4; attempt++) {
          if (capture.cancelled || lock?.cancelled) break;

          let currentButton = findLoadPreviousMessagesButton({ readyOnly: true });
          if (!currentButton) currentButton = await waitForReadyButton(attempt);

          if (!currentButton) {
            const anyButton = findLoadPreviousMessagesButton() || await waitForAnyButton(attempt);
            if (!anyButton) {
              loadState = {
                progressed: true, clicked: false, requestObserved: false, responseObserved: false,
                nativeRequestDelta: 0, nativeSuccessDelta: 0, nativeAuth401Delta: 0,
                buttonGone: true, buttonReady: false, addedRoots: [], noButtonBeforeClick: true
              };
              break;
            }
            retries++;
            progress("waiting-button", { attempt: attempt + 1 });
            continue;
          }

          loadState = await clickAndWaitForNativeBatch(currentButton, capture.orderSet, {
            synthetic: attempt > 0,
            attempt
          });
          if (loadState.clicked) capture.clicked++;
          nativeRequests += Number(loadState.nativeRequestDelta || 0);
          nativeSuccesses += Number(loadState.nativeSuccessDelta || 0);
          authRaces += Number(loadState.nativeAuth401Delta || 0);
          if (attempt) retries++;
          progress(attempt ? "retrying" : "loading", {
            attempt: attempt + 1,
            httpStatus: Number(loadState.httpStatus || 0) || 0
          });

          if (loadState.authRace || Number(loadState.httpStatus || 0) === 401) {
            const responseAt = Number(loadState.responseAt || Date.now());
            const refreshTimeout = Number(loadState.timing?.authRefreshMs || currentTiming(attempt).authRefreshMs);
            progress("auth-refresh-wait", { authRace: true, authRefreshTimeoutMs: refreshTimeout });

            const refreshed = await waitForNativeAuthRefresh(responseAt, refreshTimeout);
            if (!refreshed) {
              authRefreshTimeouts++;
              authRefreshTimedOut = true;
              progress("auth-refresh-timeout", { authRace: true });
              break;
            }

            authRefreshes++;
            progress("auth-refreshed", { authAt: refreshed.authAt });
            // SpicyChat often remounts/replaces the button after refreshing auth.
            // Do not reuse the pre-401 element; wait for a fresh live control.
            await waitForReadyButton(attempt + 1);
            continue;
          }

          const status = Number(loadState.httpStatus || 0) || 0;
          if (status >= 400) {
            nonAuthHttpError = status;
            if (status === 408 || status === 425 || status === 429 || status >= 500) {
              await DS.sleep?.(Math.min(3000, 450 * (attempt + 1)));
              continue;
            }
            break;
          }

          if (loadState.progressed) break;

          // No request means the click missed SpicyChat's current React handler.
          // A request with no completed response can simply be a busy giant DOM,
          // so let the adaptive timeout/backoff grow before the next live click.
          await DS.sleep?.(loadState.requestObserved ? Math.min(1800, 450 + attempt * 300) : 250);
        }

        if (capture.cancelled || lock?.cancelled) {
          reason = "cancelled";
          break;
        }

        if (authRefreshTimedOut) {
          reconcileMounted([]);
          messages = capturedMessagesFromSession(capture);
          reason = "native-auth-refresh-timeout";
          break;
        }

        if (nonAuthHttpError && !loadState?.progressed) {
          reconcileMounted([]);
          messages = capturedMessagesFromSession(capture);
          reason = `native-http-${nonAuthHttpError}`;
          break;
        }

        if (loadState?.noButtonBeforeClick) {
          reconcileMounted([]);
          reason = "complete";
          break;
        }

        const addedNow = reconcileMounted(loadState?.addedRoots || []);
        const growth = capture.order.length - beforeCount;
        const grew = growth > 0 || addedNow > 0;
        if (grew) {
          zeroGrowthLoads = 0;
          capture.stalled = 0;
        } else {
          zeroGrowthLoads++;
        }

        messages = capturedMessagesFromSession(capture);
        progress("captured", { httpStatus: Number(loadState?.httpStatus || 0) || 0 });

        // A successful response that removes the load button without adding IDs
        // is an exhausted active-history page. This is valid even when
        // SpicyChat's displayed count differs because of regenerations/replaced
        // messages; completion follows the active message chain, not the badge.
        if (!grew && loadState?.nativeSuccessDelta > 0 && loadState?.buttonGone) {
          const returned = await waitForAnyButton(0);
          reconcileMounted([]);
          messages = capturedMessagesFromSession(capture);
          if (!returned) {
            reason = "complete";
            break;
          }
        }

        if (!grew) {
          capture.stalled++;
          if (loadState?.requestObserved && !loadState?.responseObserved) reason = "native-response-timeout";
          else reason = loadState?.requestObserved ? "native-no-growth" : "native-no-request";
          break;
        }

        let nextButton = findLoadPreviousMessagesButton();
        if (!nextButton) nextButton = await waitForAnyButton(0);
        reconcileMounted([]);
        messages = capturedMessagesFromSession(capture);
        if (!nextButton) {
          reason = "complete";
          break;
        }

        if (zeroGrowthLoads >= 2) {
          reason = "stalled";
          break;
        }

        await DS.sleep?.(0);
      }

      reconcileMounted([]);
      messages = capturedMessagesFromSession(capture);

      let remainingButton = findLoadPreviousMessagesButton();
      if (!remainingButton && reason === "complete") remainingButton = await waitForAnyButton(0);
      const complete = !remainingButton && reason === "complete";
      if (!complete && reason === "complete") reason = "limit";
      const mountedMessages = document.querySelectorAll("div[id^='message-']").length;
      const elapsedMs = Math.round(performance.now() - started);
      persistStats();

      const result = {
        session: capture,
        messages,
        clicked: capture.clicked,
        complete,
        cancelled: reason === "cancelled",
        reason,
        source: "dom",
        messageCount: messages.length,
        initialMountedMessages,
        mountedMessages,
        parsedRoots,
        retries,
        nativeRequests,
        nativeSuccesses,
        authRaces,
        authRefreshes,
        authRefreshTimeouts,
        resumes: resumeCount,
        elapsedMs
      };

      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      perf.chatExportNativeRuns = Number(perf.chatExportNativeRuns || 0) + 1;
      perf.chatExportNativeLastMessages = messages.length;
      perf.chatExportNativeLastMounted = mountedMessages;
      perf.chatExportNativeLastParsedRoots = parsedRoots;
      perf.chatExportNativeLastRetries = retries;
      perf.chatExportNativeLastRequests = nativeRequests;
      perf.chatExportNativeLastSuccesses = nativeSuccesses;
      perf.chatExportNativeLastAuthRaces = authRaces;
      perf.chatExportNativeLastAuthRefreshes = authRefreshes;
      perf.chatExportNativeLastAuthRefreshTimeouts = authRefreshTimeouts;
      perf.chatExportNativeLastResumes = resumeCount;
      perf.chatExportNativeLastMs = elapsedMs;
      perf.chatExportNativeLastReason = reason;

      DS.diagOperationEnd?.(token, {
        outcome: reason,
        counts: { scanned: parsedRoots, changed: messages.length, skipped: 0, errors: complete || reason === "cancelled" ? 0 : 1 },
        extra: {
          source: "dom", initialMountedMessages, mountedMessages, retries, nativeRequests, nativeSuccesses,
          authRaces, authRefreshes, authRefreshTimeouts, resumes: resumeCount, elapsedMs
        }
      });
      return result;
    } finally {
      persistStats();
      document.documentElement.removeAttribute("data-ds-chat-export-native-loading");
      if (ownsHistoryPause) {
        DS.state.bulkChatHistoryLoadActive = false;
        DS.setClassState?.(document.documentElement, "ds-qol-history-loading", false);
        DS.state.bulkChatHistoryLoadNeedsRefresh = false;
        DS.state.messageDirtyRoots?.clear?.();
        if (DS.state.messageDirtyQueue) DS.state.messageDirtyQueue.length = 0;

        const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
        counters.chatExportHistoryCatchupSkips = Number(counters.chatExportHistoryCatchupSkips || 0) + 1;
      }
    }
  }



  async function copyTextValue(text) {
    const value = String(text || "");
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}

    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-10000px";
    helper.style.top = "0";
    document.documentElement.appendChild(helper);
    helper.focus();
    helper.select();
    let copied = false;
    try { copied = !!document.execCommand("copy"); } catch {}
    helper.remove();
    return copied;
  }

  async function downloadText(text, mime, filename) {
    if (typeof DS.downloadTextFile !== "function") return { ok: false, error: "Download helper unavailable." };
    try { return await DS.downloadTextFile(text, filename, mime, { requestPermission: true }); }
    catch (error) { return { ok: false, error: String(error?.message || error) }; }
  }

  function printHtml(html) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";

    const cleanup = () => {
      try { frame.remove(); } catch {}
      try { URL.revokeObjectURL(url); } catch {}
    };

    frame.addEventListener("load", () => {
      setTimeout(() => {
        try {
          const printWindow = frame.contentWindow;
          if (!printWindow) throw new Error("Print frame unavailable");
          printWindow.focus();
          printWindow.print();
          setTimeout(cleanup, 1000);
        } catch {
          cleanup();
          DS.setQuickStatus?.("Print failed. Download the HTML and print it from the browser.");
        }
      }, 150);
    }, { once: true });
    frame.addEventListener("error", () => {
      cleanup();
      DS.setQuickStatus?.("Print failed. Download the HTML and print it from the browser.");
    }, { once: true });
    frame.src = url;
    document.documentElement.appendChild(frame);
  }

  function makeExportSelect(id, labelText, values) {
    const label = document.createElement("label");
    label.appendChild(document.createTextNode(labelText));
    const select = document.createElement("select");
    select.id = id;
    for (const [value, text] of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    label.appendChild(select);
    return { label, select };
  }

  function makeExportCheckbox(id, labelText) {
    const label = document.createElement("label");
    label.className = "ds-export-check";
    const input = document.createElement("input");
    input.id = id;
    input.type = "checkbox";
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${labelText}`));
    return { label, input };
  }

  function makeExportButton(id, text, ariaLabel = "") {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.textContent = text;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  // Generate one bounded fragment at a time. File System Access streams directly
  // to a user-chosen file on supporting browsers; Blob fallback buffers the
  // output bytes, not a second entire transcript string.
  function streamExportHeader(data, opts, count) {
    if(opts.format==='json'||opts.format==='json.gz'){
      const base=JSON.parse(jsonData({...data,messages:[]},opts));
      delete base.messages;
      if(base.history)base.history.messageCount=count;
      return JSON.stringify(base).slice(0,-1)+',"messages":[';
    }
    if(opts.format==='markdown')return makeMarkdown({...data,messages:[]},opts).replace(/No chat messages found\.$/,'');
    if(opts.format==='html')return makeHtml({...data,messages:[]},opts).replace(/<p>No chat messages found\.<\/p><\/section><\/main><\/body><\/html>$/,'');
    return makePlainText({...data,messages:[]},opts).replace(/No chat messages found\.$/,'');
  }
  function streamExportFragment(data, opts, rows, offset) {
    if(!rows.length)return '';
    if(opts.censored&&typeof DS.censorChatExportText==='function')rows=rows.map(m=>({...m,text:DS.censorChatExportText(m.text,m.role||m.speaker)}));
    const body={...data,messages:rows};
    const options={...opts,offset,bodyOnly:true,streamAvatars:true};
    if(opts.format==='json'||opts.format==='json.gz')return (offset?',':'')+rows.map((message,i)=>JSON.stringify(jsonMessageEntry(message,opts,offset+i))).join(',');
    if(opts.format==='markdown')return makeMarkdown(body,options)+'\n\n';
    if(opts.format==='html')return makeHtml(body,options)+'\n';
    return makePlainText(body,options)+'\n\n';
  }
  function exportFormatSpec(format) {
    return format==='json.gz'?{ext:'json.gz',mime:'application/gzip'}:format==='json'?{ext:'json',mime:'application/json;charset=utf-8'}:format==='markdown'?{ext:'md',mime:'text/markdown;charset=utf-8'}:format==='html'?{ext:'html',mime:'text/html;charset=utf-8'}:{ext:'txt',mime:'text/plain;charset=utf-8'};
  }
  async function* checkpointExportRows(status, includeOoc, metadata, onPage) {
    const ids=status.checkpointIds;
    let readPages=0;
    for(const page of checkpointPageOrder(status)){
      const response=await exportCheckpointCall(ids,'page',{jobId:status.jobId,page});
      const messages=response.page.messages;
      if(!Array.isArray(messages))throw Error('Checkpoint is missing message data.');
      const rows=[];
      for(let i=messages.length-1;i>=0;i--){
        const m=messages[i];
        if(!exportMessageAllowed(m,{chatExportIncludeOocDirectives:includeOoc}))continue;
        const captured=metadata[m.id]||null;
        rows.push({...m,metadata:captured?(m.createdAt&&!captured.createdAt?{...captured,createdAt:m.createdAt}:captured):(m.createdAt?{createdAt:m.createdAt}:null)});
      }
      yield rows;onPage?.(++readPages);
    }
  }
  async function downloadStreamedChat(data, opts, {disk=false,onProgress=()=>{}}={}) {
    const status=data.captureStatus||{};
    const spec=exportFormatSpec(opts.format);
    const filename=`${safeBaseName(data.botInfo?.name)}-chat-export${status.terminal===false?'-partial':''}.${spec.ext}`;
    const total=disk?Number(data.messageCount||0):data.messages.length;
    const diag=DS.diagOperationStart?.('chat-export','api-export-file',{jobId:status.jobId,format:opts.format,count:total});
    const phaseStarted=performance.now();
    let offset=0,writer=null,downloadStarted=false,serializeCpuMs=0,encodeCpuMs=0,pageReadWallMs=0,sinkWriteWallMs=0,pipelineWallMs=0,confirmationWallMs=0,outputBytes=0;
    const phaseMetrics=()=>({fileGenerationWallMs:Math.round(pipelineWallMs),compressionPipelineWallMs:opts.format==='json.gz'?Math.round(pipelineWallMs):null,fileTotalWallMs:Math.round(performance.now()-phaseStarted),serializationCpuMs:Math.round(serializeCpuMs),encodingCpuMs:Math.round(encodeCpuMs),pageReadWallMs:Math.round(pageReadWallMs),pipelineWallMs:Math.round(pipelineWallMs),compressionEnabled:opts.format==='json.gz',sinkWriteWallMs:Math.round(sinkWriteWallMs),downloadConfirmationWallMs:Math.round(confirmationWallMs),outputBytes});
    try{
      if(opts.format==='json.gz'&&typeof CompressionStream!=='function')throw Error('This browser does not provide GZIP compression. Select JSON instead.');
      // The picker must be invoked while the actual user click is still active.
      if(opts.fileHandle){writer=await opts.fileHandle.createWritable();}
      else if(typeof window.showSaveFilePicker==='function'&&opts.streamToDisk===true){
        const handle=await window.showSaveFilePicker({suggestedName:filename});writer=await handle.createWritable();
      }
      if(disk&&opts.includeBotInfo){data={...data,botInfo:await collectAvailableBotInfo()};}
      const metadata=disk?await loadGenerationMetadata():{};
      const batches=disk?checkpointExportRows(status,data.includesOocDirectives,metadata): (async function*(){for(let i=0;i<data.messages.length;i+=200)yield data.messages.slice(i,i+200);})();
      async function* fragments(){
        let t=performance.now();const header=streamExportHeader(data,opts,total);serializeCpuMs+=performance.now()-t;yield header;
        const source=batches[Symbol.asyncIterator]();
        while(true){
          t=performance.now();const next=await source.next();pageReadWallMs+=performance.now()-t;if(next.done)break;const rows=next.value;
          if(disk&&!exportSameChat(status.checkpointIds))throw Error('Conversation changed; export stopped. Checkpoint retained.');
          if(rows.length){t=performance.now();const fragment=streamExportFragment(data,opts,rows,offset);serializeCpuMs+=performance.now()-t;yield fragment;offset+=rows.length;}
          onProgress(`${opts.format==='json.gz'?'Compressing':'Preparing file'} · ${offset.toLocaleString()} / ${total.toLocaleString()} messages`);
          // A disk read provides an asynchronous yield. For memory-backed
          // exports, yield periodically so the UI remains responsive.
          if(!disk&&offset%2000===0)await DS.sleep?.(0);
        }
        if(offset!==total)throw Error(`Saved message count changed (${offset} / ${total}); file not marked successful.`);
        if(opts.format==='json'||opts.format==='json.gz')yield ']}';
        else if(opts.format==='html')yield '</section></main></body></html>';
      }
      const iterator=fragments();const encoder=new TextEncoder();
      let stream=new ReadableStream({async pull(controller){try{const r=await iterator.next();if(r.done)controller.close();else {const t=performance.now();const bytes=encoder.encode(r.value);encodeCpuMs+=performance.now()-t;controller.enqueue(bytes);}}catch(error){controller.error(error);}},cancel(){return iterator.return?.();}});
      if(opts.format==='json.gz')stream=stream.pipeThrough(new CompressionStream('gzip'));
      const pipeStart=performance.now();let outcome='download-unconfirmed';
      if(writer){
        const fileWriter=writer;
        await stream.pipeTo(new WritableStream({async write(bytes){const t=performance.now();try{await fileWriter.write(bytes);outputBytes+=bytes.byteLength;}finally{sinkWriteWallMs+=performance.now()-t;}},async close(){const t=performance.now();try{await fileWriter.close();}finally{sinkWriteWallMs+=performance.now()-t;}},abort:reason=>fileWriter.abort(reason)}));
        pipelineWallMs=performance.now()-pipeStart;writer=null;downloadStarted=true;outcome='file-saved';onProgress('File saved successfully. Checkpoint retained.');
      }else{
        const blob=await new Response(stream,{headers:{'Content-Type':spec.mime}}).blob();
        pipelineWallMs=performance.now()-pipeStart;outputBytes=blob.size;
        onProgress(`Preparing browser download · ${(blob.size/1048576).toFixed(1)} MiB`);
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;
        try{document.documentElement.append(a);a.click();downloadStarted=true;}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
        onProgress('Download requested. Checking browser confirmation if available…');
        const confirmStart=performance.now();
        // No new required permission. Exact blob URL only; on browsers that
        // omit blob downloads from the API we continue to report unconfirmed.
        if(status.checkpointIds){
          for(let attempt=0;attempt<6;attempt++){
            if(attempt)await new Promise(resolve=>setTimeout(resolve,1000));
            const result=await exportCheckpointCall(status.checkpointIds,'download-status',{blobUrl:url}).catch(()=>({state:'unavailable'}));
            if(result.state==='complete'){outcome='download-completed';break;}
            if(result.state==='interrupted'){outcome='download-interrupted';break;}
            if(result.state==='unavailable')break;
            if(result.state==='in_progress')outcome='download-in-progress';
          }
        }
        confirmationWallMs=performance.now()-confirmStart;
        onProgress(outcome==='download-completed'?'Browser confirmed download completed. Checkpoint retained.':outcome==='download-interrupted'?'Browser reported an interrupted download. Retry from the saved capture.':outcome==='download-in-progress'?'Download still in progress. Completion not yet confirmed; checkpoint retained.':'Download requested. Browser save completion is not confirmed; checkpoint retained.');
      }
      DS.diagOperationEnd?.(diag,{outcome,counts:{scanned:offset},meta:{jobId:status.jobId,format:opts.format,...phaseMetrics(),timingNote:'Pipeline wall includes overlapping reads, serialization, compression and output; compression CPU is not independently observable.'}});
      const timings=phaseMetrics();
      onProgress(`${outcome==='file-saved'?'File saved successfully':outcome==='download-completed'?'Browser confirmed download completed':outcome==='download-interrupted'?'Browser reported an interrupted download':outcome==='download-in-progress'?'Download still in progress; completion unconfirmed':'Download requested; completion unconfirmed'}. File generation: ${formatExportDuration(timings.fileGenerationWallMs)} · Download confirmation: ${formatExportDuration(timings.downloadConfirmationWallMs)}.${status.checkpoint?' Checkpoint retained.':''}`);
      return {ok:outcome!=='download-interrupted',downloadStarted,outcome,timings};
    }catch(error){
      if(writer)try{await writer.abort();}catch{}
      const message=String(error?.message||error);onProgress(`File not confirmed: ${message}. Saved capture retained; retry without fetching again.`);
      DS.diagOperationEnd?.(diag,{outcome:'file-error',counts:{scanned:offset,errors:1},meta:{jobId:status.jobId,format:opts.format,...phaseMetrics(),errorKind:String(error?.name||'file-error')}});
      return {ok:false,error:message};
    }
  }
  async function withSavedCheckpoint(status,task){
    const ids=status.checkpointIds;
    return navigator.locks.request(`dsq-export:${ids.characterId}:${ids.conversationId}`,{ifAvailable:true},async owned=>{
      if(!owned)throw Error('Another tab is using this capture.');
      try{return await task();}finally{await exportCheckpointCall(ids,'release').catch(()=>{});}
    });
  }
  async function showSavedChainAudit(status,onProgress){
    return withSavedCheckpoint(status,async()=>{
      const report=await auditCheckpointChain(status,onProgress);
      status.savedChainAudit=report;
      const copied=await copyTextValue(JSON.stringify(report,null,2));
      const first=report.examples[0];
      onProgress(`Checked ${report.linksChecked.toLocaleString()} links · ${report.contradictions} contradictions · ${report.missingLinkEvidence} rows without link evidence.${first?` First mismatch: page ${first.from.page}, row ${first.from.row} → ${first.observed?`page ${first.observed.page}, row ${first.observed.row}`:'API end'} (${first.reason}).`:''} ${copied?'Privacy-safe report copied.':'Could not copy report; download JSON to include the audit.'}`);
      return report;
    });
  }
  async function showLargeCheckpointModal(status, settings) {
    if(!exportSameChat(status.checkpointIds))return;
    document.getElementById('ds-chat-export-modal')?.remove();
    const modal=document.createElement('div');modal.id='ds-chat-export-modal';
    const backdrop=document.createElement('div');backdrop.className='ds-export-backdrop';
    const dialog=document.createElement('div');dialog.className='ds-export-dialog ds-export-dialog-v2';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Large chat export');
    const head=document.createElement('div');head.className='ds-export-head';
    const details=document.createElement('div');const title=document.createElement('h2');title.textContent='Large chat export — saved locally';
    const summary=document.createElement('p');const note=document.createElement('p');
    note.textContent='Automatic preview is disabled. Full message pages are stored in this browser’s QoL IndexedDB, excluded from cloud sync. They remain until you explicitly clear or replace this capture.';
    details.append(title,summary,note);const close=makeExportButton('ds-export-large-close','×','Close');head.append(details,close);
    const controls=document.createElement('div');controls.className='ds-export-controls';
    const format=makeExportSelect('ds-export-large-format','Format',[['json.gz','Compressed JSON (.json.gz)'],['json','JSON backup'],['text','Plain text'],['markdown','Markdown'],['html','HTML archive']]);
    format.select.value=typeof CompressionStream==='function'?'json.gz':'json';
    const layout=makeExportSelect('ds-export-large-layout','HTML layout',[['bubbles','Match current chat appearance'],['transcript','Clean transcript']]);layout.select.value=settings.chatExportHtmlLayout||'bubbles';
    const options=[['bot','Bot info',!!settings.chatExportIncludeBotInfo],['rulebook','Rulebook snapshot',!!settings.chatExportIncludeRulebook],['ruleState','Visible Rulebook state',!!settings.chatExportIncludeRulebookState],['ooc','OOC/directives',!!settings.chatExportIncludeOocDirectives],['generation','Captured timestamps/model details',settings.chatExportIncludeGenerationDetails!==false],['numbers','Message numbers',settings.chatExportNumberMessages!==false],['avatars','Avatars',settings.chatExportIncludeAvatars!==false],['images','Message image links',!!settings.chatExportIncludeImageLinks],['censored','Censored copy',false]];
    const checks={};controls.append(format.label,layout.label);
    for(const [key,label,value] of options){const c=makeExportCheckbox('ds-export-large-'+key,label);c.input.checked=value;checks[key]=c.input;controls.append(c.label);}
    checks.censored.disabled=!settings.enableChatWordCensor||!String(settings.chatWordCensorList||'').trim();
    const progress=document.createElement('p');progress.setAttribute('role','status');
    const actions=document.createElement('div');actions.className='ds-export-actions';
    const download=makeExportButton('ds-export-large-download','Download saved capture');
    const save=makeExportButton('ds-export-large-save','Save directly to file…');save.hidden=typeof window.showSaveFilePicker!=='function';
    const resume=makeExportButton('ds-export-large-resume','Resume fetching');resume.hidden=status.terminal||['api-cursor-loop','api-no-progress'].includes(status.reason);
    const fresh=makeExportButton('ds-export-large-fresh','Start fresh capture…');
    const clear=makeExportButton('ds-export-large-clear','Clear saved capture…');
    const audit=makeExportButton('ds-export-large-audit','Audit saved chain / copy report');
    const appendNew=makeExportButton('ds-export-large-append','Fetch new messages');appendNew.title='Append up to 25 API pages atomically if the saved head is found. Does not revalidate older edits.';appendNew.hidden=!status.terminal;
    actions.append(download,save,resume,appendNew,audit,fresh,clear);dialog.append(head,controls,progress,actions);modal.append(backdrop,dialog);document.documentElement.append(modal);
    let busy=false;
    const sync=()=>{const count=checks.ooc.checked?status.allActiveCount:status.standardCount;const difference=status.rawCountDifference;summary.textContent=`${count.toLocaleString()} exportable messages · ${status.rawUniqueCount.toLocaleString()} unique API rows · ${status.pages} saved pages · ${status.completeness}${difference===null?'':difference<0?` · ${-difference} more API rows than reported`:difference>0?` · ${difference} fewer API rows than reported`:' · native count agrees'}${status.headChanged?' · saved snapshot head changed since capture':''}${status.chainBreaks?` · ${status.chainBreaks} previous-link contradictions (run audit for details)`:''}${status.incrementalSnapshot?' · append-only snapshot, older history not revalidated':''}.`;layout.select.disabled=format.select.value!=='html';};
    const timingNote=document.createElement('p');timingNote.className='hint';timingNote.textContent=exportSessionSummary(status);dialog.insertBefore(timingNote,progress);
    checks.ooc.addEventListener('change',sync);format.select.addEventListener('change',sync);sync();
    const closeModal=()=>{if(!busy)modal.remove();};close.addEventListener('click',closeModal);backdrop.addEventListener('click',closeModal);
    async function runDownload(streamToDisk){
      if(busy||!exportSameChat(status.checkpointIds))return;
      busy=true;for(const b of actions.children)b.disabled=true;
      try{
        // Acquire the save destination inside the click's user activation by
        // building only synchronous metadata here; disk messages stream later.
        const opts={format:format.select.value,layout:layout.select.value,includeBotInfo:checks.bot.checked,includeRulebook:checks.rulebook.checked,includeRulebookState:checks.ruleState.checked,includeGenerationDetails:checks.generation.checked,numberMessages:checks.numbers.checked,includeAvatars:checks.avatars.checked,includeImageLinks:checks.images.checked,censored:checks.censored.checked,streamToDisk};
        const snapshot={exportedAt:new Date().toISOString(),chatUrl:location.href,botInfo:collectBotInfo()||{},rulebook:checks.rulebook.checked?(DS.snapshotVisibleRulebook?.()||null):null,rulebookState:checks.ruleState.checked?collectVisibleRulebookState(collectMessages(settings)):null,appearanceTemplate:captureAppearanceTemplate(),messages:[],captureStatus:{...status,messages:undefined,filteredCount:status.rawUniqueCount-(checks.ooc.checked?status.allActiveCount:status.standardCount)},includesOocDirectives:checks.ooc.checked,messageCount:checks.ooc.checked?status.allActiveCount:status.standardCount};
        const ids=status.checkpointIds;
        const execute=async owned=>{if(!owned){progress.textContent='Another tab is using this checkpoint.';return;}const current=(await exportCheckpointCall(ids,'get')).job;if(current?.jobId!==status.jobId||current.revision!==status.revision)throw Error('Saved capture changed. Close and reopen Export.');await downloadStreamedChat(snapshot,opts,{disk:true,onProgress:text=>progress.textContent=text});};
        // A picker invoked after a lock/metadata await may lose activation.
        // For direct-to-file the browser dialog is acquired up front instead.
        if(streamToDisk&&typeof window.showSaveFilePicker==='function'){
          const spec=exportFormatSpec(opts.format);const handle=await window.showSaveFilePicker({suggestedName:`${safeBaseName(snapshot.botInfo?.name)}-chat-export.${spec.ext}`});opts.fileHandle=handle;
        }
        await navigator.locks.request(`dsq-export:${ids.characterId}:${ids.conversationId}`,{ifAvailable:true},execute);
      }catch(error){progress.textContent=`Export not confirmed: ${String(error?.message||error)}. Checkpoint retained.`;}
      finally{await exportCheckpointCall(status.checkpointIds,'release').catch(()=>{});busy=false;for(const b of actions.children)b.disabled=false;}
    }
    download.addEventListener('click',()=>runDownload(false));save.addEventListener('click',()=>runDownload(true));
    const localTask=async task=>{if(busy)return;busy=true;for(const b of actions.children)b.disabled=true;try{await task();}catch(error){progress.textContent=`${String(error?.message||error)} Saved capture retained; reopen to check its latest state.`;}finally{busy=false;for(const b of actions.children)b.disabled=false;}};
    audit.addEventListener('click',()=>localTask(()=>showSavedChainAudit(status,text=>progress.textContent=text)));
    appendNew.addEventListener('click',()=>localTask(async()=>{
      const result=await withSavedCheckpoint(status,()=>extendSavedCheckpoint(status,{...settings,chatExportIncludeOocDirectives:checks.ooc.checked},text=>progress.textContent=text));
      Object.assign(status,result.status);if(result.added){delete status.savedChainAudit;sync();}timingNote.textContent=exportSessionSummary(status);
      progress.textContent=result.added?`Saved ${result.added.toLocaleString()} new messages. Previous pages retained; older edits or regenerated branches are not revalidated.`:'No new rows before the saved head. Older history was not revalidated.';
    }));
    resume.addEventListener('click',()=>{if(!busy){modal.remove();DS.exportCurrentChat();}});
    fresh.addEventListener('click',()=>{if(!busy){modal.remove();DS.exportCurrentChat({forceNew:true});}});
    clear.addEventListener('click',async()=>{
      if(busy||!confirm('Delete the saved local export checkpoint for this conversation? This does not change the SpicyChat conversation or files you downloaded.'))return;
      try{await navigator.locks.request(`dsq-export:${status.checkpointIds.characterId}:${status.checkpointIds.conversationId}`,{ifAvailable:true},async owned=>{if(!owned)throw Error('Another tab is using this checkpoint.');await exportCheckpointCall(status.checkpointIds,'clear',{jobId:status.jobId,revision:status.revision});});modal.remove();DS.setQuickStatus?.('Local export checkpoint cleared.');}catch(error){progress.textContent=String(error?.message||error);}finally{await exportCheckpointCall(status.checkpointIds,'release').catch(()=>{});}
    });
  }

  function showExportModal(data) {
    document.getElementById("ds-chat-export-modal")?.remove();
    const settings = DS.state?.settings || {};
    const modal = document.createElement("div");
    modal.id = "ds-chat-export-modal";

    const backdrop = document.createElement("div");
    backdrop.className = "ds-export-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "ds-export-dialog ds-export-dialog-v2";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Chat export");

    const head = document.createElement("div");
    head.className = "ds-export-head";
    const headText = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "Chat export";
    const count = document.createElement("p");
    const countNote = document.createElement("p");
    countNote.textContent = "Note: SpicyChat's displayed chat count may include deleted or replaced messages.";
    headText.append(title, count, countNote);
    const closeButton = makeExportButton("ds-export-close", "×", "Close");
    head.append(headText, closeButton);

    const controls = document.createElement("div");
    controls.className = "ds-export-controls";
    const formatControl = makeExportSelect("ds-export-format", "Format", [
      ["text", "Plain text"],
      ["markdown", "Markdown"],
      ["html", "HTML archive"],
      ["json", "JSON backup"],
      ...(typeof CompressionStream === "function" && !window.flutter_inappwebview?.callHandler && typeof window._dsRequestExport !== "function" ? [["json.gz", "Compressed JSON (.json.gz)"]] : []),
    ]);
    const layoutControl = makeExportSelect("ds-export-layout", "HTML layout", [
      ["bubbles", "Match current chat appearance"],
      ["transcript", "Clean transcript"],
    ]);
    const botInfoControl = makeExportCheckbox("ds-export-bot-info", "Bot info");
    const rulebookControl = makeExportCheckbox("ds-export-rulebook", "Rulebook snapshot (at export)");
    rulebookControl.label.title = "Exports the visible Rulebook name and HUD meters only, not the Rulebook's full instructions or historical state.";
    const rulebookStateControl = makeExportCheckbox("ds-export-rulebook-state", "Rulebook state (Story Moments / Story Time)");
    rulebookStateControl.label.title = "Exports visible Rulebook status changes attached to currently mounted chat messages. Does not reconstruct older events or export the full Rulebook.";
    const oocControl = makeExportCheckbox("ds-export-ooc", "OOC/directives");
    const generationControl = makeExportCheckbox("ds-export-generation", "Captured timestamps/model details");
    const numbersControl = makeExportCheckbox("ds-export-numbers", "Message numbers");
    const avatarsControl = makeExportCheckbox("ds-export-avatars", "Avatars in HTML/JSON");
    const imageLinksControl = makeExportCheckbox("ds-export-image-links", "Message image links (when available)");
    const censoredControl = makeExportCheckbox("ds-export-censor", "Export censored copy (original by default)");
    controls.append(
      formatControl.label,
      layoutControl.label,
      botInfoControl.label,
      rulebookControl.label,
      rulebookStateControl.label,
      oocControl.label,
      generationControl.label,
      numbersControl.label,
      avatarsControl.label,
      imageLinksControl.label,
      censoredControl.label,
    );

    const textarea = document.createElement("textarea");
    textarea.id = "ds-chat-export-text";
    textarea.spellcheck = false;

    const actions = document.createElement("div");
    actions.className = "ds-export-actions";
    // Normal export always fetches the complete active history through the API
    // before this window is shown. A retry only appears when that automatic
    // fetch did not complete; Native lives behind Advanced / Compatibility.
    const apiHistoryButton = makeExportButton("ds-chat-export-api-history", "Retry full chat fetch");
    const archivePresetButton = makeExportButton("ds-chat-export-archive-preset", "Archive / Recovery Lab");
    archivePresetButton.title = "Prepare a private JSON recovery backup. Adds evidence options without unchecking existing choices or changing saved defaults.";
    const copyButton = makeExportButton("ds-chat-export-copy", "Copy");
    const downloadButton = makeExportButton("ds-chat-export-download", "Download");
    const printButton = makeExportButton("ds-chat-export-print", "Print / Save PDF");
    const clearCheckpointButton = makeExportButton("ds-export-clear-checkpoint", "Clear saved capture…");
    const auditCheckpointButton=makeExportButton('ds-export-audit-checkpoint','Audit saved chain / copy report');
    const appendCheckpointButton=makeExportButton('ds-export-append-checkpoint','Fetch new messages');appendCheckpointButton.title='Append up to 25 API pages atomically if the saved head is found. Does not revalidate older edits.';
    actions.append(archivePresetButton, apiHistoryButton, copyButton, downloadButton, printButton, appendCheckpointButton,auditCheckpointButton,clearCheckpointButton);

    const compatibility = document.createElement("details");
    compatibility.className = "ds-export-compatibility";
    const compatibilitySummary = document.createElement("summary");
    compatibilitySummary.textContent = "Advanced / Compatibility";
    const nativeWarning = document.createElement("p");
    nativeWarning.className = "ds-export-native-warning";
    nativeWarning.textContent = "Normal export already uses the fast API and keeps old history out of the live page. The page-loading method below is only for compatibility/testing and can become extremely slow or memory-heavy on large chats.";
    const compatibilityActions = document.createElement("div");
    compatibilityActions.className = "ds-export-actions";
    const refreshApiButton = makeExportButton("ds-chat-export-refresh-api", "Refresh chat data (API)");
    const nativeHistoryButton = makeExportButton("ds-chat-export-native-history", "Load full chat through page (very slow)");
    const reloadChatButton = makeExportButton("ds-chat-export-reload-chat", "Reload chat to clear page-loaded history");
    reloadChatButton.hidden = true;
    compatibilityActions.append(refreshApiButton, nativeHistoryButton, reloadChatButton);
    compatibility.append(compatibilitySummary, nativeWarning, compatibilityActions);

    dialog.append(head, controls, textarea, actions, compatibility);
    modal.append(backdrop, dialog);
    document.documentElement.appendChild(modal);

    const format = formatControl.select;
    const layout = layoutControl.select;
    const botInfo = botInfoControl.input;
    const rulebook = rulebookControl.input;
    const rulebookState = rulebookStateControl.input;
    const ooc = oocControl.input;
    const generation = generationControl.input;
    const numbers = numbersControl.input;
    const avatars = avatarsControl.input;
    const imageLinks = imageLinksControl.input;
    const censored = censoredControl.input;

    format.value = settings.chatExportDefaultFormat || "text";
    layout.value = settings.chatExportHtmlLayout || "bubbles";
    botInfo.checked = !!settings.chatExportIncludeBotInfo;
    rulebook.checked = !!settings.chatExportIncludeRulebook;
    rulebookState.checked = settings.chatExportIncludeRulebookState === true;
    ooc.checked = !!settings.chatExportIncludeOocDirectives;
    generation.checked = settings.chatExportIncludeGenerationDetails !== false;
    numbers.checked = settings.chatExportNumberMessages !== false;
    avatars.checked = settings.chatExportIncludeAvatars !== false;
    imageLinks.checked = settings.chatExportIncludeImageLinks === true;
    censored.checked = false; // Never turn this on without a fresh explicit choice.
    censored.disabled = !settings.enableChatWordCensor || !String(settings.chatWordCensorList || "").trim();
    censored.title = "Masks only message text. The original source remains unchanged.";

    let workingData = data;
    let activeLoadLock = null;
    let apiCapture = createCaptureSession(settings, data.captureStatus?.source === "api" ? (data.messages || []) : []);
    let nativeCapture = createCaptureSession(settings, collectMessages(settings));
    let activeCapture = data.captureStatus?.source === "dom" ? nativeCapture : apiCapture;
    let largePreviewSkipped = false;
    const LARGE_PREVIEW_MESSAGE_THRESHOLD = 3000;
    const opts = () => ({ format: format.value, layout: layout.value, includeBotInfo: botInfo.checked, includeRulebook: rulebook.checked, includeRulebookState: rulebookState.checked, includeGenerationDetails: generation.checked, numberMessages: numbers.checked, includeAvatars: avatars.checked, includeImageLinks: imageLinks.checked, censored: censored.checked });
    const exportExt = () => format.value === "markdown" ? "md" : format.value === "json.gz" ? "json.gz" : format.value === "json" ? "json" : format.value === "html" ? "html" : "txt";
    const refresh = () => {
      // The user can enable the option inside Export even when the saved
      // preference was off at the time the preview was first prepared.
      if (rulebook.checked && !workingData.rulebook) workingData.rulebook = DS.snapshotVisibleRulebook?.() || null;
      if (rulebookState.checked && !workingData.rulebookState) workingData.rulebookState = collectVisibleRulebookState(workingData.messages);
      const perf = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      largePreviewSkipped = workingData.messages.length >= LARGE_PREVIEW_MESSAGE_THRESHOLD;
      if (largePreviewSkipped) {
        textarea.value = `[Large chat: automatic preview disabled for ${workingData.messages.length} messages to avoid repeatedly building a huge export inside the live SpicyChat page. Copy/Download/Print will build the selected format once when requested.]`;
        perf.chatExportLastSerializeMs = 0;
        perf.chatExportLastSerializedChars = 0;
      } else {
        const serializeStarted = performance.now();
        const rendered = renderFormat(workingData, opts());
        const serializeMs = Math.round(performance.now() - serializeStarted);
        textarea.value = rendered.text;
        perf.chatExportLastSerializeMs = serializeMs;
        perf.chatExportLastSerializedChars = rendered.text.length;
      }
      const status = workingData.captureStatus;
      clearCheckpointButton.hidden = !status?.checkpoint;
      auditCheckpointButton.hidden=!status?.checkpoint;
      appendCheckpointButton.hidden=!status?.checkpoint||!status?.terminal;
      const messageLabel = `${workingData.messages.length} active message${workingData.messages.length === 1 ? "" : "s"}`;
      if (status?.source === "api" && status?.complete) {
        count.textContent = `Chat ready · ${messageLabel}${status.filteredCount ? ` · ${status.filteredCount} API rows excluded by content/export filters` : ""}.`;
      } else if (status?.source === "api") {
        const raw = Number.isFinite(status.rawUniqueCount) ? ` · ${status.rawUniqueCount} unique API rows${status.expectedCount ? ` / ${status.expectedCount} reported` : ""}` : "";
        const omitted = status.filteredCount ? ` · ${status.filteredCount} excluded by content/export filters` : "";
        const difference = status.rawCountDifference;
        const explanation = difference < 0 ? ` ${-difference} more unique API rows than reported; this is not evidence of missing messages.` : difference > 0 ? ` ${difference} fewer API rows than reported; native counter or coverage may differ.` : "";
        count.textContent = `${messageLabel} available${raw}${omitted} · ${status.reason || "API capture"}: completeness unverified.${explanation}${status.checkpoint ? " Local checkpoint retained." : ""}`;
      } else if (status?.source === "api-error") {
        count.textContent = `${messageLabel} mounted messages available · API fetch interrupted: ${status.error || "unknown error"}. Reopen Export to resume the saved checkpoint; Start fresh API capture is under Advanced / Compatibility.`;
      } else if (status?.source === "dom") {
        const nativeStats = status?.mountedMessages
          ? ` · ${status.mountedMessages} mounted${Number.isFinite(Number(status.nativeRequests)) ? ` · ${Number(status.nativeRequests)} request${Number(status.nativeRequests) === 1 ? "" : "s"}` : ""}${Number.isFinite(Number(status.nativeSuccesses)) ? ` · ${Number(status.nativeSuccesses)} success${Number(status.nativeSuccesses) === 1 ? "" : "es"}` : ""}${status.authRaces ? ` · ${status.authRaces} auth race${status.authRaces === 1 ? "" : "s"}` : ""}${status.authRefreshes ? ` · ${status.authRefreshes} auth refresh${status.authRefreshes === 1 ? "" : "es"}` : ""}${status.resumes ? ` · resumed ${status.resumes}×` : ""}`
          : "";
        count.textContent = `${messageLabel} · page compatibility load${nativeStats}${status?.complete ? " · complete" : " · incomplete"}.`;
      } else {
        count.textContent = `${messageLabel} available.`;
      }
      const reloadHidden = !(status?.source === "dom" && Number(status?.mountedMessages || 0) >= 250);
      if (reloadChatButton.hidden !== reloadHidden) reloadChatButton.hidden = reloadHidden;
      const canUseApiHistory = !!chatRouteIds().characterId;
      const historyAlreadyComplete = status?.source === "api" && !!status?.complete;
      const apiHidden = !canUseApiHistory || historyAlreadyComplete;
      if (apiHistoryButton.hidden !== apiHidden) apiHistoryButton.hidden = apiHidden;
      apiHistoryButton.textContent = status?.checkpoint ? "Resume / reopen saved capture" : "Retry full chat fetch";
      const refreshHidden = !canUseApiHistory;
      if (refreshApiButton.hidden !== refreshHidden) refreshApiButton.hidden = refreshHidden;
      const nativeHidden = !workingData.olderMessagesAvailable && workingData.captureStatus?.source === "dom";
      if (nativeHistoryButton.hidden !== nativeHidden) nativeHistoryButton.hidden = nativeHidden;
      nativeHistoryButton.textContent = "Load full chat through page (very slow)";
      if (historyAlreadyComplete) {
        nativeWarning.textContent = "Chat history is already complete in memory through the fast API. These controls are only for troubleshooting or compatibility testing; page-loading old messages is not needed for a normal export.";
      } else if (status?.source === "api-error") {
        nativeWarning.textContent = "The automatic API fetch failed. Retry full chat fetch first. If that still fails, Load full chat through page uses SpicyChat's own history button, but it mounts the conversation into the live page and can become extremely slow or memory-heavy on large chats.";
      } else {
        nativeWarning.textContent = "Normal export automatically uses the fast API. Page-loading is only a compatibility/testing fallback and can become extremely slow or memory-heavy on large chats.";
      }
      layout.disabled = format.value !== "html";
      printButton.disabled = format.value !== "html";
      downloadButton.textContent = `${status?.checkpoint && !status.terminal ? "Save partial" : "Download"} ${exportExt().toUpperCase()}`;
      if (status?.checkpoint) countNote.textContent = "Saved message pages remain locally in QoL until explicitly cleared or replaced; not included in cloud sync. Refresh data starts a new capture after confirmation.";
      if (status?.checkpoint) count.textContent += " " + exportSessionSummary(status);
      if (largePreviewSkipped) count.textContent += " Large-chat preview disabled; export is built once on action.";
    };

    for (const control of [format, layout, botInfo, rulebook, rulebookState, generation, numbers, avatars, imageLinks, censored]) control.addEventListener("change", refresh);
    ooc.addEventListener("change", async () => {
      const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked, chatExportIncludeRulebook: rulebook.checked, chatExportIncludeRulebookState: rulebookState.checked };
      activeCapture.settings = nextSettings;
      if (workingData.captureStatus?.source === "api") {
        // API history is intentionally kept in memory rather than replaced by
        // the much smaller currently-mounted DOM slice. If the OOC/directive
        // filter changes, refresh the API capture automatically so the user
        // does not need a redundant manual "get full chat" step.
        try {
          await runHistoryMethod("api", apiHistoryButton, { automatic: true });
        } catch {
          refresh();
        }
        return;
      }
      const messages = collectMessages(nextSettings);
      const metadata = await loadGenerationMetadata();
      for (const message of messages) message.metadata = metadata[message.id] || null;
      workingData = { ...workingData, messages, includesOocDirectives: ooc.checked,
        captureStatus: { ...workingData.captureStatus, complete: false, source: "dom", reason: "mounted-ooc-change" } };
      refresh();
    });

    const close = () => {
      if (activeLoadLock?.active) {
        activeLoadLock.cancelled = true;
        activeCapture.cancelled = true;
        nativeCapture.cancelled = true;
        apiCapture.cancelled = true;
      }
      modal.remove();
    };
    backdrop.addEventListener("click", close);
    closeButton.addEventListener("click", close);
    const runHistoryMethod = async (method, button, { automatic = false, preserveRecoveryCapture = false, forceNew = false } = {}) => {
      if (activeLoadLock?.active) {
        activeLoadLock.cancelled = true;
        activeCapture.cancelled = true;
        apiHistoryButton.textContent = "Cancelling…";
        refreshApiButton.textContent = "Cancelling…";
        nativeHistoryButton.textContent = "Cancelling…";
        return;
      }

      activeLoadLock = beginExportLock();
      if (!activeLoadLock) return false;
      activeCapture.cancelled = false;
      apiHistoryButton.disabled = true;
      refreshApiButton.disabled = true;
      nativeHistoryButton.disabled = true;
      if (button) {
        button.disabled = false;
        if (!automatic) button.textContent = "Cancel loading";
      }

      try {
        const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked, chatExportIncludeRulebook: rulebook.checked, chatExportIncludeRulebookState: rulebookState.checked, chatExportHistoryMode: method };

        // Keep API and Native history fully separate, but keep ONE cumulative
        // Native capture session across retries/resumes. This prevents a 401 or
        // giant-DOM timeout from throwing away already captured pages.
        if (method === "native") {
          nativeCapture.settings = nextSettings;
          nativeCapture.cancelled = false;
          mergeCapturedMessages(nativeCapture);
          activeCapture = nativeCapture;
        } else {
          apiCapture.settings = nextSettings;
          apiCapture.cancelled = false;
          activeCapture = apiCapture;
        }

        const result = await loadExportHistory({
          session: activeCapture,
          lock: activeLoadLock,
          mode: method,
          allowFallback: false,
          forceNew,
          onProgress: progress => {
            if (progress.source === "api") {
              const total = progress.expectedCount ? ` / ${progress.expectedCount}` : "";
              const retry = progress.retries ? ` · ${progress.retries} retry${progress.retries === 1 ? "" : "ies"}` : "";
              const auth = progress.authRefreshes ? ` · auth refreshed ${progress.authRefreshes}×` : "";
              const eta = progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : "";
              const elapsed = progress.elapsedMs ? ` · ${formatExportDuration(progress.elapsedMs)} elapsed` : "";
              count.textContent = progress.rawUniqueCount != null ? exportProgressText(progress) : `Fetching full chat… ${progress.count}${total} active messages · ${progress.pages || 1} API page${(progress.pages || 1) === 1 ? "" : "s"}${retry}${auth}${elapsed}${eta}`;
            } else {
              const requests = Number(progress.nativeRequests || 0);
              const successes = Number(progress.nativeSuccesses || 0);
              const auth = Number(progress.authRaces || 0);
              const refreshed = Number(progress.authRefreshes || 0);
              const phase = progress.phase === "auth-refresh-wait"
                ? " · waiting for refreshed auth"
                : progress.phase === "auth-refreshed"
                  ? " · auth refreshed; reacquiring button"
                  : progress.phase === "resume"
                    ? " · resuming previous Native session"
                    : "";
              count.textContent = `${progress.count} unique messages captured · ${progress.clicked || 0} click${progress.clicked === 1 ? "" : "s"} · ${requests} request${requests === 1 ? "" : "s"} · ${successes} success${successes === 1 ? "" : "es"}${auth ? ` · ${auth} auth race${auth === 1 ? "" : "s"}` : ""}${refreshed ? ` · ${refreshed} refresh${refreshed === 1 ? "" : "es"}` : ""}${phase}`;
            }
          }
        });
        if (location.href !== data.chatUrl) throw Error("Conversation changed; saved capture retained.");
        if (result.diskOnly) { modal.remove(); await showLargeCheckpointModal(result,nextSettings); return true; }
        activeCapture = result.session || activeCapture;
        if (method === "native") nativeCapture = activeCapture;
        else apiCapture = activeCapture;
        count.textContent = `Building export from ${result.messages.length} messages…`;
        await DS.sleep?.(0);
        // A recovery preset must not discard an existing usable capture or
        // combine messages from the old chat with metadata from a new route.
        if (preserveRecoveryCapture && (!modal.isConnected || location.href !== data.chatUrl ||
            result.cancelled || result.messages.length < workingData.messages.length ||
            (!result.complete && workingData.captureStatus?.complete))) {
          return false;
        }
        const nextData = await buildExportData(nextSettings, result.messages, result);
        if (preserveRecoveryCapture && (!modal.isConnected || location.href !== data.chatUrl)) return false;
        workingData = nextData;
        refresh();
        return true;
      } catch (error) {
        count.textContent = method === "api"
          ? `Full chat fetch failed: ${String(error?.message || error)}. Retry the API fetch, or use Advanced / Compatibility if needed.`
          : `Page compatibility load failed: ${String(error?.message || error)}.`;
        return false;
      } finally {
        endExportLock(activeLoadLock);
        activeLoadLock = null;
        apiHistoryButton.disabled = false;
        refreshApiButton.disabled = false;
        nativeHistoryButton.disabled = false;
        apiHistoryButton.textContent = "Retry full chat fetch";
        refreshApiButton.textContent = "Start fresh API capture…";
        nativeHistoryButton.textContent = workingData.captureStatus?.source === "dom" && !workingData.captureStatus?.complete && nativeCapture.order.length
          ? "Resume page compatibility load (very slow)"
          : "Load full chat through page (very slow)";
      }
    };

    archivePresetButton.addEventListener("click", async () => {
      if (activeLoadLock?.active) return;
      if (location.href !== data.chatUrl) {
        countNote.textContent = "The chat changed. Close Export and reopen it on the desired conversation.";
        return;
      }
      // Per-export choices only: no storage writes, no upload, no native
      // history expansion. Retain the original transcript and role metadata.
      format.value = "json";
      botInfo.checked = true;
      rulebook.checked = true;
      rulebookState.checked = true;
      generation.checked = true;
      numbers.checked = true;
      // Add evidence; do not override explicit avatar, media or censor choices.
      const oocWasEnabled = ooc.checked;
      const privacyNote = "Recovery preset: private local JSON; adds available bot info and visible Rulebook evidence, not hidden definitions. Existing export options kept." +
        (censored.checked ? " Censored export remains enabled; turn it off yourself if original text is needed." : " Keep the conversation file private.");
      countNote.textContent = privacyNote;
      // OOC/directives are filtered during capture, not serialization. Only
      // re-fetch when the current capture omitted them; do not merely tick a box.
      if (workingData.includesOocDirectives !== true) {
        ooc.checked = true;
        const lockedControls = [archivePresetButton, copyButton, downloadButton, printButton,
          format, layout, botInfo, rulebook, rulebookState, ooc, generation, numbers, avatars, imageLinks, censored];
        const previousDisabled = lockedControls.map(control => control.disabled);
        lockedControls.forEach(control => { control.disabled = true; });
        let captured = false;
        try {
          captured = await runHistoryMethod("api", null, { automatic: true, preserveRecoveryCapture: true });
        } finally {
          lockedControls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
        }
        if (!modal.isConnected) return;
        if (location.href !== data.chatUrl) {
          countNote.textContent = "The chat changed during capture. Close Export and reopen it on the desired conversation.";
          archivePresetButton.disabled = true;
          copyButton.disabled = true;
          downloadButton.disabled = true;
          printButton.disabled = true;
          return;
        }
        if (!captured) {
          ooc.checked = oocWasEnabled || workingData.includesOocDirectives === true;
          countNote.textContent = `${privacyNote} OOC refresh did not complete; existing capture retained. Retry the preset if needed.`;
          refresh();
          return;
        }
        // runHistoryMethod already rendered this capture. Refreshing again
        // would unnecessarily serialize a second copy of the same transcript.
        printButton.disabled = true;
        layout.disabled = true;
      } else {
        ooc.checked = true;
        refresh();
      }
    });
    apiHistoryButton.addEventListener("click", () => runHistoryMethod("api", apiHistoryButton));
    refreshApiButton.textContent = "Start fresh API capture…";
    refreshApiButton.addEventListener("click", () => runHistoryMethod("api", refreshApiButton, {forceNew:true}));
    auditCheckpointButton.addEventListener('click',async()=>{if(activeLoadLock?.active||!workingData.captureStatus?.checkpoint)return;const lock=beginExportLock();if(!lock)return;try{await showSavedChainAudit(workingData.captureStatus,text=>countNote.textContent=text);}catch(error){countNote.textContent=String(error?.message||error);}finally{endExportLock(lock);}});
    appendCheckpointButton.addEventListener('click',async()=>{if(activeLoadLock?.active||!workingData.captureStatus?.checkpoint)return;const lock=beginExportLock();if(!lock)return;try{const status=workingData.captureStatus;const result=await withSavedCheckpoint(status,()=>extendSavedCheckpoint(status,settings,text=>countNote.textContent=text));if(result.added)await showLargeCheckpointModal(result.status,settings);else {workingData.captureStatus.currentSessionTimings=result.status.currentSessionTimings;countNote.textContent='No new rows before saved head; older history was not revalidated. '+exportSessionSummary(result.status);}}catch(error){countNote.textContent=String(error?.message||error);}finally{endExportLock(lock);}});
    clearCheckpointButton.addEventListener("click", async () => {
      const status=workingData.captureStatus;
      if(!status?.checkpoint||activeLoadLock?.active||!confirm("Delete the local export checkpoint? The native conversation and downloaded files are unchanged."))return;
      const ids=status.checkpointIds;
      try{await navigator.locks.request(`dsq-export:${ids.characterId}:${ids.conversationId}`,{ifAvailable:true},async owned=>{if(!owned)throw Error("Another tab is using this capture.");await exportCheckpointCall(ids,"clear",{jobId:status.jobId,revision:status.revision});});workingData.captureStatus={...status,checkpoint:false};refresh();countNote.textContent="Local checkpoint cleared; current in-memory export remains available until closed.";}catch(error){countNote.textContent=String(error?.message||error);}finally{await exportCheckpointCall(ids,"release").catch(()=>{});}
    });
    nativeHistoryButton.addEventListener("click", () => runHistoryMethod("native", nativeHistoryButton));
    reloadChatButton.addEventListener("click", () => location.reload());
    copyButton.addEventListener("click", async () => {
      if (largePreviewSkipped) count.textContent = `Building ${workingData.messages.length}-message export for Copy…`;
      await DS.sleep?.(0);
      const value = largePreviewSkipped ? renderFormat(workingData, opts()).text : textarea.value;
      const copied = await copyTextValue(value);
      DS.setQuickStatus?.(copied ? "Export copied." : "Could not copy the export.");
      refresh();
    });
    downloadButton.addEventListener("click", async () => {
      if(activeLoadLock?.active)return;
      if(format.value==="json.gz"|| (largePreviewSkipped&&!window.flutter_inappwebview?.callHandler&&typeof window._dsRequestExport!=="function")){
        downloadButton.disabled=true;try{await downloadStreamedChat(workingData,opts(),{onProgress:text=>count.textContent=text});}finally{downloadButton.disabled=false;}return;
      }
      if (largePreviewSkipped) count.textContent = `Building ${workingData.messages.length}-message export for download…`;
      await DS.sleep?.(0);
      const rendered = renderFormat(workingData, opts());
      const result = await downloadText(rendered.text, rendered.mime, `${safeBaseName(workingData.botInfo?.name)}-chat-export.${rendered.ext}`);
      if (!result?.ok) {
        const copied = await copyTextValue(rendered.text);
        DS.setQuickStatus?.(copied
          ? "Android did not confirm the file save. Export copied instead."
          : "File save could not be confirmed. Copy the export from this window.");
        count.textContent = copied
          ? "File not verified; export copied to clipboard."
          : "File not verified; use Copy instead.";
      } else {
        DS.setQuickStatus?.("Chat export sent to downloads.");
        refresh();
      }
    });
    printButton.addEventListener("click", async () => {
      if (largePreviewSkipped) count.textContent = `Building ${workingData.messages.length}-message HTML for Print / Save PDF…`;
      await DS.sleep?.(0);
      const options = { ...opts(), format: "html" };
      const printData = options.censored && typeof DS.censorChatExportText === "function"
        ? { ...workingData, messages: workingData.messages.map(m => ({ ...m, text: DS.censorChatExportText(m.text, m.role || m.speaker) })) }
        : workingData;
      printHtml(makeHtml(printData, options));
      refresh();
    });
    refresh();
    textarea.focus();
  }

  DS.copyCurrentChat = async function copyCurrentChat() {
    if (!DS.isSingleChatPage()) {
      DS.setQuickStatus?.("Open a chat first.");
      return false;
    }

    const settings = DS.state?.settings || {};
    const lock = beginExportLock();
    if (!lock) {
      DS.setQuickStatus?.("A chat export is already running.");
      return false;
    }

    const originalRoute=chatRouteIds();
    const session = createCaptureSession(settings);
    DS.setQuickStatus?.("Fetching full chat…", true);
    let result = { messages: mergeCapturedMessages(session), complete: false, cancelled: false, reason: "loaded" };

    try {
      try {
        result = await loadExportHistory({
          session,
          lock,
          mode: "api",
          allowFallback: false,
          onProgress: progress => {
            const total = progress.expectedCount ? ` / ${progress.expectedCount}` : "";
            DS.setQuickStatus?.(
              progress.rawUniqueCount != null ? exportProgressText(progress) : `Fetching full chat… ${progress.count}${total} active messages${progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : ""}`,
              true
            );
          }
        });
      } catch (error) {
        DS.setQuickStatus?.("Full chat fetch failed. Open Export to retry or use Advanced / Compatibility.");
        return false;
      }

      if (!exportSameChat(originalRoute)) return false;
      if (result.diskOnly) { await showLargeCheckpointModal(result,settings); DS.setQuickStatus?.("Large capture ready. Use the file exporter instead of copying the entire chat to clipboard."); return false; }
      const data = await buildExportData(settings, result.messages, result);
      if (result.cancelled) { showExportModal(data); return false; }
      const value = makePlainText(data, {
        includeBotInfo: !!settings.chatExportIncludeBotInfo,
        includeRulebook: !!settings.chatExportIncludeRulebook,
        includeRulebookState: settings.chatExportIncludeRulebookState === true,
        includeGenerationDetails: settings.chatExportIncludeGenerationDetails !== false,
        numberMessages: settings.chatExportNumberMessages !== false,
        includeAvatars: false,
        includeImageLinks: settings.chatExportIncludeImageLinks === true
      });
      const ok = await copyTextValue(value);
      DS.setQuickStatus?.(
        ok
          ? `Copied ${data.messages.length} active messages${result.complete ? "." : " (full history may be incomplete)."}`
          : "Could not copy chat."
      );
      return ok;
    } finally {
      endExportLock(lock);
    }
  };

  DS.exportCurrentChat = async function exportCurrentChat({forceNew=false}={}) {
    if (!DS.isSingleChatPage()) {
      DS.setQuickStatus?.("Open a chat first.");
      return;
    }

    const settings = DS.state?.settings || {};
    const lock = beginExportLock();
    if (!lock) {
      DS.setQuickStatus?.("A chat export is already running.");
      return;
    }

    const originalRoute=chatRouteIds();
    const session = createCaptureSession(settings);
    DS.setQuickStatus?.("Fetching full chat…", true);
    let result = { messages: mergeCapturedMessages(session), complete: false, cancelled: false, reason: "loaded" };

    try {
      try {
        result = await loadExportHistory({
          session,
          lock,
          mode: "api",
          allowFallback: false,
          forceNew,
          onProgress: progress => {
            const total = progress.expectedCount ? ` / ${progress.expectedCount}` : "";
            DS.setQuickStatus?.(
              progress.rawUniqueCount != null ? exportProgressText(progress) : `Fetching full chat… ${progress.count}${total} active messages${progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : ""}`,
              true
            );
          }
        });
      } catch (error) {
        const current = mergeCapturedMessages(session);
        result = {
          messages: current,
          complete: false,
          cancelled: false,
          reason: "api-error",
          source: "api-error",
          requestedSource: "api",
          error: String(error?.message || error || "history export failed")
        };
      }

      if (!exportSameChat(originalRoute)) return;
      if (result.diskOnly) { await showLargeCheckpointModal(result,settings); DS.setQuickStatus?.(`Chat saved locally: ${result.messageCount.toLocaleString()} messages.`); return; }
      const data = await buildExportData(settings, result.messages, result);
      showExportModal(data);
      DS.setQuickStatus?.(
        result.reason === "api-error"
          ? "Full chat fetch failed. Export opened with the available messages; retry there or use Advanced / Compatibility."
          : result.complete
            ? `Chat ready: ${data.messages.length} active messages.`
            : `Chat ready: ${data.messages.length} active messages${result.cancelled ? " (fetch cancelled)." : "."}`
      );
    } finally {
      endExportLock(lock);
    }
  };
})();

}

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

    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
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
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
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
      if (!text || looksLikeUiText(text)) continue;

      messages.push({
        id: rawId.replace(/^message-/, ""),
        speaker,
        text,
        role: isUser ? "user" : "bot",
        avatar: bubble.querySelector("img")?.src || ""
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

      if (!text || looksLikeUiText(text)) continue;

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
        avatar: findSpeakerAvatar(root, textContainer)
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
      appearanceTemplate: captureAppearanceTemplate(),
      messages,
      olderMessagesAvailable: !!findLoadPreviousMessagesButton(),
      captureStatus: captureStatus || null
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

  function makePlainText(data, opts) {
    const parts = [`SpicyChat Export`, `Exported: ${new Date(data.exportedAt).toLocaleString()}`, `Chat: ${data.chatUrl}`];
    if (opts.includeBotInfo) parts.push(`BOT INFO\n${plainBotInfo(data.botInfo)}`);
    const messages = data.messages.map((message, index) => {
      const number = opts.numberMessages ? `${index + 1}. ` : "";
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      return `${number}${message.speaker}${meta.length ? ` [${meta.join(" · ")}]` : ""}\n${message.text}`;
    });
    parts.push(`MESSAGES\n${messages.join("\n\n") || "No chat messages found."}`);
    return parts.join("\n\n---\n\n");
  }

  function escapeMd(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/([`])/g, "\\$1");
  }

  function makeMarkdown(data, opts) {
    const parts = ["# SpicyChat Export", `- Exported: ${new Date(data.exportedAt).toLocaleString()}`, `- Chat: ${data.chatUrl}`];
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
    parts.push("## Messages");
    data.messages.forEach((message, index) => {
      const prefix = opts.numberMessages ? `${index + 1}. ` : "";
      parts.push(`### ${prefix}${escapeMd(message.speaker)}`);
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      if (meta.length) parts.push(`*${meta.map(escapeMd).join(" · ")}*`);
      parts.push(message.text);
    });
    if (!data.messages.length) parts.push("No chat messages found.");
    return parts.join("\n\n");
  }

  function jsonData(data, opts) {
    return JSON.stringify({
      format: "SpicyChat QoL chat export",
      version: 2,
      exportedAt: data.exportedAt,
      chatUrl: data.chatUrl,
      bot: opts.includeBotInfo ? data.botInfo : undefined,
      history: data.captureStatus ? {
        source: data.captureStatus.source || undefined,
        requestedSource: data.captureStatus.requestedSource || undefined,
        complete: data.captureStatus.complete === true,
        expectedCount: data.captureStatus.expectedCount || undefined,
        messageCount: data.messages.length,
        pages: data.captureStatus.pages || undefined,
        pageLimit: data.captureStatus.limit || undefined,
        elapsedMs: data.captureStatus.elapsedMs || undefined,
        reason: data.captureStatus.reason || undefined,
        nativeClicks: data.captureStatus.clicked || undefined,
        nativeRequests: data.captureStatus.nativeRequests || undefined,
        nativeSuccesses: data.captureStatus.nativeSuccesses || undefined,
        nativeAuthRaces: data.captureStatus.authRaces || undefined,
        nativeAuthRefreshes: data.captureStatus.authRefreshes || undefined,
        nativeResumes: data.captureStatus.resumes || undefined
      } : undefined,
      messages: data.messages.map((message, index) => ({
        number: opts.numberMessages ? index + 1 : undefined,
        id: message.id || undefined,
        createdAt: message.createdAt || message.metadata?.createdAt || undefined,
        speaker: message.speaker,
        text: message.text,
        avatar: opts.includeAvatars ? message.avatar || undefined : undefined,
        generation: opts.includeGenerationDetails ? message.metadata || undefined : undefined
      }))
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
    const messages = data.messages.map((message, index) => {
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      const role = ["user", "human"].includes(String(message.role || "").toLowerCase()) ? "user" : "bot";
      const avatarId = opts.includeAvatars ? avatarIndex.get(String(message.avatar || "").trim()) : undefined;
      const avatar = Number.isInteger(avatarId) ? `<span class="avatar avatar-${avatarId}" aria-hidden="true"></span>` : "";
      const messageId = escapeHtmlText(message.id || "");
      const createdAt = Number(message.createdAt || message.metadata?.createdAt || 0) || 0;
      return `<article class="message ${matched ? "match" : "transcript"} role-${role}"${messageId ? ` data-message-id="${messageId}"` : ""}${createdAt ? ` data-created-at="${createdAt}"` : ""}>
        <header>${avatar}<div><strong>${opts.numberMessages ? `${index + 1}. ` : ""}${escapeHtmlText(message.speaker)}</strong>${meta.length ? `<small>${escapeHtmlText(meta.join(" · "))}</small>` : ""}</div></header>
        <div class="body">${richTextHtml(message.text)}</div>
      </article>`;
    }).join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlText(bot.name || "SpicyChat")} chat export</title><style>
      :root{color-scheme:dark;${vars}}*{box-sizing:border-box}body{margin:0;background:${matched ? "var(--ds-export-page-bg)" : "#0b0b0d"};color:${matched ? "var(--ds-export-page-text)" : "#eee"};font:${matched ? "var(--ds-export-font-size)/var(--ds-export-line-height) var(--ds-export-font)" : "15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif"}}main{max-width:900px;margin:auto;padding:28px 18px 60px}h1,h2{margin:.2em 0}.muted,small{color:#aaa}.export-meta{margin-bottom:18px;color:#999}.bot-info{padding:16px;border:1px solid #2b2b31;border-radius:14px;background:#141417;margin-bottom:22px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.tags span{background:#24242b;padding:3px 8px;border-radius:999px;font-size:12px}details{margin-top:8px;border-top:1px solid #2b2b31;padding-top:8px}summary{cursor:pointer}.messages{display:flex;flex-direction:column;gap:14px}.message{break-inside:avoid}.message header{display:flex;gap:10px;align-items:center;margin-bottom:7px}.message header .avatar{width:38px;height:38px;flex:0 0 38px;background-size:cover;background-position:center;border-radius:9px}${avatarCss}.message header div{display:flex;flex-direction:column}.message.match{padding:14px 16px;max-width:min(100%,650px)}.message.match.role-bot{align-self:flex-start;background:var(--ds-export-bot-bg);color:var(--ds-export-bot-text);border:var(--ds-export-bot-border-width) var(--ds-export-bot-border-style) var(--ds-export-bot-border);border-radius:var(--ds-export-bot-radius)}.message.match.role-user{align-self:flex-end;background:var(--ds-export-user-bg);color:var(--ds-export-user-text);border:var(--ds-export-user-border-width) var(--ds-export-user-border-style) var(--ds-export-user-border);border-radius:var(--ds-export-user-radius)}.message.transcript{padding:10px 0;border-bottom:1px solid #24242a;border-radius:0;background:none}.body{white-space:normal;overflow-wrap:anywhere}.body code{padding:.08em .34em;background:var(--ds-export-code-bg,#24242b);color:var(--ds-export-code-text,inherit);border:1px solid var(--ds-export-code-border,transparent);border-radius:var(--ds-export-code-radius,5px);font:inherit;box-decoration-break:clone;-webkit-box-decoration-break:clone}.body pre code{display:block;padding:10px;white-space:pre-wrap}@media print{:root{color-scheme:light}body{background:#fff;color:#111}.bot-info,.message.match{background:#fff!important;color:#111!important;border-color:#ccc!important}.muted,small,.export-meta{color:#555}.tags span{background:#eee}.message.transcript{border-color:#ddd}main{max-width:none;padding:0}}
    </style></head><body><main><h1>SpicyChat Export</h1><div class="export-meta">Exported ${escapeHtmlText(new Date(data.exportedAt).toLocaleString())} · ${escapeHtmlText(data.chatUrl)}</div>${infoBlocks}<section class="messages">${messages || "<p>No chat messages found.</p>"}</section></main></body></html>`;
  }

  function safeBaseName(value) {
    return cleanText(value).replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "spicychat";
  }

  function renderFormat(data, opts) {
    if (opts.format === "markdown") return { text: makeMarkdown(data, opts), mime: "text/markdown;charset=utf-8", ext: "md" };
    if (opts.format === "json") return { text: jsonData(data, opts), mime: "application/json;charset=utf-8", ext: "json" };
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

  function apiHistoryMessages(data, settings, fallbackBotName) {
    const rows = Array.isArray(data?.messages) ? data.messages : [];
    const personaName = cleanInline(data?.userPersona?.name || "You") || "You";
    const userAvatar = normalizeApiAvatar(data?.userPersona?.avatar_url || data?.userPersona?.avatarUrl);
    const visibleBot = collectBotInfo();
    const botName = cleanInline(fallbackBotName || visibleBot?.name || "Bot") || "Bot";
    const botAvatar = normalizeApiAvatar(visibleBot?.avatar || "");

    return rows.map(row => {
      const role = String(row?.role || "").toLowerCase();
      const isUser = role === "user" || role === "human";
      const text = cleanMessageText(row?.content || row?.text || row?.message || "");
      return {
        id: String(row?.id || "").trim(),
        speaker: isUser ? personaName : botName,
        text,
        avatar: isUser ? userAvatar : botAvatar,
        createdAt: Number(row?.createdAt || row?.created_at || 0) || null,
        role: role || (isUser ? "user" : "bot")
      };
    }).filter(message => {
      if (!message.text) return false;
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
        if (attempt >= 3 || !retryableHistoryError(error)) throw error;
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

  async function loadAllMessagesViaApi({ settings, lock = null, onProgress = null } = {}) {
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
    const botName = collectBotInfo()?.name || "Bot";

    const absorb = data => {
      const parsed = apiHistoryMessages(data, settings, botName);
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
      while (lastId && !reachedStart && (!expectedCount || byId.size < expectedCount)) {
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
          reason = "api-exhausted";
          break;
        }

        const added = absorb(data);
        pages++;
        const oldest = rawRows.at(-1) || null;
        reachedStart = apiRowStartsConversation(oldest);
        const nextCursor = reachedStart ? "" : String(oldest?.id || "").trim();

        onProgress?.({
          source: "api", phase: "fetched", count: byId.size,
          expectedCount, pages, limit: chosenLimit,
          retries: metrics.retries, authRefreshes: metrics.authRefreshes
        });

        if (reachedStart) {
          reason = "api-chain-start";
          lastId = "";
          break;
        }
        if (!nextCursor || nextCursor === lastId || (!added && !expectedCount)) {
          reason = "api-exhausted";
          break;
        }
        lastId = nextCursor;
        await DS.sleep?.(0);
      }

      const messages = orderNewestFirst.map(id => byId.get(id)).filter(Boolean).reverse();
      if (reason === "api-complete" && expectedCount > 0 && messages.length >= expectedCount) reason = "api-count-reached";

      const complete = reason !== "cancelled" && (
        reachedStart ||
        reason === "api-chain-start" ||
        reason === "api-exhausted" ||
        reason === "api-count-reached" ||
        (expectedCount > 0 && messages.length >= expectedCount) ||
        (!lastId && messages.length > 0)
      );
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
        extra: {
          source: "api", pages, limit: chosenLimit, expectedCount,
          reportedDifference, elapsedMs: result.elapsedMs,
          requestMs: result.requestMs, networkMs: result.networkMs,
          processingMs: result.processingMs, retries: result.retries,
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

  async function loadExportHistory({ session = null, lock = null, onProgress = null, mode = "", allowFallback = true } = {}) {
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
      const apiResult = await loadAllMessagesViaApi({ settings, lock, onProgress });
      if (apiResult.messages.length || apiResult.cancelled) return { ...apiResult, requestedSource: "api" };
      throw new Error("API export returned no messages");
    } catch (error) {
      if (!allowFallback) throw error;
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

  function downloadText(text, mime, filename) {
    if (typeof DS.downloadTextFile === "function") {
      DS.downloadTextFile(text, filename, mime, { requestPermission: true });
      return;
    }
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
    ]);
    const layoutControl = makeExportSelect("ds-export-layout", "HTML layout", [
      ["bubbles", "Match current chat appearance"],
      ["transcript", "Clean transcript"],
    ]);
    const botInfoControl = makeExportCheckbox("ds-export-bot-info", "Bot info");
    const oocControl = makeExportCheckbox("ds-export-ooc", "OOC/directives");
    const generationControl = makeExportCheckbox("ds-export-generation", "Captured timestamps/model details");
    const numbersControl = makeExportCheckbox("ds-export-numbers", "Message numbers");
    const avatarsControl = makeExportCheckbox("ds-export-avatars", "Avatars in HTML/JSON");
    controls.append(
      formatControl.label,
      layoutControl.label,
      botInfoControl.label,
      oocControl.label,
      generationControl.label,
      numbersControl.label,
      avatarsControl.label,
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
    const copyButton = makeExportButton("ds-chat-export-copy", "Copy");
    const downloadButton = makeExportButton("ds-chat-export-download", "Download");
    const printButton = makeExportButton("ds-chat-export-print", "Print / Save PDF");
    actions.append(apiHistoryButton, copyButton, downloadButton, printButton);

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
    const ooc = oocControl.input;
    const generation = generationControl.input;
    const numbers = numbersControl.input;
    const avatars = avatarsControl.input;

    format.value = settings.chatExportDefaultFormat || "text";
    layout.value = settings.chatExportHtmlLayout || "bubbles";
    botInfo.checked = !!settings.chatExportIncludeBotInfo;
    ooc.checked = !!settings.chatExportIncludeOocDirectives;
    generation.checked = settings.chatExportIncludeGenerationDetails !== false;
    numbers.checked = settings.chatExportNumberMessages !== false;
    avatars.checked = settings.chatExportIncludeAvatars !== false;

    let workingData = data;
    let activeLoadLock = null;
    let apiCapture = createCaptureSession(settings, data.captureStatus?.source === "api" ? (data.messages || []) : []);
    let nativeCapture = createCaptureSession(settings, collectMessages(settings));
    let activeCapture = data.captureStatus?.source === "dom" ? nativeCapture : apiCapture;
    let largePreviewSkipped = false;
    const LARGE_PREVIEW_MESSAGE_THRESHOLD = 3000;
    const opts = () => ({ format: format.value, layout: layout.value, includeBotInfo: botInfo.checked, includeGenerationDetails: generation.checked, numberMessages: numbers.checked, includeAvatars: avatars.checked });
    const exportExt = () => format.value === "markdown" ? "md" : format.value === "json" ? "json" : format.value === "html" ? "html" : "txt";
    const refresh = () => {
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
      const messageLabel = `${workingData.messages.length} active message${workingData.messages.length === 1 ? "" : "s"}`;
      if (status?.source === "api" && status?.complete) {
        count.textContent = `Chat ready · ${messageLabel}.`;
      } else if (status?.source === "api-error") {
        count.textContent = `${messageLabel} available · full chat fetch failed. Retry full chat fetch, or use Advanced / Compatibility if needed.`;
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
      if (apiHistoryButton.textContent !== "Retry full chat fetch") apiHistoryButton.textContent = "Retry full chat fetch";
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
      downloadButton.textContent = `Download ${exportExt().toUpperCase()}`;
      if (largePreviewSkipped) count.textContent += " Large-chat preview disabled; export is built once on action.";
    };

    for (const control of [format, layout, botInfo, generation, numbers, avatars]) control.addEventListener("change", refresh);
    ooc.addEventListener("change", async () => {
      const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked };
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
      workingData = { ...workingData, messages };
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
    const runHistoryMethod = async (method, button, { automatic = false } = {}) => {
      if (activeLoadLock?.active) {
        activeLoadLock.cancelled = true;
        activeCapture.cancelled = true;
        apiHistoryButton.textContent = "Cancelling…";
        refreshApiButton.textContent = "Cancelling…";
        nativeHistoryButton.textContent = "Cancelling…";
        return;
      }

      activeLoadLock = beginExportLock();
      if (!activeLoadLock) return;
      activeCapture.cancelled = false;
      apiHistoryButton.disabled = true;
      refreshApiButton.disabled = true;
      nativeHistoryButton.disabled = true;
      if (button) {
        button.disabled = false;
        if (!automatic) button.textContent = "Cancel loading";
      }

      try {
        const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked, chatExportHistoryMode: method };

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
          onProgress: progress => {
            if (progress.source === "api") {
              const total = progress.expectedCount ? ` / ${progress.expectedCount}` : "";
              const retry = progress.retries ? ` · ${progress.retries} retry${progress.retries === 1 ? "" : "ies"}` : "";
              const auth = progress.authRefreshes ? ` · auth refreshed ${progress.authRefreshes}×` : "";
              const eta = progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : "";
              const elapsed = progress.elapsedMs ? ` · ${formatExportDuration(progress.elapsedMs)} elapsed` : "";
              count.textContent = `Fetching full chat… ${progress.count}${total} active messages · ${progress.pages || 1} API page${(progress.pages || 1) === 1 ? "" : "s"}${retry}${auth}${elapsed}${eta}`;
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
        activeCapture = result.session || activeCapture;
        if (method === "native") nativeCapture = activeCapture;
        else apiCapture = activeCapture;
        count.textContent = `Building export from ${result.messages.length} messages…`;
        await DS.sleep?.(0);
        workingData = await buildExportData(nextSettings, result.messages, result);
        refresh();
      } catch (error) {
        count.textContent = method === "api"
          ? `Full chat fetch failed: ${String(error?.message || error)}. Retry the API fetch, or use Advanced / Compatibility if needed.`
          : `Page compatibility load failed: ${String(error?.message || error)}.`;
      } finally {
        endExportLock(activeLoadLock);
        activeLoadLock = null;
        apiHistoryButton.disabled = false;
        refreshApiButton.disabled = false;
        nativeHistoryButton.disabled = false;
        apiHistoryButton.textContent = "Retry full chat fetch";
        refreshApiButton.textContent = "Refresh chat data (API)";
        nativeHistoryButton.textContent = workingData.captureStatus?.source === "dom" && !workingData.captureStatus?.complete && nativeCapture.order.length
          ? "Resume page compatibility load (very slow)"
          : "Load full chat through page (very slow)";
      }
    };

    apiHistoryButton.addEventListener("click", () => runHistoryMethod("api", apiHistoryButton));
    refreshApiButton.addEventListener("click", () => runHistoryMethod("api", refreshApiButton));
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
      if (largePreviewSkipped) count.textContent = `Building ${workingData.messages.length}-message export for download…`;
      await DS.sleep?.(0);
      const rendered = renderFormat(workingData, opts());
      downloadText(rendered.text, rendered.mime, `${safeBaseName(workingData.botInfo?.name)}-chat-export.${rendered.ext}`);
      refresh();
    });
    printButton.addEventListener("click", async () => {
      if (largePreviewSkipped) count.textContent = `Building ${workingData.messages.length}-message HTML for Print / Save PDF…`;
      await DS.sleep?.(0);
      printHtml(makeHtml(workingData, { ...opts(), format: "html" }));
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
              `Fetching full chat… ${progress.count}${total} active messages${progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : ""}`,
              true
            );
          }
        });
      } catch (error) {
        DS.setQuickStatus?.("Full chat fetch failed. Open Export to retry or use Advanced / Compatibility.");
        return false;
      }

      const data = await buildExportData(settings, result.messages, result);
      const value = makePlainText(data, {
        includeBotInfo: !!settings.chatExportIncludeBotInfo,
        includeGenerationDetails: settings.chatExportIncludeGenerationDetails !== false,
        numberMessages: settings.chatExportNumberMessages !== false,
        includeAvatars: false
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

  DS.exportCurrentChat = async function exportCurrentChat() {
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
              `Fetching full chat… ${progress.count}${total} active messages${progress.etaMs ? ` · ETA ~${formatExportDuration(progress.etaMs)}` : ""}`,
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

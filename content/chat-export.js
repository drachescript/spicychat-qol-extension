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

  async function buildExportData(settings, messageOverride = null, captureStatus = null) {
    const messages = Array.isArray(messageOverride) ? messageOverride.map(message => ({ ...message })) : collectMessages(settings);
    const metadata = await loadGenerationMetadata();
    for (const message of messages) message.metadata = metadata[message.id] || null;
    return {
      exportedAt: new Date().toISOString(),
      chatUrl: location.href,
      botInfo: await collectAvailableBotInfo(),
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
      messages: data.messages.map((message, index) => ({
        number: opts.numberMessages ? index + 1 : undefined,
        id: message.id || undefined,
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

  function makeHtml(data, opts) {
    const bot = data.botInfo || {};
    const infoBlocks = opts.includeBotInfo ? `
      <section class="bot-info">
        <h2>${escapeHtmlText(bot.name || "Bot")}</h2>
        ${bot.creator ? `<p class="muted">${escapeHtmlText(bot.creator)}</p>` : ""}
        ${bot.tags?.length ? `<div class="tags">${bot.tags.map(tag => `<span>${escapeHtmlText(tag)}</span>`).join("")}</div>` : ""}
        ${[["Description", bot.description], ["Personality", bot.personality], ["Scenario", bot.scenario], ["Lorebook", bot.lorebook], ["Definition", bot.definition]].filter(([,v]) => v).map(([label,v]) => `<details><summary>${label}</summary><div>${richTextHtml(v)}</div></details>`).join("")}
      </section>` : "";
    const messages = data.messages.map((message, index) => {
      const meta = opts.includeGenerationDetails ? metadataLines(message.metadata) : [];
      return `<article class="message ${opts.layout === "transcript" ? "transcript" : "bubble"}">
        <header>${opts.includeAvatars && message.avatar ? `<img src="${escapeHtmlText(message.avatar)}" alt="">` : ""}<div><strong>${opts.numberMessages ? `${index + 1}. ` : ""}${escapeHtmlText(message.speaker)}</strong>${meta.length ? `<small>${escapeHtmlText(meta.join(" · "))}</small>` : ""}</div></header>
        <div class="body">${richTextHtml(message.text)}</div>
      </article>`;
    }).join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtmlText(bot.name || "SpicyChat")} chat export</title><style>
      :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0b0d;color:#eee;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:900px;margin:auto;padding:28px 18px 60px}h1,h2{margin:.2em 0}.muted,small{color:#aaa}.export-meta{margin-bottom:18px;color:#999}.bot-info{padding:16px;border:1px solid #2b2b31;border-radius:14px;background:#141417;margin-bottom:22px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.tags span{background:#24242b;padding:3px 8px;border-radius:999px;font-size:12px}details{margin-top:8px;border-top:1px solid #2b2b31;padding-top:8px}summary{cursor:pointer}.messages{display:flex;flex-direction:column;gap:14px}.message{break-inside:avoid}.message header{display:flex;gap:10px;align-items:center;margin-bottom:7px}.message header img{width:38px;height:38px;object-fit:cover;border-radius:9px}.message header div{display:flex;flex-direction:column}.message.bubble{padding:14px 16px;border:1px solid #292930;border-radius:16px;background:#17171b}.message.transcript{padding:10px 0;border-bottom:1px solid #24242a;border-radius:0;background:none}.body{white-space:normal;overflow-wrap:anywhere}@media print{:root{color-scheme:light}body{background:#fff;color:#111}.bot-info,.message.bubble{background:#fff;border-color:#ccc}.muted,small,.export-meta{color:#555}.tags span{background:#eee}.message.transcript{border-color:#ddd}main{max-width:none;padding:0}}
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
    const session = { settings, byId: new Map(), order: [], orderSet: new Set(), cancelled: false, clicked: 0, stalled: 0 };
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
    return qsa("button").filter(isVisible).find(button => {
      const text = norm(button.textContent);
      const key = button.querySelector("[data-translate-key='chat:page.action.loadPreviousMessages']");
      if (!key && !text.includes("load previous messages")) return false;
      if (!readyOnly) return true;
      return !button.disabled && button.getAttribute("aria-disabled") !== "true";
    }) || null;
  }

  async function waitForPreviousMessageLoad(beforeCount, beforeFirstId, oldButton, timeoutMs = 12000) {
    const started = Date.now();
    let sawBusyState = false;
    let sawButtonReplacement = false;

    while (Date.now() - started < timeoutMs) {
      const roots = getMessageRoots();
      const count = roots.length;
      const firstId = String(roots[0]?.id || "");
      const current = findLoadPreviousMessagesButton();

      if (count > beforeCount) {
        return { progressed: true, sawBusyState, sawButtonReplacement, buttonGone: false };
      }
      if (beforeFirstId && firstId && firstId !== beforeFirstId) {
        return { progressed: true, sawBusyState, sawButtonReplacement, buttonGone: false };
      }
      if (!current) {
        return { progressed: true, sawBusyState, sawButtonReplacement, buttonGone: true };
      }

      if (current !== oldButton) sawButtonReplacement = true;
      if (current.disabled || current.getAttribute("aria-disabled") === "true") sawBusyState = true;

      // A busy -> ready transition or a React button replacement is not proof
      // that older messages actually reached the DOM. Wait for the message roots
      // to change (or for the load button to disappear) before calling it progress.
      await DS.sleep(140);
    }

    return { progressed: false, sawBusyState, sawButtonReplacement, buttonGone: false };
  }


  async function waitForMessageBatchSettle(maxMs = 4000, stableMs = 700) {
    const started = Date.now();
    let lastSignature = "";
    let stableSince = 0;

    while (Date.now() - started < maxMs) {
      const roots = getMessageRoots();
      const signature = roots.map(root => String(root?.id || "")).join("|");
      if (signature === lastSignature) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= stableMs) return roots;
      } else {
        lastSignature = signature;
        stableSince = 0;
      }
      await DS.sleep(160);
    }

    return getMessageRoots();
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

  async function loadAllPreviousMessages({ session = null, lock = null, onProgress = null } = {}) {
    const settings = session?.settings || DS.state?.settings || {};
    const capture = session || createCaptureSession(settings);
    let messages = mergeCapturedMessages(capture);
    onProgress?.({ count: messages.length, clicked: capture.clicked, phase: "start" });

    const ownsHistoryPause = !DS.state.bulkChatHistoryLoadActive;
    if (ownsHistoryPause) {
      DS.state.bulkChatHistoryLoadActive = true;
      DS.state.bulkChatHistoryLoadNeedsRefresh = false;
      DS.setClassState?.(document.documentElement, "ds-qol-history-loading", true);
    }

    const token = DS.diagOperationStart?.("chat-export", "load-older-messages", { initialMessages: messages.length });
    let reason = "complete";
    let parsedRoots = 0;

    try {
      for (let i = 0; i < 500; i++) {
        if (capture.cancelled || lock?.cancelled) {
          reason = "cancelled";
          break;
        }

        let button = findLoadPreviousMessagesButton();
        if (!button) break;

        if (button.disabled || button.getAttribute("aria-disabled") === "true") {
          const ready = await waitFor(() => findLoadPreviousMessagesButton({ readyOnly: true }), 8000, 140);
          if (!ready) {
            reason = "stalled";
            break;
          }
          button = ready;
        }

        const beforeRoots = getMessageRoots();
        const beforeIds = new Set(beforeRoots.map(root => String(root?.id || "")).filter(Boolean));
        const beforeCount = beforeRoots.length;
        const beforeFirstId = String(beforeRoots[0]?.id || "");

        let loadState = { progressed: false, sawBusyState: false, sawButtonReplacement: false, buttonGone: false };

        for (let attempt = 0; attempt < 4 && !loadState.progressed; attempt++) {
          if (capture.cancelled || lock?.cancelled) break;

          let currentButton = findLoadPreviousMessagesButton({ readyOnly: true });
          if (!currentButton) {
            currentButton = await waitFor(() => findLoadPreviousMessagesButton({ readyOnly: true }), 20000, 180);
            if (!currentButton && !findLoadPreviousMessagesButton()) {
              loadState = { ...loadState, progressed: true, buttonGone: true };
              break;
            }
          }
          if (!currentButton) {
            await DS.sleep(1000 + (attempt * 750));
            continue;
          }

          const clickWorked = clickPreviousMessagesButton(currentButton, { synthetic: attempt > 0 });
          if (clickWorked) capture.clicked++;
          onProgress?.({ count: messages.length, clicked: capture.clicked, phase: attempt ? "retrying" : "loading" });

          loadState = clickWorked
            ? await waitForPreviousMessageLoad(beforeCount, beforeFirstId, currentButton, 14000)
            : loadState;

          if (!loadState.progressed && loadState.sawBusyState) {
            const extended = await waitForPreviousMessageLoad(beforeCount, beforeFirstId, findLoadPreviousMessagesButton() || currentButton, 22000);
            loadState = {
              progressed: extended.progressed,
              sawBusyState: true,
              sawButtonReplacement: loadState.sawButtonReplacement || extended.sawButtonReplacement,
              buttonGone: extended.buttonGone
            };
          }

          if (!loadState.progressed) await DS.sleep(1000 + (attempt * 750));
        }

        const progressed = !!loadState.progressed;
        const afterRoots = progressed ? await waitForMessageBatchSettle() : getMessageRoots();
        let addedRoots = afterRoots.filter(root => {
          const id = String(root?.id || "");
          return id && !beforeIds.has(id);
        });
        if (progressed && !addedRoots.length) addedRoots = afterRoots;

        parsedRoots += addedRoots.length;
        if (addedRoots.length) messages = mergeCapturedMessages(capture, addedRoots);
        onProgress?.({ count: messages.length, clicked: capture.clicked, phase: progressed ? "captured" : "stalled" });

        if (!progressed) {
          capture.stalled++;
          reason = "stalled";
          break;
        }

        capture.stalled = 0;
      }

      messages = mergeCapturedMessages(capture, []);
      const complete = !findLoadPreviousMessagesButton() && reason !== "cancelled";
      if (!complete && reason === "complete") reason = "limit";

      const result = {
        session: capture,
        messages,
        clicked: capture.clicked,
        complete,
        cancelled: reason === "cancelled",
        reason,
        messageCount: messages.length
      };
      DS.diagOperationEnd?.(token, {
        outcome: reason,
        counts: { scanned: parsedRoots, changed: messages.length, skipped: 0, errors: reason === "stalled" ? 1 : 0 }
      });
      return result;
    } finally {
      if (ownsHistoryPause) {
        DS.state.bulkChatHistoryLoadActive = false;
        DS.setClassState?.(document.documentElement, "ds-qol-history-loading", false);

        // Export can temporarily mount hundreds of historical messages. They
        // were intentionally ignored while bulk loading; do not immediately
        // turn that into one giant catch-up reconciliation pass when export
        // finishes. The current/latest messages were already decorated before
        // export, and older messages can be handled incrementally later if the
        // user actually interacts with them.
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
      ["bubbles", "Chat bubbles"],
      ["transcript", "Transcript"],
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
    const loadOlderButton = makeExportButton("ds-chat-export-load-older", "Load older messages");
    const copyButton = makeExportButton("ds-chat-export-copy", "Copy");
    const downloadButton = makeExportButton("ds-chat-export-download", "Download");
    const printButton = makeExportButton("ds-chat-export-print", "Print / Save PDF");
    actions.append(loadOlderButton, copyButton, downloadButton, printButton);

    dialog.append(head, controls, textarea, actions);
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
    let activeCapture = createCaptureSession(settings, data.messages || []);
    const opts = () => ({ format: format.value, layout: layout.value, includeBotInfo: botInfo.checked, includeGenerationDetails: generation.checked, numberMessages: numbers.checked, includeAvatars: avatars.checked });
    const refresh = () => {
      const rendered = renderFormat(workingData, opts());
      textarea.value = rendered.text;
      const status = workingData.captureStatus;
      const suffix = status?.complete
        ? " Complete."
        : status?.cancelled
          ? " Export loading was cancelled."
          : status?.reason === "stalled" && workingData.olderMessagesAvailable
            ? " Automatic history loading did not make progress. Older messages are still available."
            : workingData.olderMessagesAvailable
              ? " Older messages are still available."
              : "";
      count.textContent = `${workingData.messages.length} message${workingData.messages.length === 1 ? "" : "s"} captured.${suffix}`;
      loadOlderButton.hidden = !workingData.olderMessagesAvailable;
      layout.disabled = format.value !== "html";
      printButton.disabled = format.value !== "html";
      downloadButton.textContent = `Download ${rendered.ext.toUpperCase()}`;
    };

    for (const control of [format, layout, botInfo, generation, numbers, avatars]) control.addEventListener("change", refresh);
    ooc.addEventListener("change", async () => {
      const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked };
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
      }
      modal.remove();
    };
    backdrop.addEventListener("click", close);
    closeButton.addEventListener("click", close);
    loadOlderButton.addEventListener("click", async () => {
      if (activeLoadLock?.active) {
        activeLoadLock.cancelled = true;
        activeCapture.cancelled = true;
        loadOlderButton.textContent = "Cancelling…";
        return;
      }

      activeLoadLock = beginExportLock();
      if (!activeLoadLock) return;
      activeCapture.cancelled = false;
      loadOlderButton.textContent = "Cancel loading";

      try {
        const nextSettings = { ...settings, chatExportIncludeOocDirectives: ooc.checked };
        activeCapture.settings = nextSettings;
        const result = await loadAllPreviousMessages({
          session: activeCapture,
          lock: activeLoadLock,
          onProgress: progress => {
            count.textContent = `${progress.count} unique messages captured · ${progress.clicked} older-message load${progress.clicked === 1 ? "" : "s"}`;
          }
        });
        activeCapture = result.session;
        workingData = await buildExportData(nextSettings, result.messages, result);
        refresh();
      } finally {
        endExportLock(activeLoadLock);
        activeLoadLock = null;
        loadOlderButton.textContent = "Load older messages";
      }
    });
    copyButton.addEventListener("click", async () => {
      const copied = await copyTextValue(textarea.value);
      DS.setQuickStatus?.(copied ? "Export copied." : "Could not copy the export.");
    });
    downloadButton.addEventListener("click", () => {
      const rendered = renderFormat(workingData, opts());
      downloadText(rendered.text, rendered.mime, `${safeBaseName(workingData.botInfo?.name)}-chat-export.${rendered.ext}`);
    });
    printButton.addEventListener("click", () => printHtml(makeHtml(workingData, { ...opts(), format: "html" })));
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
    DS.setQuickStatus?.("Preparing chat copy…", true);
    let result = { messages: mergeCapturedMessages(session), complete: !findLoadPreviousMessagesButton(), cancelled: false, reason: "loaded" };

    try {
      if (settings.chatExportLoadPreviousMessages) {
        result = await loadAllPreviousMessages({
          session,
          lock,
          onProgress: progress => DS.setQuickStatus?.(`Preparing chat copy… ${progress.count} unique messages captured`, true)
        });
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
          ? `Copied ${data.messages.length} messages${result.complete ? "." : " (older messages may remain)."}`
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
    DS.setQuickStatus?.("Preparing export…", true);
    let result = { messages: mergeCapturedMessages(session), complete: !findLoadPreviousMessagesButton(), cancelled: false, reason: "loaded" };

    try {
      if (settings.chatExportLoadPreviousMessages) {
        result = await loadAllPreviousMessages({
          session,
          lock,
          onProgress: progress => DS.setQuickStatus?.(`Preparing export… ${progress.count} unique messages captured`, true)
        });
      }

      const data = await buildExportData(settings, result.messages, result);
      showExportModal(data);
      DS.setQuickStatus?.(
        result.complete
          ? `Export ready: ${data.messages.length} messages captured.`
          : `Export ready: ${data.messages.length} messages captured${result.cancelled ? " (loading cancelled)." : ". Older messages may remain."}`
      );
    } finally {
      endExportLock(lock);
    }
  };
})();

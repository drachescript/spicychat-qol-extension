(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const OUTPUT_CLASS = "ds-rp-repair-output";
  const ORIGINAL_HIDDEN_CLASS = "ds-rp-repair-original-hidden";
  const BUTTON_CLASS = "ds-rp-repair-toggle";
  const MESSAGE_SELECTOR = "div[id^='message-']";

  let observer = null;
  let lastSettingsHash = "";
  let initializedRoute = "";
  const pendingMessages = new Set();
  const PENDING_CHUNK_SIZE = 8;
  let deferredFlushTimer = null;
  let flushScheduled = false;

  const ACTION_VERBS = [
    "pauses", "turns", "looks", "glances", "stares", "meets", "nods", "shakes", "sighs", "exhales",
    "inhales", "smiles", "grins", "smirks", "frowns", "scoffs", "snorts", "laughs", "chuckles", "sniffles",
    "swallows", "freezes", "steps", "walks", "moves", "crosses", "leans", "reaches", "folds", "raises", "lowers",
    "shifts", "tilts", "grips", "clutches", "taps", "stomps", "pushes", "pulls", "sits", "stands", "kneels",
    "paces", "watches", "studies", "blinks", "winces", "shrugs", "gestures", "points", "whips", "throws",
    "rubs", "bites", "presses", "runs", "slams", "opens", "closes", "enters", "leaves", "lingers", "hovers"
  ];

  function settings() {
    return DS.getEffectiveRpFormatSettings?.() || DS.state?.settings || {};
  }

  function settingsHash(s) {
    return [
      s.rpFormatStyle, s.rpFormatDetection, s.rpFormatConvertBoldActions !== false,
      s.rpFormatRemoveActionParens !== false, s.rpFormatPreserveInlineEmphasis !== false,
      s.rpFormatPreserveSemanticQuotes !== false, s.rpFormatPreserveBackticks !== false,
      s.rpFormatShowMessageButtons !== false, s.rpFormatRepairAuto !== false
    ].join("|");
  }

  function isAiMessage(message) {
    return !!message?.querySelector?.("a[href*='/chatbot/']");
  }

  function getMessageParts(message) {
    const anchor = message?.querySelector?.("a[href*='/chatbot/']");
    const bubble = anchor?.closest?.("div[class*='max-w-[650px]']") || null;
    const body = bubble?.children?.[1] || null;
    if (!(body instanceof HTMLElement)) return {};
    const firstSpan = body.querySelector("span.leading-6") || body.querySelector("span");
    const contentHost = firstSpan?.parentElement || body.firstElementChild || null;
    return { bubble, body, contentHost };
  }

  function stripVisibleMarkdown(text) {
    let value = String(text || "");
    value = value.replace(/^\s*\*{1,3}(?=\s|$)/, "");
    value = value.replace(/\*{1,3}\s*$/g, "");
    return value;
  }

  function cleanActionText(text, s) {
    let value = stripVisibleMarkdown(text).replace(/\s+/g, " ").trim();
    if (s.rpFormatRemoveActionParens !== false && /^\([\s\S]+\)$/.test(value)) {
      value = value.slice(1, -1).trim();
    }
    return value;
  }

  function normalizeSemanticQuotes(text, s) {
    let value = stripVisibleMarkdown(text);
    if (s.rpFormatPreserveSemanticQuotes !== false && s.rpFormatStyle === "clean") {
      // SpicyChat already removed the outer dialogue quotes when it rendered <q>.
      // In Clean RP, a leading single-quoted phrase is therefore usually a quote
      // *inside* speech, so keep that semantic quote while dropping dialogue quotes.
      value = value.replace(/^'([^'\n]{1,180})'/, '"$1"');
    }
    return value;
  }

  function looksLikeNarration(text, strength) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return false;
    const lower = value.toLowerCase();

    if (/^(from|outside|inside|across|nearby|meanwhile|elsewhere|a beat|silence|footsteps|the doorbell|the door|the room|the hallway|the night|the air)\b/i.test(value)) {
      return true;
    }

    const verbPattern = ACTION_VERBS.join("|");
    const namedActor = new RegExp(`^(?:[A-Z][\\p{L}'-]{1,30}|she|he|they|it)\\s+(?:${verbPattern})\\b`, "iu");
    if (namedActor.test(value)) return true;

    if (strength === "aggressive") {
      const containsAction = new RegExp(`\\b(?:${verbPattern})\\b`, "iu");
      if (containsAction.test(value) && !/[?!]\s*$/.test(value)) return true;
      if (/^[A-Z][\p{L}'-]{1,30}\b/u.test(value) && /\b(?:her|his|their|the|toward|across|against|beside|behind|near)\b/i.test(lower)) return true;
    }

    return false;
  }

  function appendSegment(segments, segment) {
    if (!segment) return;
    if (segment.type === "action") {
      const text = String(segment.text || "");
      if (!text.trim()) return;
      const previous = segments[segments.length - 1];
      if (previous?.type === "action") {
        previous.text += text;
        return;
      }
    }
    segments.push(segment);
  }

  function extractSegments(span, s) {
    const children = [...span.childNodes];
    const strength = ["conservative", "balanced", "aggressive"].includes(s.rpFormatDetection) ? s.rpFormatDetection : "balanced";
    const segments = [];

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        const raw = stripVisibleMarkdown(node.nodeValue || "");
        if (!raw.trim()) continue;
        const type = looksLikeNarration(raw, strength) ? "action" : "speech";
        appendSegment(segments, type === "action" ? { type, text: raw } : { type, sourceText: raw });
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName;

      if (tag === "BR") {
        segments.push({ type: "break" });
        continue;
      }

      if (tag === "Q") {
        segments.push({ type: "speech", sourceNode: node });
        continue;
      }

      if (tag === "CODE") {
        if (s.rpFormatPreserveBackticks !== false) {
          segments.push({ type: "alternate", sourceNode: node });
        } else {
          segments.push({ type: "speech", sourceText: node.textContent || "" });
        }
        continue;
      }

      if (tag === "EM") {
        appendSegment(segments, { type: "action", text: node.textContent || "" });
        continue;
      }

      if (tag === "STRONG" && s.rpFormatConvertBoldActions !== false) {
        appendSegment(segments, { type: "action", text: node.textContent || "" });
        continue;
      }

      const raw = stripVisibleMarkdown(node.textContent || "");
      if (!raw.trim()) continue;
      const type = looksLikeNarration(raw, strength) ? "action" : "speech";
      appendSegment(segments, type === "action" ? { type, text: raw } : { type, sourceText: raw });
    }

    return segments;
  }

  function cloneSpeechChildren(sourceNode, s) {
    const fragment = document.createDocumentFragment();
    let firstText = true;

    const appendNode = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.nodeValue || "";
        if (firstText) {
          text = normalizeSemanticQuotes(text, s);
          firstText = false;
        } else {
          text = stripVisibleMarkdown(text);
        }
        fragment.appendChild(document.createTextNode(text));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if ((node.tagName === "EM" || node.tagName === "I") && s.rpFormatPreserveInlineEmphasis !== false) {
        const em = document.createElement("em");
        em.className = "ds-rp-repair-emphasis";
        [...node.childNodes].forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) em.appendChild(document.createTextNode(stripVisibleMarkdown(child.nodeValue || "")));
          else em.appendChild(document.createTextNode(child.textContent || ""));
        });
        fragment.appendChild(em);
        firstText = false;
        return;
      }
      [...node.childNodes].forEach(appendNode);
    };

    if (sourceNode) [...sourceNode.childNodes].forEach(appendNode);
    return fragment;
  }

  function firstVisibleChar(segment, s) {
    if (segment.type === "action") return cleanActionText(segment.text, s).charAt(0);
    if (segment.type === "alternate") return String(segment.sourceNode?.textContent || "").trim().charAt(0);
    if (segment.sourceText) return stripVisibleMarkdown(segment.sourceText).trim().charAt(0);
    return String(segment.sourceNode?.textContent || "").trim().charAt(0);
  }

  function lastVisibleChar(container) {
    const text = String(container.textContent || "").trimEnd();
    return text.charAt(text.length - 1);
  }

  function maybeSpace(container, nextSegment, s) {
    const last = lastVisibleChar(container);
    const first = firstVisibleChar(nextSegment, s);
    if (!last || !first) return;
    if (/\s/.test(last) || /^[,.;:!?)}\]]/.test(first)) return;
    container.appendChild(document.createTextNode(" "));
  }

  function renderSpan(span, s) {
    const output = document.createElement("span");
    output.className = span.className || "leading-6 mb-[10px] last:mb-0";
    output.classList.add("ds-rp-repair-line");
    const segments = extractSegments(span, s);

    for (const segment of segments) {
      if (segment.type === "break") {
        output.appendChild(document.createElement("br"));
        continue;
      }

      maybeSpace(output, segment, s);

      if (segment.type === "action") {
        const text = cleanActionText(segment.text, s);
        if (!text) continue;
        const em = document.createElement("em");
        em.className = "ds-rp-repair-action";
        em.textContent = text;
        output.appendChild(em);
        continue;
      }

      if (segment.type === "alternate") {
        const code = document.createElement("code");
        code.className = "ds-rp-repair-alternate";
        code.textContent = segment.sourceNode?.textContent || "";
        output.appendChild(code);
        continue;
      }

      const speech = document.createElement("span");
      speech.className = "ds-rp-repair-speech";
      const quoted = s.rpFormatStyle === "quoted";
      if (quoted) speech.appendChild(document.createTextNode('"'));
      if (segment.sourceNode) {
        speech.appendChild(cloneSpeechChildren(segment.sourceNode, s));
      } else {
        speech.appendChild(document.createTextNode(normalizeSemanticQuotes(segment.sourceText || "", s).trim()));
      }
      if (quoted) speech.appendChild(document.createTextNode('"'));
      output.appendChild(speech);
    }

    return output;
  }

  function buildOutput(contentHost, s) {
    const output = document.createElement("div");
    output.className = `${OUTPUT_CLASS} flex flex-col w-full [overflow-wrap:anywhere]`;

    for (const child of [...contentHost.children]) {
      if (child.tagName === "SPAN") output.appendChild(renderSpan(child, s));
      else if (child.tagName === "HR") output.appendChild(document.createElement("hr"));
    }

    return output;
  }

  function isRepairedView(message, s) {
    if (message.dataset.dsRpView === "original") return false;
    if (message.dataset.dsRpView === "repaired") return true;
    return s.rpFormatRepairAuto !== false;
  }

  function updateButton(button, repaired) {
    if (!button) return;
    const text = repaired ? "RP✓" : "RP";
    const title = repaired ? "RP Format Repair is shown — click for original" : "Show RP Format Repair";
    if (button.textContent !== text) button.textContent = text;
    button.dataset.dsRpActive = repaired ? "1" : "0";
    if (button.title !== title) button.title = title;
    if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
  }

  function applyView(message, contentHost, output, s) {
    const repaired = isRepairedView(message, s);
    contentHost.classList.toggle(ORIGINAL_HIDDEN_CLASS, repaired);
    output.hidden = !repaired;
    updateButton(message.querySelector(`.${BUTTON_CLASS}`), repaired);
  }

  function ensureToggleButton(message, contentHost, output, s) {
    let button = message.querySelector(`.${BUTTON_CLASS}`);
    if (s.rpFormatShowMessageButtons === false) {
      button?.remove();
      return;
    }
    if (!button) {
      const dropdown = message.querySelector('button[aria-label="message-dropdown"]');
      const wrapper = dropdown?.closest?.("div.relative") || dropdown?.parentElement || null;
      const host = wrapper?.parentElement || null;
      if (!host) return;
      button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const currentlyRepaired = !output.hidden;
        message.dataset.dsRpView = currentlyRepaired ? "original" : "repaired";
        applyView(message, contentHost, output, settings());
      });
      host.insertBefore(button, wrapper);
    }
    updateButton(button, !output.hidden);
  }

  function processMessage(message, force = false) {
    const s = settings();
    if (!message?.isConnected || DS.isMessageEditPending?.(message) || !isAiMessage(message)) return;
    const { contentHost } = getMessageParts(message);
    if (!(contentHost instanceof HTMLElement) || contentHost.classList.contains(OUTPUT_CLASS)) return;

    const hash = `${settingsHash(s)}|${contentHost.textContent || ""}`;
    if (!force && message.dataset.dsRpReady === hash && message.querySelector(`.${OUTPUT_CLASS}`)) {
      const output = message.querySelector(`.${OUTPUT_CLASS}`);
      applyView(message, contentHost, output, s);
      ensureToggleButton(message, contentHost, output, s);
      return;
    }

    message.querySelector(`.${OUTPUT_CLASS}`)?.remove();
    contentHost.classList.remove(ORIGINAL_HIDDEN_CLASS);
    const output = buildOutput(contentHost, s);
    contentHost.insertAdjacentElement("afterend", output);
    message.dataset.dsRpReady = hash;
    applyView(message, contentHost, output, s);
    ensureToggleButton(message, contentHost, output, s);
  }

  function historyBatchBusy() {
    return !!DS.state?.bulkChatHistoryLoadActive || Date.now() < Number(DS.state?.chatHistoryBatchUntil || 0);
  }

  function schedulePendingFlush(delay = 0) {
    if (flushScheduled || deferredFlushTimer) return;
    if (delay > 0) {
      deferredFlushTimer = setTimeout(() => {
        deferredFlushTimer = null;
        schedulePendingFlush();
      }, delay);
      return;
    }
    flushScheduled = true;
    requestAnimationFrame(flushPending);
  }

  function flushPending() {
    flushScheduled = false;
    if (!pendingMessages.size) return;
    if (historyBatchBusy()) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.rpFormatHistoryDeferrals = Number(counters.rpFormatHistoryDeferrals || 0) + 1;
      const wait = Math.max(140, Number(DS.state?.chatHistoryBatchUntil || 0) - Date.now() + 100);
      schedulePendingFlush(Math.min(1700, wait));
      return;
    }
    const items = [...pendingMessages].slice(0, PENDING_CHUNK_SIZE);
    items.forEach(message => pendingMessages.delete(message));
    items.forEach(message => processMessage(message));
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.rpFormatChunkPasses = Number(counters.rpFormatChunkPasses || 0) + 1;
    counters.rpFormatChunkMessages = Number(counters.rpFormatChunkMessages || 0) + items.length;
    if (pendingMessages.size) schedulePendingFlush();
  }

  function queueMessage(message) {
    if (!message || !isAiMessage(message)) return;
    pendingMessages.add(message);
    schedulePendingFlush();
  }

  function messageFromNode(node) {
    if (!(node instanceof Element)) return null;
    return node.matches(MESSAGE_SELECTOR) ? node : node.closest(MESSAGE_SELECTOR);
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      const s = settings();
      if (!s.enabled || !s.enableRpFormatRepair || !DS.isSingleChatPage?.()) return;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        const targetElement = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
        if (targetElement?.closest?.(`.${OUTPUT_CLASS}, .${BUTTON_CLASS}`)) continue;
        const ownMessage = messageFromNode(targetElement);
        if (ownMessage) queueMessage(ownMessage);
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element) || DS.isQolOwnedNode?.(node) || node.closest?.(`.${OUTPUT_CLASS}, .${BUTTON_CLASS}`)) return;
          const direct = messageFromNode(node);
          if (direct) queueMessage(direct);
          node.querySelectorAll?.(MESSAGE_SELECTOR).forEach(queueMessage);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  function disconnectObserver() {
    observer?.disconnect();
    observer = null;
    pendingMessages.clear();
    clearTimeout(deferredFlushTimer);
    deferredFlushTimer = null;
    flushScheduled = false;
  }

  function cleanupMessage(message) {
    message.querySelectorAll(`.${OUTPUT_CLASS}`).forEach(el => el.remove());
    message.querySelectorAll(`.${BUTTON_CLASS}`).forEach(el => el.remove());
    message.querySelectorAll(`.${ORIGINAL_HIDDEN_CLASS}`).forEach(el => el.classList.remove(ORIGINAL_HIDDEN_CLASS));
    delete message.dataset.dsRpReady;
    delete message.dataset.dsRpView;
  }

  function cleanup() {
    disconnectObserver();
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(cleanupMessage);
    lastSettingsHash = "";
    initializedRoute = "";
    DS.state.rpFormatRepairWasActive = false;
  }

  DS.applyRpFormatRepair = function applyRpFormatRepair() {
    const s = settings();
    if (!s.enabled || !s.enableRpFormatRepair || !DS.isSingleChatPage?.()) {
      if (DS.state.rpFormatRepairWasActive) cleanup();
      return;
    }

    DS.state.rpFormatRepairWasActive = true;
    ensureObserver();
    const nextHash = settingsHash(s);
    const route = String(location.pathname || "");
    const force = nextHash !== lastSettingsHash || initializedRoute !== route;
    lastSettingsHash = nextHash;
    ensureObserver();

    // The module observer handles individual message edits/streaming after the
    // initial pass. Avoid walking every old message again on each global QoL run.
    if (force || !initializedRoute) {
      const loaded = DS.getLoadedMessageRoots?.() || Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
      loaded.forEach(message => {
        if (!isAiMessage(message)) return;
        processMessage(message, true);
      });
      initializedRoute = route;
    } else {
      document.querySelectorAll(`${MESSAGE_SELECTOR}:not([data-ds-rp-ready])`).forEach(message => {
        if (isAiMessage(message)) processMessage(message, false);
      });
    }
  };

  DS.prepareRpFormatRepairMessageForEdit = cleanupMessage;
  DS.removeRpFormatRepair = cleanup;
})();

(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const MARK = "ds-alt-dialogue";
  const STYLE_ATTR = "data-ds-alt-dialogue-style";
  const CUSTOM_ATTR = "data-ds-alt-dialogue-custom";
  const GENERATED_ATTR = "data-ds-alt-dialogue-generated";
  const VALID_STYLES = new Set(["dialogue", "texting", "thoughts", "subtle"]);
  const VALID_SCOPES = new Set(["ai", "user", "both"]);
  const READY_ATTR = "data-ds-alt-dialogue-ready";
  let lastSignature = "";
  let lastRoute = "";

  function normalizeHex(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
  }

  function isAiMessage(message) {
    if (message?.querySelector?.("div[class*='bg-blumine-'], div[class*='m-[0_10px_0_53px]']")) return false;
    return !!message?.querySelector?.("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function getMessageContentHost(message) {
    if (!(message instanceof Element)) return null;

    // Scope styling to the actual message body. /cmd/OOC directive UI can also
    // contain code-like text, but it lives outside this content host.
    const bubble = message.querySelector("div[class*='!max-w-[650px]'], div[class*='max-w-[650px]']");
    const body = bubble?.children?.[1] || null;
    if (!(body instanceof HTMLElement)) return null;

    const firstSpan = body.querySelector("span.leading-6") || body.querySelector("span");
    return firstSpan?.parentElement || body.firstElementChild || body;
  }

  function inlineCodeNodes(message) {
    const host = getMessageContentHost(message);
    if (!host) return [];
    const hosts = [host];
    host.parentElement?.querySelectorAll?.(".ds-rp-repair-output").forEach(output => hosts.push(output));
    return hosts.flatMap(item => [...item.querySelectorAll("code")]).filter(code => !code.closest("pre"));
  }

  function nativeHighlightedBacktickNodes(message) {
    const host = getMessageContentHost(message);
    if (!host) return [];

    // SpicyChat currently has a third rendering path for user backticks:
    // ordinary messages can turn `text` into a highlighted <blockquote>
    // instead of <code>, while /cmd/Directed variants may leave literal
    // backticks untouched. Treat only highlighted blockquotes inside the
    // real message body as alternate dialogue so directive UI stays out.
    const hosts = [host];
    host.parentElement?.querySelectorAll?.(".ds-rp-repair-output").forEach(output => hosts.push(output));
    return hosts.flatMap(item => [...item.querySelectorAll("blockquote.bg-colorHighlight")]);
  }

  function clearNode(node) {
    node.classList.remove(MARK);
    node.removeAttribute(STYLE_ATTR);
    node.removeAttribute(CUSTOM_ATTR);
  }

  function unwrapGenerated(root = document) {
    root.querySelectorAll?.(`[${GENERATED_ATTR}='1']`).forEach(span => {
      span.replaceWith(document.createTextNode(`\`${span.textContent || ""}\``));
    });
  }

  function cleanup() {
    unwrapGenerated(document);
    document.querySelectorAll(`.${MARK}`).forEach(clearNode);
    const root = document.documentElement;
    root.style.removeProperty("--ds-alt-dialogue-text");
    root.style.removeProperty("--ds-alt-dialogue-bg");
    root.style.removeProperty("--ds-alt-dialogue-border");
    document.querySelectorAll(`[${READY_ATTR}]`).forEach(message => message.removeAttribute(READY_ATTR));
    lastSignature = "";
    lastRoute = "";
    DS.state.alternateDialogueWasActive = false;
  }

  function shouldSkipTextNode(node, host) {
    const parent = node?.parentElement;
    if (!parent || !host.contains(parent)) return true;
    return !!parent.closest([
      "code", "pre", "button", "input", "textarea", "select", "option",
      ".ds-translation-block", ".ds-qol-panel", "#ds-qol-panel",
      `[${GENERATED_ATTR}='1']`
    ].join(","));
  }

  function rawBacktickTextNodes(host) {
    if (!host) return [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    const out = [];
    let node;
    while ((node = walker.nextNode())) {
      if (shouldSkipTextNode(node, host)) continue;
      const text = String(node.nodeValue || "");
      if (/`[^`\n]+`/.test(text)) out.push(node);
    }
    return out;
  }

  function wrapRawBackticks(host) {
    for (const node of rawBacktickTextNodes(host)) {
      const text = String(node.nodeValue || "");
      const regex = /`([^`\n]+)`/g;
      let match;
      let last = 0;
      const fragment = document.createDocumentFragment();
      let changed = false;

      while ((match = regex.exec(text))) {
        changed = true;
        if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
        const span = document.createElement("span");
        span.setAttribute(GENERATED_ATTR, "1");
        span.textContent = match[1];
        fragment.appendChild(span);
        last = regex.lastIndex;
      }

      if (!changed) continue;
      if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
    }
  }

  function styleNode(node, style, customColors) {
    node.classList.add(MARK);
    node.setAttribute(STYLE_ATTR, style);
    node.setAttribute(CUSTOM_ATTR, customColors ? "1" : "0");
    node.title = node.title || "Alternate dialogue / inline text";
  }

  function processMessage(message, style, scope, customColors, signature) {
    if (!message?.isConnected || DS.isMessageEditPending?.(message)) return;

    const ai = isAiMessage(message);
    const allowed = scope === "both" || (scope === "ai" && ai) || (scope === "user" && !ai);

    if (!allowed) {
      unwrapGenerated(message);
      message.querySelectorAll(`.${MARK}`).forEach(clearNode);
      message.setAttribute(READY_ATTR, signature);
      return;
    }

    const host = getMessageContentHost(message);
    if (!host) return;

    wrapRawBackticks(host);

    const validNodes = new Set([
      ...inlineCodeNodes(message),
      ...nativeHighlightedBacktickNodes(message),
      ...message.querySelectorAll(`[${GENERATED_ATTR}='1']`)
    ]);

    message.querySelectorAll(`.${MARK}`).forEach(node => {
      if (!validNodes.has(node)) clearNode(node);
    });

    validNodes.forEach(node => styleNode(node, style, customColors));
    message.setAttribute(READY_ATTR, signature);
  }

  DS.applyAlternateDialogueStyling = function applyAlternateDialogueStyling() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.styleAlternateDialogue || !DS.isSingleChatPage?.()) {
      if (DS.state.alternateDialogueWasActive) cleanup();
      return;
    }

    DS.state.alternateDialogueWasActive = true;

    const style = VALID_STYLES.has(settings.alternateDialogueStyle)
      ? settings.alternateDialogueStyle
      : "dialogue";
    const scope = VALID_SCOPES.has(settings.alternateDialogueScope)
      ? settings.alternateDialogueScope
      : "ai";
    const customColors = !!settings.alternateDialogueCustomColors;
    const signature = JSON.stringify([
      style, scope, customColors,
      normalizeHex(settings.alternateDialogueTextColor, "#f4d35e"),
      normalizeHex(settings.alternateDialogueBackgroundColor, "#1f2430"),
      normalizeHex(settings.alternateDialogueBorderColor, "#596273")
    ]);
    const route = String(location.pathname || "");
    const fullPass = signature !== lastSignature || route !== lastRoute;
    lastSignature = signature;
    lastRoute = route;

    const root = document.documentElement;
    root.style.setProperty("--ds-alt-dialogue-text", normalizeHex(settings.alternateDialogueTextColor, "#f4d35e"));
    root.style.setProperty("--ds-alt-dialogue-bg", normalizeHex(settings.alternateDialogueBackgroundColor, "#1f2430"));
    root.style.setProperty("--ds-alt-dialogue-border", normalizeHex(settings.alternateDialogueBorderColor, "#596273"));

    let messages;
    if (fullPass) {
      messages = [...document.querySelectorAll("div[id^='message-']")];
    } else {
      const laneRoots = DS.getCurrentMessageLaneRoots?.() || [];
      messages = laneRoots.length
        ? [...new Set(laneRoots)]
        : [...document.querySelectorAll(`div[id^='message-']:not([${READY_ATTR}])`)];
      if (laneRoots.length) {
        const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
        counters.alternateDialogueIncrementalUpdates = Number(counters.alternateDialogueIncrementalUpdates || 0) + 1;
        counters.alternateDialogueDirtyRoots = Number(counters.alternateDialogueDirtyRoots || 0) + messages.length;
      }
    }

    messages.forEach(message => processMessage(message, style, scope, customColors, signature));
  };

  DS.prepareAlternateDialogueMessageForEdit = function prepareAlternateDialogueMessageForEdit(message) {
    if (!message) return;
    unwrapGenerated(message);
    message.querySelectorAll?.(`.${MARK}`).forEach(clearNode);
    message.removeAttribute?.(READY_ATTR);
  };

  DS.removeAlternateDialogueStyling = cleanup;
})();

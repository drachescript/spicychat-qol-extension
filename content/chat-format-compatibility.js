(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS || DS.__chatFormatCompatibilityLoaded) return;
  DS.__chatFormatCompatibilityLoaded = true;

  const MESSAGE_SELECTOR = "div[id^='message-']";
  const FIX_ATTR = "data-ds-native-format-dialogue-fix";
  const FIX_SELECTOR = `[${FIX_ATTR}='1']`;
  const pending = new Set();
  let observer = null;
  let flushScheduled = false;

  function enabled() {
    const settings = DS.state?.settings || {};
    return !!settings.enabled && !!DS.isSingleChatPage?.();
  }

  function customBubbleColorsActive() {
    return document.documentElement.getAttribute("data-ds-chat-bubbles") === "1";
  }

  function messageFromNode(node) {
    if (!(node instanceof Element)) return null;
    return node.matches(MESSAGE_SELECTOR) ? node : node.closest(MESSAGE_SELECTOR);
  }

  function unwrapFixes(root) {
    root?.querySelectorAll?.(FIX_SELECTOR).forEach(wrapper => {
      wrapper.replaceWith(document.createTextNode(wrapper.textContent || ""));
    });
  }

  function hasMeaningfulDirectText(span) {
    return [...span.childNodes].some(node => node.nodeType === Node.TEXT_NODE && /\S/.test(node.nodeValue || ""));
  }

  function spanLooksColorLeaked(span) {
    if (!(span instanceof HTMLElement) || !hasMeaningfulDirectText(span)) return false;
    if (span.closest(".ds-rp-repair-output, .ds-translation-output, pre, code")) return false;

    const className = String(span.className || "");
    if (/\b(?:dark:)?text-sky-\d+\b/.test(className)) return true;

    // Native SpicyChat dialogue normally becomes <q> while actions become <em>.
    // Single quotes/backticks stay as raw text, and on affected 4.5.x renders the
    // action color can leak onto that surrounding raw text. Mixed raw text + an
    // action element is therefore safe to normalize back to native dialogue color.
    if (span.querySelector(":scope > em, :scope > i")) return true;

    return false;
  }

  function wrapDirectText(span) {
    if (!spanLooksColorLeaked(span)) {
      unwrapFixes(span);
      return;
    }

    const nodes = [...span.childNodes];
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE || !/\S/.test(node.nodeValue || "")) continue;
      const wrapper = document.createElement("span");
      wrapper.setAttribute(FIX_ATTR, "1");
      wrapper.className = "ds-native-format-dialogue-fix !text-black dark:!text-white";
      wrapper.textContent = node.nodeValue || "";
      node.replaceWith(wrapper);
    }
  }

  function repairMessage(message) {
    if (!(message instanceof HTMLElement) || !message.isConnected) return;
    if (DS.isMessageEditPending?.(message)) return;
    if (!enabled() || customBubbleColorsActive()) {
      unwrapFixes(message);
      return;
    }

    const spans = [...message.querySelectorAll("span.leading-6")]
      .filter(span => !span.closest(".ds-rp-repair-output"));
    spans.forEach(wrapDirectText);
  }

  function flush() {
    flushScheduled = false;
    const items = [...pending].slice(0, 24);
    items.forEach(item => pending.delete(item));
    items.forEach(repairMessage);
    if (pending.size) scheduleFlush();
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flush);
  }

  function queueMessage(message) {
    if (!(message instanceof HTMLElement)) return;
    pending.add(message);
    scheduleFlush();
  }

  function scanInitial() {
    if (!enabled()) return;
    const roots = DS.getMessageEnhancerRoots?.({ newest: 48, margin: 1600 });
    const messages = Array.isArray(roots) && roots.length
      ? roots
      : [...document.querySelectorAll(MESSAGE_SELECTOR)].slice(-48);
    messages.forEach(queueMessage);
  }

  function ensureObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(mutations => {
      if (!enabled()) return;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        const targetMessage = messageFromNode(mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement);
        if (targetMessage) queueMessage(targetMessage);
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element) || node.matches?.(FIX_SELECTOR) || node.closest?.(FIX_SELECTOR)) return;
          const direct = messageFromNode(node);
          if (direct) queueMessage(direct);
          node.querySelectorAll?.(MESSAGE_SELECTOR).forEach(queueMessage);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function refresh() {
    if (!enabled()) {
      document.querySelectorAll(FIX_SELECTOR).forEach(wrapper => wrapper.replaceWith(document.createTextNode(wrapper.textContent || "")));
      return;
    }
    ensureObserver();
    scanInitial();
  }

  DS.applyChatFormattingCompatibility = refresh;
  DS.prepareChatFormattingCompatibilityMessageForEdit = function prepareChatFormattingCompatibilityMessageForEdit(message) {
    unwrapFixes(message);
  };

  window.addEventListener("popstate", () => setTimeout(refresh, 60), true);
  document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("a[href]")) setTimeout(refresh, 100);
  }, true);

  try {
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== "local" || !DS.hasSettingStorageChanges?.(changes)) return;
      setTimeout(refresh, 0);
    });
  } catch {}

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
  setTimeout(refresh, 350);
  setTimeout(refresh, 1200);
  setTimeout(refresh, 3000);
})();

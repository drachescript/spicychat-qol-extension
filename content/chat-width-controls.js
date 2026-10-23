// Optional width control: one cached stylesheet, no DOM observers, selectors or per-keystroke measurements.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const STYLE_ID = "ds-qol-chat-width-style";
  const ACTIVE = "data-ds-qol-chat-width-active";
  // Target the native lanes and the real bubble element (including SpicyChat's
  // !max-w-[650px] class). Rules are desktop-only and installed only on opt-in.
  const CSS = `
  @media (min-width: 761px) {
    html[${ACTIVE}="1"] div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center,
    html[${ACTIVE}="1"][data-ds-chat-message-layout="stacked"] div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center {
      width: 100% !important;
      max-width: min(var(--ds-qol-chat-stream-width), calc(100vw - 48px)) !important;
      margin-inline: auto !important;
      box-sizing: border-box !important;
    }
    /* SpicyChat places !max-w-[650px] on the actual message bubble, not the
       message-row's second child. Target native bubbles without touching all
       nested message/action elements. */
    html[${ACTIVE}="1"] div[id^="message-"] [class*="!max-w-[650px]"] {
      max-width: min(var(--ds-qol-chat-bubble-width), calc(100% - 24px)) !important;
      box-sizing: border-box !important;
    }
    html[${ACTIVE}="1"] .w-full.justify-center.m-auto:has(textarea[placeholder="Message..."]) {
      width: 100% !important;
      max-width: min(var(--ds-qol-chat-composer-width), calc(100vw - 48px)) !important;
      margin-inline: auto !important;
      box-sizing: border-box !important;
    }
    /* The stacked layout normally keeps an independent 800px composer cap. */
    html[${ACTIVE}="1"][data-ds-chat-message-layout="stacked"] [data-ds-stacked-composer-bubble="1"] {
      width: min(var(--ds-qol-chat-composer-width), calc(100vw - 48px)) !important;
      max-width: min(var(--ds-qol-chat-composer-width), calc(100vw - 48px)) !important;
      flex-basis: min(var(--ds-qol-chat-composer-width), calc(100vw - 48px)) !important;
      min-width: 0 !important;
    }
  }`;
  function width(value, fallback, min, max) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
  }
  DS.applyChatWidthSettings = function applyChatWidthSettings() {
    const html = document.documentElement;
    if (!html) return false;
    const settings = DS.state?.settings || {};
    const enabled = settings.enabled !== false && settings.enableChatWidthControls === true &&
      /^\/chat\/[^/]+\/[^/]+/i.test(location.pathname);
    const stream = width(settings.chatStreamWidth, 800, 520, 1600);
    const bubble = Math.min(stream, width(settings.chatBubbleMaxWidth, 650, 360, 1500));
    const composer = width(settings.chatComposerWidth, 800, 520, 1600);
    const signature = enabled ? `${stream}:${bubble}:${composer}` : "off";
    if (DS.state.chatWidthSignature === signature &&
        (!enabled || document.getElementById(STYLE_ID))) return false;
    DS.state.chatWidthSignature = signature;
    if (!enabled) {
      html.removeAttribute(ACTIVE);
      for (const key of ["--ds-qol-chat-stream-width", "--ds-qol-chat-bubble-width", "--ds-qol-chat-composer-width"]) html.style.removeProperty(key);
      document.getElementById(STYLE_ID)?.remove();
      return true;
    }
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || html).appendChild(style);
    }
    html.style.setProperty("--ds-qol-chat-stream-width", `${stream}px`);
    html.style.setProperty("--ds-qol-chat-bubble-width", `${bubble}px`);
    html.style.setProperty("--ds-qol-chat-composer-width", `${composer}px`);
    html.setAttribute(ACTIVE, "1");
    return true;
  };
})();
}

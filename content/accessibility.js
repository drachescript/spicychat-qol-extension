(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const STYLE_ID = "ds-qol-accessibility-style";
  const QOL_SURFACES = [
    "#ds-chat-search-panel",
    "#ds-memory-bulk-toolbar",
    ".ds-formatting-toolbar",
    ".ds-smart-filter-toolbar",
    ".ds-recommendation-toolbar",
    ".ds-bot-organizer-popover",
    ".ds-android-qol-menu",
    ".ds-favorite-history-dialog",
    ".ds-character-profile-dialog",
    ".ds-tool-modal-dialog",
    "#ds-chat-export-modal .ds-export-dialog"
  ].join(",\n");

  function allowedScale(value, fallback = 100) {
    const number = Number(value);
    return [100, 110, 125, 150].includes(number) ? number : fallback;
  }

  function lineHeightFor(value) {
    if (value === "comfortable") return "1.55";
    if (value === "spacious") return "1.75";
    return "";
  }

  DS.applyAccessibilitySettings = function applyAccessibilitySettings() {
    const settings = DS.state?.settings || {};
    const enabled = settings.enabled !== false;
    const uiScale = enabled ? allowedScale(settings.qolInterfaceScale) : 100;
    const chatScale = enabled ? allowedScale(settings.chatTextScale) : 100;
    const lineMode = enabled && ["native", "comfortable", "spacious"].includes(settings.chatLineSpacing)
      ? settings.chatLineSpacing
      : "native";
    const lineHeight = lineHeightFor(lineMode);
    const signature = `${uiScale}|${chatScale}|${lineMode}`;

    if (DS.state.accessibilityStyleSignature === signature && document.getElementById(STYLE_ID)) return false;
    DS.state.accessibilityStyleSignature = signature;

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }

    const chatRules = [];
    if (chatScale !== 100) {
      chatRules.push(`
        div[id^="message-"] div[class*="overflow-wrap"] {
          font-size: ${chatScale}% !important;
        }
        div[id^="message-"] div[class*="overflow-wrap"] :is(p, span, li, blockquote) {
          font-size: inherit;
        }
      `);
    }
    if (lineHeight) {
      chatRules.push(`
        div[id^="message-"] div[class*="overflow-wrap"],
        div[id^="message-"] div[class*="overflow-wrap"] :is(p, span, li, blockquote) {
          line-height: ${lineHeight} !important;
        }
      `);
    }

    const uiRule = uiScale === 100 ? "" : `
      ${QOL_SURFACES} {
        zoom: ${uiScale / 100};
      }
    `;

    style.textContent = `${chatRules.join("\n")}\n${uiRule}`;
    return true;
  };
})();

(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const HOST_ID = "ds-native-rating-quick";
  let ratingInFlight = false;

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const visible = el => {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  };
  const wait = async (getter, timeoutMs = 5000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = getter();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
  };

  function modal() {
    return [...document.querySelectorAll("div.fixed, [role='dialog']")].find(el => visible(el) && /rate chatbot/i.test(clean(el.textContent))) || null;
  }

  function ratingButtons(dialog) {
    return [...dialog.querySelectorAll("button")]
      .filter(button => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .filter(button => button.querySelector("svg[class*='lucide-thumbs-']"));
  }

  function targetButton(dialog, kind) {
    const list = ratingButtons(dialog);
    if (kind === "down") return list.find(button => button.querySelector("svg[class*='thumbs-down']"));
    const ups = list.filter(button => button.querySelector("svg[class*='thumbs-up']"));
    return kind === "double"
      ? (ups.find(button => button.querySelectorAll("svg[class*='thumbs-up']").length >= 2) || ups[1])
      : ups[0];
  }

  function alreadySelected(button, kind) {
    if (!button) return false;
    if (button.getAttribute("aria-pressed") === "true") return true;
    const state = String(button.getAttribute("data-state") || "").toLowerCase();
    if (["active", "checked", "on", "selected"].includes(state)) return true;
    const cls = String(button.className || "");
    const selectedClass = kind === "down" ? "bg-red-9" : kind === "double" ? "bg-purple-9" : "bg-blue-9";
    return new RegExp(`(^|\\s)${selectedClass}(\\s|$)`).test(cls) && !/(^|\s)bg-transparent(\s|$)/.test(cls);
  }

  function closeDialog(dialog) {
    const close = dialog?.querySelector("button[aria-label='X-button'], button[aria-label='Cancel']");
    if (!close) return;
    try { close.click(); } catch { DS.realClick?.(close); }
  }

  function statusFor(kind, already = false) {
    const name = kind === "down" ? "dislike" : kind === "double" ? "double-like" : "like";
    return already ? `Native ${name} is already selected.` : `Native ${name} submitted.`;
  }

  async function rate(kind) {
    if (ratingInFlight) return;
    ratingInFlight = true;
    try {
      const native = document.querySelector("button[aria-label='ThumbsUp-button']");
      if (!native) return DS.setQuickStatus?.("SpicyChat rating button not found.");

      try { native.click(); } catch { DS.realClick?.(native); }
      const dialog = await wait(modal, 5000);
      if (!dialog) return DS.setQuickStatus?.("SpicyChat rating dialog did not open.");

      const target = targetButton(dialog, kind);
      if (!target) {
        closeDialog(dialog);
        return DS.setQuickStatus?.("Requested native rating choice was not found.");
      }

      // SpicyChat leaves an existing choice clickable while Done stays disabled.
      // Clicking the selected choice again would deselect it, so leave it alone.
      if (alreadySelected(target, kind)) {
        closeDialog(dialog);
        return DS.setQuickStatus?.(statusFor(kind, true));
      }

      try { target.click(); } catch { DS.realClick?.(target); }
      const done = await wait(() => {
        const button = dialog.querySelector("button[aria-label='Done']");
        return button && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
      }, 3500);

      if (!done) {
        closeDialog(dialog);
        return DS.setQuickStatus?.("SpicyChat did not enable Done for that rating.");
      }

      try { done.click(); } catch { DS.realClick?.(done); }
      DS.setQuickStatus?.(statusFor(kind));
    } finally {
      ratingInFlight = false;
    }
  }

  function cleanup() { document.getElementById(HOST_ID)?.remove(); }

  DS.applyNativeRatingHelpers = function applyNativeRatingHelpers() {
    const settings = DS.state.settings || {};
    if (!settings.enabled || !settings.enableNativeRatingHelpers || !DS.isSingleChatPage?.()) return cleanup();
    if (document.getElementById(HOST_ID)) return;

    const native = document.querySelector("button[aria-label='ThumbsUp-button']");
    if (!native?.parentElement) return;

    const host = document.createElement("span");
    host.id = HOST_ID;
    host.style.cssText = "display:inline-flex;gap:3px;margin-right:3px";
    for (const [kind, label, title] of [
      ["down", "−", "Dislike through SpicyChat's native rating dialog"],
      ["up", "+", "Like through SpicyChat's native rating dialog"],
      ["double", "++", "Double-like through SpicyChat's native rating dialog"]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.style.cssText = "min-width:26px;height:26px;padding:0 5px;border:1px solid rgba(148,163,184,.35);border-radius:999px;background:transparent;color:inherit;cursor:pointer;font:700 11px system-ui";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        rate(kind);
      });
      host.appendChild(button);
    }
    native.parentElement.insertBefore(host, native);
  };

  DS.removeNativeRatingHelpers = cleanup;
})();

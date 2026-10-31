// Independent OOC composer shortcut shared by Full and Core + OOC packages.
// No generic Chat UI feature is required to mount or restore the OOC control.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const OOC_SHORTCUT_CLASS = "ds-chat-ooc-shortcut";
  const OOC_WRAPPER_CLASS = "ds-chat-ooc-shortcut-wrapper";
  let oocHealthTimer = 0;
  let oocHealthConfirmTimer = 0;
  function restoreOocShortcuts() {
    // Do not let a health check run after the user has turned OOC off.
    clearTimeout(oocHealthTimer);
    clearTimeout(oocHealthConfirmTimer);
    oocHealthTimer = 0;
    oocHealthConfirmTimer = 0;
    DS.qsa(`.${OOC_WRAPPER_CLASS}`).forEach(wrapper => wrapper.remove());
    DS.qsa(`.${OOC_SHORTCUT_CLASS}`).forEach(button => button.remove());
    DS.qsa(".ds-chat-ooc-controls-fallback").forEach(row => row.remove());

    DS.qsa("[data-ds-ooc-image-wrapper='1']").forEach(wrapper => {
      const original = wrapper.querySelector(
        'button[data-ds-ooc-original-image="1"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]'
      );

      if (original) {
        original.style.removeProperty("display");
        original.removeAttribute("data-ds-ooc-original-image");
      }

      const originalTooltip = wrapper.dataset.dsOocOriginalTooltip;
      if (originalTooltip !== undefined) {
        if (originalTooltip) wrapper.setAttribute("data-tooltip-content", originalTooltip);
        else wrapper.removeAttribute("data-tooltip-content");
      }

      delete wrapper.dataset.dsOocOriginalTooltip;
      delete wrapper.dataset.dsOocImageWrapper;
    });
  }

  function isVisibleElement(element) {
    if (!element || !document.contains(element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return element.getClientRects().length > 0;
  }

  function composerFieldNear(control) {
    const selectors =
      'textarea, input[type="text"], [contenteditable="true"][role="textbox"], [contenteditable="true"]';

    for (let node = control; node && node !== document.body; node = node.parentElement) {
      const fields = DS.qsa(selectors, node).filter(isVisibleElement);
      if (fields.length) return fields[fields.length - 1];
      if (node.id === "root") break;
    }

    const fields = DS.qsa(selectors)
      .filter(isVisibleElement)
      .filter(field => !field.closest("#ds-qol-panel, [id^='message-']"));

    return fields.sort((a, b) => {
      const aText = DS.normalize(
        `${a.getAttribute("placeholder") || ""} ${a.getAttribute("aria-label") || ""}`
      );
      const bText = DS.normalize(
        `${b.getAttribute("placeholder") || ""} ${b.getAttribute("aria-label") || ""}`
      );
      const aScore = aText.includes("message") ? 10 : 0;
      const bScore = bText.includes("message") ? 10 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
    })[0] || null;
  }

  function preferredOocTemplateIndex() {
    return Number(DS.getPreferredOocTemplateIndex?.() || 0);
  }

  function normalizeOocShortcut(button) {
    if (!button) return null;

    // SpicyChat temporarily disables its native Image control while a reply is
    // being generated. OOC is cloned from that control for native sizing, but
    // transient disabled state must never become permanent on the QoL clone.
    // Avoid writing unchanged attributes/classes. DOMTokenList.add/remove can
    // emit a class mutation even when the requested token is already correct;
    // the chat observer would then wake up to inspect our own OOC control.
    for (const name of ["disabled", "aria-disabled", "data-disabled", "data-ds-hidden", "data-ds-reason"]) {
      if (button.hasAttribute(name)) button.removeAttribute(name);
    }
    for (const name of ["ds-hidden", "opacity-60", "cursor-not-allowed", "pointer-events-none"]) {
      if (button.classList.contains(name)) button.classList.remove(name);
    }
    if (!button.classList.contains("cursor-pointer")) button.classList.add("cursor-pointer");
    for (const property of ["display", "pointer-events", "opacity"]) {
      if (button.style.getPropertyValue(property)) button.style.removeProperty(property);
    }
    if (button.type !== "button") button.type = "button";

    if (button.getAttribute("tabindex") === "-1") button.removeAttribute("tabindex");
    return button;
  }

  function bindOocShortcut(button) {
    if (!button || button.dataset.dsOocBound === "1") return button;
    button.dataset.dsOocBound = "1";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      if (typeof DS.insertOocTemplate !== "function") {
        DS.setQuickStatus?.("OOC tools are still loading.");
        return;
      }

      DS.insertOocTemplate(preferredOocTemplateIndex());
    });

    return button;
  }

  function nativeImageForOoc(button) {
    const wrapper = button?.closest?.("[data-ds-ooc-image-wrapper='1']") || button?.parentElement;
    return wrapper?.querySelector?.(
      'button[data-ds-ooc-original-image="1"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]'
    ) || null;
  }

  function composerIsUsableForOoc(button) {
    const field = composerFieldNear(button);
    if (!field) return false;
    if (field.disabled || field.readOnly) return false;
    if (field.getAttribute("aria-disabled") === "true") return false;
    return isVisibleElement(field);
  }

  function oocShortcutLooksUsable(button) {
    if (!button || !document.contains(button) || !isVisibleElement(button)) return false;
    if (button.disabled || button.matches?.(":disabled")) return false;
    if (button.getAttribute("aria-disabled") === "true") return false;
    const style = getComputedStyle(button);
    if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") return false;
    if (button.classList.contains("cursor-not-allowed") || button.classList.contains("pointer-events-none")) return false;
    return true;
  }

  function reportOocHealthFailure() {
    if (!DS.isSingleChatPage?.() || document.visibilityState !== "visible") return;
    DS.runtimeLog?.("warn", "chat-ui", "OOC shortcut remained unusable after local repair", {
      route: String(location.pathname || "").slice(0, 160)
    });
    DS.setQuickStatus?.("OOC control could not be repaired. Reload this chat manually if it stays unavailable.");
  }

  function scheduleOocShortcutHealthCheck() {
    if (oocHealthTimer) return;

    oocHealthTimer = window.setTimeout(() => {
      oocHealthTimer = 0;
      const { settings } = DS.state;
      if (!settings?.enabled || !settings.replaceChatImageWithOocButton || !DS.isSingleChatPage?.()) return;

      const buttons = DS.qsa(`.${OOC_SHORTCUT_CLASS}`).filter(button => !button.closest("#ds-qol-panel"));
      if (!buttons.length) return;

      let needsConfirm = false;
      buttons.forEach(button => {
        bindOocShortcut(normalizeOocShortcut(button));

        // Do not treat SpicyChat's legitimate in-generation disabled window as
        // a broken QoL control. Only escalate once the native source control and
        // composer are usable again.
        const nativeImage = nativeImageForOoc(button);
        const nativeReady = !nativeImage || (!nativeImage.disabled && nativeImage.getAttribute("aria-disabled") !== "true");
        if (nativeReady && composerIsUsableForOoc(button) && !oocShortcutLooksUsable(button)) {
          needsConfirm = true;
        }
      });

      if (!needsConfirm || oocHealthConfirmTimer) return;

      oocHealthConfirmTimer = window.setTimeout(() => {
        oocHealthConfirmTimer = 0;
        const broken = DS.qsa(`.${OOC_SHORTCUT_CLASS}`).some(button => {
          if (button.closest("#ds-qol-panel")) return false;
          bindOocShortcut(normalizeOocShortcut(button));
          const nativeImage = nativeImageForOoc(button);
          const nativeReady = !nativeImage || (!nativeImage.disabled && nativeImage.getAttribute("aria-disabled") !== "true");
          return nativeReady && composerIsUsableForOoc(button) && !oocShortcutLooksUsable(button);
        });
        if (broken) reportOocHealthFailure();
      }, 850);
    }, 250);
  }

  function createOocShortcut(original) {
    const button = original.cloneNode(false);

    // Prefer the native Image button as a size template, but keep OOC in its
    // own sibling wrapper. Never inherit its transient disabled/hidden state.
    button.removeAttribute("data-testid");
    button.removeAttribute("id");
    button.removeAttribute("data-ds-ooc-original-image");
    button.classList.add(OOC_SHORTCUT_CLASS);
    button.setAttribute("aria-label", "Insert OOC message");
    button.title = "Insert selected OOC message";
    button.textContent = "OOC";

    normalizeOocShortcut(button);
    bindOocShortcut(button);
    return button;
  }

  function findComposerPlacement(field) {
    if (!field) return null;
    // The chat composer keeps a stable message-field shell even when React
    // temporarily removes Image, Suggest and Plus while the user is typing.
    // Mount into that shell rather than making OOC depend on those buttons.
    for (let shell = field.parentElement; shell && shell !== document.body; shell = shell.parentElement) {
      const children = Array.from(shell.children || []);
      if (children.length < 2) continue;
      const fieldBranch = children.find(child => child === field || child.contains(field));
      if (!fieldBranch) continue;
      // Prefer native controls when they return after typing; a temporary
      // fallback row must not capture OOC permanently ahead of Image/Suggest.
      const nativeControls = children.find(child => child !== fieldBranch &&
        !child.matches?.(".ds-chat-ooc-controls-fallback") &&
        child.querySelector?.('button[aria-label="Plus-button"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"], button[aria-label="autogenerate"]')
      );
      const fallbackControls = children.find(child => child.matches?.(".ds-chat-ooc-controls-fallback"));
      const isMobileComposer = shell.classList.contains("items-end") && shell.classList.contains("w-full");
      const onMobile = !!window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches;
      if (isMobileComposer && onMobile) {
        // Keep OOC in a dedicated, fixed left slot. Native Plus/Image/Suggest
        // move or vanish while typing; following their moving row placed OOC
        // under Send and changed the textbox width after several lines.
        return { shell, fieldBranch, controls: fallbackControls || null };
      }
      const controls = nativeControls || fallbackControls || null;
      if (controls) return { shell, fieldBranch, controls };
      if (isMobileComposer) return { shell, fieldBranch, controls: null };
    }
    return null;
  }

  function ensureOocShortcut() {
    const field = document.querySelector('textarea[placeholder="Message..."], textarea[placeholder*="Message"], textarea[aria-label="Message"]')
      || composerFieldNear(document.body);
    const placement = findComposerPlacement(field);
    if (!placement || placement.shell.closest("#ds-qol-panel")) return;

    let { shell, fieldBranch, controls } = placement;
    if (window.matchMedia?.("(max-width: 760px), (pointer: coarse)")?.matches &&
        shell.classList.contains("items-end") && shell.classList.contains("w-full")) {
      shell.dataset.dsMobileComposerRow = "1";
      fieldBranch.dataset.dsMobileComposerField = "1";
    }
    if (!controls) {
      // No native left-side controls remain during typing. Create a small
      // standalone lane immediately to the left of the message field.
      controls = document.createElement("div");
      controls.className = "h-full flex items-end gap-sm mb-1 ds-chat-ooc-controls-fallback";
      shell.insertBefore(controls, fieldBranch);
    }

    // Restore any old image-slot replacement from previous code/reloads.
    // The OOC shortcut is always its own button; Image is controlled only by
    // the independent Hide image generation setting.
    DS.qsa("[data-ds-ooc-image-wrapper='1']").forEach(wrapper => {
      const nativeImage = wrapper.querySelector('button[data-ds-ooc-original-image="1"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]');
      if (nativeImage?.hasAttribute("data-ds-ooc-original-image")) {
        nativeImage.style.removeProperty("display");
        nativeImage.removeAttribute("data-ds-ooc-original-image");
      }
      const oldTooltip = wrapper.dataset.dsOocOriginalTooltip;
      if (oldTooltip !== undefined) {
        if (oldTooltip) wrapper.setAttribute("data-tooltip-content", oldTooltip);
        else wrapper.removeAttribute("data-tooltip-content");
      }
      delete wrapper.dataset.dsOocOriginalTooltip;
      delete wrapper.dataset.dsOocImageWrapper;
    });

    const existingHolders = DS.qsa(`.${OOC_WRAPPER_CLASS}`);
    let holder = existingHolders.find(node => node.parentElement === controls) || null;
    const legacyButton = DS.qsa(`.${OOC_SHORTCUT_CLASS}`).find(button => !holder?.contains(button)) || null;
    for (const old of existingHolders) if (old !== holder) old.remove();
    DS.qsa(`.${OOC_SHORTCUT_CLASS}`).forEach(button => {
      if (!holder?.contains(button)) button.remove();
    });
    DS.qsa(".ds-chat-ooc-controls-fallback").forEach(row => {
      if (row !== controls) row.remove();
    });

    if (!holder) {
      const template = controls.querySelector('button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"], button[aria-label="autogenerate"], button[aria-label="Plus-button"]')
        || legacyButton;
      holder = document.createElement("div");
      holder.className = `inline-flex max-w-full ${OOC_WRAPPER_CLASS}`;
      holder.setAttribute("data-tooltip-content", "OOC");
      const button = template ? createOocShortcut(template) : document.createElement("button");
      if (!template) {
        button.className = OOC_SHORTCUT_CLASS;
        button.setAttribute("aria-label", "Insert OOC message");
        button.title = "Insert selected OOC message";
        button.textContent = "OOC";
        bindOocShortcut(normalizeOocShortcut(button));
      }
      // Keep the fallback identical in dimensions to native composer icons,
      // regardless of whether the template was Image, Suggest or Plus.
      button.className = `inline-flex items-center justify-center transition-all duration-200 rounded-full bg-transparent text-black dark:text-white w-9 h-9 cursor-pointer ${OOC_SHORTCUT_CLASS}`;
      holder.appendChild(button);
    }

    // With Suggest available the intended order is Image → OOC → Suggest.
    // React may remove Suggest while typing; OOC stays in the same left lane.
    const suggestion = controls.querySelector('button[aria-label="autogenerate"]');
    const suggestionWrapper = suggestion?.closest?.('[data-tooltip-content="Suggest"]') || suggestion?.parentElement;
    const image = controls.querySelector('button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]');
    const imageWrapper = image?.closest?.('[data-tooltip-content="Image"]') || image?.parentElement;
    const plus = controls.querySelector('button[aria-label="Plus-button"]');
    const plusWrapper = plus?.closest?.(".relative") || plus?.parentElement;
    if (suggestionWrapper?.parentElement === controls) {
      if (holder.parentElement !== controls || holder.nextElementSibling !== suggestionWrapper) {
        controls.insertBefore(holder, suggestionWrapper);
      }
    } else if (imageWrapper?.parentElement === controls) {
      if (imageWrapper.nextElementSibling !== holder) imageWrapper.insertAdjacentElement("afterend", holder);
    } else if (plusWrapper?.parentElement === controls) {
      if (plusWrapper.nextElementSibling !== holder) plusWrapper.insertAdjacentElement("afterend", holder);
    } else if (holder.parentElement !== controls) {
      controls.appendChild(holder);
    }

    const shortcut = holder.querySelector(`.${OOC_SHORTCUT_CLASS}`);
    bindOocShortcut(normalizeOocShortcut(shortcut));
    scheduleOocShortcutHealthCheck();
  }

  // Early composer OOC mount, independent of the expensive chat-UI pass.
  // Called while other enhancements are waiting for native React to settle.
  // OOC's feature lifecycle can restore the native image control without
  // keeping the rest of the Chat UI feature enabled.
  DS.removeEssentialOocShortcut = restoreOocShortcuts;

  DS.applyEssentialOocShortcut = function applyEssentialOocShortcut() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.replaceChatImageWithOocButton || !DS.isSingleChatPage?.()) return;
    if (DS.state.oocShortcutMode !== "alongside") {
      restoreOocShortcuts();
      DS.state.oocShortcutMode = "alongside";
    }
    ensureOocShortcut();
  };


})();
}

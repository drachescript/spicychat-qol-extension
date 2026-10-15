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

  function findComposerControlsRow(field) {
    if (!field) return null;

    // The current SpicyChat composer has three direct branches: left-side
    // controls, the message field, and Send. Find that shared shell from the
    // textbox instead of deriving placement from Plus/Image, because those
    // native controls can themselves be hidden by QoL.
    for (let shell = field.parentElement; shell && shell !== document.body; shell = shell.parentElement) {
      const directChildren = Array.from(shell.children || []);
      if (directChildren.length < 2) continue;

      const fieldBranch = directChildren.find(child => child === field || child.contains(field));
      if (!fieldBranch) continue;

      const controlsBranch = directChildren.find(child => {
        if (child === fieldBranch) return false;
        return !!child.querySelector?.(
          'button[aria-label="Plus-button"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"], .ds-chat-ooc-shortcut, .ds-chat-asterisk-shortcut'
        );
      });

      if (controlsBranch) return controlsBranch;
    }

    return null;
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

    // The replacement is cloned from SpicyChat's Image button so it keeps the
    // native sizing/classes. Never inherit QoL's marker, inline display:none,
    // or SpicyChat's transient generation-time disabled state.
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

  function imageWrapperFor(original) {
    return (
      original?.closest('[data-tooltip-content="Image"]') ||
      original?.parentElement?.closest(".inline-flex") ||
      original?.parentElement ||
      null
    );
  }

  function ensureOocShortcut(replaceImage) {
    const imageButtons = DS.qsa(
      'button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]'
    ).filter(button => !button.classList.contains(OOC_SHORTCUT_CLASS));

    // When the user starts typing, SpicyChat replaces its Image/voice controls
    // with Send. OOC must not depend on Image continuing to exist. Keep the
    // shortcut on the composer controls row (next to Plus) until Image returns.
    if (!imageButtons.length) {
      const field = composerFieldNear(document.body);
      const controlRow = findComposerControlsRow(field);
      if (!controlRow || controlRow.closest("#ds-qol-panel")) return;

      const wrappers = DS.qsa(`.${OOC_WRAPPER_CLASS}`);
      let holder = wrappers.find(wrapper => wrapper.parentElement === controlRow) || null;
      wrappers.forEach(wrapper => { if (wrapper !== holder) wrapper.remove(); });

      // A native Image wrapper may have been removed by React. Never keep a
      // detached/stale shortcut or create more than one visible button.
      DS.qsa(`.${OOC_SHORTCUT_CLASS}`).forEach(button => {
        if (!holder?.contains(button)) button.remove();
      });

      if (!holder) {
        const template = DS.qsa('button[aria-label="Plus-button"]', controlRow)[0]
          || DS.qsa('button[aria-label="send-message"]', controlRow)[0];
        if (!template) return;
        holder = document.createElement("div");
        holder.className = `inline-flex max-w-full ${OOC_WRAPPER_CLASS}`;
        holder.setAttribute("data-tooltip-content", "OOC");
        const shortcut = createOocShortcut(template);
        // A fallback cloned from Plus/Send should look like the normal Image-
        // based OOC shortcut, not inherit a filled Plus or Send background.
        shortcut.className = `inline-flex items-center justify-center transition-all duration-200 rounded-full bg-transparent text-black dark:text-white w-9 h-9 cursor-pointer ${OOC_SHORTCUT_CLASS}`;
        holder.appendChild(shortcut);
      }

      const plusContainer = DS.qsa('button[aria-label="Plus-button"]', controlRow)[0]
        ?.closest(".relative") || null;
      const anchor = plusContainer?.parentElement === controlRow
        ? plusContainer
        : Array.from(controlRow.children).find(child => child !== holder) || null;
      if (anchor && anchor.nextElementSibling !== holder) {
        anchor.insertAdjacentElement("afterend", holder);
      } else if (!anchor && holder.parentElement !== controlRow) {
        controlRow.appendChild(holder);
      }
      const shortcut = holder.querySelector(`.${OOC_SHORTCUT_CLASS}`);
      bindOocShortcut(normalizeOocShortcut(shortcut));
      scheduleOocShortcutHealthCheck();
      return;
    }

    // In replace mode, the native Image wrapper hosts OOC. Drop only the
    // temporary composer-row fallback before attaching there again.
    if (replaceImage) {
      DS.qsa(`.${OOC_WRAPPER_CLASS}`).forEach(wrapper => wrapper.remove());
    }

    imageButtons.forEach(original => {
      const wrapper = imageWrapperFor(original);
      if (!wrapper || wrapper.closest("#ds-qol-panel")) return;

      if (replaceImage) {
        DS.setDatasetIfChanged?.(wrapper, "dsOocImageWrapper", "1");

        if (wrapper.dataset.dsOocOriginalTooltip === undefined) {
          wrapper.dataset.dsOocOriginalTooltip = wrapper.getAttribute("data-tooltip-content") || "";
        }

        DS.setAttributeIfChanged?.(wrapper, "data-tooltip-content", "OOC");
        DS.setDatasetIfChanged?.(original, "dsOocOriginalImage", "1");
        if (original.style.getPropertyValue("display") !== "none" ||
            original.style.getPropertyPriority("display") !== "important") {
          original.style.setProperty("display", "none", "important");
        }

        const existingShortcut = wrapper.querySelector(`.${OOC_SHORTCUT_CLASS}`);
        if (!existingShortcut) {
          wrapper.appendChild(createOocShortcut(original));
        } else {
          // Repair buttons created from a transiently-disabled native Image
          // control without requiring the user to reload the conversation.
          if (existingShortcut.hasAttribute("data-ds-ooc-original-image")) {
            existingShortcut.removeAttribute("data-ds-ooc-original-image");
          }
          normalizeOocShortcut(existingShortcut);
          bindOocShortcut(existingShortcut);
        }
        scheduleOocShortcutHealthCheck();
        return;
      }

      if (original.style.getPropertyValue("display")) original.style.removeProperty("display");
      if (original.hasAttribute("data-ds-ooc-original-image")) original.removeAttribute("data-ds-ooc-original-image");

      const controlRow = wrapper.parentElement;
      if (!controlRow) return;

      // SpicyChat rerenders/repositions the Image control whenever the composer
      // changes. An injected sibling is not part of React's tree, so it can be
      // left behind while a new Image wrapper is inserted beside it. Reuse one
      // shortcut and remove every stale copy before placing it back after Image.
      const existingWrappers = DS.qsa(`.${OOC_WRAPPER_CLASS}`);
      let shortcutWrapper = existingWrappers.find(
        candidate => candidate.parentElement === controlRow
      ) || null;

      existingWrappers.forEach(candidate => {
        if (candidate !== shortcutWrapper) candidate.remove();
      });

      if (!shortcutWrapper) {
        shortcutWrapper = document.createElement("div");
        shortcutWrapper.className = `inline-flex max-w-full ${OOC_WRAPPER_CLASS}`;
        shortcutWrapper.setAttribute("data-tooltip-content", "OOC");
        shortcutWrapper.appendChild(createOocShortcut(original));
      }

      // Moving the existing node is intentional and keeps the button strictly
      // single-instance even when SpicyChat inserts a fresh Image wrapper.
      if (wrapper.nextElementSibling !== shortcutWrapper) {
        wrapper.insertAdjacentElement("afterend", shortcutWrapper);
      }

      const shortcut = shortcutWrapper.querySelector(`.${OOC_SHORTCUT_CLASS}`);
      if (shortcut) {
        normalizeOocShortcut(shortcut);
        bindOocShortcut(shortcut);
      }
      scheduleOocShortcutHealthCheck();
    });
  }

  // Early composer OOC mount, independent of the expensive chat-UI pass.
  // Called while other enhancements are waiting for native React to settle.
  // OOC's feature lifecycle can restore the native image control without
  // keeping the rest of the Chat UI feature enabled.
  DS.removeEssentialOocShortcut = restoreOocShortcuts;

  DS.applyEssentialOocShortcut = function applyEssentialOocShortcut() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.replaceChatImageWithOocButton || !DS.isSingleChatPage?.()) return;
    const mode = settings.hideChatImageButton ? "replace" : "alongside";
    if (DS.state.oocShortcutMode !== mode) {
      restoreOocShortcuts();
      DS.state.oocShortcutMode = mode;
    }
    ensureOocShortcut(!!settings.hideChatImageButton);
  };


})();
}

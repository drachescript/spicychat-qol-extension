(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const BRIDGE_ATTR = "data-ds-message-action-bridge";

  function cleanText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getDropdownHolder(button) {
    return button.closest(".relative") || button.parentElement || button;
  }

  function getMessageRoot(button) {
    let node = button;

    for (let i = 0; node && i < 10; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const hasDropdown = !!node.querySelector("button[aria-label='message-dropdown']");
      const hasMessageText = !!node.querySelector("span.leading-6, div[class*='overflow-wrap'], p");
      const hasMessageTools = !!node.querySelector("button[aria-label='RefreshCcw-button'], button[aria-label='MessageSquarePlus-button'], button[aria-label='Star-button']");

      if (hasDropdown && (hasMessageText || hasMessageTools)) {
        return node;
      }
    }

    return button.closest("div") || button;
  }

  function isAiMessage(button) {
    const root = getMessageRoot(button);
    return !!root.querySelector("a[href*='/chatbot/'], a[aria-label='chatbot-profile']");
  }

  function hasUploadedUserImage(sourceButton) {
    if (!sourceButton || isAiMessage(sourceButton)) return false;

    let node = sourceButton;
    for (let i = 0; node && i < 12; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const image = node.querySelector?.(
        "img[src*='/chat_user_images/'], img[src*='chat_user_images']"
      );
      if (image) return true;
    }

    return false;
  }

  function makeActionButton(action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-message-quick-action";
    button.dataset.dsMessageAction = action.label;
    button.setAttribute("aria-label", `QoL ${action.label}`);
    button.title = action.label;
    button.textContent = action.icon;
    return button;
  }

  function getEnabledActions(sourceButton) {
    const settings = DS.state?.settings || {};
    const ai = isAiMessage(sourceButton);
    const actions = [];

    // Copy, Edit and Report are controlled only by their individual switches.
    // The Settings "Copy + Edit + Report" checkbox is a group toggle that
    // updates those switches; it is deliberately not a runtime override.
    // This means turning Report off always hides Report even if the group
    // toggle had previously been used.
    const canReport = settings.messageQuickActionReport === true && ai;
    const canCopy = settings.messageQuickActionCopy === true;
    const canEdit = settings.messageQuickActionEdit === true;
    const canRemoveImage = settings.messageQuickActionRemoveImage === true && !ai && hasUploadedUserImage(sourceButton);
    const canResend = settings.messageQuickActionResend === true && !ai && !!getDirectCopyText(sourceButton);

    if (ai) {
      if (canReport) actions.push({ label: "Report", icon: "⚑" });
      if (canCopy) actions.push({ label: "Copy", icon: "⧉" });
      if (canEdit) actions.push({ label: "Edit", icon: "✎" });
      return actions;
    }

    if (canEdit) actions.push({ label: "Edit", icon: "✎" });
    if (canCopy) actions.push({ label: "Copy", icon: "⧉" });
    if (canResend) actions.push({ label: "Resend", icon: "↻" });
    if (canRemoveImage) actions.push({ label: "Remove Image", icon: "⌫" });

    return actions;
  }

  function clickDropdown(button) {
    try {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    } catch {}

    try {
      button.click();
    } catch {}
  }

  function menuButtons(label, sourceButton, includeHidden = false) {
    const holder = getDropdownHolder(sourceButton);
    const exact = `button[aria-label='${CSS.escape(label)}']`;
    const accept = button => {
      if (button.closest("#ds-qol-panel, .ds-message-quick-actions")) return false;
      return includeHidden || isVisible(button);
    };

    const local = DS.qsa(exact, holder).filter(accept);
    if (local.length) return local;

    const sourceRect = sourceButton.getBoundingClientRect();
    return DS.qsa(exact)
      .filter(accept)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const ad = Math.abs(ar.top - sourceRect.top) + Math.abs(ar.left - sourceRect.left);
        const bd = Math.abs(br.top - sourceRect.top) + Math.abs(br.left - sourceRect.left);
        return ad - bd;
      });
  }

  function beginSilentBridge() {
    DS.setAttributeIfChanged?.(document.documentElement, BRIDGE_ATTR, "1");
  }

  function endSilentBridge(delay = 0) {
    window.setTimeout(() => {
      if (document.documentElement.hasAttribute(BRIDGE_ATTR)) document.documentElement.removeAttribute(BRIDGE_ATTR);
    }, delay);
  }

  async function writeClipboard(text) {
    const value = cleanText(text);
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}

    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-10000px";
      textarea.style.top = "-10000px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  function getDirectCopyText(sourceButton) {
    const root = getMessageRoot(sourceButton);
    if (!root) return "";

    // SpicyChat's normal rendered message body is made from leading-6 spans.
    // Restrict direct-copy to that known structure so headers, Directed/OOC
    // controls, translation UI and other message chrome never get copied by
    // accident. Unknown/new structures fall back to SpicyChat's own Copy.
    const bodyHost = root.querySelector("div[class*='overflow-wrap']");
    if (!bodyHost) return "";

    const lines = Array.from(bodyHost.querySelectorAll("span.leading-6"))
      .filter(span => !span.closest(".ds-translation-output, .ds-message-quick-actions, [data-ds-translation-output]"))
      .map(span => cleanText(span.textContent))
      .filter(Boolean);

    if (!lines.length) return "";
    return lines.join("\n");
  }


  function findComposerTextarea() {
    const fields = DS.qsa("textarea")
      .filter(field => isVisible(field))
      .filter(field => {
        const placeholder = cleanText(field.getAttribute("placeholder") || "").toLowerCase();
        if (placeholder.includes("enter something")) return false;
        return !field.closest("div[id^='message-'], #ds-qol-panel");
      });
    return fields.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function setComposerText(value) {
    const field = findComposerTextarea();
    if (!field) {
      DS.setQuickStatus?.("Could not find the chat message box.");
      return false;
    }

    const next = String(value || "");
    const current = String(field.value || "");
    if (current.trim() && current !== next) {
      const replace = window.confirm("Replace your current draft with this older message?");
      if (!replace) return false;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(field, next); else field.value = next;
    try {
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: next }));
    } catch {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus({ preventScroll: false });
    try { field.setSelectionRange(next.length, next.length); } catch {}
    DS.setQuickStatus?.("Restored message to the composer. Review it, then send when ready.");
    return true;
  }

  function runResend(sourceButton) {
    const text = getDirectCopyText(sourceButton);
    if (!text) {
      DS.setQuickStatus?.("Could not read this message safely for resend.");
      return false;
    }
    return setComposerText(text);
  }

  async function runDirectCopy(sourceButton) {
    const text = getDirectCopyText(sourceButton);
    if (!text) return false;

    const copied = await writeClipboard(text);
    if (copied) DS.setQuickStatus?.("Copied message.");
    return copied;
  }

  async function runMenuAction(sourceButton, label) {
    // We still let SpicyChat execute its native Edit / Report / Remove Image
    // handlers, but suppress the intermediate three-dot popup completely.
    // This is deliberately a compatibility bridge rather than reimplementing
    // undocumented SpicyChat requests ourselves.
    beginSilentBridge();

    try {
      clickDropdown(sourceButton);

      let actionButton = null;
      for (let i = 0; i < 16; i++) {
        actionButton = menuButtons(label, sourceButton, true)[0] || null;
        if (actionButton) break;
        await DS.sleep(60);
      }

      if (!actionButton) {
        DS.setQuickStatus?.(`${label} is not available on this message.`);
        return false;
      }

      DS.realClick(actionButton);
      DS.setQuickStatus?.(`${label} clicked.`);
      return true;
    } finally {
      // Keep the bridge active just long enough for React to consume the
      // action click/unmount the menu. Report's actual modal is not matched by
      // the bridge CSS, so it remains visible as intended.
      endSilentBridge(120);
    }
  }

  async function runAction(sourceButton, action) {
    const settings = DS.state?.settings || {};

    if (action.label === "Copy") {
      const copiedDirectly = await runDirectCopy(sourceButton);
      if (copiedDirectly) return true;
      return runMenuAction(sourceButton, "Copy");
    }

    if (action.label === "Resend") {
      return runResend(sourceButton);
    }

    if (action.label === "Remove Image" && settings.messageQuickActionConfirmRemoveImage === true) {
      const confirmed = window.confirm("Remove the uploaded image from this message?");
      if (!confirmed) return false;
    }

    return runMenuAction(sourceButton, action.label);
  }

  function ensureQuickActions(dropdownButton, settingsSignature) {
    if (!dropdownButton || dropdownButton.closest("#ds-qol-panel, .ds-message-quick-actions")) return;

    const holder = getDropdownHolder(dropdownButton);
    if (!holder) return;

    let bar = holder.querySelector(":scope > .ds-message-quick-actions");
    const actions = getEnabledActions(dropdownButton);
    const signature = JSON.stringify(actions.map(action => action.label));

    // Only replace SpicyChat's three-dot launcher when this particular message
    // actually has at least one enabled QoL action. This matters when users
    // enable just Remove Image or Resend: unrelated messages keep their normal
    // native menu instead of being left with neither quick actions nor dots.
    if (!actions.length) {
      DS.setClassState?.(holder, "ds-message-dropdown-hidden", false);
      bar?.remove();
      DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
      return;
    }

    DS.setClassState?.(holder, "ds-message-dropdown-hidden", true);

    if (!bar) {
      bar = document.createElement("div");
      bar.className = "ds-message-quick-actions";
      holder.insertBefore(bar, holder.firstChild);
    }

    if (bar.dataset.dsActionSignature === signature) {
      DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
      return;
    }

    DS.setDatasetIfChanged?.(bar, "dsActionSignature", signature);
    bar.replaceChildren();

    for (const action of actions) {
      const button = makeActionButton(action);
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        runAction(dropdownButton, action).then(success => {
          if (!success || action.label !== "Remove Image") return;

          // SpicyChat removes the attachment asynchronously. Re-check this
          // message shortly afterwards so the image-only action disappears.
          window.setTimeout(() => {
            delete dropdownButton.dataset.dsMessageQuickReady;
            DS.applyMessageOptions?.();
          }, 250);
        });
      });
      bar.appendChild(button);
    }

    DS.setDatasetIfChanged?.(dropdownButton, "dsMessageQuickReady", settingsSignature);
  }

  function cleanup() {
    DS.qsa(".ds-message-quick-actions").forEach(el => el.remove());
    DS.qsa(".ds-message-dropdown-hidden").forEach(el => {
      DS.setClassState?.(el, "ds-message-dropdown-hidden", false);
    });
    DS.qsa("button[aria-label='message-dropdown'][data-ds-message-quick-ready]").forEach(button => {
      delete button.dataset.dsMessageQuickReady;
    });
    document.documentElement.removeAttribute(BRIDGE_ATTR);
    DS.state.messageOptionsSettingsSignature = "";
  }

  function settingsSignature(settings) {
    return [
      settings.messageQuickActionCopy === true ? 1 : 0,
      settings.messageQuickActionEdit === true ? 1 : 0,
      settings.messageQuickActionRemoveImage === true ? 1 : 0,
      settings.messageQuickActionResend === true ? 1 : 0,
      settings.messageQuickActionConfirmRemoveImage === true ? 1 : 0,
      settings.messageQuickActionReport === true ? 1 : 0
    ].join("");
  }

  function hasAnyQuickActionEnabled(settings) {
    return (
      settings.messageQuickActionCopy === true ||
      settings.messageQuickActionEdit === true ||
      settings.messageQuickActionRemoveImage === true ||
      settings.messageQuickActionResend === true ||
      settings.messageQuickActionReport === true
    );
  }

  DS.applyMessageOptions = function applyMessageOptions() {
    const settings = DS.state?.settings || {};

    if (!settings.enabled || !DS.isSingleChatPage?.() || !hasAnyQuickActionEnabled(settings)) {
      if (DS.state.messageOptionsWasActive) cleanup();
      DS.state.messageOptionsWasActive = false;
      return;
    }

    DS.state.messageOptionsWasActive = true;
    const signature = settingsSignature(settings);
    const signatureChanged = DS.state.messageOptionsSettingsSignature !== signature;
    DS.state.messageOptionsSettingsSignature = signature;

    const laneRoots = !signatureChanged ? (DS.getCurrentMessageLaneRoots?.() || []) : [];
    let buttons = [];

    if (laneRoots.length) {
      buttons = laneRoots.flatMap(root => {
        if (DS.isMessageEditPending?.(root)) return [];
        if (settings.chatPerformanceMode && root.classList.contains("ds-chat-message-far")) return [];
        return DS.qsa("button[aria-label='message-dropdown']", root);
      });
      const counters = DS.state?.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.messageOptionsIncrementalUpdates = Number(counters.messageOptionsIncrementalUpdates || 0) + 1;
    } else {
      let selector = "button[aria-label='message-dropdown']";
      if (settings.chatPerformanceMode) {
        selector = `[id^='message-']:not(.ds-chat-message-far) button[aria-label='message-dropdown']`;
      }
      if (!signatureChanged) selector += `:not([data-ds-message-quick-ready='${signature}'])`;
      buttons = DS.qsa(selector);
    }

    buttons
      .filter(button => !button.closest("#ds-qol-panel"))
      .filter(button => !DS.isMessageEditPending?.(button.closest("div[id^='message-']")))
      .forEach(button => ensureQuickActions(button, signature));
  };
})();

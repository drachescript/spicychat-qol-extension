(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  DS.restoreChatUiReason = function restoreChatUiReason(reason) {
    DS.qsa(`[data-ds-reason="${reason}"]`).forEach(el => {
      DS.unhideElement(el);
    });
  };

  const OOC_SHORTCUT_CLASS = "ds-chat-ooc-shortcut";
  const OOC_WRAPPER_CLASS = "ds-chat-ooc-shortcut-wrapper";
  const ASTERISK_SHORTCUT_CLASS = "ds-chat-asterisk-shortcut";
  const ASTERISK_WRAPPER_CLASS = "ds-chat-asterisk-shortcut-wrapper";
  let asteriskRepairRaf = 0;
  let asteriskRepairListenersInstalled = false;
  let asteriskRepairObserver = null;
  let asteriskRepairSafetyTimer = 0;
  let asteriskAutoPairInstalled = false;
  const asteriskRepairTimeouts = new Set();
  let oocHealthTimer = 0;
  let oocHealthConfirmTimer = 0;

  function restoreOocShortcuts() {
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

  function restoreAsteriskShortcuts() {
    DS.qsa(`.${ASTERISK_WRAPPER_CLASS}`).forEach(wrapper => wrapper.remove());
    DS.qsa(`.${ASTERISK_SHORTCUT_CLASS}`).forEach(button => button.remove());
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

  function setNativeTextValue(field, nextValue, replacement, selectionStart, selectionEnd) {
    const prototype = field.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (setter) setter.call(field, nextValue);
    else field.value = nextValue;

    try {
      field.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: replacement
      }));
    } catch {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    field.dispatchEvent(new Event("change", { bubbles: true }));

    try {
      field.focus({ preventScroll: true });
      field.setSelectionRange(selectionStart, selectionEnd);
    } catch {}
  }

  function wrapTextControlInAsterisks(field, savedSelection = null) {
    const value = String(field.value || "");
    let start = Number.isFinite(field.selectionStart) ? field.selectionStart : value.length;
    let end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : start;

    if (
      savedSelection &&
      savedSelection.field === field &&
      savedSelection.value === value
    ) {
      start = savedSelection.start;
      end = savedSelection.end;
    }

    start = Math.max(0, Math.min(value.length, start));
    end = Math.max(start, Math.min(value.length, end));

    const selected = value.slice(start, end);
    const replacement = selected ? `*${selected}*` : "**";
    const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;

    if (selected) {
      // Keep the original words selected inside the new asterisks so another
      // formatting action can still operate on the same text if desired.
      setNativeTextValue(field, nextValue, replacement, start + 1, end + 1);
    } else {
      // No selection: insert a pair and leave the cursor between them.
      setNativeTextValue(field, nextValue, replacement, start + 1, start + 1);
    }
  }

  function wrapContentEditableInAsterisks(field) {
    field.focus({ preventScroll: true });
    const selection = window.getSelection?.();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

    if (!range || !field.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(field);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    const selected = range.collapsed ? "" : range.toString();
    range.deleteContents();
    const textNode = document.createTextNode(selected ? `*${selected}*` : "**");
    range.insertNode(textNode);

    const nextRange = document.createRange();
    if (selected) {
      nextRange.setStart(textNode, 1);
      nextRange.setEnd(textNode, textNode.data.length - 1);
    } else {
      nextRange.setStart(textNode, 1);
      nextRange.collapse(true);
    }
    selection?.removeAllRanges();
    selection?.addRange(nextRange);

    try {
      field.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: textNode.data
      }));
    } catch {
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function createAsteriskShortcut(original) {
    const button = original.cloneNode(false);

    button.removeAttribute("data-testid");
    button.removeAttribute("id");
    button.removeAttribute("data-ds-hidden");
    button.removeAttribute("data-ds-reason");
    button.classList.remove("ds-hidden");
    button.classList.add(ASTERISK_SHORTCUT_CLASS);
    button.style.removeProperty("display");
    button.type = "button";
    button.setAttribute("aria-label", "Wrap selected text in asterisks");
    button.title = "Wrap selected text in *asterisks*";
    button.textContent = "*";

    let savedSelection = null;

    button.addEventListener("pointerdown", event => {
      const field = composerFieldNear(button);
      if (field && (field.tagName === "TEXTAREA" || field.tagName === "INPUT")) {
        savedSelection = {
          field,
          value: String(field.value || ""),
          start: Number.isFinite(field.selectionStart) ? field.selectionStart : 0,
          end: Number.isFinite(field.selectionEnd) ? field.selectionEnd : 0
        };
      } else {
        savedSelection = null;
      }

      // Keep the chat text selection from collapsing when the toolbar button
      // itself is pressed, which is especially important on touch devices.
      event.preventDefault();
    });

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const field = savedSelection?.field && document.contains(savedSelection.field)
        ? savedSelection.field
        : composerFieldNear(button);

      if (!field) {
        DS.setQuickStatus?.("Could not find the chat message box.");
        return;
      }

      if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") {
        wrapTextControlInAsterisks(field, savedSelection);
      } else if (field.isContentEditable) {
        wrapContentEditableInAsterisks(field);
      }

      savedSelection = null;
    });

    return button;
  }

  function wantsDedicatedAsteriskButton(settings = DS.state?.settings || {}) {
    if (!settings.enabled || !settings.showAsteriskButton || !DS.isSingleChatPage?.()) return false;
    // Do not show two identical * controls when the compact formatting toolbar
    // already provides the action wrapper. The dedicated button automatically
    // returns if the toolbar or its * wrapper is disabled.
    return !(settings.showFormattingToolbar && settings.formatToolbarAsterisk !== false);
  }

  function asteriskShortcutHealthy() {
    const shortcut = DS.qs?.(`.${ASTERISK_SHORTCUT_CLASS}`);
    if (!shortcut || !shortcut.isConnected || !isVisibleElement(shortcut)) return false;

    const wrapper = shortcut.closest?.(`.${ASTERISK_WRAPPER_CLASS}`);
    if (!wrapper || !wrapper.isConnected) return false;

    const field = composerFieldNear(shortcut);
    if (!field) return false;

    const controlRow = findComposerControlsRow(field);
    return !!controlRow && wrapper.parentElement === controlRow;
  }

  function runAsteriskRepair() {
    const settings = DS.state?.settings || {};
    if (!wantsDedicatedAsteriskButton(settings)) {
      restoreAsteriskShortcuts();
      return;
    }
    ensureAsteriskShortcut();
  }

  function scheduleAsteriskShortcutRepair() {
    cancelAnimationFrame(asteriskRepairRaf);
    for (const timer of asteriskRepairTimeouts) clearTimeout(timer);
    asteriskRepairTimeouts.clear();

    asteriskRepairRaf = requestAnimationFrame(() => {
      asteriskRepairRaf = 0;
      runAsteriskRepair();
    });

    // React can replace the composer one or two frames AFTER the input event.
    // Retry a few times instead of assuming the first animation frame won.
    for (const delay of [40, 140, 420]) {
      const timer = setTimeout(() => {
        asteriskRepairTimeouts.delete(timer);
        if (!asteriskShortcutHealthy()) runAsteriskRepair();
      }, delay);
      asteriskRepairTimeouts.add(timer);
    }
  }

  function installAsteriskRepairListeners() {
    if (!asteriskRepairListenersInstalled) {
      asteriskRepairListenersInstalled = true;

      document.addEventListener("input", event => {
        if (!wantsDedicatedAsteriskButton()) return;

        const field = composerFieldNear(document.body);
        if (field && event.target === field) scheduleAsteriskShortcutRepair();
      }, true);

      document.addEventListener("click", event => {
        if (!event.target?.closest?.(`.${ASTERISK_SHORTCUT_CLASS}`)) return;
        scheduleAsteriskShortcutRepair();
      }, true);
    }

    if (!asteriskRepairObserver) {
      asteriskRepairObserver = new MutationObserver(() => {
        const settings = DS.state?.settings || {};
        if (!wantsDedicatedAsteriskButton(settings)) return;

        // This observer intentionally DOES react when React removes only a QoL
        // node. The main page observer ignores many extension-only mutations,
        // which was why the shortcut could still vanish in 0.1.8.65/66.
        if (!asteriskShortcutHealthy()) scheduleAsteriskShortcutRepair();
      });

      asteriskRepairObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    if (!asteriskRepairSafetyTimer) {
      asteriskRepairSafetyTimer = window.setInterval(() => {
        const settings = DS.state?.settings || {};
        if (!wantsDedicatedAsteriskButton(settings)) return;
        if (!asteriskShortcutHealthy()) runAsteriskRepair();
      }, 1200);
    }
  }

  function isComposerTypingField(field) {
    if (!field || field.closest?.("#ds-qol-panel")) return false;
    const typingField = field.closest?.("textarea, input, [contenteditable='true']") || field;
    if (!(typingField.tagName === "TEXTAREA" || typingField.tagName === "INPUT" || typingField.isContentEditable)) return false;
    return composerFieldNear(document.body) === typingField;
  }

  function contentEditableCaretOffset(field, range) {
    const pre = range.cloneRange();
    pre.selectNodeContents(field);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  function setContentEditableSelectionByOffsets(field, start, end = start) {
    const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let startNode = null, endNode = null, startOffset = 0, endOffset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const next = pos + String(node.nodeValue || "").length;
      if (!startNode && start <= next) { startNode = node; startOffset = Math.max(0, start - pos); }
      if (!endNode && end <= next) { endNode = node; endOffset = Math.max(0, end - pos); break; }
      pos = next;
    }
    if (!startNode) {
      startNode = field;
      startOffset = field.childNodes.length;
    }
    if (!endNode) { endNode = startNode; endOffset = startOffset; }
    const selection = window.getSelection?.();
    if (!selection) return;
    const nextRange = document.createRange();
    try {
      nextRange.setStart(startNode, Math.min(startOffset, startNode.nodeType === Node.TEXT_NODE ? startNode.nodeValue.length : startNode.childNodes.length));
      nextRange.setEnd(endNode, Math.min(endOffset, endNode.nodeType === Node.TEXT_NODE ? endNode.nodeValue.length : endNode.childNodes.length));
      selection.removeAllRanges();
      selection.addRange(nextRange);
    } catch {}
  }

  function dispatchContentEditableInput(field, data) {
    try { field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data })); }
    catch { field.dispatchEvent(new Event("input", { bubbles: true })); }
  }

  function autoPairContentEditable(field) {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!field.contains(range.commonAncestorContainer)) return false;

    const start = contentEditableCaretOffset(field, range);
    const selected = range.toString();
    const text = String(field.textContent || "");

    if (!selected && text.charAt(start) === "*") {
      setContentEditableSelectionByOffsets(field, start + 1, start + 1);
      return true;
    }

    range.deleteContents();
    const replacement = selected ? `*${selected}*` : "**";
    const textNode = document.createTextNode(replacement);
    range.insertNode(textNode);
    field.focus();
    const nextStart = start + 1;
    const nextEnd = selected ? nextStart + selected.length : nextStart;
    setContentEditableSelectionByOffsets(field, nextStart, nextEnd);
    dispatchContentEditableInput(field, replacement);
    return true;
  }

  function installAsteriskAutoPairing() {
    if (asteriskAutoPairInstalled) return;
    asteriskAutoPairInstalled = true;

    document.addEventListener("beforeinput", event => {
      const settings = DS.state?.settings || {};
      if (!settings.enabled || !settings.autoPairAsterisks || !DS.isSingleChatPage?.()) return;
      if (event.inputType !== "insertText" || event.data !== "*") return;

      const field = event.target?.closest?.("textarea, input, [contenteditable='true']") || event.target;
      if (!isComposerTypingField(field)) return;

      event.preventDefault();

      if (field.isContentEditable) {
        if (autoPairContentEditable(field)) scheduleAsteriskShortcutRepair();
        return;
      }

      const value = String(field.value || "");
      const start = Number.isFinite(field.selectionStart) ? field.selectionStart : value.length;
      const end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : start;

      if (end > start) {
        const selected = value.slice(start, end);
        const replacement = `*${selected}*`;
        const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
        setNativeTextValue(field, nextValue, replacement, start + 1, end + 1);
        scheduleAsteriskShortcutRepair();
        return;
      }

      // If the cursor is already sitting in front of the closing asterisk that
      // QoL inserted earlier, pressing * simply moves over it instead of
      // creating a third star.
      if (value.charAt(start) === "*") {
        try {
          field.setSelectionRange(start + 1, start + 1);
        } catch {}
        scheduleAsteriskShortcutRepair();
        return;
      }

      const replacement = "**";
      const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
      setNativeTextValue(field, nextValue, replacement, start + 1, start + 1);
      scheduleAsteriskShortcutRepair();
    }, true);
  }

  DS.setAutoPairAsterisks = async function setAutoPairAsterisks(enabled) {
    const settings = DS.state?.settings;
    if (!settings) return false;

    settings.autoPairAsterisks = !!enabled;
    if (settings.autoPairAsterisks) installAsteriskAutoPairing();

    await DS.saveSettingsPatch?.({ autoPairAsterisks: settings.autoPairAsterisks });
    DS.updateQuickPanel?.();
    return settings.autoPairAsterisks;
  };

  DS.toggleAutoPairAsterisks = function toggleAutoPairAsterisks() {
    return DS.setAutoPairAsterisks?.(!DS.state?.settings?.autoPairAsterisks);
  };

  let chatEnterBehaviorInstalled = false;
  let lastHandledEnterAt = 0;
  let lastHandledEnterField = null;
  let allowNativeLineBreakUntil = 0;
  let allowNativeLineBreakField = null;

  function composerEnterBehavior() {
    const raw = String(DS.state?.settings?.chatEnterKeyBehavior || "site-default");
    return ["site-default", "send", "newline"].includes(raw) ? raw : "site-default";
  }

  function insertComposerNewline(field) {
    if (!field) return false;
    if (field.isContentEditable) {
      field.focus?.({ preventScroll: true });
      const selection = window.getSelection?.();
      let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!range || !field.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      range.deleteContents();
      const node = document.createTextNode("\n");
      range.insertNode(node);
      const next = document.createRange();
      next.setStartAfter(node);
      next.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(next);
      try {
        field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertLineBreak", data: null }));
      } catch {
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    }

    if (!(field instanceof HTMLTextAreaElement) && !(field instanceof HTMLInputElement)) return false;
    const value = String(field.value || "");
    const start = Number.isFinite(field.selectionStart) ? field.selectionStart : value.length;
    const end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : start;
    const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`;
    setNativeTextValue(field, nextValue, "\n", start + 1, start + 1);
    return true;
  }

  function visibleSendButton(field = null) {
    const isVisibleEnabledButton = button => {
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      const style = getComputedStyle(button);
      return style.display !== "none" && style.visibility !== "hidden" && button.getClientRects().length > 0;
    };

    const explicit = DS.qsa(
      'button[aria-label="send-message"], button[aria-label*="send" i], button[data-testid*="send" i], button[title*="send" i]'
    ).find(isVisibleEnabledButton);
    if (explicit) return explicit;

    // SpicyChat currently swaps the right-side voice button for Send when the
    // composer has text. Keep a narrow structural fallback for markup variants
    // where that Send button has no stable aria-label/test id. Never use it for
    // an empty composer and never mistake voice/image/OOC controls for Send.
    const text = field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement
      ? String(field.value || "")
      : String(field?.textContent || "");
    if (!field || !text.trim()) return null;

    let shell = field.parentElement;
    for (let depth = 0; shell && depth < 6; depth += 1, shell = shell.parentElement) {
      const buttons = DS.qsa("button", shell).filter(isVisibleEnabledButton);
      if (!buttons.length) continue;
      const fallback = [...buttons].reverse().find(button => {
        const descriptor = [
          button.getAttribute("aria-label"),
          button.getAttribute("data-testid"),
          button.getAttribute("title"),
          button.textContent
        ].filter(Boolean).join(" ").toLowerCase();
        return !/(voice|record|microphone|image|ooc|suggest|auto.?generate|plus|attach|upload)/i.test(descriptor);
      });
      if (fallback && fallback !== field) return fallback;
    }
    return null;
  }

  function sendComposerMessage(field) {
    const button = visibleSendButton(field);
    if (!button) {
      DS.setQuickStatus?.("SpicyChat's Send button is not ready yet.");
      return false;
    }
    try { field?.focus?.({ preventScroll: true }); } catch {}
    button.click();
    return true;
  }

  function handleConfiguredEnter(event, source) {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !DS.isSingleChatPage?.()) return false;
    const mode = composerEnterBehavior();
    if (mode === "site-default") return false;

    const inputType = String(event.inputType || "");
    const isBeforeInput = source === "beforeinput";
    const isLineBreak = isBeforeInput
      ? (inputType === "insertLineBreak" || inputType === "insertParagraph")
      : event.key === "Enter";
    if (!isLineBreak || event.isComposing) return false;

    const field = event.target?.closest?.("textarea, input, [contenteditable='true']") || event.target;
    if (!isComposerTypingField(field)) return false;

    const now = Date.now();
    if (isBeforeInput && allowNativeLineBreakField === field && now < allowNativeLineBreakUntil) {
      allowNativeLineBreakField = null;
      allowNativeLineBreakUntil = 0;
      return false;
    }

    if (!isBeforeInput && (event.ctrlKey || event.metaKey || event.altKey)) return false;

    if (mode === "send") {
      // Hardware Shift+Enter keeps SpicyChat's native line-break behavior. Mark
      // the following beforeinput so the mobile/IME listener does not turn that
      // same physical keypress into a send.
      if (!isBeforeInput && event.shiftKey) {
        allowNativeLineBreakField = field;
        allowNativeLineBreakUntil = now + 350;
        return false;
      }
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      if (isBeforeInput && lastHandledEnterField === field && now - lastHandledEnterAt < 180) return true;
      lastHandledEnterField = field;
      lastHandledEnterAt = now;
      sendComposerMessage(field);
      return true;
    }

    // newline mode: Return/Enter always edits the existing composer and the
    // visible Send button remains the explicit submit action. This catches both
    // desktop keydown and Android/iOS beforeinput/IME line-break events.
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    if (isBeforeInput && lastHandledEnterField === field && now - lastHandledEnterAt < 180) return true;
    lastHandledEnterField = field;
    lastHandledEnterAt = now;
    insertComposerNewline(field);
    return true;
  }

  function installChatEnterBehavior() {
    if (chatEnterBehaviorInstalled) return;
    chatEnterBehaviorInstalled = true;
    document.addEventListener("keydown", event => handleConfiguredEnter(event, "keydown"), true);
    document.addEventListener("beforeinput", event => handleConfiguredEnter(event, "beforeinput"), true);
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

  function ensureAsteriskShortcut() {
    const field = composerFieldNear(document.body);
    if (!field) return;

    const controlRow = findComposerControlsRow(field);
    if (!controlRow) return;

    const anchorSelectors = [
      'button[aria-label="generate-image"]',
      'button[data-testid="ImageGenerationButton"]',
      'button[aria-label="Plus-button"]',
      'button[aria-label*="voice" i]'
    ];

    let original = null;
    for (const selector of anchorSelectors) {
      original = DS.qsa(selector, controlRow).find(button =>
        !button.classList.contains(OOC_SHORTCUT_CLASS) &&
        !button.classList.contains(ASTERISK_SHORTCUT_CLASS) &&
        !button.closest("#ds-qol-panel")
      ) || null;
      if (original) break;
    }

    // If all native left-side controls disappeared during a React rerender,
    // use an existing shortcut as the visual template until they return.
    original ||= DS.qs(`.${OOC_SHORTCUT_CLASS}`, controlRow);
    original ||= DS.qs(`.${ASTERISK_SHORTCUT_CLASS}`);
    if (!original) return;

    const existingWrappers = DS.qsa(`.${ASTERISK_WRAPPER_CLASS}`);
    let shortcutWrapper = existingWrappers.find(
      candidate => candidate.parentElement === controlRow
    ) || null;

    existingWrappers.forEach(candidate => {
      if (candidate !== shortcutWrapper) candidate.remove();
    });

    if (!shortcutWrapper) {
      shortcutWrapper = document.createElement("div");
      shortcutWrapper.className = `inline-flex max-w-full ${ASTERISK_WRAPPER_CLASS}`;
      shortcutWrapper.setAttribute("data-tooltip-content", "Asterisks");
      shortcutWrapper.appendChild(createAsteriskShortcut(original));
    }

    // Keep the shortcut as a DIRECT child of the composer control row. In
    // 0.1.8.65 it could be inserted inside the Plus wrapper; hiding Plus then
    // hid the asterisk button with it after the next composer refresh.
    const oocWrapper = Array.from(controlRow.children).find(
      child => child.classList?.contains(OOC_WRAPPER_CLASS)
    );

    if (oocWrapper) {
      if (oocWrapper.nextElementSibling !== shortcutWrapper) {
        oocWrapper.insertAdjacentElement("afterend", shortcutWrapper);
      }
      return;
    }

    const nativeControlBranch = Array.from(controlRow.children).find(child =>
      child !== shortcutWrapper &&
      !!child.querySelector?.(
        'button[aria-label="Plus-button"], button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]'
      )
    );

    if (nativeControlBranch) {
      if (nativeControlBranch.nextElementSibling !== shortcutWrapper) {
        nativeControlBranch.insertAdjacentElement("afterend", shortcutWrapper);
      }
    } else if (shortcutWrapper.parentElement !== controlRow) {
      controlRow.appendChild(shortcutWrapper);
    }
  }

  function preferredOocTemplateIndex() {
    return Number(DS.getPreferredOocTemplateIndex?.() || 0);
  }

  function normalizeOocShortcut(button) {
    if (!button) return null;

    // SpicyChat temporarily disables its native Image control while a reply is
    // being generated. OOC is cloned from that control for native sizing, but
    // transient disabled state must never become permanent on the QoL clone.
    button.removeAttribute("disabled");
    button.removeAttribute("aria-disabled");
    button.removeAttribute("data-disabled");
    button.removeAttribute("data-ds-hidden");
    button.removeAttribute("data-ds-reason");
    button.classList.remove("ds-hidden", "opacity-60", "cursor-not-allowed", "pointer-events-none");
    button.classList.add("cursor-pointer");
    button.style.removeProperty("display");
    button.style.removeProperty("pointer-events");
    button.style.removeProperty("opacity");
    button.type = "button";

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

    imageButtons.forEach(original => {
      const wrapper = imageWrapperFor(original);
      if (!wrapper || wrapper.closest("#ds-qol-panel")) return;

      if (replaceImage) {
        wrapper.dataset.dsOocImageWrapper = "1";

        if (wrapper.dataset.dsOocOriginalTooltip === undefined) {
          wrapper.dataset.dsOocOriginalTooltip = wrapper.getAttribute("data-tooltip-content") || "";
        }

        wrapper.setAttribute("data-tooltip-content", "OOC");
        original.dataset.dsOocOriginalImage = "1";
        original.style.setProperty("display", "none", "important");

        const existingShortcut = wrapper.querySelector(`.${OOC_SHORTCUT_CLASS}`);
        if (!existingShortcut) {
          wrapper.appendChild(createOocShortcut(original));
        } else {
          // Repair buttons created from a transiently-disabled native Image
          // control without requiring the user to reload the conversation.
          existingShortcut.removeAttribute("data-ds-ooc-original-image");
          normalizeOocShortcut(existingShortcut);
          bindOocShortcut(existingShortcut);
        }
        scheduleOocShortcutHealthCheck();
        return;
      }

      original.style.removeProperty("display");
      original.removeAttribute("data-ds-ooc-original-image");

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

  DS.restoreSendMessageControl = function restoreSendMessageControl() {
    DS.qsa('[data-ds-reason="chat-ui:voice"]').forEach(el => {
      DS.unhideElement(el);
    });

    DS.qsa('button[aria-label="send-message"]').forEach(button => {
      let el = button;

      for (
        let i = 0;
        el && i < 8;
        i++, el = el.parentElement
      ) {
        if (
          el === document.body ||
          el.id === "root"
        ) {
          break;
        }

        const reason = String(
          el.dataset.dsReason || ""
        );

        if (reason.startsWith("chat-ui:")) {
          DS.unhideElement(el);
        }
      }
    });
  };

  DS.hideSmallControlWrapper =
    function hideSmallControlWrapper(
      button,
      reason,
      preferredSelectors = []
    ) {
      if (!button) return;

      for (const selector of preferredSelectors) {
        const wrapper = button.closest(selector);

        if (
          !wrapper ||
          wrapper === document.body ||
          wrapper.id === "root"
        ) {
          continue;
        }

        const buttons = DS.qsa(
          "button",
          wrapper
        );

        const textboxes = DS.qsa(
          "textarea, input[type='text'], [contenteditable='true'], [role='textbox']",
          wrapper
        );

        const containsSendButton =
          !!wrapper.querySelector(
            'button[aria-label="send-message"]'
          );

        const text =
          DS.normalize(wrapper.textContent);

        if (
          buttons.length === 1 &&
          textboxes.length === 0 &&
          !containsSendButton &&
          text.length < 80
        ) {
          DS.hideElement(
            wrapper,
            reason
          );

          return;
        }
      }

      DS.hideElement(
        button,
        reason
      );
    };

  let stackedComposerAlignmentRaf = 0;
  let stackedComposerResizeInstalled = false;

  function findStackedComposerLayout() {
    const textarea = document.querySelector('textarea[placeholder="Message..."], textarea[placeholder*="Message"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return null;
    const bubble = textarea.closest("div.grow.border-1") || textarea.parentElement?.parentElement;
    const row = bubble?.closest("div.flex.items-end.gap-sm.w-full") || bubble?.parentElement?.parentElement;
    if (!(bubble instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
    return { textarea, bubble, row };
  }

  function clearStackedComposerAlignment() {
    cancelAnimationFrame(stackedComposerAlignmentRaf);
    stackedComposerAlignmentRaf = 0;
    document.querySelectorAll('[data-ds-stacked-composer-row="1"]').forEach(row => {
      row.removeAttribute("data-ds-stacked-composer-row");
      row.style.removeProperty("--ds-stacked-composer-shift");
    });
    document.querySelectorAll('[data-ds-stacked-composer-bubble="1"]').forEach(bubble => {
      bubble.removeAttribute("data-ds-stacked-composer-bubble");
      bubble.style.removeProperty("--ds-stacked-composer-width");
    });
  }

  function measureStackedMessageLane() {
    const rows = [...document.querySelectorAll(
      'div[id^="message-"] > div > div > div.w-full.flex.mb-lg.bg-transparent.items-center'
    )].filter(row => row.getClientRects().length);
    return rows.at(-1)?.getBoundingClientRect?.() || null;
  }

  function scheduleStackedComposerAlignment(active = true) {
    if (!active) {
      clearStackedComposerAlignment();
      return;
    }

    const composer = findStackedComposerLayout();
    if (!composer) return;

    document.querySelectorAll('[data-ds-stacked-composer-row="1"]').forEach(row => {
      if (row !== composer.row) {
        row.removeAttribute("data-ds-stacked-composer-row");
        row.style.removeProperty("--ds-stacked-composer-shift");
      }
    });
    document.querySelectorAll('[data-ds-stacked-composer-bubble="1"]').forEach(bubble => {
      if (bubble !== composer.bubble) {
        bubble.removeAttribute("data-ds-stacked-composer-bubble");
        bubble.style.removeProperty("--ds-stacked-composer-width");
      }
    });

    composer.row.setAttribute("data-ds-stacked-composer-row", "1");
    composer.bubble.setAttribute("data-ds-stacked-composer-bubble", "1");

    if (!stackedComposerResizeInstalled) {
      stackedComposerResizeInstalled = true;
      window.addEventListener("resize", () => {
        if (document.documentElement.getAttribute("data-ds-chat-message-layout") === "stacked") {
          scheduleStackedComposerAlignment(true);
        }
      }, { passive: true });
    }

    cancelAnimationFrame(stackedComposerAlignmentRaf);
    stackedComposerAlignmentRaf = requestAnimationFrame(() => {
      stackedComposerAlignmentRaf = 0;
      const current = findStackedComposerLayout();
      if (!current || document.documentElement.getAttribute("data-ds-chat-message-layout") !== "stacked") return;

      const laneRect = measureStackedMessageLane();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 0;
      if (laneRect?.width) {
        current.bubble.style.setProperty("--ds-stacked-composer-width", `${Math.round(laneRect.width * 10) / 10}px`);
      } else {
        current.bubble.style.removeProperty("--ds-stacked-composer-width");
      }

      // Let the max-width rule settle before measuring the final bubble center.
      requestAnimationFrame(() => {
        const latest = findStackedComposerLayout();
        if (!latest || document.documentElement.getAttribute("data-ds-chat-message-layout") !== "stacked") return;
        if (viewportWidth <= 760) {
          latest.row.style.setProperty("--ds-stacked-composer-shift", "0px");
          return;
        }

        const targetRect = measureStackedMessageLane();
        const bubbleRect = latest.bubble.getBoundingClientRect();
        const currentShift = Number.parseFloat(latest.row.style.getPropertyValue("--ds-stacked-composer-shift")) || 0;
        const baseBubbleCenter = bubbleRect.left + (bubbleRect.width / 2) - currentShift;
        const targetCenter = targetRect?.width
          ? targetRect.left + (targetRect.width / 2)
          : viewportWidth / 2;
        const shift = Math.max(-220, Math.min(220, targetCenter - baseBubbleCenter));
        latest.row.style.setProperty("--ds-stacked-composer-shift", `${Math.round(shift * 10) / 10}px`);
      });
    });
  }

  DS.applyChatUiCleanup =
    function applyChatUiCleanup() {
      const { settings } = DS.state;
      const onChat = !!settings.enabled && DS.isSingleChatPage();
      installChatEnterBehavior();
      const stackedLayout = !!onChat && !!settings.stackChatMessages;
      if (stackedLayout) DS.setAttributeIfChanged?.(document.documentElement, "data-ds-chat-message-layout", "stacked");
      else if (document.documentElement.hasAttribute("data-ds-chat-message-layout")) document.documentElement.removeAttribute("data-ds-chat-message-layout");
      scheduleStackedComposerAlignment(stackedLayout);

      const hasActiveCleanup = !!(
        settings.stackChatMessages ||
        settings.hideChatPlusButton ||
        settings.hideChatImageButton ||
        settings.replaceChatImageWithOocButton ||
        settings.showAsteriskButton ||
        settings.autoPairAsterisks ||
        settings.chatEnterKeyBehavior !== "site-default" ||
        settings.hideChatVoiceButton ||
        settings.hideUnlockCustomVoices
      );

      DS.setClassState?.(
        document.documentElement,
        "ds-hide-chat-voice",
        !!onChat && !!settings.hideChatVoiceButton
      );

      if (!onChat || !hasActiveCleanup) {
        if (DS.state.chatUiCleanupWasActive) {
          [
            "chat-ui:plus",
            "chat-ui:image",
            "chat-ui:image-tooltip",
            "chat-ui:unlock-custom-voices",
            "chat-ui:unlock-custom-voices-text",
            "chat-ui:voice"
          ].forEach(reason => DS.restoreChatUiReason(reason));
          restoreOocShortcuts();
          restoreAsteriskShortcuts();
          DS.state.oocShortcutMode = "off";
          DS.restoreSendMessageControl();
        }

        DS.state.chatUiCleanupWasActive = false;
        return;
      }

      DS.state.chatUiCleanupWasActive = true;
      DS.restoreSendMessageControl();

      if (settings.hideChatPlusButton) {
        DS.qsa(
          'button[aria-label="Plus-button"]'
        ).forEach(button => {
          DS.hideSmallControlWrapper(
            button,
            "chat-ui:plus",
            [".relative"]
          );
        });
      } else {
        DS.restoreChatUiReason(
          "chat-ui:plus"
        );
      }

      const oocShortcutMode = settings.replaceChatImageWithOocButton
        ? (settings.hideChatImageButton ? "replace" : "alongside")
        : "off";

      if (DS.state.oocShortcutMode !== oocShortcutMode) {
        restoreOocShortcuts();
        DS.state.oocShortcutMode = oocShortcutMode;
      }

      if (settings.replaceChatImageWithOocButton) {
        // "Show OOC button" no longer forces Image off. It only occupies the
        // Image slot when the separate Hide image generation option is enabled.
        DS.restoreChatUiReason("chat-ui:image");
        DS.restoreChatUiReason("chat-ui:image-tooltip");
        ensureOocShortcut(settings.hideChatImageButton);
      } else {
        restoreOocShortcuts();
        DS.state.oocShortcutMode = "off";

        if (settings.hideChatImageButton) {
          DS.qsa(
            'button[aria-label="generate-image"], button[data-testid="ImageGenerationButton"]'
          ).forEach(button => {
            DS.hideSmallControlWrapper(
              button,
              "chat-ui:image",
              [
                '[data-tooltip-content="Image"]',
                ".inline-flex"
              ]
            );
          });

          DS.qsa('[data-tooltip-content="Image"]').forEach(el => {
            const buttons = DS.qsa("button", el);
            const textboxes = DS.qsa(
              "textarea, input[type='text'], [contenteditable='true'], [role='textbox']",
              el
            );

            if (buttons.length <= 1 && textboxes.length === 0) {
              DS.hideElement(el, "chat-ui:image-tooltip");
            }
          });
        } else {
          DS.restoreChatUiReason("chat-ui:image");
          DS.restoreChatUiReason("chat-ui:image-tooltip");
        }
      }

      if (wantsDedicatedAsteriskButton(settings)) {
        installAsteriskRepairListeners();
        ensureAsteriskShortcut();
      } else {
        restoreAsteriskShortcuts();
      }

      if (settings.autoPairAsterisks) {
        installAsteriskAutoPairing();
      }

      if (
        settings.hideUnlockCustomVoices
      ) {
        DS.qsa(
          'button[aria-label="Unlock Custom Voices"]'
        ).forEach(button => {
          DS.hideElement(
            button,
            "chat-ui:unlock-custom-voices"
          );
        });

        DS.qsa("button").forEach(button => {
          if (
            DS.normalize(button.textContent) ===
            "unlock custom voices"
          ) {
            DS.hideElement(
              button,
              "chat-ui:unlock-custom-voices-text"
            );
          }
        });
      } else {
        DS.restoreChatUiReason(
          "chat-ui:unlock-custom-voices"
        );

        DS.restoreChatUiReason(
          "chat-ui:unlock-custom-voices-text"
        );
      }

      DS.restoreSendMessageControl();
    };
})();
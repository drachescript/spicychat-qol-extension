(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const ID = "ds-formatting-toolbar";
  let savedSelection = null;

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function composerField() {
    const toolkit = [...document.querySelectorAll(".sai-wysiwyg-editor[contenteditable='true']")]
      .find(el => visible(el) && !el.closest("div[id^='message-']"));
    if (toolkit) return toolkit;
    const fields = [...document.querySelectorAll("textarea, [contenteditable='true']")]
      .filter(el => visible(el) && !el.closest("div[id^='message-'], #ds-qol-panel"));
    return fields.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function controlRow(field) {
    if (!field) return null;
    let el = field.parentElement;
    for (let i = 0; el && i < 8; i++, el = el.parentElement) {
      const buttons = [...el.querySelectorAll(":scope > button, :scope > div > button")]
        .filter(button => visible(button) && !button.closest("#ds-formatting-toolbar"));
      if (buttons.length) {
        const row = buttons[0].parentElement || el;
        if (!row.closest?.("#ds-formatting-toolbar")) return row;
      }
    }
    return field.parentElement;
  }

  function textControlSelection(field) {
    return { kind: "text", field, start: field.selectionStart ?? field.value.length, end: field.selectionEnd ?? field.selectionStart ?? field.value.length };
  }

  function contentSelection(field) {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) return { kind: "content", field, range: null };
    const range = selection.getRangeAt(0);
    if (!field.contains(range.commonAncestorContainer)) return { kind: "content", field, range: null };
    return { kind: "content", field, range: range.cloneRange() };
  }

  function rememberSelection() {
    const field = composerField();
    if (!field) return;
    savedSelection = field.tagName === "TEXTAREA" || field.tagName === "INPUT" ? textControlSelection(field) : contentSelection(field);
  }

  function dispatchInput(field, data) {
    try { field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data })); }
    catch { field.dispatchEvent(new Event("input", { bubbles: true })); }
  }

  function wrapTextControl(field, before, after, selection) {
    const value = String(field.value || "");
    const start = selection?.field === field ? selection.start : (field.selectionStart ?? value.length);
    const end = selection?.field === field ? selection.end : (field.selectionEnd ?? start);
    const selected = value.slice(start, end);
    const replacement = `${before}${selected}${after}`;
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, next); else field.value = next;
    dispatchInput(field, replacement);
    const caretStart = start + before.length;
    const caretEnd = selected ? caretStart + selected.length : caretStart;
    field.focus();
    try { field.setSelectionRange(caretStart, caretEnd); } catch {}
  }

  function makeContentRange(field) {
    if (savedSelection?.kind === "content" && savedSelection.field === field && savedSelection.range && field.contains(savedSelection.range.commonAncestorContainer)) {
      return savedSelection.range.cloneRange();
    }
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    return range;
  }

  function wrapContent(field, before, after) {
    const range = makeContentRange(field);
    const selected = range.toString();
    range.deleteContents();
    const text = document.createTextNode(`${before}${selected}${after}`);
    range.insertNode(text);
    const selection = window.getSelection();
    const next = document.createRange();
    next.setStart(text, before.length);
    next.setEnd(text, before.length + selected.length);
    selection.removeAllRanges();
    selection.addRange(next);
    field.focus();
    dispatchInput(field, text.nodeValue);
  }

  function applyWrap(before, after = before) {
    const field = savedSelection?.field && document.contains(savedSelection.field) ? savedSelection.field : composerField();
    if (!field) return DS.setQuickStatus?.("Could not find the chat message box.");
    if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") wrapTextControl(field, before, after, savedSelection);
    else if (field.isContentEditable) wrapContent(field, before, after);
    savedSelection = null;
  }

  function buildButton(label, title, before, after = before) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ds-formatting-button";
    button.textContent = label;
    button.title = title;
    button.addEventListener("pointerdown", event => { rememberSelection(); event.preventDefault(); });
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); applyWrap(before, after); });
    return button;
  }


  function customDefinitions(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 5)
      .map((line, index) => {
        const parts = line.split("|").map(part => part.trim());
        if (parts.length < 2) return null;
        const label = String(parts[0] || `Custom ${index + 1}`).slice(0, 14);
        const before = String(parts[1] || "").slice(0, 30);
        const after = String(parts.length >= 3 ? parts.slice(2).join("|").trim() : before).slice(0, 30);
        if (!before && !after) return null;
        return [`custom-${index}-${label}-${before}-${after}`, label || `C${index + 1}`, `Wrap with ${label || `custom ${index + 1}`}`, before, after];
      })
      .filter(Boolean);
  }

  function cleanup() {
    document.getElementById(ID)?.remove();
    DS.state.formattingToolbarWasActive = false;
  }

  DS.applyFormattingToolbar = function applyFormattingToolbar() {
    const settings = DS.state?.settings || {};
    if (!settings.enabled || !settings.showFormattingToolbar || !DS.isSingleChatPage?.()) {
      if (DS.state.formattingToolbarWasActive) cleanup();
      return;
    }
    DS.state.formattingToolbarWasActive = true;
    const field = composerField();
    const row = controlRow(field);
    if (!field || !row) return;
    const definitions = [];
    if (settings.formatToolbarAsterisk !== false) definitions.push(["asterisk", "*", "Wrap in *asterisks*", "*", "*"]);
    if (settings.formatToolbarBold !== false) definitions.push(["bold", "**", "Wrap in **bold**", "**", "**"]);
    if (settings.formatToolbarBoldItalic) definitions.push(["boldItalic", "***", "Wrap in ***bold italic***", "***", "***"]);
    if (settings.formatToolbarStrike) definitions.push(["strike", "~~", "Wrap in ~~strikethrough~~", "~~", "~~"]);
    if (settings.formatToolbarParens !== false) definitions.push(["parens", "( )", "Wrap in parentheses", "(", ")"]);
    if (settings.formatToolbarQuotes !== false) definitions.push(["quotes", '" "', "Wrap in quotes", '"', '"']);
    if (settings.formatToolbarBackticks) definitions.push(["backticks", "` `", "Wrap in backticks / alternate dialogue", "`", "`"]);
    if (settings.formatToolbarBrackets) definitions.push(["brackets", "[ ]", "Wrap in square brackets", "[", "]"]);
    if (settings.formatToolbarBraces) definitions.push(["braces", "{ }", "Wrap in braces", "{", "}"]);
    definitions.push(...customDefinitions(settings.formatToolbarCustomWrappers));

    const signature = definitions.map(([key]) => key).join("|");

    let toolbar = document.getElementById(ID);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = ID;
      toolbar.className = "ds-formatting-toolbar";
      row.appendChild(toolbar);
    } else if (toolbar.parentElement !== row && row !== toolbar && !toolbar.contains(row)) {
      // SpicyChat can rebuild/move the composer row. Move the existing toolbar
      // instead of destroying/recreating it so it does not visibly blink.
      row.appendChild(toolbar);
    }

    // Critical QoL passes can run frequently because SpicyChat itself mutates
    // the page in the background. Rebuilding these buttons on every pass made
    // the toolbar flash even while the user was idle. Only rebuild when the
    // enabled button set actually changes.
    if (toolbar.dataset.dsFormattingSignature === signature) return;

    toolbar.replaceChildren(
      ...definitions.map(([, label, title, before, after]) =>
        buildButton(label, title, before, after)
      )
    );
    toolbar.dataset.dsFormattingSignature = signature;
  };

  DS.wrapComposerText = function wrapComposerText(before, after = before) {
    savedSelection = null;
    applyWrap(String(before || ""), String(after ?? before ?? ""));
  };

  DS.removeFormattingToolbar = cleanup;
})();

(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const TOOLBAR_CLASS = "ds-bot-editor-snippets";
  const FIELD_HINTS = [
    "personality",
    "scenario",
    "greeting",
    "first message",
    "description",
    "definition",
    "prompt",
    "example dialogue",
    "example conversation",
    "character details",
    "character description",
    "lore",
    "system prompt"
  ];
  const EXCLUDED_HINTS = [
    "message...",
    "write a message",
    "search",
    "feedback",
    "comment",
    "report",
    "ooc template"
  ];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function settings() {
    return DS.state?.settings || {};
  }

  function isEditorRoute() {
    const path = String(location.pathname || "");
    return (
      /^\/(?:[a-z]{2}\/)?chatbot\/create(?:\/[^/?#]+)?\/?$/i.test(path) ||
      /^\/(?:[a-z]{2}\/)?chatbot\/[^/]+\/edit\/?$/i.test(path) ||
      /^\/(?:[a-z]{2}\/)?chatbot\/edit(?:\/|$)/i.test(path) ||
      /^\/(?:[a-z]{2}\/)?create(?:\/chatbot)?\/?$/i.test(path)
    );
  }

  function pageLooksLikeEditor() {
    if (isEditorRoute()) return true;

    return [...document.querySelectorAll("h1, h2")]
      .slice(0, 12)
      .map(element => normalize(element.textContent))
      .some(text => (
        text.includes("create chatbot") ||
        text.includes("edit chatbot") ||
        text.includes("create character") ||
        text.includes("edit character")
      ));
  }

  function snippetButtonsEnabled() {
    const value = settings();
    return !!(
      value.botEditorShowCharButton ||
      value.botEditorShowUserButton ||
      value.botEditorShowContinueButton ||
      value.botEditorShowNoControlButton ||
      (value.botEditorShowCustomSnippets && Array.isArray(value.botEditorSnippets) && value.botEditorSnippets.length)
    );
  }

  let lastAdvancedOpenClick = 0;

  function findAdvancedButton() {
    const translated = document.querySelector(
      "[data-translate-key='chatbot:form.advancedButton']"
    );
    if (translated) return translated.closest("button");

    return [...document.querySelectorAll("button")].find(button =>
      normalize(button.textContent) === "advanced"
    ) || null;
  }

  function advancedSectionIsClosed(button) {
    if (!button) return false;

    const expanded = button.getAttribute("aria-expanded");
    if (expanded === "true") return false;
    if (expanded === "false") return true;

    if (button.querySelector("svg.lucide-chevron-up, svg[class*='lucide-chevron-up']")) {
      return false;
    }
    if (button.querySelector("svg.lucide-chevron-down, svg[class*='lucide-chevron-down']")) {
      return true;
    }

    const path = button.querySelector("svg path")?.getAttribute("d")
      ?.toLowerCase()
      ?.replace(/\s+/g, "") || "";

    if (path.includes("m18 15-6-6-6 6".replace(/\s+/g, ""))) return false;
    if (path.includes("m6 9 6 6 6-6".replace(/\s+/g, ""))) return true;

    return false;
  }

  function applyAdvancedAutoOpen() {
    if (!settings().botEditorAutoOpenAdvanced || !pageLooksLikeEditor()) return;

    const button = findAdvancedButton();
    if (!button || !advancedSectionIsClosed(button)) return;
    if (Date.now() - lastAdvancedOpenClick < 1200) return;

    lastAdvancedOpenClick = Date.now();
    DS.realClick?.(button);
    setTimeout(() => DS.scheduleRun?.(), 350);
  }

  let lastGuidelinesAgreementClick = 0;

  function normalizedCreationPath() {
    return location.pathname
      .replace(/^\/[a-z]{2}(?=\/)/i, "")
      .replace(/\/+$/, "") || "/";
  }

  let lastLorebookStartNewClick = 0;

  function isLorebookCreateChooser() {
    return normalizedCreationPath() === "/lorebook/create";
  }

  function findLorebookStartNewButton() {
    if (!isLorebookCreateChooser()) return null;

    return [...document.querySelectorAll("button")].find(button => {
      if (button.disabled || button.closest("#ds-qol-panel")) return false;
      const headings = [...button.querySelectorAll("p, span")].map(el => normalize(el.textContent));
      if (!headings.includes("start new")) return false;

      // The chooser currently has Start New and Import cards. Require either
      // the pencil icon or the known subtitle so Import can never be clicked.
      return !!button.querySelector("svg.lucide-pencil, svg[class*='lucide-pencil']") ||
        headings.some(text => text.includes("build your world one detail at a time"));
    }) || null;
  }

  function applyLorebookAutoStartNew() {
    if (!settings().lorebookAutoStartNew || !isLorebookCreateChooser()) return;

    const button = findLorebookStartNewButton();
    if (!button) return;
    if (Date.now() - lastLorebookStartNewClick < 1800) return;

    lastLorebookStartNewClick = Date.now();
    try {
      button.click();
    } catch {
      DS.realClick?.(button);
    }
  }

  function normalizeDefaultVisibility(value) {
    const mode = normalize(value);
    return mode === "public" || mode === "unlisted" ? mode : "ignore";
  }

  function findChatbotVisibilityButton(mode) {
    if (normalizedCreationPath() !== "/chatbot/create") return null;

    const ariaKey = mode === "unlisted" ? "hidden" : "public";
    const direct = document.querySelector(`button[aria-labelledby="${ariaKey}"]`);
    if (direct && !direct.disabled && !direct.closest("#ds-qol-panel")) return direct;

    return [...document.querySelectorAll("button")].find(button => {
      if (button.disabled || button.closest("#ds-qol-panel")) return false;
      return normalize(button.textContent) === mode;
    }) || null;
  }

  function visibilityButtonSelected(button) {
    if (!button) return false;
    if (button.getAttribute("aria-pressed") === "true") return true;
    if (button.dataset.state === "active" || button.dataset.selected === "true") return true;
    return button.classList.contains("bg-black") || button.classList.contains("dark:bg-white");
  }

  function applyDefaultChatbotVisibility() {
    const mode = normalizeDefaultVisibility(settings().botEditorDefaultVisibility);
    if (mode === "ignore" || normalizedCreationPath() !== "/chatbot/create") return;

    const button = findChatbotVisibilityButton(mode);
    if (!button) return;

    const form = button.closest("form") || button.parentElement;
    if (!form) return;

    // Set the default once for this rendered creation form. This means the
    // user can still manually change visibility afterwards without QoL
    // immediately forcing it back. If SpicyChat rebuilds the form, the new
    // form gets the selected default again.
    if (form.dataset.dsDefaultVisibilityApplied === mode) return;

    if (!visibilityButtonSelected(button)) {
      try {
        button.click();
      } catch {
        DS.realClick?.(button);
      }
    }

    form.dataset.dsDefaultVisibilityApplied = mode;
  }

  function isSupportedCreationGuidelinesPage() {
    const path = normalizedCreationPath();
    return path === "/chatbot/create" || /^\/chatbot\/create\/[^/]+$/i.test(path) || path === "/lorebook/create";
  }

  function findCreationGuidelinesCheckbox() {
    return document.querySelector(
      "[data-field-name='guidelines'] input[type='checkbox'][name='guidelines']"
    );
  }

  function applyCreationGuidelinesAgreement() {
    if (!settings().autoAgreeCreationGuidelines || !isSupportedCreationGuidelinesPage()) return;

    const checkbox = findCreationGuidelinesCheckbox();
    if (!checkbox || checkbox.disabled || checkbox.checked) return;
    if (Date.now() - lastGuidelinesAgreementClick < 1200) return;

    lastGuidelinesAgreementClick = Date.now();
    DS.realClick?.(checkbox);
    setTimeout(() => DS.scheduleRun?.(), 250);
  }

  function fieldText(field) {
    const parts = [
      field.id,
      field.name,
      field.getAttribute("aria-label"),
      field.getAttribute("placeholder"),
      field.getAttribute("data-testid")
    ];

    if (field.id) {
      try {
        const linked = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (linked) parts.push(linked.textContent);
      } catch {}
    }

    const label = field.closest("label");
    if (label) parts.push(label.textContent);

    const container = field.parentElement;
    if (container) {
      [...container.children]
        .filter(element => element !== field && /^(LABEL|P|SPAN|DIV)$/.test(element.tagName))
        .slice(0, 4)
        .forEach(element => parts.push(element.textContent));
    }

    return normalize(parts.filter(Boolean).join(" "));
  }

  function isRelevantField(field) {
    if (!field || field.disabled || field.readOnly) return false;
    if (field.closest("#ds-qol-panel, #ds-chat-export-modal, .ds-bot-editor-snippets, [data-role='alertbox']")) return false;
    if (field.closest("form[role='search'], [role='search']")) return false;
    if (/^\/(?:[a-z]{2}\/)?chat\//i.test(location.pathname)) return false;

    const text = fieldText(field);
    if (EXCLUDED_HINTS.some(hint => text.includes(hint))) return false;
    if (FIELD_HINTS.some(hint => text.includes(hint))) return true;

    // Chatbot forms can change labels/classes. On a confirmed editor page,
    // accept long text fields but still reject normal one-line inputs.
    return pageLooksLikeEditor() && (field.tagName === "TEXTAREA" || field.isContentEditable);
  }

  function customSnippets(input) {
    if (!Array.isArray(input)) return [];

    const seen = new Set();
    return input.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const name = String(item.name || item.title || `Snippet ${index + 1}`).trim();
      const text = String(item.text || item.value || "").trim();
      if (!name || !text) return [];
      const key = `${name.toLowerCase()}\n${text}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ name, text }];
    });
  }

  function buttonDefinitions() {
    const value = settings();
    const buttons = [];

    if (value.botEditorShowCharButton) {
      buttons.push({ label: "{{char}}", text: "{{char}}", title: "Insert {{char}}" });
    }
    if (value.botEditorShowUserButton) {
      buttons.push({ label: "{{user}}", text: "{{user}}", title: "Insert {{user}}" });
    }
    if (value.botEditorShowContinueButton) {
      buttons.push({ label: "CONTINUE", text: "CONTINUE", title: "Insert CONTINUE" });
    }
    if (value.botEditorShowNoControlButton) {
      buttons.push({
        label: "No-control rule",
        text: "{{char}} must never narrate, speak, think, act, or make decisions for {{user}}. Only the user controls {{user}}.",
        title: "Insert a personality rule that keeps control of {{user}} with the user"
      });
    }
    if (value.botEditorShowCustomSnippets) {
      customSnippets(value.botEditorSnippets).forEach(snippet => {
        buttons.push({ label: snippet.name, text: snippet.text, title: `Insert ${snippet.name}` });
      });
    }

    return buttons;
  }

  function setNativeValue(field, value) {
    const prototype = field.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
  }

  function insertIntoTextControl(field, text) {
    const value = String(field.value || "");
    const start = Number.isFinite(field.selectionStart) ? field.selectionStart : value.length;
    const end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : start;
    const next = `${value.slice(0, start)}${text}${value.slice(end)}`;

    setNativeValue(field, next);
    field.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus({ preventScroll: true });

    const cursor = start + text.length;
    try { field.setSelectionRange(cursor, cursor); } catch {}
  }

  function insertIntoContentEditable(field, text) {
    field.focus({ preventScroll: true });
    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

    if (!range || !field.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(field);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);

    field.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text
    }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertSnippet(field, text) {
    if (!field || !document.contains(field)) return;
    if (field.tagName === "TEXTAREA" || field.tagName === "INPUT") {
      insertIntoTextControl(field, text);
    } else if (field.isContentEditable) {
      insertIntoContentEditable(field, text);
    }
  }

  function signature(buttons) {
    return JSON.stringify(buttons.map(button => [button.label, button.text]));
  }

  function createToolbar(field, buttons) {
    const toolbar = document.createElement("div");
    toolbar.className = TOOLBAR_CLASS;
    toolbar.dataset.dsSignature = signature(buttons);

    buttons.forEach(definition => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ds-bot-editor-snippet-button";
      button.textContent = definition.label;
      button.title = definition.title || definition.label;
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        insertSnippet(field, definition.text);
      });
      toolbar.appendChild(button);
    });

    return toolbar;
  }

  function clearToolbars() {
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach(element => element.remove());
    document.querySelectorAll("[data-ds-bot-editor-snippet-target]").forEach(field => {
      delete field.dataset.dsBotEditorSnippetTarget;
    });
  }

  DS.removeBotEditorSnippetTools = clearToolbars;

  DS.applyBotEditorSnippetTools = function applyBotEditorSnippetTools() {
    if (!settings().enabled) {
      clearToolbars();
      return;
    }

    applyLorebookAutoStartNew();
    applyDefaultChatbotVisibility();
    applyCreationGuidelinesAgreement();

    if (!pageLooksLikeEditor()) {
      clearToolbars();
      return;
    }

    applyAdvancedAutoOpen();

    if (!snippetButtonsEnabled()) {
      clearToolbars();
      return;
    }

    const buttons = buttonDefinitions();
    if (!buttons.length) {
      clearToolbars();
      return;
    }

    const currentSignature = signature(buttons);
    const fields = [...document.querySelectorAll("textarea, [contenteditable='true']")]
      .filter(isRelevantField);

    fields.forEach(field => {
      const existing = field.previousElementSibling;
      if (existing?.classList?.contains(TOOLBAR_CLASS)) {
        if (existing.dataset.dsSignature === currentSignature) return;
        existing.remove();
      }

      field.insertAdjacentElement("beforebegin", createToolbar(field, buttons));
      field.dataset.dsBotEditorSnippetTarget = "1";
    });

    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach(toolbar => {
      const target = toolbar.nextElementSibling;
      if (!target || !fields.includes(target)) toolbar.remove();
    });
  };
})();

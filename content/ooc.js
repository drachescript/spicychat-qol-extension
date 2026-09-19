(() => {
  "use strict";

  const DS = window.DragonScriptQoL;

  const OOC_SELECTED_KEY = "ds-qol-ooc-selected-index-v1";

  function cleanName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[“”"]/g, "")
      .trim();
  }

  function normalized(value) {
    return typeof DS.normalize === "function"
      ? DS.normalize(value)
      : String(value || "")
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function readSelectedOocIndex() {
    try {
      const value = Number(sessionStorage.getItem(OOC_SELECTED_KEY));
      return Number.isInteger(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function writeSelectedOocIndex(index) {
    try {
      sessionStorage.setItem(OOC_SELECTED_KEY, String(Math.max(0, Number(index) || 0)));
    } catch {}
  }

  DS.getPreferredOocTemplateIndex = function getPreferredOocTemplateIndex() {
    const templates = DS.getOocTemplates?.() || [];
    if (!templates.length) return 0;

    const panelSelect = document.getElementById("ds-qol-ooc-select");
    const panelValue = Number(panelSelect?.value);

    if (Number.isInteger(panelValue) && panelValue >= 0 && panelValue < templates.length) {
      return panelValue;
    }

    return Math.min(readSelectedOocIndex(), templates.length - 1);
  };

  DS.getOocTemplates = function getOocTemplates() {
    const raw = DS.state.settings.oocTemplates;

    if (typeof DS.normalizeOocTemplates === "function") {
      return DS.normalizeOocTemplates(raw);
    }

    if (Array.isArray(raw)) {
      return raw
        .map((item, index) => {
          if (typeof item === "string") {
            const text = item.trim();
            return text ? { name: `OOC ${index + 1}`, text } : null;
          }

          if (!item || typeof item !== "object") return null;

          const text = String(item.text || "").trim();
          if (!text) return null;

          return {
            name: String(item.name || `OOC ${index + 1}`).trim(),
            text
          };
        })
        .filter(Boolean);
    }

    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/\n\s*---\s*\n/g)
        .map((text, index) => ({
          name: `OOC ${index + 1}`,
          text: text.trim()
        }))
        .filter(item => item.text);
    }

    return [{ name: "Strict no-control", text: DS.DEFAULT_OOC_TEMPLATE }];
  };

  function isBadArea(el) {
    return !!el.closest(
      [
        "#ds-qol-panel",
        "#ds-chat-export-modal",
        "nav",
        "aside",
        "header",
        "footer",
        "button",
        "select",
        "textarea",
        "input",
        "[role='button']",
        "[role='dialog']",
        "[aria-labelledby='confirmation modal']",
        "[data-testid='LocaleSelector']",
        "[data-testid='FloatingUpgradeCta']",
        "[data-testid='GetPremiumButton']",
        "[href='/subscribe']",
        "[href*='/subscribe']"
      ].join(", ")
    );
  }

  function looksLikeName(text) {
    const value = cleanName(text);

    if (!value) return false;
    if (value.length < 2 || value.length > 60) return false;

    const lower = value.toLowerCase();

    const bad = [
      "en",
      "de",
      "fr",
      "es",
      "it",
      "pt",
      "nl",
      "pl",
      "ru",
      "ja",
      "ko",
      "zh",
      "you",
      "me",
      "user",
      "assistant",
      "character",
      "persona",
      "change persona",
      "true supporter",
      "get a taste",
      "im all in",
      "i'm all in",
      "most popular",
      "subscribe",
      "premium",
      "upgrade",
      "home",
      "chats",
      "my personas",
      "create",
      "favorites",
      "recommendations",
      "leaderboard",
      "help",
      "sign in",
      "sign out"
    ];

    if (bad.includes(lower)) return false;
    if (/^[a-z]{2}$/i.test(value)) return false;
    if (lower.includes("ago")) return false;
    if (lower.includes("ooc")) return false;
    if (lower.includes("message")) return false;
    if (lower.includes("/month")) return false;
    if (lower.includes("$")) return false;
    if (/^\d+$/.test(value)) return false;
    if (value.split(" ").length > 5) return false;

    return /^[\p{L}\p{N}_ .'\-]+$/u.test(value);
  }

  function getBotName() {
    if (typeof DS.getCurrentBotName === "function") {
      const name = cleanName(DS.getCurrentBotName());
      if (name) return name;
    }

    const h1 = cleanName(document.querySelector("h1")?.textContent);
    if (h1) return h1;

    return "the character";
  }

  function hasUserSideAncestor(el) {
    let node = el;

    for (let i = 0; node && i < 9; i++, node = node.parentElement) {
      if (node === document.body || node.id === "root") break;

      const cls = String(node.className || "").toLowerCase();

      if (
        cls.includes("justify-end") ||
        cls.includes("items-end") ||
        cls.includes("self-end") ||
        cls.includes("ml-auto") ||
        cls.includes("flex-row-reverse") ||
        cls.includes("text-right")
      ) {
        return true;
      }
    }

    return false;
  }

  function detectUserNameFromMessages() {
    const botName = normalized(getBotName());

    const candidates = DS.qsa(
      "main p, main span, main h1, main h2, main h3, [role='main'] p, [role='main'] span"
    )
      .map(el => {
        const text = cleanName(el.textContent);
        const rect = el.getBoundingClientRect();

        let score = 0;

        if (!looksLikeName(text)) score = -100;
        if (normalized(text) === botName) score = -100;
        if (isBadArea(el)) score = -100;
        if (!rect.width || !rect.height) score = -100;

        if (hasUserSideAncestor(el)) score += 20;

        const centerX = rect.left + rect.width / 2;

        if (centerX > window.innerWidth / 2) {
          score += 8;
        }

        return { el, text, score };
      })
      .filter(item => item.score >= 15)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        return (
          b.el.getBoundingClientRect().top -
          a.el.getBoundingClientRect().top
        );
      });

    return candidates[0]?.text || "";
  }

  function detectUserNameFromPersonas() {
    const personas = DS.state.savedPersonas || [];

    const active =
      personas.find(persona => persona.active || persona.selected) ||
      personas[0];

    const name = cleanName(active?.name || active?.label || "");

    return looksLikeName(name) ? name : "";
  }

  function detectUserNameFromCheckedPersona() {
    const checked = DS.qsa("input[type='radio']:checked")
      .map(input => {
        const byFor =
          input.id && window.CSS?.escape
            ? document.querySelector(
              `label[for="${CSS.escape(input.id)}"]`
            )
            : null;

        const label = input.closest("label") || byFor;

        return cleanName(label?.textContent);
      })
      .find(looksLikeName);

    return checked || "";
  }

  DS.detectOocUserName = function detectOocUserName() {
    return (
      detectUserNameFromMessages() ||
      detectUserNameFromCheckedPersona() ||
      detectUserNameFromPersonas() ||
      "the user"
    );
  };

  DS.detectOocBotName = function detectOocBotName() {
    return getBotName() || "the character";
  };

  DS.resolveOocTemplate = function resolveOocTemplate(template) {
    const user = DS.detectOocUserName();
    const bot = DS.detectOocBotName();

    const text =
      template && typeof template === "object"
        ? template.text
        : template;

    return String(text || DS.DEFAULT_OOC_TEMPLATE)
      .replaceAll("{user}", user)
      .replaceAll("{persona}", user)
      .replaceAll("{player}", user)
      .replaceAll("{bot}", bot)
      .replaceAll("{character}", bot);
  };

  function isTypingField(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

    const tag = el.tagName?.toLowerCase();

    return (
      tag === "textarea" ||
      (tag === "input" && /^(text|search|email|url|tel|password)?$/i.test(el.type || "text")) ||
      el.isContentEditable ||
      el.getAttribute("contenteditable") === "true" ||
      el.getAttribute("role") === "textbox"
    );
  }

  function isVisibleTypingField(el) {
    if (!isTypingField(el)) return false;
    if (el.closest("#ds-qol-panel, #ds-chat-export-modal, nav, aside, header, footer")) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;

    return true;
  }

  function isEditableTypingField(el) {
    if (!isVisibleTypingField(el)) return false;

    if (el.matches?.("[disabled], [aria-disabled='true']")) return false;
    if (el.disabled) return false;
    if (el.readOnly) return false;

    return true;
  }

  function isEditMessageField(el) {
    if (!isEditableTypingField(el)) return false;

    const box = el.closest("div, form, section, article");
    const host = el.closest("[class*='rounded'], [class*='gap-md'], [class*='flex-col']") || box;
    const wider = host?.parentElement || host;

    if (
      wider?.querySelector?.("button[aria-label='save'], [data-translate-key='common:save']") &&
      wider?.querySelector?.("button[aria-label='cancel'], [data-translate-key='common:cancel']")
    ) {
      return true;
    }

    const placeholder = String(el.getAttribute("placeholder") || "").toLowerCase();
    if (placeholder.includes("enter something")) return true;

    return false;
  }

  function getTypingFields() {
    return DS.qsa(
      "textarea, input[type='text'], input:not([type]), [contenteditable='true'], [role='textbox']"
    ).filter(isVisibleTypingField);
  }

  function getActiveTypingField() {
    const active = document.activeElement;

    if (isEditableTypingField(active)) return active;

    const nested = active?.closest?.(
      "textarea, input[type='text'], input:not([type]), [contenteditable='true'], [role='textbox']"
    );

    return isEditableTypingField(nested) ? nested : null;
  }

  function getChatInput() {
    const active = getActiveTypingField();

    // When editing an existing message, the active edit textarea should win.
    if (active && isEditMessageField(active)) return active;

    const fields = getTypingFields();

    const activeEditable = active && fields.includes(active) ? active : null;
    if (activeEditable) return activeEditable;

    const editField = fields
      .filter(isEditMessageField)
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];

    if (editField) return editField;

    return fields
      .filter(isEditableTypingField)
      .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
  }

  function getInputText(el) {
    if (!el) return "";

    return "value" in el
      ? String(el.value || "")
      : String(el.textContent || "");
  }

  function buildOocValue(existing, text) {
    const ooc = String(text || "").trim();
    const current = String(existing || "");

    if (!current.trim()) return ooc;

    return `${current.replace(/[ \t]+$/g, "").replace(/\n+$/g, "")}\n\n${ooc}`;
  }

  function getOocAppendText(existing, text) {
    const next = buildOocValue(existing, text);
    const current = String(existing || "");

    return next.startsWith(current)
      ? next.slice(current.length)
      : `\n\n${String(text || "").trim()}`;
  }

  function dispatchTextInput(el, data) {
    try {
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data
        })
      );
    } catch {}

    try {
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data
        })
      );
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeValue(el, next, data) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLInputElement
          ? HTMLInputElement.prototype
          : null;

    const setter = proto
      ? Object.getOwnPropertyDescriptor(proto, "value")?.set
      : null;

    if (setter) {
      setter.call(el, next);
    } else {
      el.value = next;
    }

    const end = String(next || "").length;

    if (typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(end, end);
      } catch {}
    }

    dispatchTextInput(el, data);
  }

  function appendNativeValue(el, addition, nextValue) {
    el.focus();

    const end = String(el.value || "").length;

    if (typeof el.setSelectionRange === "function") {
      try {
        el.setSelectionRange(end, end);
      } catch {}
    }

    if (typeof el.setRangeText === "function") {
      try {
        el.setRangeText(addition, end, end, "end");
        dispatchTextInput(el, addition);
      } catch {
        setNativeValue(el, nextValue, addition);
      }
    } else {
      setNativeValue(el, nextValue, addition);
    }

    requestAnimationFrame(() => {
      if (String(el.value || "") !== String(nextValue || "")) {
        setNativeValue(el, nextValue, addition);
      }
    });
  }

  function appendContentEditable(el, addition) {
    el.focus();

    const selection = window.getSelection?.();
    const range = document.createRange();

    range.selectNodeContents(el);
    range.collapse(false);

    selection?.removeAllRanges();
    selection?.addRange(range);

    let inserted = false;

    try {
      inserted = document.execCommand?.("insertText", false, addition) === true;
    } catch {
      inserted = false;
    }

    if (!inserted) {
      range.insertNode(document.createTextNode(addition));
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      dispatchTextInput(el, addition);
    }
  }

  DS.insertOocText = function insertOocText(text) {
    const input = getChatInput();

    if (!input) {
      DS.setQuickStatus?.("Could not find an editable chat or message box.");
      return;
    }

    const currentText = getInputText(input);
    const nextValue = buildOocValue(currentText, text);
    const addition = getOocAppendText(currentText, text);

    if (!String(text || "").trim()) {
      DS.setQuickStatus?.("OOC template is empty.");
      return;
    }

    input.focus();

    if (
      input.isContentEditable ||
      input.getAttribute("contenteditable") === "true"
    ) {
      input.textContent = nextValue;
      dispatchTextInput(input, addition);
    } else if ("value" in input) {
      appendNativeValue(input, addition, nextValue);
    } else {
      input.textContent = nextValue;
      dispatchTextInput(input, addition);
    }

    input.focus();
  };

  DS.insertOocTemplate = function insertOocTemplate(index = 0) {
    const templates = DS.getOocTemplates();
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, templates.length - 1)));
    writeSelectedOocIndex(safeIndex);

    const template =
      templates[safeIndex] ||
      templates[0] ||
      { name: "Strict no-control", text: DS.DEFAULT_OOC_TEMPLATE };

    const resolved = DS.resolveOocTemplate(template);

    DS.insertOocText(resolved);

    DS.setQuickStatus?.(
      `Inserted ${template.name || "OOC"} for ${DS.detectOocUserName()}.`
    );
  };

  function templateLabel(template, index) {
    if (template && typeof template === "object") {
      const name = cleanName(template.name);
      if (name) return name.slice(0, 34);

      template = template.text;
    }

    const text = cleanName(template)
      .replace(/^\[OOC:\s*/i, "")
      .replace(/\]$/g, "")
      .trim();

    if (!text || text === ":") {
      return `OOC ${index + 1}`;
    }

    return text.slice(0, 34);
  }

  function ensureOocPanel() {
    const panel = document.getElementById("ds-qol-panel");
    if (!panel) return;

    const body = panel.querySelector(".ds-qol-body");
    if (!body) return;

    let row = document.getElementById("ds-qol-ooc-row");

    if (
      !DS.isSingleChatPage() ||
      DS.state.settings.showOocTools === false ||
      DS.state.settings.quickPanelShowOoc === false
    ) {
      row?.remove();
      return;
    }

    const templates = DS.getOocTemplates();
    const signature = JSON.stringify(templates);

    if (!row) {
      row = document.createElement("div");
      row.id = "ds-qol-ooc-row";
      row.className = "ds-qol-ooc-card";
      DS.setSafeMarkup(row, `
        <div class="ds-qol-mini-label">OOC message</div>
        <div class="ds-qol-ooc-controls">
          <select id="ds-qol-ooc-select" title="OOC template"></select>
          <button id="ds-qol-insert-ooc" type="button">Insert</button>
        </div>
      `);

      body.appendChild(row);

      row
        .querySelector("#ds-qol-insert-ooc")
        .addEventListener("click", () => {
          const select =
            document.getElementById("ds-qol-ooc-select");

          DS.insertOocTemplate(
            Number(select?.value || 0)
          );
        });

      row
        .querySelector("#ds-qol-ooc-select")
        .addEventListener("change", event => {
          writeSelectedOocIndex(Number(event.target?.value || 0));
        });
    }

    const select = row.querySelector("#ds-qol-ooc-select");
    const insertButton = row.querySelector("#ds-qol-insert-ooc");
    if (!select || !insertButton) return;

    const singleTemplate = templates.length <= 1;
    if (select.hidden !== singleTemplate) select.hidden = singleTemplate;
    DS.setTextIfChanged?.(insertButton, singleTemplate ? "Insert OOC" : "Insert");
    DS.setAttributeIfChanged?.(insertButton, "title", singleTemplate
      ? `Insert ${templateLabel(templates[0], 0)}`
      : "Insert selected OOC template");

    if (singleTemplate) {
      if (select.value !== "0") select.value = "0";
      writeSelectedOocIndex(0);
      DS.setDatasetIfChanged?.(select, "dsTemplateSignature", signature);
      return;
    }

    if (select.dataset.dsTemplateSignature !== signature) {
      const current = select.value;

      const options = templates.map((template, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = templateLabel(template, index);
        return option;
      });
      select.replaceChildren(...options);

      if (
        [...select.options].some(option => option.value === current)
      ) {
        select.value = current;
      } else {
        select.value = String(Math.min(readSelectedOocIndex(), Math.max(0, templates.length - 1)));
      }

      writeSelectedOocIndex(Number(select.value || 0));
      select.dataset.dsTemplateSignature = signature;
    }
  }

  DS.ensureOocPanel = ensureOocPanel;

  DS.applyOocTools = function applyOocTools() {
    if (!DS.state.settings.enabled) return;

    ensureOocPanel();
  };
})();
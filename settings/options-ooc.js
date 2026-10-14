// OOC Settings helpers: reusable template normalization, edits and rendering.
// Loaded before options.js; no work is started until the OOC controls are used.
function oocNameFromText(text, index = 0) {
  const clean = String(text || "")
    .replace(/^\s*\[?OOC\s*:?\s*/i, "")
    .replace(/\]?\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean || clean === ":") return `OOC ${index + 1}`;
  return clean.length > 28 ? `${clean.slice(0, 28)}...` : clean;
}

function templatesToArray(raw) {
  return String(raw || "")
    .split(/\n\s*---\s*\n/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function normalizeOocTemplates(input) {
  let items = [];

  if (Array.isArray(input)) {
    items = input;
  } else if (typeof input === "string" && input.trim()) {
    items = templatesToArray(input);
  }

  if (!items.length) {
    items = [
      { id: DEFAULT_OOC_TEMPLATE_ID, name: "Strict no-control", text: DEFAULT_OOC_TEMPLATE, builtIn: true },
      { id: HARD_OOC_TEMPLATE_ID, name: "Hard no-control + formatting", text: HARD_OOC_TEMPLATE, builtIn: true }
    ];
  }

  return items
    .map((item, index) => {
      if (typeof item === "string") {
        let text = item.trim();
        if (!text) return null;
        if (text === OLD_DEFAULT_OOC_TEMPLATE) text = DEFAULT_OOC_TEMPLATE;

        return {
          id: `ooc-${Date.now()}-${index}`,
          name: oocNameFromText(text, index),
          text
        };
      }

      if (!item || typeof item !== "object") return null;

      let text = String(item.text || item.body || item.value || "").trim();
      if (!text) return null;
      if (text === OLD_DEFAULT_OOC_TEMPLATE) text = DEFAULT_OOC_TEMPLATE;

      return {
        id: String(item.id || `ooc-${Date.now()}-${index}`),
        name: String(item.name || item.title || "").trim() || oocNameFromText(text, index),
        text,
        builtIn: item.builtIn === true
      };
    })
    .filter(Boolean);
}

function oocTemplatesFromPage() {
  const rows = [...document.querySelectorAll(".ooc-template-card")];

  return normalizeOocTemplates(
    rows.map((row, index) => ({
      id: row.dataset.oocId || `ooc-${Date.now()}-${index}`,
      name: row.querySelector(".ooc-template-name")?.value?.trim() || `OOC ${index + 1}`,
      text: row.querySelector(".ooc-template-text")?.value?.trim() || ""
    }))
  );
}

function oocInnerBody(value) {
  const text = String(value || "").trim();
  const match = text.match(/^\[OOC\s*:\s*([\s\S]*?)\]$/i);
  return match ? match[1].trim() : text;
}

function appendOocRules(baseValue, additionValue) {
  const base = String(baseValue || "").trim();
  const additionBody = oocInnerBody(additionValue);
  if (!additionBody) return base;
  const baseBody = oocInnerBody(base);
  const norm = value => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(baseBody).includes(norm(additionBody))) return base;
  if (!baseBody) return `[OOC: ${additionBody}]`;
  if (/^\[OOC\s*:/i.test(base) && /\]$/.test(base)) return `[OOC: ${baseBody} ${additionBody}]`;
  return `${base}\n\n[OOC: ${additionBody}]`;
}

function renderOocTemplates(templates) {
  const host = $("oocTemplateList");
  if (!host) return;

  const normalized = normalizeOocTemplates(templates);
  const cards = normalized.map(template => {
    const card = makeElement("div", {
      className: "ooc-template-card",
      dataset: { oocId: template.id }
    });

    const head = makeElement("div", { className: "ooc-template-head" });
    const nameLabel = makeElement("label", {}, [document.createTextNode("Name")]);
    const nameInput = makeElement("input", {
      className: "ooc-template-name",
      attrs: { type: "text", placeholder: "Example: Strict no-control" }
    });
    nameInput.value = template.name;
    nameLabel.appendChild(nameInput);

    const appendHard = makeElement("button", {
      className: "ooc-template-append-hard",
      text: "+ Hard rules",
      attrs: { type: "button", title: "Append the built-in hard no-control and formatting rules without replacing this OOC" }
    });
    if (template.id === HARD_OOC_TEMPLATE_ID || template.text === HARD_OOC_TEMPLATE) appendHard.hidden = true;

    const remove = makeElement("button", {
      className: "ooc-template-remove",
      text: "×",
      attrs: { type: "button", title: "Remove this OOC" }
    });
    head.append(nameLabel, appendHard, remove);

    const textLabel = makeElement("label", {}, [document.createTextNode("Text")]);
    const textarea = makeElement("textarea", {
      className: "ooc-template-text",
      attrs: { spellcheck: "false", placeholder: "[OOC: ...]" }
    });
    textarea.value = template.text;
    textLabel.appendChild(textarea);

    card.append(head, textLabel);
    return card;
  });

  host.replaceChildren(...cards);

  host.querySelectorAll(".ooc-template-append-hard").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".ooc-template-card");
      const textarea = card?.querySelector(".ooc-template-text");
      if (!textarea) return;
      const next = appendOocRules(textarea.value, HARD_OOC_TEMPLATE);
      if (next === textarea.value) {
        showSettingsToast("Those hard OOC rules are already present.");
        return;
      }
      textarea.value = next;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      showSettingsToast("Hard OOC rules appended without replacing your existing text.");
    });
  });

  host.querySelectorAll(".ooc-template-remove").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".ooc-template-card")?.remove();

      if (!host.querySelector(".ooc-template-card")) {
        renderOocTemplates([{ name: "Blank OOC", text: "[OOC: ]" }]);
      }
    });
  });
}

function addOocTemplate() {
  const current = oocTemplatesFromPage();
  current.push({ id: `ooc-${Date.now()}`, name: `OOC ${current.length + 1}`, text: "[OOC: ]" });
  renderOocTemplates(current);
}



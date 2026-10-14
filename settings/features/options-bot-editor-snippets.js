// Feature-owned options helpers: bot-editor-snippets. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeBotEditorSnippets(input) {
  if (!Array.isArray(input)) return [];

  const seen = new Set();
  const snippets = [];

  input.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const name = String(item.name || item.title || `Snippet ${index + 1}`).trim();
    const text = String(item.text || item.value || "").trim();
    if (!name || !text) return;

    const key = `${name.toLowerCase()}\n${text}`;
    if (seen.has(key)) return;
    seen.add(key);

    snippets.push({
      id: String(item.id || `snippet-${Date.now()}-${index}`),
      name,
      text
    });
  });

  return snippets;
}

function rawBotEditorSnippetsFromPage() {
  return [...document.querySelectorAll(".bot-editor-snippet-card")].map((row, index) => ({
    id: row.dataset.snippetId || `snippet-${Date.now()}-${index}`,
    name: row.querySelector(".bot-editor-snippet-name")?.value || "",
    text: row.querySelector(".bot-editor-snippet-text")?.value || ""
  }));
}

function botEditorSnippetsFromPage() {
  return normalizeBotEditorSnippets(rawBotEditorSnippetsFromPage());
}

function snippetCardElement(snippet) {
  const card = makeElement("div", {
    className: "bot-editor-snippet-card",
    dataset: { snippetId: snippet.id }
  });

  const head = makeElement("div", { className: "ooc-template-head" });
  const nameLabel = makeElement("label", {}, [document.createTextNode("Button name")]);
  const nameInput = makeElement("input", {
    className: "bot-editor-snippet-name",
    attrs: { type: "text", placeholder: "Example: Writing rule" }
  });
  nameInput.value = snippet.name;
  nameLabel.appendChild(nameInput);

  const remove = makeElement("button", {
    className: "bot-editor-snippet-remove",
    text: "×",
    attrs: { type: "button", title: "Remove this snippet" }
  });
  head.append(nameLabel, remove);

  const textLabel = makeElement("label", {}, [document.createTextNode("Text to insert")]);
  const textarea = makeElement("textarea", {
    className: "bot-editor-snippet-text",
    attrs: { spellcheck: "false", placeholder: "Text inserted at the cursor" }
  });
  textarea.value = snippet.text;
  textLabel.appendChild(textarea);

  card.append(head, textLabel);
  return card;
}

function bindBotEditorSnippetRemoveButtons() {
  const host = $("botEditorSnippetList");
  if (!host) return;

  host.querySelectorAll(".bot-editor-snippet-remove").forEach(button => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      button.closest(".bot-editor-snippet-card")?.remove();
      if (!host.querySelector(".bot-editor-snippet-card")) {
        setEmptyState(host, "No custom snippets saved yet.");
      }
    });
  });
}

function renderBotEditorSnippets(input) {
  const host = $("botEditorSnippetList");
  if (!host) return;

  const snippets = normalizeBotEditorSnippets(input);
  if (!snippets.length) {
    setEmptyState(host, "No custom snippets saved yet.");
    return;
  }

  host.replaceChildren(...snippets.map(snippetCardElement));
  bindBotEditorSnippetRemoveButtons();
}

function addBotEditorSnippet() {
  const host = $("botEditorSnippetList");
  if (!host) return;

  host.querySelector(".bot-manager-empty")?.remove();
  const snippet = {
    id: `snippet-${Date.now()}`,
    name: `Snippet ${host.querySelectorAll(".bot-editor-snippet-card").length + 1}`,
    text: ""
  };
  const card = snippetCardElement(snippet);
  host.appendChild(card);
  bindBotEditorSnippetRemoveButtons();
  card.querySelector(".bot-editor-snippet-name")?.focus();
}

function mergeBotEditorSnippetLists(...lists) {
  return normalizeBotEditorSnippets(lists.flatMap(list => Array.isArray(list) ? list : []));
}

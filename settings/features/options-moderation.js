// Feature-owned options helpers: moderation. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function parseModerationCustomTerms(valueText) {
  const seen = new Set();
  const output = [];
  for (const rawRow of String(valueText || "").split(/\n+/)) {
    const row = rawRow.replace(/\s+/g, " ").trim();
    if (!row) continue;
    const parts = row.split("|");
    const word = String(parts.shift() || "").trim().slice(0, 80);
    const group = String(parts.join("|") || "Custom").trim().slice(0, 40) || "Custom";
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    output.push({ word, group, custom: true });
    if (output.length >= 200) break;
  }
  return output;
}

function moderationData() {
  return {
    groups: MODERATION_MANAGER_GROUPS,
    balancedContextOnly: MODERATION_MANAGER_CONTEXT_ONLY,
    ageWords: MODERATION_MANAGER_AGE_WORDS,
    parseCustomTerms: parseModerationCustomTerms
  };
}

function splitLocalTerms(valueText) {
  return uniqueClean(String(valueText || "").split(/[\n,;]+/).map(item => String(item || "").trim().toLowerCase()).filter(Boolean));
}

function parsedCustomModerationTerms() {
  const parser = moderationData().parseCustomTerms;
  try { return typeof parser === "function" ? parser(value("creatorModerationWarningCustomTerms", "")) : []; }
  catch { return []; }
}

function serializeCustomModerationTerms(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => `${String(item?.word || "").trim()} | ${String(item?.group || "Custom").trim() || "Custom"}`)
    .filter(line => line.split("|")[0].trim())
    .join("\n");
}

function setModerationIgnoredSet(set) {
  const box = $("creatorModerationWarningIgnoredTerms");
  if (!box) return;
  box.value = [...set].sort((a, b) => a.localeCompare(b)).join("\n");
  renderModerationTermManager();
}

function moderationManagerEntries() {
  const data = moderationData();
  const contextOnly = new Set([...(data.balancedContextOnly || []), ...(data.ageWords || [])].map(item => String(item).toLowerCase()));
  const entries = [];
  for (const [group, words] of Object.entries(data.groups || {})) {
    for (const word of words || []) entries.push({ word: String(word), group, custom: false, contextual: contextOnly.has(String(word).toLowerCase()) });
  }
  for (const item of parsedCustomModerationTerms()) entries.push({ word: item.word, group: item.group || "Custom", custom: true, contextual: false });
  const seen = new Set();
  return entries.filter(item => {
    const key = `${item.group}\n${item.word}`.toLowerCase();
    if (!item.word || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderModerationTermManager() {
  const host = $("moderationTermList");
  if (!host) return;
  const entries = moderationManagerEntries();
  const ignored = new Set(splitLocalTerms(value("creatorModerationWarningIgnoredTerms", "")));
  const search = value("moderationTermSearch", "").trim().toLowerCase();
  const groupFilter = value("moderationTermCategory", "all");
  const stateFilter = value("moderationTermState", "all");

  const categorySelect = $("moderationTermCategory");
  if (categorySelect) {
    const current = categorySelect.value || "all";
    const categories = [...new Set(entries.map(item => item.group))].sort((a, b) => a.localeCompare(b));
    categorySelect.replaceChildren(makeElement("option", { text: "All categories", attrs: { value: "all" } }), ...categories.map(group => makeElement("option", { text: group, attrs: { value: group } })));
    categorySelect.value = categories.includes(current) ? current : "all";
  }

  const filtered = entries.filter(item => {
    const isIgnored = ignored.has(item.word.toLowerCase());
    if (search && !`${item.word} ${item.group}`.toLowerCase().includes(search)) return false;
    if (groupFilter !== "all" && item.group !== groupFilter) return false;
    if (stateFilter === "active" && isIgnored) return false;
    if (stateFilter === "ignored" && !isIgnored) return false;
    if (stateFilter === "community" && item.custom) return false;
    if (stateFilter === "custom" && !item.custom) return false;
    return true;
  }).sort((a, b) => a.group.localeCompare(b.group) || a.word.localeCompare(b.word));

  const customCount = entries.filter(item => item.custom).length;
  const ignoredCount = new Set(entries.filter(item => ignored.has(item.word.toLowerCase())).map(item => item.word.toLowerCase())).size;
  const summary = $("moderationTermSummary");
  if (summary) summary.textContent = `${entries.length} known term${entries.length === 1 ? "" : "s"} · ${customCount} custom · ${ignoredCount} ignored locally · showing ${filtered.length}`;

  if (!filtered.length) {
    host.replaceChildren(makeElement("div", { className: "bot-manager-empty", text: "No warning terms match these filters." }));
    return;
  }
  host.replaceChildren(...filtered.map(item => {
    const isIgnored = ignored.has(item.word.toLowerCase());
    const row = makeElement("div", { className: `moderation-term-row${isIgnored ? " is-ignored" : ""}` });
    const main = makeElement("div");
    main.appendChild(makeElement("div", { className: "moderation-term-word", text: item.word }));
    const meta = makeElement("div", { className: "moderation-term-meta" });
    meta.appendChild(makeElement("span", { text: item.group }));
    meta.appendChild(makeElement("span", { text: item.custom ? "Custom" : "Community" }));
    if (item.contextual) meta.appendChild(makeElement("span", { text: "Context-sensitive in Balanced" }));
    if (isIgnored) meta.appendChild(makeElement("span", { text: "Ignored locally" }));
    main.appendChild(meta);
    const actions = makeElement("div", { className: "moderation-term-actions" });
    const toggle = makeElement("button", { text: isIgnored ? "Enable" : "Ignore", attrs: { type: "button" } });
    toggle.addEventListener("click", () => {
      const next = new Set(splitLocalTerms(value("creatorModerationWarningIgnoredTerms", "")));
      const key = item.word.toLowerCase();
      if (next.has(key)) next.delete(key); else next.add(key);
      setModerationIgnoredSet(next);
      showSettingsToast(`${item.word}: ${isIgnored ? "enabled" : "ignored locally"}. Changes save automatically.`);
    });
    actions.appendChild(toggle);
    if (item.custom) {
      const remove = makeElement("button", { text: "Remove", attrs: { type: "button" } });
      remove.addEventListener("click", () => {
        const remaining = parsedCustomModerationTerms().filter(custom => custom.word.toLowerCase() !== item.word.toLowerCase());
        const box = $("creatorModerationWarningCustomTerms");
        if (box) box.value = serializeCustomModerationTerms(remaining);
        renderModerationTermManager();
        showSettingsToast(`${item.word}: custom warning removed. Changes save automatically.`);
      });
      actions.appendChild(remove);
    }
    row.append(main, actions);
    return row;
  }));
}

function setupModerationTermManager() {
  ["moderationTermSearch", "moderationTermCategory", "moderationTermState", "creatorModerationWarningIgnoredTerms", "creatorModerationWarningCustomTerms"].forEach(id => {
    $(id)?.addEventListener(id.includes("Search") || id.includes("Terms") ? "input" : "change", renderModerationTermManager);
  });
  $("clearModerationIgnoredTerms")?.addEventListener("click", () => {
    const box = $("creatorModerationWarningIgnoredTerms");
    if (box) box.value = "";
    renderModerationTermManager();
    showSettingsToast("Local moderation-warning ignores cleared. Changes save automatically.");
  });
  $("addModerationCustomTerm")?.addEventListener("click", () => {
    const termInput = $("moderationCustomTerm");
    const term = String(termInput?.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const group = value("moderationCustomCategory", "Custom").trim().slice(0, 40) || "Custom";
    if (!term) { showSettingsToast("Enter a custom warning term first."); return; }
    const current = parsedCustomModerationTerms();
    const existsAnywhere = moderationManagerEntries().some(item => item.word.toLowerCase() === term.toLowerCase());
    if (existsAnywhere) { showSettingsToast("That warning term already exists in the community or custom list."); return; }
    current.push({ word: term, group });
    const box = $("creatorModerationWarningCustomTerms");
    if (box) box.value = serializeCustomModerationTerms(current);
    if (termInput) termInput.value = "";
    renderModerationTermManager();
    showSettingsToast(`${term}: custom warning added. Changes save automatically.`);
  });
  $("moderationCustomTerm")?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    $("addModerationCustomTerm")?.click();
  });
  renderModerationTermManager();
}

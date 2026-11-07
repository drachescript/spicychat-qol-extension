// Feature-owned Settings for model-quick-access, never executes when omitted from Lite.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("model-quick-access")) return;
  const host = document.getElementById("ds-feature-panel-model-quick-access");
  if (!host) return;
  const section = document.createElement("section"); section.className = "card";
  const heading = document.createElement("h2"); heading.textContent = "Model Quick Access"; section.append(heading);
  const fields = [["enableModelQuickAccess", "Enable my ordered model shortcuts", "checkbox"], ["modelQuickAccessNames", "Quick models, one name per line, first = highest priority", "textarea"]];
  for (const [key, description, kind] of fields) {
    const label = document.createElement("label"); label.className = kind === "checkbox" ? "row" : "";
    const input = document.createElement(kind === "checkbox" ? "input" : "textarea"); input.id = key;
    if (kind === "checkbox") { input.type = "checkbox"; label.append(input); }
    const span = document.createElement("span"); span.textContent = description; label.append(span);
    if (kind !== "checkbox") label.append(input);
    section.append(label);
  }
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Add models using the + button in SpicyChat's model picker while this feature is enabled, or type names below. Move them into your preferred order here. Mobile native model rows are never rearranged."; section.append(hint);
  const orderedHost = document.createElement("div");
  orderedHost.id = "ds-model-quick-order";
  section.append(orderedHost);
  const namesInput = section.querySelector("#modelQuickAccessNames");
  const parse = () => [...new Map(String(namesInput?.value || "").split(/\r?\n/).map(name => name.trim()).filter(Boolean).map(name => [name.toLowerCase(), name])).values()];
  function updateNames(next) {
    if (!namesInput) return;
    namesInput.value = next.join("\n");
    namesInput.dispatchEvent(new Event("input", { bubbles: true }));
    namesInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function drawOrderedNames() {
    orderedHost.replaceChildren();
    const names = parse().slice(0, 30);
    if (!names.length) {
      const empty = document.createElement("p"); empty.className = "hint";
      empty.textContent = "No quick models selected yet."; orderedHost.append(empty);
      return;
    }
    names.forEach((name, index) => {
      const row = document.createElement("div"); row.className = "button-row";
      const text = document.createElement("span"); text.textContent = name;
      text.style.flex = "1";
      for (const [title, step] of [["Move up", -1], ["Move down", 1], ["Remove", null]]) {
        const button = document.createElement("button"); button.type = "button";
        button.textContent = step == null ? "Remove" : step < 0 ? "↑" : "↓";
        button.title = `${title}: ${name}`;
        button.disabled = step !== null && (index + step < 0 || index + step >= names.length);
        button.addEventListener("click", () => {
          const updated = parse();
          const at = updated.findIndex(item => item.toLowerCase() === name.toLowerCase());
          if (at < 0) return;
          if (step == null) updated.splice(at, 1);
          else if (at + step >= 0 && at + step < updated.length) [updated[at], updated[at + step]] = [updated[at + step], updated[at]];
          updateNames(updated); drawOrderedNames();
        });
        row.append(button);
      }
      row.prepend(text); orderedHost.append(row);
    });
  }
  namesInput?.addEventListener("input", drawOrderedNames);
  host.replaceWith(section);
  // Feature-owned Settings read handlers. The shared Settings controller never
  // needs to know the keys or defaults when this optional panel is excluded.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  readers["enableModelQuickAccess"] = () => !!document.getElementById("enableModelQuickAccess")?.checked;
  readers["modelQuickAccessNames"] = () => String(document.getElementById("modelQuickAccessNames")?.value || "");
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  loaders["enableModelQuickAccess"] = (settings) => { setChecked("enableModelQuickAccess", !!settings.enableModelQuickAccess); };
  loaders["modelQuickAccessNames"] = (settings) => { setValue("modelQuickAccessNames", settings.modelQuickAccessNames || ""); drawOrderedNames(); };
})();

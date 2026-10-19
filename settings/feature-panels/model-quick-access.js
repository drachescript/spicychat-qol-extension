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
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Uses native model actions. Models missing from the compact menu are opened through Explore All when available. Mobile native model rows are not rearranged."; section.append(hint);
  host.replaceWith(section);
})();

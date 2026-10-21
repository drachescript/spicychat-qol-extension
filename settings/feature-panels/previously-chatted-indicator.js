// Feature-owned Settings for previously-chatted-indicator, never executes when omitted from Lite.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("previously-chatted-indicator")) return;
  const host = document.getElementById("ds-feature-panel-previously-chatted-indicator");
  if (!host) return;
  const section = document.createElement("section"); section.className = "card";
  const heading = document.createElement("h2"); heading.textContent = "Previously Chatted Indicator"; section.append(heading);
  const fields = [["enablePreviouslyChattedIndicator", "Show an icon for bots with confirmed user messages", "checkbox"], ["chattedIndicatorShowOpened", "Also show a different mark for only opened/uncertain chats", "checkbox"]];
  for (const [key, description, kind] of fields) {
    const label = document.createElement("label"); label.className = kind === "checkbox" ? "row" : "";
    const input = document.createElement(kind === "checkbox" ? "input" : "textarea"); input.id = key;
    if (kind === "checkbox") { input.type = "checkbox"; label.append(input); }
    const span = document.createElement("span"); span.textContent = description; label.append(span);
    if (kind !== "checkbox") label.append(input);
    section.append(label);
  }
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Reuses saved chat metadata; opened does not mean messaged. No background rescans."; section.append(hint);
  host.replaceWith(section);
  // Feature-owned Settings read handlers. The shared Settings controller never
  // needs to know the keys or defaults when this optional panel is excluded.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  readers["enablePreviouslyChattedIndicator"] = () => !!document.getElementById("enablePreviouslyChattedIndicator")?.checked;
  readers["chattedIndicatorShowOpened"] = () => !!document.getElementById("chattedIndicatorShowOpened")?.checked;
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  loaders["enablePreviouslyChattedIndicator"] = (settings) => { setChecked("enablePreviouslyChattedIndicator", !!settings.enablePreviouslyChattedIndicator); };
  loaders["chattedIndicatorShowOpened"] = (settings) => { setChecked("chattedIndicatorShowOpened", !!settings.chattedIndicatorShowOpened); };
})();

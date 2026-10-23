// Feature-owned Settings for chat-lorebook-manager, never executes when omitted from Lite.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-lorebook-manager")) return;
  const host = document.getElementById("ds-feature-panel-chat-lorebook-manager");
  if (!host) return;
  const section = document.createElement("section"); section.className = "card";
  const heading = document.createElement("h2"); heading.textContent = "Chat Lorebook Manager"; section.append(heading);
  const fields = [["enableChatLorebookManager", "Enable local per-conversation Lorebook editing and To Lorebook actions", "checkbox"]];
  for (const [key, description, kind] of fields) {
    const label = document.createElement("label"); label.className = kind === "checkbox" ? "row" : "";
    const input = document.createElement(kind === "checkbox" ? "input" : "textarea"); input.id = key;
    if (kind === "checkbox") { input.type = "checkbox"; label.append(input); }
    const span = document.createElement("span"); span.textContent = description; label.append(span);
    if (kind !== "checkbox") label.append(input);
    section.append(label);
  }
  const suggestionLabel=document.createElement('label');suggestionLabel.className='row';
  const suggestionCheckbox=document.createElement('input');suggestionCheckbox.type='checkbox';suggestionCheckbox.id='enableContextLorebookSuggestions';
  suggestionLabel.append(suggestionCheckbox,document.createTextNode('Enable reviewed Context Keeper → local Lorebook suggestions (OFF by default)'));
  section.append(suggestionLabel);
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Save, edit, activate/deactivate, pin, test keywords and export local entries. Native Lorebook publishing remains an explicit reviewed handoff."; section.append(hint);
  host.replaceWith(section);
  // Feature-owned Settings read handlers. The shared Settings controller never
  // needs to know the keys or defaults when this optional panel is excluded.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  readers["enableChatLorebookManager"] = () => !!document.getElementById("enableChatLorebookManager")?.checked;
  readers.enableContextLorebookSuggestions=()=>!!document.getElementById('enableContextLorebookSuggestions')?.checked;
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  loaders.enableContextLorebookSuggestions=s=>{const box=document.getElementById('enableContextLorebookSuggestions');if(box)box.checked=s.enableContextLorebookSuggestions===true;};
  loaders["enableChatLorebookManager"] = (settings) => { setChecked("enableChatLorebookManager", !!settings.enableChatLorebookManager); };
})();

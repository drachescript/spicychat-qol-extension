// Feature-owned Settings for chat-lorebook-manager, never executes when omitted from Lite.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-lorebook-manager")) return;
  const host = document.getElementById("ds-feature-panel-chat-lorebook-manager");
  if (!host) return;
  const section = document.createElement("section"); section.className = "card";
  const heading = document.createElement("h2"); heading.textContent = "Chat Lorebook Manager"; section.append(heading);
  const experiment = document.createElement('p');experiment.className = 'hint';
  experiment.textContent = 'Experimental — test this with a spare conversation first. Review entries and keep a backup.';
  section.append(experiment);
  const fields = [["enableChatLorebookManager", "Enable a local Lorebook for each conversation", "checkbox"]];
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
  suggestionLabel.append(suggestionCheckbox,document.createTextNode('Suggest Lorebook entries from reviewed Context Keeper facts (OFF by default)'));
  section.append(suggestionLabel);
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = "Edit, pin, turn entries on/off and test their keywords here. These are local entries; they won\'t change a native SpicyChat Lorebook unless you review and save them separately."; section.append(hint);
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

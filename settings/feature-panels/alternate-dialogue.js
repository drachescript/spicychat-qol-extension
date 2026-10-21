// Settings panel owned by alternate-dialogue. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("alternate-dialogue")) return;
  const host = document.getElementById("ds-feature-panel-alternate-dialogue");
  if (!host) return;
  const make = (entry) => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attributes, ...children] = entry;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) continue;
      node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(make(child));
    return node;
  };
  host.replaceWith(make(["section",{"class":"card","id":"alternateDialogueCard"},"\n",["h2",{},"Alternate dialogue styling"],"\n",["label",{"class":"row"},["input",{"id":"styleAlternateDialogue","type":"checkbox"}],["span",{},"Style backtick / inline-code dialogue"]],"\n",["p",{"class":"hint"},"Useful for texting, thoughts, telepathy, radio/comms, or other dialogue wrapped in backticks. QoL scopes this to the actual message body so /cmd/OOC directive UI is left alone. The three color pickers below only apply while Use custom backtick colors is checked."],"\n",["label",{},"Apply to\n          ",["select",{"id":"alternateDialogueScope"},"\n",["option",{"value":"ai"},"AI messages only"],"\n",["option",{"value":"user"},"My messages only"],"\n",["option",{"value":"both"},"AI + my messages"],"\n"],"\n"],"\n",["label",{},"Backtick style\n          ",["select",{"id":"alternateDialogueStyle"},"\n",["option",{"value":"dialogue"},"Dialogue highlight"],"\n",["option",{"value":"texting"},"Texting / comms"],"\n",["option",{"value":"thoughts"},"Thoughts / telepathy"],"\n",["option",{"value":"subtle"},"Subtle inline box"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"alternateDialogueCustomColors","type":"checkbox"}],["span",{},"Use custom backtick colors"]],"\n",["label",{},"Text color ",["input",{"id":"alternateDialogueTextColor","type":"color","value":"#f4d35e"}]],"\n",["label",{},"Background color ",["input",{"id":"alternateDialogueBackgroundColor","type":"color","value":"#1f2430"}]],"\n",["label",{},"Border color ",["input",{"id":"alternateDialogueBorderColor","type":"color","value":"#596273"}]],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["styleAlternateDialogue"] = () => (checked("styleAlternateDialogue"));
  loaders["styleAlternateDialogue"] = (settings) => { setChecked("styleAlternateDialogue", !!settings.styleAlternateDialogue); };
  readers["alternateDialogueScope"] = () => (["ai", "user", "both"].includes(value("alternateDialogueScope")) ? value("alternateDialogueScope") : "ai");
  loaders["alternateDialogueScope"] = (settings) => { setValue("alternateDialogueScope", ["ai", "user", "both"].includes(settings.alternateDialogueScope) ? settings.alternateDialogueScope : "ai"); };
  readers["alternateDialogueStyle"] = () => (value("alternateDialogueStyle", "dialogue"));
  loaders["alternateDialogueStyle"] = (settings) => { setValue("alternateDialogueStyle", settings.alternateDialogueStyle || "dialogue"); };
  readers["alternateDialogueCustomColors"] = () => (checked("alternateDialogueCustomColors"));
  loaders["alternateDialogueCustomColors"] = (settings) => { setChecked("alternateDialogueCustomColors", !!settings.alternateDialogueCustomColors); };
  readers["alternateDialogueTextColor"] = () => (value("alternateDialogueTextColor", "#f4d35e"));
  loaders["alternateDialogueTextColor"] = (settings) => { setValue("alternateDialogueTextColor", settings.alternateDialogueTextColor || "#f4d35e"); };
  readers["alternateDialogueBackgroundColor"] = () => (value("alternateDialogueBackgroundColor", "#1f2430"));
  loaders["alternateDialogueBackgroundColor"] = (settings) => { setValue("alternateDialogueBackgroundColor", settings.alternateDialogueBackgroundColor || "#1f2430"); };
  readers["alternateDialogueBorderColor"] = () => (value("alternateDialogueBorderColor", "#596273"));
  loaders["alternateDialogueBorderColor"] = (settings) => { setValue("alternateDialogueBorderColor", settings.alternateDialogueBorderColor || "#596273"); };

})();

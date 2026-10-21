// Settings panel owned by command-palette. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("command-palette")) return;
  const host = document.getElementById("ds-feature-panel-command-palette");
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
  host.replaceWith(make(["section",{"class":"card","id":"commandPaletteCard"},"\n",["h2",{},"Command Palette"],"\n",["label",{"class":"row"},["input",{"id":"enableCommandPalette","type":"checkbox"}],["span",{},"Enable the QoL Command Palette on SpicyChat"]],"\n",["label",{},"Shortcut",["select",{"id":"commandPaletteShortcut"},["option",{"value":"ctrl-k"},"Ctrl/Cmd + K"],["option",{"value":"ctrl-shift-k"},"Ctrl/Cmd + Shift + K"],["option",{"value":"alt-k"},"Alt + K"],["option",{"value":"off"},"No keyboard shortcut"]]],"\n",["label",{"class":"row"},["input",{"id":"commandPaletteShowSavedItems","type":"checkbox"}],["span",{},"Include saved bots, Lorebooks and personas in palette search"]],"\n",["p",{"class":"hint"},"Searches QoL actions with fuzzy/typo-friendly matching. Pin frequently used results with the star; recent actions are ranked higher automatically. The shortcut only works on SpicyChat pages and does not change browser-level shortcuts."],"\n",["div",{"class":"button-row"},["button",{"id":"openCommandPaletteFromOptions","type":"button"},"Open palette in source tab"],["button",{"id":"clearCommandPaletteHistory","type":"button"},"Clear palette pins/recent"]],"\n",["p",{"class":"hint","id":"commandPaletteStatus"}],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableCommandPalette"] = () => (checked("enableCommandPalette", false));
  loaders["enableCommandPalette"] = (settings) => { setChecked("enableCommandPalette", !!settings.enableCommandPalette); };
  readers["commandPaletteShortcut"] = () => (["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(value("commandPaletteShortcut")) ? value("commandPaletteShortcut") : "ctrl-k");
  loaders["commandPaletteShortcut"] = (settings) => { setValue("commandPaletteShortcut", ["ctrl-k", "ctrl-shift-k", "alt-k", "off"].includes(settings.commandPaletteShortcut) ? settings.commandPaletteShortcut : "ctrl-k"); };
  readers["commandPaletteShowSavedItems"] = () => (checked("commandPaletteShowSavedItems", true));
  loaders["commandPaletteShowSavedItems"] = (settings) => { setChecked("commandPaletteShowSavedItems", settings.commandPaletteShowSavedItems !== false); };

})();

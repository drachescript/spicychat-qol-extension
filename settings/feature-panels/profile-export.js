// Settings panel owned by profile-export. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("profile-export")) return;
  const host = document.getElementById("ds-feature-panel-profile-export");
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
  host.replaceWith(make(["section",{"class":"card","id":"profileExportCard"},"\n",["h2",{},"Bot / profile export"],"\n",["label",{"class":"row"},["input",{"id":"enableProfileExport","type":"checkbox"}],["span",{},"Add Export to bot profile pages"]],"\n",["p",{"class":"hint"},"Exports only fields the current public profile actually exposes. Available formats: JSON, Markdown, and a standalone HTML archive. QoL does not guess hidden Personality/Scenario/Example Dialogue fields on Greeting-only profiles."],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableProfileExport"] = () => (checked("enableProfileExport"));
  loaders["enableProfileExport"] = (settings) => { setChecked("enableProfileExport", !!settings.enableProfileExport); };

})();

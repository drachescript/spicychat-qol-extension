// rulebook-diagnostics: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("rulebook-diagnostics")) return;
  const host = document.getElementById("ds-feature-panel-rulebook-diagnostics");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"rulebookDiagnosticsCard"},["h2",{},"Rulebook troubleshooting"],"\n",["label",{"class":"row"},["input",{"id":"enableRulebookDiagnostics","type":"checkbox"}],["span",{},"Show a read-only Rulebook log in chats"]],"\n",["p",{"class":"hint"},"Record visible Rulebook meter changes in this tab for troubleshooting (up to 150). Hidden rules are not read and Rulebook values are not changed."]]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableRulebookDiagnostics"] = () => checked("enableRulebookDiagnostics");
  loaders["enableRulebookDiagnostics"] = settings => { setChecked("enableRulebookDiagnostics", !!settings.enableRulebookDiagnostics); };
})();

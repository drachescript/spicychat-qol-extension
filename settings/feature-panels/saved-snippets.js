// saved-snippets: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("saved-snippets")) return;
  const host = document.getElementById("ds-feature-panel-saved-snippets");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"savedSnippetsCard"},"\n",["h2",{},"Saved Text / Snippets"],"\n",["label",{"class":"row"},["input",{"id":"enableSavedTextSnippets","type":"checkbox"}],["span",{},"Enable Saved Snippets in chats"]],"\n",["p",{"class":"hint"},"Save, search and insert reusable chat text from the QoL panel."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableSavedTextSnippets"] = () => checked("enableSavedTextSnippets");
  loaders["enableSavedTextSnippets"] = settings => { setChecked("enableSavedTextSnippets", !!settings.enableSavedTextSnippets); };
})();

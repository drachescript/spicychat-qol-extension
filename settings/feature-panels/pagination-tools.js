// pagination-tools: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("pagination-tools")) return;
  const host = document.getElementById("ds-feature-panel-pagination-tools");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},["h2",{},"Pagination shortcuts"],"\n",["label",{"class":"row"},["input",{"id":"paginationTopJumpBox","type":"checkbox"}],["span",{},"Show a page-number box above chatbot listings"]],"\n",["label",{"class":"row"},["input",{"id":"paginationQuickJumpMenu","type":"checkbox"}],["span",{},"Show a quick page-jump dropdown beside bottom pagination"]],"\n",["p",{"class":"hint"},"Use page-number shortcuts, estimated last page and optional Random page in pagination."]]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["paginationTopJumpBox"] = () => checked("paginationTopJumpBox");
  loaders["paginationTopJumpBox"] = settings => { setChecked("paginationTopJumpBox", !!settings.paginationTopJumpBox); };
  readers["paginationQuickJumpMenu"] = () => checked("paginationQuickJumpMenu");
  loaders["paginationQuickJumpMenu"] = settings => { setChecked("paginationQuickJumpMenu", !!settings.paginationQuickJumpMenu); };
})();

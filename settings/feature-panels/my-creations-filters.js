// my-creations-filters: Settings markup, load and save handlers for this feature.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("my-creations-filters")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-my-creations-filters")) return;
  { const host = document.getElementById("ds-feature-panel-my-creations-filters"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"My Creations filters"],"\n",["label",{"class":"row"},["input",{"id":"showBlockButtonOnMyCreations","type":"checkbox"}],["span",{},"Also show the block X on My Creations"]],"\n",["label",{"class":"row"},["input",{"id":"enableMyCreationsFilters","type":"checkbox"}],["span",{},"Enable My Creations filters"]],"\n",["label",{"class":"row"},["input",{"id":"rememberMyCreationsView","type":"checkbox"}],["span",{},"Remember My Creations sort/filter choices after reloads and returning to the page"]],"\n",["label",{"class":"row"},["input",{"id":"autoLoadMyCreations","type":"checkbox"}],["span",{},"Automatically load more bots on My Creations"]],"\n",["label",{},"Extra My Creations pages to auto-load",["input",{"id":"myCreationsAutoLoadPages","max":"30","min":"1","step":"1","type":"number","value":"1"}]],"\n",["p",{"class":"hint"},"Load extra My Creations pages with SpicyChat’s normal Load More button. Stops when no more bots appear."],"\n",["p",{"class":"hint"},"Filter loaded My Chatbots cards by visibility, messages, Lorebooks, definition and tokens. No public data is changed."],"\n",["p",{"class":"hint"},"Remember My Chatbots sorting without changing unsupported or removed sort options."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["showBlockButtonOnMyCreations"] = () => checked("showBlockButtonOnMyCreations");
  loaders["showBlockButtonOnMyCreations"] = settings => { setChecked("showBlockButtonOnMyCreations", !!settings.showBlockButtonOnMyCreations); };
  readers["enableMyCreationsFilters"] = () => checked("enableMyCreationsFilters");
  loaders["enableMyCreationsFilters"] = settings => { setChecked("enableMyCreationsFilters", !!settings.enableMyCreationsFilters); };
  readers["rememberMyCreationsView"] = () => checked("rememberMyCreationsView");
  loaders["rememberMyCreationsView"] = settings => { setChecked("rememberMyCreationsView", !!settings.rememberMyCreationsView); };
  readers["autoLoadMyCreations"] = () => checked("autoLoadMyCreations");
  loaders["autoLoadMyCreations"] = settings => { setChecked("autoLoadMyCreations", !!settings.autoLoadMyCreations); };
  readers["myCreationsAutoLoadPages"] = () => Math.max(1, Math.min(30, Number(value("myCreationsAutoLoadPages", "1")) || 1));
  loaders["myCreationsAutoLoadPages"] = settings => { setValue("myCreationsAutoLoadPages", String(Math.max(1, Math.min(30, Number(settings.myCreationsAutoLoadPages) || 1)))); };
})();

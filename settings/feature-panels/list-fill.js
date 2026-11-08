// list-fill: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("list-fill")) return;
  const host = document.getElementById("ds-feature-panel-list-fill");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},["h2",{},"Listing refill"],"\n",["p",{"class":"hint"},"When filters hide too many bots, QoL can check later pages for more matches. It uses a temporary inactive tab on desktop and is currently off on mobile."],"\n",["label",{"class":"row"},["input",{"id":"autoFillListings","type":"checkbox"}],["span",{},"Enable Listing Refill"]],"\n",["label",{},"Target visible cards",["input",{"id":"autoFillTargetCards","max":"200","min":"1","step":"1","type":"number"}]],"\n",["label",{},"Max extra pages / Load More attempts per listing",["input",{"id":"autoFillMaxClicks","max":"30","min":"1","step":"1","type":"number"}]],"\n",["p",{"class":"hint"},"Refill filtered lists from later pages, skipping duplicates. Target 50–200 visible cards; a helper tab closes automatically."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["autoFillListings"] = () => checked("autoFillListings");
  loaders["autoFillListings"] = settings => { setChecked("autoFillListings", settings.autoFillListings); };
  readers["autoFillTargetCards"] = () => Math.max(1, Math.min(200, Number(value("autoFillTargetCards", "50")) || 50));
  loaders["autoFillTargetCards"] = settings => { setValue("autoFillTargetCards", String(settings.autoFillTargetCards || 50)); };
  readers["autoFillMaxClicks"] = () => Math.max(1, Math.min(30, Number(value("autoFillMaxClicks", "8")) || 8));
  loaders["autoFillMaxClicks"] = settings => { setValue("autoFillMaxClicks", String(settings.autoFillMaxClicks || 8)); };
})();

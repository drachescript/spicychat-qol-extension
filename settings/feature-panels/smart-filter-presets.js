// smart-filter-presets: Settings markup, load and save handlers for this feature.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("smart-filter-presets")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-smart-filter-presets")) return;
  { const host = document.getElementById("ds-feature-panel-smart-filter-presets"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Smart filter presets"],"\n",["label",{"class":"row"},["input",{"id":"enableSmartFilterPresets","type":"checkbox"}],["span",{},"Enable Smart Filter Presets"]],"\n",["p",{"class":"hint"},"Save or reuse filter combinations, including include/exclude choices for Favorites, Later, Lorebooks and followed creators."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableSmartFilterPresets"] = () => checked("enableSmartFilterPresets");
  loaders["enableSmartFilterPresets"] = settings => { setChecked("enableSmartFilterPresets", !!settings.enableSmartFilterPresets); };
})();

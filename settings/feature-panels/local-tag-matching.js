// local-tag-matching: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("local-tag-matching")) return;
  const host = document.getElementById("ds-feature-panel-local-tag-matching");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Personal tags from bot text"],"\n",["div",{"class":"sub-card"},"\n","\n",["label",{"class":"row"},["input",{"id":"localTagMatchEnabled","type":"checkbox"}],["span",{},"Automatically add personal tags when matching bot text is found"]],"\n",["label",{},"Local match rules, one per line",["textarea",{"id":"localTagMatchRules","rows":"6","spellcheck":"false","placeholder":"Scat => title,greeting,description: scat, defecat*, feces, poop\nWerewolf => title,description,greeting: werewolf, lycanthrope\nMonster => greeting,scenario: monster girl, beastfolk"}]],"\n",["label",{"class":"row"},["input",{"id":"localTagMatchFetchPublic","type":"checkbox"}],["span",{},"Check public bot profiles for greeting/details not already saved (slower)"]],"\n",["p",{"class":"hint"},"Rules: personal tag => fields: matching words. Commas match any phrase; a trailing * matches word endings. Tags stay local and do not scan private editors."],"\n"],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["localTagMatchEnabled"] = () => checked("localTagMatchEnabled");
  loaders["localTagMatchEnabled"] = settings => { setChecked("localTagMatchEnabled", !!settings.localTagMatchEnabled); };
  readers["localTagMatchRules"] = () => value("localTagMatchRules");
  loaders["localTagMatchRules"] = settings => { setValue("localTagMatchRules", settings.localTagMatchRules || ""); };
  readers["localTagMatchFetchPublic"] = () => checked("localTagMatchFetchPublic");
  loaders["localTagMatchFetchPublic"] = settings => { setChecked("localTagMatchFetchPublic", !!settings.localTagMatchFetchPublic); };
})();

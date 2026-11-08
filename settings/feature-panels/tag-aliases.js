// tag-aliases: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("tag-aliases")) return;
  const host = document.getElementById("ds-feature-panel-tag-aliases");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"tagAliasesCard"},"\n",["h2",{},"Local tag aliases / emoji"],"\n",["label",{"class":"row"},["input",{"id":"enableTagAliases","type":"checkbox"}],["span",{},"Enable local tag aliases and emoji display helpers"]],"\n",["label",{"class":"row"},["input",{"id":"tagAliasShowDisplay","type":"checkbox"}],["span",{},"Show alias mapping beside matching visible tag chips"]],"\n",["label",{},"Aliases, one per line",["textarea",{"id":"tagAliasRules","rows":"6","spellcheck":"false","placeholder":"wlw => FemalePOV | 🌈\npoly => Multiple Characters | 👥\nmyth => Fantasy | ✨"}]],"\n",["p",{"class":"hint"},"Aliases are local and never change SpicyChat tags. Format: alias => exact tag | optional emoji."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableTagAliases"] = () => checked("enableTagAliases");
  loaders["enableTagAliases"] = settings => { setChecked("enableTagAliases", !!settings.enableTagAliases); };
  readers["tagAliasRules"] = () => value("tagAliasRules");
  loaders["tagAliasRules"] = settings => { setValue("tagAliasRules", settings.tagAliasRules || ""); };
  readers["tagAliasShowDisplay"] = () => checked("tagAliasShowDisplay");
  loaders["tagAliasShowDisplay"] = settings => { setChecked("tagAliasShowDisplay", settings.tagAliasShowDisplay !== false); };
})();

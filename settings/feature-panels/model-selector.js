// Settings panel and persistence owned by model-selector; omitted Custom features leave no live controls.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("model-selector")) return;
  const host = document.getElementById('ds-feature-panel-model-selector');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Model quick menu"],"\n",["label",{"class":"row"},["input",{"id":"customizeModelQuickMenu","type":"checkbox"}],["span",{},"Customize model menus + favorite hearts"]],"\n",["label",{"class":"row"},["input",{"id":"modelQuickFavoritesOnly","type":"checkbox"}],["span",{},"Show only favorite models in the quick menu"]],"\n",["label",{},"Favorite models, one per line",["textarea",{"id":"modelFavoriteNames","placeholder":"Qwen Plus Character\nSpicyXL 132B","spellcheck":"false"}]],"\n",["label",{},"Models to hide, one per line",["textarea",{"id":"modelHiddenNames","placeholder":"A model I never use","spellcheck":"false"}]],"\n",["p",{"class":"hint"},"Star your favorite models and choose which ones appear in QoL's quick menu. Hidden models are still available in SpicyChat."],"\n",["label",{"class":"row"},["input",{"id":"expandModelSelectorDescriptions","type":"checkbox"}],["span",{},"Expand all model descriptions in Available models"]],["label",{"class":"row"},["input",{"id":"hideModelUpgradeButtons","type":"checkbox"}],["span",{},"Hide locked-model Upgrade buttons and block locked-model upgrade prompts"]]]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["customizeModelQuickMenu"] = () => checked("customizeModelQuickMenu");
  loaders["customizeModelQuickMenu"] = settings => { setChecked("customizeModelQuickMenu", !!settings.customizeModelQuickMenu); };
  readers["modelQuickFavoritesOnly"] = () => checked("modelQuickFavoritesOnly");
  loaders["modelQuickFavoritesOnly"] = settings => { setChecked("modelQuickFavoritesOnly", !!settings.modelQuickFavoritesOnly); };
  readers["modelFavoriteNames"] = () => value("modelFavoriteNames", "");
  loaders["modelFavoriteNames"] = settings => { setValue("modelFavoriteNames", settings.modelFavoriteNames || ""); };
  readers["modelHiddenNames"] = () => value("modelHiddenNames", "");
  loaders["modelHiddenNames"] = settings => { setValue("modelHiddenNames", settings.modelHiddenNames || ""); };
  readers["expandModelSelectorDescriptions"] = () => checked("expandModelSelectorDescriptions");
  loaders["expandModelSelectorDescriptions"] = settings => { setChecked("expandModelSelectorDescriptions", !!settings.expandModelSelectorDescriptions); };
  readers["hideModelUpgradeButtons"] = () => checked("hideModelUpgradeButtons");
  loaders["hideModelUpgradeButtons"] = settings => { setChecked("hideModelUpgradeButtons", !!settings.hideModelUpgradeButtons); };
})();

// language-filter: optional feature-owned Settings, including its saved-setting handlers.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("language-filter")) return;
  const host = document.getElementById('ds-feature-panel-language-filter');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Language filter"],"\n",["p",{"class":"hint"},"Include or exclude selected languages. Turn on the main bot-card filter to use the optional Lorebook and Rulebook filters below. Uncertain language matches stay visible."],"\n",["label",{"class":"row"},["input",{"id":"enableLanguageFilter","type":"checkbox"}],["span",{},"Filter bot cards by language"]],"\n",["label",{"class":"row"},["input",{"id":"languageFilterLorebooks","type":"checkbox"}],["span",{},"Also filter public Lorebooks by language"]],"\n",["label",{"class":"row"},["input",{"id":"languageFilterRulebooks","type":"checkbox"}],["span",{},"Also filter public Rulebooks by language"]],"\n",["label",{},"Selected-language behavior\n",["select",{"id":"languageSelectionMode"},"\n",["option",{"value":"include"},"Show only selected languages"],"\n",["option",{"value":"exclude"},"Hide selected languages"],"\n"],"\n"],"\n",["div",{"class":"language-grid"},"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"en"}],["span",{},"English"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"de"}],["span",{},"German"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"ja"}],["span",{},"Japanese"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"ko"}],["span",{},"Korean"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"zh"}],["span",{},"Chinese"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"ru"}],["span",{},"Russian / Cyrillic"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"ar"}],["span",{},"Arabic"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"he"}],["span",{},"Hebrew"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"th"}],["span",{},"Thai"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"hi"}],["span",{},"Hindi / Devanagari"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"el"}],["span",{},"Greek"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"es"}],["span",{},"Spanish"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"fr"}],["span",{},"French"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"it"}],["span",{},"Italian"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"pt"}],["span",{},"Portuguese"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"nl"}],["span",{},"Dutch"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"pl"}],["span",{},"Polish"]],"\n",["label",{"class":"row"},["input",{"class":"allowed-language","type":"checkbox","value":"tr"}],["span",{},"Turkish"]],"\n"],"\n",["label",{"class":"row"},["input",{"id":"languageAutoDetectUntagged","type":"checkbox"}],["span",{},"Auto-detect untagged bots from their title + description + greeting when needed"]],"\n",["label",{"class":"row"},["input",{"id":"languageShowDetectedBadge","type":"checkbox"}],["span",{},"Show a small local “QoL: language” badge on detected cards"]],"\n",["p",{"class":"hint"},"Lorebooks and Rulebooks use their visible titles and descriptions with the same language choices. Unknown languages stay visible. Filtering only hides cards on your screen; it never blocks or changes them. Bot detection may also use cached public details."],"\n",["input",{"id":"languageFilterMode","type":"hidden","value":"conservative"}],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableLanguageFilter"] = () => checked("enableLanguageFilter");
  loaders["enableLanguageFilter"] = settings => { setChecked("enableLanguageFilter", settings.enableLanguageFilter); };
  readers["languageFilterLorebooks"] = () => checked("languageFilterLorebooks");
  loaders["languageFilterLorebooks"] = settings => { setChecked("languageFilterLorebooks", settings.languageFilterLorebooks === true); };
  readers["languageFilterRulebooks"] = () => checked("languageFilterRulebooks");
  loaders["languageFilterRulebooks"] = settings => { setChecked("languageFilterRulebooks", settings.languageFilterRulebooks === true); };
  readers["languageSelectionMode"] = () => ["include", "exclude"].includes(value("languageSelectionMode")) ? value("languageSelectionMode") : "include";
  loaders["languageSelectionMode"] = settings => { setValue("languageSelectionMode", ["include", "exclude"].includes(settings.languageSelectionMode) ? settings.languageSelectionMode : "include"); };
  readers["languageAutoDetectUntagged"] = () => checked("languageAutoDetectUntagged");
  loaders["languageAutoDetectUntagged"] = settings => { setChecked("languageAutoDetectUntagged", settings.languageAutoDetectUntagged !== false); };
  readers["languageShowDetectedBadge"] = () => checked("languageShowDetectedBadge");
  loaders["languageShowDetectedBadge"] = settings => { setChecked("languageShowDetectedBadge", !!settings.languageShowDetectedBadge); };
  readers["languageFilterMode"] = () => "conservative";
  loaders["languageFilterMode"] = settings => { setValue("languageFilterMode", settings.languageFilterMode || "conservative"); };
})();

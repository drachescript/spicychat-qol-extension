// Settings panel and persistence owned by generation-profiles; omitted Custom features leave no live controls.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("generation-profiles")) return;
  const host = document.getElementById('ds-feature-panel-generation-profiles');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Generation profiles"],"\n",["label",{"class":"row"},["input",{"id":"enableGenerationProfiles","type":"checkbox"}],["span",{},"Enable Generation Profiles"]],"\n",["p",{"class":"hint"},"Save a model and its generation settings so you can switch back to them later. Profiles are included in normal QoL backups."],"\n",["p",{"class":"hint"},"Stored profiles: ",["span",{"id":"generationProfileCount"},"0 saved"],"."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableGenerationProfiles"] = () => checked("enableGenerationProfiles");
  loaders["enableGenerationProfiles"] = settings => { setChecked("enableGenerationProfiles", !!settings.enableGenerationProfiles); };
})();

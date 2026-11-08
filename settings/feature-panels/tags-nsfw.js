// tags-nsfw: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("tags-nsfw")) return;
  const host = document.getElementById("ds-feature-panel-tags-nsfw");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Tag defaults"],"\n",["label",{"class":"row"},["input",{"id":"autoTags","type":"checkbox"}],["span",{},"Automatically include/exclude tags"]],"\n",["label",{"class":"row"},["input",{"id":"showTagTemplateButton","type":"checkbox"}],["span",{},"Show Copy button beside Narrow by tag Reset to apply this saved template"]],"\n",["p",{"class":"hint"},"Exact spelling matters. Leave empty unless you really want tags preselected. The in-page Copy button applies this saved include/exclude template on demand."],"\n",["label",{},"Include tags, one per line",["textarea",{"id":"includeTags","placeholder":"English\nFantasy","spellcheck":"false"}]],"\n",["label",{},"Exclude tags, one per line",["textarea",{"id":"excludeTags","placeholder":"Low Quality","spellcheck":"false"}]],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["autoTags"] = () => checked("autoTags");
  loaders["autoTags"] = settings => { setChecked("autoTags", settings.autoTags); };
  readers["showTagTemplateButton"] = () => checked("showTagTemplateButton");
  loaders["showTagTemplateButton"] = settings => { setChecked("showTagTemplateButton", !!settings.showTagTemplateButton); };
  readers["includeTags"] = () => linesToArray(value("includeTags"));
  loaders["includeTags"] = settings => { setValue("includeTags", arrayToLines(settings.includeTags)); };
  readers["excludeTags"] = () => linesToArray(value("excludeTags"));
  loaders["excludeTags"] = settings => { setValue("excludeTags", arrayToLines(settings.excludeTags)); };
})();

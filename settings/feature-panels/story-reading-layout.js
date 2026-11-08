// story-reading-layout: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("story-reading-layout")) return;
  const host = document.getElementById("ds-feature-panel-story-reading-layout");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},["h2",{},"Story Mode reading layout"],"\n",["label",{"class":"row"},["input",{"id":"storyReadingLayout","type":"checkbox"}],["span",{},"Improve Story Mode reading layout (visual only)"]],"\n",["p",{"class":"hint"},"Adds subtle message boundaries and readable wrapping on native Story Mode pages. Does not merge Story Mode with normal RP, edit text or alter generation."]]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["storyReadingLayout"] = () => checked("storyReadingLayout");
  loaders["storyReadingLayout"] = settings => { setChecked("storyReadingLayout", !!settings.storyReadingLayout); };
})();

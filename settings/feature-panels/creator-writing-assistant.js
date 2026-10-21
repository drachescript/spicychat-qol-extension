// Settings panel owned by creator-writing-assistant. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("creator-writing-assistant")) return;
  const host = document.getElementById("ds-feature-panel-creator-writing-assistant");
  if (!host) return;
  const make = (entry) => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attributes, ...children] = entry;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) continue;
      node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(make(child));
    return node;
  };
  host.replaceWith(make(["section",{"class":"card","id":"creatorWritingAssistantCard"},"\n",["h2",{},"Creator Writing Assistant"],"\n",["label",{"class":"row"},["input",{"id":"enableCreatorWritingAssistant","type":"checkbox"}],["span",{},"Add spell/grammar/phrasing review tools to chatbot and Lorebook editors"]],"\n",["label",{"class":"row"},["input",{"id":"creatorWritingUseBrowserAi","type":"checkbox"}],["span",{},"Offer built-in browser AI rewriting when the browser/device supports it"]],"\n",["label",{},"Translation target / writing language",["input",{"id":"creatorWritingTargetLanguage","type":"text","value":"English","placeholder":"English"}]],"\n",["label",{},"Personal dictionary words",["textarea",{"id":"creatorWritingDictionary","rows":"3","spellcheck":"false","placeholder":"character names, fantasy terms, custom spellings"}]],"\n",["p",{"class":"hint"},"The assistant can review selected text or a whole field, run local consistency checks, and optionally use a browser-provided on-device language model for grammar, clarity, concise rewrites, tone preservation, or translation. It protects {{user}}/{{char}}, code/URLs, previews the result first, and never saves or publishes automatically."],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableCreatorWritingAssistant"] = () => (checked("enableCreatorWritingAssistant"));
  loaders["enableCreatorWritingAssistant"] = (settings) => { setChecked("enableCreatorWritingAssistant", !!settings.enableCreatorWritingAssistant); };
  readers["creatorWritingUseBrowserAi"] = () => (checked("creatorWritingUseBrowserAi"));
  loaders["creatorWritingUseBrowserAi"] = (settings) => { setChecked("creatorWritingUseBrowserAi", settings.creatorWritingUseBrowserAi !== false); };
  readers["creatorWritingTargetLanguage"] = () => (value("creatorWritingTargetLanguage", "English"));
  loaders["creatorWritingTargetLanguage"] = (settings) => { setValue("creatorWritingTargetLanguage", settings.creatorWritingTargetLanguage || "English"); };
  readers["creatorWritingDictionary"] = () => (value("creatorWritingDictionary"));
  loaders["creatorWritingDictionary"] = (settings) => { setValue("creatorWritingDictionary", settings.creatorWritingDictionary || ""); };

})();

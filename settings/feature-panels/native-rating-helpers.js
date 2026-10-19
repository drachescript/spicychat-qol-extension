// Settings panel owned by native-rating-helpers. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("native-rating-helpers")) return;
  const host = document.getElementById("ds-feature-panel-native-rating-helpers");
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
  host.replaceWith(make(["section",{"class":"card","id":"nativeRatingHelpersCard"},"\n",["h2",{},"Native rating helpers"],"\n",["label",{"class":"row"},["input",{"id":"enableNativeRatingHelpers","type":"checkbox"}],["span",{},"Add compact Dislike / Like / Double-like shortcuts beside SpicyChat's rating button"]],"\n",["p",{"class":"hint"},"The shortcuts open and use SpicyChat's normal Rate Chatbot dialog and its native Done button. QoL does not invent a separate rating or call a hidden rating API."],"\n"]));
})();

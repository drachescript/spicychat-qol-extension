// Settings panel owned by animation-control. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("animation-control")) return;
  const host = document.getElementById("ds-feature-panel-animation-control");
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
  host.replaceWith(make(["section",{"class":"card","id":"animatedImagesCard"},"\n",["h2",{},"Animated bot images"],"\n",["label",{"class":"row"},["input",{"id":"reduceAnimatedBotImages","type":"checkbox"}],["span",{},"Only animate bot images while I hover them"]],"\n",["input",{"id":"animatedImageMode","type":"hidden","value":"hover"}],"\n",["h3",{},"Apply to"],"\n",["label",{"class":"row"},["input",{"id":"animatedImagesListings","type":"checkbox"}],["span",{},"Home, Favorites, Recommendations and bot listings"]],"\n",["label",{"class":"row"},["input",{"id":"animatedImagesChats","type":"checkbox"}],["span",{},"Bot/avatar animation inside chats"]],"\n",["label",{"class":"row"},["input",{"id":"animatedImagesProfiles","type":"checkbox"}],["span",{},"Character/profile pages"]],"\n",["label",{"class":"row"},["input",{"id":"animatedImagesChatMedia","type":"checkbox"}],["span",{},"Large animated media inside chat messages"]],"\n",["p",{"class":"hint"},"When enabled, matching animated images stay on a still frame until you hover them, then pause again when the pointer leaves. Chat message media stays separate so GIFs people intentionally send in the conversation can remain unaffected unless you enable that scope too."],"\n"]));
})();

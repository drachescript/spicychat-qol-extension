// Settings panel owned by character-qol-profiles. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("character-qol-profiles")) return;
  const host = document.getElementById("ds-feature-panel-character-qol-profiles");
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
  host.replaceWith(make(["section",{"class":"card","id":"characterQolProfilesCard"},"\n",["h2",{},"Per-character QoL profiles"],"\n",["label",{"class":"row"},["input",{"id":"enableCharacterQolProfiles","type":"checkbox"}],["span",{},"Enable per-character QoL profiles"]],"\n",["p",{"class":"hint"},"Adds a Character profile button to the QoL panel on individual chats. A character can override RP Format Repair, RP formatting style/detection, and Auto voice on chat open while every unchanged option continues using your normal global settings."],"\n"]));
})();

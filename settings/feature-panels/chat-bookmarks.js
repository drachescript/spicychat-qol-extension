// Settings panel owned by chat-bookmarks. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-bookmarks")) return;
  const host = document.getElementById("ds-feature-panel-chat-bookmarks");
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
  host.replaceWith(make(["section",{"class":"card","id":"messageBookmarksCard"},"\n",["h2",{},"Message bookmarks / multiple local pins"],"\n",["label",{"class":"row"},["input",{"id":"enableMessageBookmarks","type":"checkbox"}],["span",{},"Enable local message bookmarks in chats"]],"\n",["label",{"class":"row"},["input",{"id":"messageBookmarkButtons","type":"checkbox"}],["span",{},"Show a bookmark star on each loaded message"]],"\n",["p",{"class":"hint"},"Bookmark as many messages as you want without changing SpicyChat's native pins. Bookmarks are stored locally per chat, can have optional notes, can be searched, add Back/Forward location history, and provide ★ Prev / Next ★ navigation between loaded bookmarks."],"\n"]));
})();

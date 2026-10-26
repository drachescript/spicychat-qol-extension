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
  host.replaceWith(make(["section",{"class":"card","id":"messageBookmarksCard"},"\n",["h2",{},"Message bookmarks / multiple local pins"],"\n",["label",{"class":"row"},["input",{"id":"enableMessageBookmarks","type":"checkbox"}],["span",{},"Enable local message bookmarks in chats"]],"\n",["label",{"class":"row"},["input",{"id":"messageBookmarkButtons","type":"checkbox"}],["span",{},"Show a bookmark star on each loaded message"]],"\n",["label",{"class":"row"},["input",{"id":"enableChatHistoryNavigator","type":"checkbox"}],["span",{},"Chat history navigator (Experimental)"]],"\n",["p",{"class":"hint"},"Bookmarks have a manager in the chat header. Jump opens older bookmarks in a temporary read-only viewer, even when the separate History Navigator is disabled. With History enabled, you can browse pages of up to 200 messages (falling back to smaller pages if needed), and index page boundaries on demand without loading earlier messages in live chat. Experimental Jump in chat can ask SpicyChat to load a few older pages on demand; long-distance jumps are not guaranteed. The read-only viewer remains available. Indexing is local, cancellable, and saves IDs only."],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableMessageBookmarks"] = () => (checked("enableMessageBookmarks"));
  loaders["enableMessageBookmarks"] = (settings) => { setChecked("enableMessageBookmarks", !!settings.enableMessageBookmarks); };
  readers["enableChatHistoryNavigator"] = () => checked("enableChatHistoryNavigator");
  loaders["enableChatHistoryNavigator"] = (settings) => { setChecked("enableChatHistoryNavigator", !!settings.enableChatHistoryNavigator); };
  readers["messageBookmarkButtons"] = () => (checked("messageBookmarkButtons", true));
  loaders["messageBookmarkButtons"] = (settings) => { setChecked("messageBookmarkButtons", settings.messageBookmarkButtons !== false); };

})();

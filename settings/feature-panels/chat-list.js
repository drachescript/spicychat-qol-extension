// chat-list: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-list")) return;
  const host = document.getElementById("ds-feature-panel-chat-list");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"randomChatSettingsCard"},"\n",["h2",{},"Random Chat"],"\n",["label",{"class":"row"},["input",{"id":"showRandomChatButton","type":"checkbox"}],["span",{},"Show Random Chat on Home / Recommended and Favorites"]],"\n",["div",{"class":"sub-card"},"\n",["label",{"class":"row"},["input",{"id":"randomChatUseLastHomeFilters","type":"checkbox"}],["span",{},"Reuse my current/last Home search when available"]],"\n",["label",{"class":"row"},["input",{"id":"randomChatIncludeOpened","type":"checkbox"}],["span",{},"Allow bots already known as opened"]],"\n",["label",{"class":"row"},["input",{"id":"randomChatIncludeLater","type":"checkbox"}],["span",{},"Allow bots saved for Later"]],"\n",["label",{"class":"row"},["input",{"id":"randomChatIncludeFavorites","type":"checkbox"}],["span",{},"Allow Favorite-history bots when picking from Home / Recommended"]],"\n",["p",{"class":"hint"},"Pick random public bots through SpicyChat search or your Favorites list, without opening helper pages."],"\n"],"\n"]));
  // Chat-list shortcuts stay in their original Settings location, but their
  // controls and storage handlers only exist when Chat List is installed.
  const shortcutHost = document.getElementById("ds-chat-list-shortcuts-mount");
  if (shortcutHost) {
    const card = document.createElement("div");
    card.className = "sub-card";
    for (const [id, caption] of [
      ["chatListTwoColumns", "Show conversations in two columns on wide screens"],
      ["chatListPopoutShortcut", "Add an Open window button to conversation cards"],
      ["chatListRenameShortcut", "Add a quick Rename button to conversation cards (uses SpicyChat)"]
    ]) {
      const label = document.createElement("label");
      label.className = "row";
      const checkbox = document.createElement("input");
      checkbox.id = id;
      checkbox.type = "checkbox";
      const span = document.createElement("span");
      span.textContent = caption;
      label.append(checkbox, span);
      card.appendChild(label);
    }
    shortcutHost.replaceWith(card);
  }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["chatListTwoColumns"] = () => checked("chatListTwoColumns");
  loaders["chatListTwoColumns"] = settings => { setChecked("chatListTwoColumns", !!settings.chatListTwoColumns); };
  readers["chatListPopoutShortcut"] = () => checked("chatListPopoutShortcut");
  loaders["chatListPopoutShortcut"] = settings => { setChecked("chatListPopoutShortcut", !!settings.chatListPopoutShortcut); };
  readers["chatListRenameShortcut"] = () => checked("chatListRenameShortcut");
  loaders["chatListRenameShortcut"] = settings => { setChecked("chatListRenameShortcut", !!settings.chatListRenameShortcut); };
  readers["showRandomChatButton"] = () => checked("showRandomChatButton");
  loaders["showRandomChatButton"] = settings => { setChecked("showRandomChatButton", !!settings.showRandomChatButton); };
  readers["randomChatUseLastHomeFilters"] = () => checked("randomChatUseLastHomeFilters");
  loaders["randomChatUseLastHomeFilters"] = settings => { setChecked("randomChatUseLastHomeFilters", settings.randomChatUseLastHomeFilters !== false); };
  readers["randomChatIncludeOpened"] = () => checked("randomChatIncludeOpened");
  loaders["randomChatIncludeOpened"] = settings => { setChecked("randomChatIncludeOpened", settings.randomChatIncludeOpened !== false); };
  readers["randomChatIncludeLater"] = () => checked("randomChatIncludeLater");
  loaders["randomChatIncludeLater"] = settings => { setChecked("randomChatIncludeLater", settings.randomChatIncludeLater !== false); };
  readers["randomChatIncludeFavorites"] = () => checked("randomChatIncludeFavorites");
  loaders["randomChatIncludeFavorites"] = settings => { setChecked("randomChatIncludeFavorites", settings.randomChatIncludeFavorites !== false); };
})();

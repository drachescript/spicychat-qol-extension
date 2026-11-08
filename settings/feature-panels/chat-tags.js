// chat-tags: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-tags")) return;
  const host = document.getElementById("ds-feature-panel-chat-tags");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Bot tags in chats"],"\n",["label",{"class":"row"},["input",{"id":"showChatTagLinks","type":"checkbox"}],["span",{},"Make the bot's tags clickable on chat pages"]],"\n",["label",{"class":"row"},["input",{"id":"showChatTagAddButtons","type":"checkbox"}],["span",{},"Show + buttons to add tags to the saved Narrow by tag list"]],"\n",["p",{"class":"hint"},"Clicking a tag opens the Home page with that tag included. The + button adds it without replacing tags already saved in your include list."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["showChatTagLinks"] = () => checked("showChatTagLinks");
  loaders["showChatTagLinks"] = settings => { setChecked("showChatTagLinks", !!settings.showChatTagLinks); };
  readers["showChatTagAddButtons"] = () => checked("showChatTagAddButtons");
  loaders["showChatTagAddButtons"] = settings => { setChecked("showChatTagAddButtons", !!settings.showChatTagAddButtons); };
})();

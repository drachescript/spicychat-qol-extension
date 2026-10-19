// Settings panel owned by chat-topbar. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-topbar")) return;
  const host = document.getElementById("ds-feature-panel-chat-topbar");
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
  host.replaceWith(make(["section",{"class":"card","id":"chatTopBarCard"},"\n",["h2",{},"Chat top bar"],"\n",["p",{"class":"hint"},"Small cleanup tools for the bot title area on chat pages."],"\n",["label",{"class":"row"},["input",{"id":"showChatTopBarTools","type":"checkbox"}],["span",{},"Enable chat top bar tools"]],"\n",["label",{"class":"row"},["input",{"id":"chatTopBarInlineCreator","type":"checkbox"}],["span",{},"Keep the creator star on the creator line"]],"\n",["label",{"class":"row"},["input",{"id":"hideChatTopBarRatingButton","type":"checkbox"}],["span",{},"Hide the rating button in the chat header"]],"\n",["label",{"class":"row"},["input",{"id":"hideChatTopBarModelButton","type":"checkbox"}],["span",{},"Hide the model button in the chat header"]],"\n",["label",{"class":"row"},["input",{"id":"hideChatTopBarContextDot","type":"checkbox"}],["span",{},"Hide the memory/context dot"]],"\n",["label",{"class":"row"},["input",{"id":"hideChatDropdownVoiceUpsell","type":"checkbox"}],["span",{},"Hide Unlock Custom Voices in the chat menu"]],"\n",["label",{"class":"row"},["input",{"id":"hideChatDropdownMemoryItem","type":"checkbox"}],["span",{},"Hide Enable/Disable Memory in the chat menu"]],"\n"]));
})();

// Settings panel owned by chat-search. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-search")) return;
  const host = document.getElementById("ds-feature-panel-chat-search");
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
  host.replaceWith(make(["section",{"class":"card","id":"chatSearchCard"},"\n",["h2",{},"Search inside current chat"],"\n",["label",{"class":"row"},["input",{"id":"showChatSearch","type":"checkbox"}],["span",{},"Enable Search Inside Current Chat"]],"\n",["div",{"class":"sub-card"},"\n",["label",{"class":"row"},["input",{"id":"chatSearchShowPanel","type":"checkbox"}],["span",{},"Show search controls in the QoL panel"]],"\n",["label",{"class":"row"},["input",{"id":"chatSearchShowFindButton","type":"checkbox"}],["span",{},"Show a Find button beside the chat title"]],"\n"],"\n",["div",{"class":"sub-card"},"\n",["label",{"class":"row"},["input",{"id":"chatSearchExactPhrase","type":"checkbox"}],["span",{},"Exact phrase search"]],"\n",["label",{"class":"row"},["input",{"id":"chatSearchCaseSensitive","type":"checkbox"}],["span",{},"Case-sensitive search"]],"\n",["label",{"class":"row"},["input",{"id":"chatSearchWholeWord","type":"checkbox"}],["span",{},"Match whole words"]],"\n",["label",{"class":"row"},["input",{"id":"chatSearchRegex","type":"checkbox"}],["span",{},"Regex / advanced search"]],"\n",["label",{"class":"row"},["input",{"id":"chatSearchLoadUntilMatch","type":"checkbox"}],["span",{},"When loading older messages, keep going until a match is found"]],"\n"],"\n",["p",{"class":"hint"},"Search currently loaded messages, filter by Bot, You or bookmarked messages, jump between matches, and optionally keep loading older SpicyChat history until a match is found. With Exact phrase off, every word in the query may match independently; turn it on for literal phrases."],"\n"]));
})();

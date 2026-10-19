// Settings panel owned by focus-mode. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("focus-mode")) return;
  const host = document.getElementById("ds-feature-panel-focus-mode");
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
  host.replaceWith(make(["section",{"class":"card","id":"focusModeCard"},"\n",["h2",{},"Focus / Immersive Mode"],"\n",["label",{"class":"row"},["input",{"id":"enableFocusMode","type":"checkbox"}],["span",{},"Enable Focus / Immersive Mode in chats"]],"\n",["div",{"class":"sub-card"},"\n",["label",{"class":"row"},["input",{"id":"focusHideSidebar","type":"checkbox"}],["span",{},"Hide the sidebar while Focus Mode is active"]],"\n",["label",{"class":"row"},["input",{"id":"focusHideTopBar","type":"checkbox"}],["span",{},"Hide top-bar controls while Focus Mode is active"]],"\n",["label",{"class":"row"},["input",{"id":"focusHideChatHeader","type":"checkbox"}],["span",{},"Hide the current chat header while Focus Mode is active"]],"\n",["label",{"class":"row"},["input",{"id":"focusHideQolPanel","type":"checkbox"}],["span",{},"Hide the QoL panel while Focus Mode is active"]],"\n"],"\n",["p",{"class":"hint"},"Adds a Focus mode button to the QoL panel on individual chats. Focus Mode temporarily hides the selected UI without changing your normal visibility settings. An Exit focus button stays available, and Escape also exits the mode."],"\n"]));
})();

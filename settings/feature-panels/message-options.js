// message-options: optional feature-owned Settings, including its saved-setting handlers.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("message-options")) return;
  const host = document.getElementById('ds-feature-panel-message-options');
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Message options"],"\n",["div",{"class":"sub-card"},"\n",["h3",{},"Message layout"],"\n",["label",{"class":"row"},["input",{"id":"stackChatMessages","type":"checkbox"}],["span",{},"Stack user and AI messages in one chat column"]],"\n",["p",{"class":"hint"},"Aligns user and AI message boxes in the same vertical chat column without rebuilding SpicyChat's message DOM. Turn it off to keep SpicyChat's normal left/right message layout."],"\n"],"\n",["p",{"class":"hint"},"Show optional Copy, Edit, Report and Remove Image actions on messages. SpicyChat’s normal editor/report form still opens when needed."],"\n",["label",{"class":"row"},["input",{"id":"showMessageQuickActions","type":"checkbox"}],["span",{},"Copy, Edit & Report quick actions (toggle all three)"]],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionCopy","type":"checkbox"}],["span",{},"Show Copy icon"]],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionEdit","type":"checkbox"}],["span",{},"Show Edit icon"]],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionRemoveImage","type":"checkbox"}],["span",{},"Show Remove Image icon on my messages that contain an uploaded picture"]],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionResend","type":"checkbox"}],["span",{},"Show Resend icon on my text messages"]],"\n",["p",{"class":"hint"},"Resend safely puts that old user message back into the composer so you can edit/send it again; it never auto-sends. If you already have a draft, QoL asks before replacing it."],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionConfirmRemoveImage","type":"checkbox"}],["span",{},"Confirm before removing an uploaded image"]],"\n",["label",{"class":"row"},["input",{"id":"messageQuickActionReport","type":"checkbox"}],["span",{},"Show Report icon on AI messages"]],"\n",["label",{"class":"row"},["input",{"id":"messageBottomMenuShortcut","type":"checkbox"}],["span",{},"Add a three-dot message menu beside the bottom message actions"]],"\n",["p",{"class":"hint"},"Uses SpicyChat's normal Edit, Copy and Report actions. The original menu stays available."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["stackChatMessages"] = () => checked("stackChatMessages");
  loaders["stackChatMessages"] = settings => { setChecked("stackChatMessages", !!settings.stackChatMessages); };
  readers["showMessageQuickActions"] = () => checked("showMessageQuickActions");
  loaders["showMessageQuickActions"] = settings => { setChecked("showMessageQuickActions", !!settings.showMessageQuickActions); };
  readers["messageQuickActionCopy"] = () => checked("messageQuickActionCopy");
  loaders["messageQuickActionCopy"] = settings => { setChecked("messageQuickActionCopy", !!settings.messageQuickActionCopy); };
  readers["messageQuickActionEdit"] = () => checked("messageQuickActionEdit");
  loaders["messageQuickActionEdit"] = settings => { setChecked("messageQuickActionEdit", !!settings.messageQuickActionEdit); };
  readers["messageQuickActionRemoveImage"] = () => checked("messageQuickActionRemoveImage");
  loaders["messageQuickActionRemoveImage"] = settings => { setChecked("messageQuickActionRemoveImage", !!settings.messageQuickActionRemoveImage); };
  readers["messageQuickActionResend"] = () => checked("messageQuickActionResend");
  loaders["messageQuickActionResend"] = settings => { setChecked("messageQuickActionResend", !!settings.messageQuickActionResend); };
  readers["messageQuickActionConfirmRemoveImage"] = () => checked("messageQuickActionConfirmRemoveImage");
  loaders["messageQuickActionConfirmRemoveImage"] = settings => { setChecked("messageQuickActionConfirmRemoveImage", !!settings.messageQuickActionConfirmRemoveImage); };
  readers["messageQuickActionReport"] = () => checked("messageQuickActionReport");
  loaders["messageQuickActionReport"] = settings => { setChecked("messageQuickActionReport", !!settings.messageQuickActionReport); };
  readers["messageBottomMenuShortcut"] = () => checked("messageBottomMenuShortcut");
  loaders["messageBottomMenuShortcut"] = settings => { setChecked("messageBottomMenuShortcut", !!settings.messageBottomMenuShortcut); };
})();

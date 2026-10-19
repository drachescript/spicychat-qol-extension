// Settings panel owned by chat-nudges. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-nudges")) return;
  const host = document.getElementById("ds-feature-panel-chat-nudges");
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
  host.replaceWith(make(["section",{"class":"card","id":"chatNudgesCard"},"\n",["h2",{},"Chat Nudges"],"\n",["label",{"class":"row"},["input",{"id":"enableChatNudges","type":"checkbox"}],["span",{},"Enable local inactivity reminders for up to 2 chatbots"]],"\n",["label",{},"Default reminder delay\n",["select",{"id":"chatNudgeDefaultHours"},"\n",["option",{"value":"5"},"5 hours"],"\n",["option",{"value":"8"},"8 hours"],"\n",["option",{"value":"24"},"1 day"],"\n",["option",{"value":"48"},"2 days"],"\n",["option",{"value":"168"},"1 week"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"chatNudgeBrowserNotifications","type":"checkbox"}],["span",{},"Use browser notifications when permission is available"]],"\n",["div",{"class":"button-row"},["button",{"id":"chatNudgeRequestNotifications","type":"button"},"Enable browser notifications"],["button",{"id":"chatNudgeRefresh","type":"button"},"Refresh list"]],"\n",["p",{"class":"hint","id":"chatNudgePermissionStatus"},"Notification permission not checked yet."],"\n",["div",{"class":"managed-list","id":"chatNudgeList"}],"\n",["p",{"class":"hint"},"Open a chat and use the ",["strong",{},"Nudge"]," button beside the chatbot name to add or remove it. QoL watches at most two chats. A nudge is a local reminder built from the most recent bot reply; it does not generate or send a new SpicyChat message. Scheduled browser notifications require the browser to be running. If notifications are unavailable, the reminder is shown the next time QoL is active on SpicyChat."],"\n"]));
})();

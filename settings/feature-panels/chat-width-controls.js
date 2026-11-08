// chat-width-controls: owned Settings markup, serialization and loading. No storage migration.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("chat-width-controls")) return;
  const host = document.getElementById("ds-feature-panel-chat-width-controls");
  if (!host) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, val] of Object.entries(attrs)) element.setAttribute(name, val);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card","id":"chatWidthControlsCard"},"\n",["h2",{},"Chat stream & input width"],"\n",["p",{"class":"hint"},"Make the chat wider or narrower on desktop. You can set message, bubble and typing-area widths separately. This only changes the layout, not chat history."],"\n",["label",{"class":"row"},["input",{"id":"enableChatWidthControls","type":"checkbox"}],["span",{},"Customize chat widths (off by default)"]],"\n",["label",{},"Message stream width (px)\n",["input",{"id":"chatStreamWidth","max":"1600","min":"520","step":"20","type":"number"}],"\n"],"\n",["label",{},"Maximum individual bubble width (px)\n",["input",{"id":"chatBubbleMaxWidth","max":"1500","min":"360","step":"20","type":"number"}],"\n"],"\n",["label",{},"Message input area width (px)\n",["input",{"id":"chatComposerWidth","max":"1600","min":"520","step":"20","type":"number"}],"\n"],"\n",["p",{"class":"hint"},"Suggested starting values: default ~800 / 650 / 800; wider ~1100 / 950 / 1100. Widths remain bounded by the available window; new and edited messages are unaffected."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableChatWidthControls"] = () => checked("enableChatWidthControls");
  loaders["enableChatWidthControls"] = settings => { setChecked("enableChatWidthControls", settings.enableChatWidthControls === true); };
  readers["chatStreamWidth"] = () => Math.min(1600, Math.max(520, Number(value("chatStreamWidth", "800")) || 800));
  loaders["chatStreamWidth"] = settings => { setValue("chatStreamWidth", Math.min(1600, Math.max(520, Number(settings.chatStreamWidth) || 800))); };
  readers["chatBubbleMaxWidth"] = () => Math.min(1500, Math.max(360, Number(value("chatBubbleMaxWidth", "650")) || 650));
  loaders["chatBubbleMaxWidth"] = settings => { setValue("chatBubbleMaxWidth", Math.min(1500, Math.max(360, Number(settings.chatBubbleMaxWidth) || 650))); };
  readers["chatComposerWidth"] = () => Math.min(1600, Math.max(520, Number(value("chatComposerWidth", "800")) || 800));
  loaders["chatComposerWidth"] = settings => { setValue("chatComposerWidth", Math.min(1600, Math.max(520, Number(settings.chatComposerWidth) || 800))); };
})();

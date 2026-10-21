// Settings panel owned by chat-scene-notes. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-scene-notes")) return;
  const host = document.getElementById("ds-feature-panel-chat-scene-notes");
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
  host.replaceWith(make(["section",{"class":"card","id":"chatSceneNotesSettingsCard"},"\n",["h2",{},"Per-chat Scene Notes"],"\n",["label",{"class":"row"},["input",{"id":"enableChatSceneNotes","type":"checkbox"}],["span",{},"Enable a separate Scene field for each conversation (off by default)"]],"\n",["label",{"class":"row"},["input",{"id":"chatSceneNotesAutoInclude","type":"checkbox"}],["span",{},"Include saved scene notes in outgoing messages automatically (off by default)"]],"\n",["label",{"class":"row"},["input",{"id":"chatSceneNotesEnableBotApply","type":"checkbox"}],["span",{},"Allow staging Scene Notes into my bot’s actual Scenario field (Private/Unlisted only, off by default)"]],"\n",["label",{},"When auto-including notes ",["select",{"id":"chatSceneNotesAutoMode"},["option",{"value":"session"},"Once per conversation session"],["option",{"value":"every"},"Every message (repeats the notes)"]]],"\n",["p",{"class":"hint"},"When enabled, use the new Scene button in a chat to edit its private scene notes and optionally insert them into an unsent draft. Automatic inclusion is a separate opt-in and adds visible OOC text to your message. Local notes do not change the bot or native Memories. The separate Apply to bot action is available only for bots you own that are confirmed Private or Unlisted. It fills the owned bot's native Scenario editor for review; saving it changes the bot for all its conversations. QoL never changes visibility or saves it automatically."],"\n"]));

  // Only installed panels register their Settings readers and loaders.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableChatSceneNotes"] = () => (checked("enableChatSceneNotes"));
  loaders["enableChatSceneNotes"] = (settings) => { setChecked("enableChatSceneNotes", !!settings.enableChatSceneNotes); };
  readers["chatSceneNotesEnableBotApply"] = () => (checked("chatSceneNotesEnableBotApply"));
  loaders["chatSceneNotesEnableBotApply"] = (settings) => { setChecked("chatSceneNotesEnableBotApply", !!settings.chatSceneNotesEnableBotApply); };
  readers["chatSceneNotesAutoInclude"] = () => (checked("chatSceneNotesAutoInclude"));
  loaders["chatSceneNotesAutoInclude"] = (settings) => { setChecked("chatSceneNotesAutoInclude", !!settings.chatSceneNotesAutoInclude); };
  readers["chatSceneNotesAutoMode"] = () => (value("chatSceneNotesAutoMode") === "every" ? "every" : "session");
  loaders["chatSceneNotesAutoMode"] = (settings) => { setValue("chatSceneNotesAutoMode", settings.chatSceneNotesAutoMode === "every" ? "every" : "session"); };
})();

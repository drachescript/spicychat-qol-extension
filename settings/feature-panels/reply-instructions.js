// Settings panel owned by reply-instructions. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("reply-instructions")) return;
  const host = document.getElementById("ds-feature-panel-reply-instructions");
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
  host.replaceWith(make(["section",{"class":"card","id":"replyInstructionsCard"},"\n",["h2",{},"Reply Instructions"],"\n",["label",{"class":"row"},["input",{"id":"enableReplyInstructions","type":"checkbox"}],["span",{},"Enable persistent reply instructions"]],"\n",["label",{},"Default reply instruction\n",["textarea",{"id":"replyInstructionText","maxlength":"2000","placeholder":"Example: Keep replies around 2-4 paragraphs. Use *asterisks* for actions. Keep emojis occasional.","spellcheck":"true"}],"\n"],"\n",["label",{},"Automatic send mode\n",["select",{"id":"replyInstructionSendMode"},"\n",["option",{"value":"session"},"Once per chat session — add it to the next message after opening/reloading the chat"],"\n",["option",{"value":"every"},"Every user message — strongest persistence, but repeats the instruction"],"\n",["option",{"value":"manual"},"Manual only — use the RI chat button when needed"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"replyInstructionOocWrapper","type":"checkbox"}],["span",{},"Wrap the instruction as an OOC directive"]],"\n",["label",{"class":"row"},["input",{"id":"replyInstructionShowChatButton","type":"checkbox"}],["span",{},"Show an RI button beside the chat composer"]],"\n",["p",{"class":"hint"},"This is the closest QoL can get to a permanent reply-style instruction without SpicyChat exposing a separate system-prompt field. Automatic modes append the instruction to your outgoing message, so the instruction is visible in the sent chat text. The RI button can insert it manually or save a bot-specific override. Bot overrides are stored locally inside QoL settings. RP Format Repair is different: it only changes how existing AI replies look on your screen."],"\n"]));

  // Only installed panels register their Settings readers and loaders.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableReplyInstructions"] = () => (checked("enableReplyInstructions"));
  loaders["enableReplyInstructions"] = (settings) => { setChecked("enableReplyInstructions", !!settings.enableReplyInstructions); };
})();

// Settings panel owned by rp-state-tracker. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("rp-state-tracker")) return;
  const host = document.getElementById("ds-feature-panel-rp-state-tracker");
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
  host.replaceWith(make(["section",{"class":"card","id":"rpStateTrackerCard"},"\n",["h2",{},"RP State Tracker"],"\n",["p",{"class":"hint"},"Keeps changing RP details separate from long-term memory, such as current location, inventory, worn clothing, injuries, stats, currency, party members, and active objectives. Suggestion credit: jumjam."],"\n",["label",{"class":"row"},["input",{"id":"enableRpStateTracker","type":"checkbox"}],["span",{},"Enable RP State Tracker in chats"]],"\n",["label",{},"Tracking mode\n          ",["select",{"id":"rpStateTrackerMode"},"\n",["option",{"value":"manual"},"Manual only"],"\n",["option",{"value":"conservative"},"Conservative automatic (recommended)"],"\n",["option",{"value":"assisted"},"Assisted — also suggest likely state changes for review"],"\n"],"\n"],"\n",["label",{},"Send current state to the bot\n          ",["select",{"id":"rpStateInjectMode"},"\n",["option",{"value":"manual"},"Manual only"],"\n",["option",{"value":"changed"},"When the state changes (recommended)"],"\n",["option",{"value":"every"},"With every message"],"\n"],"\n"],"\n",["label",{},"Maximum current-state context size\n          ",["input",{"id":"rpStateMaxContextChars","type":"number","min":"300","max":"3000","step":"100","value":"1200"}],"\n"],"\n",["label",{"class":"row"},["input",{"id":"rpStateShowQuickPanel","type":"checkbox"}],["span",{},"Show RP State in the QoL quick panel"]],"\n",["p",{"class":"hint"},"Conservative mode automatically reads clear state lines such as ",["strong",{},"Inventory: flashlight, 2 medkits"],", ",["strong",{},"Location: motel room 204"],", or ",["strong",{},"State: HP=42/50; Gold=80"],". Assisted mode can also suggest simple changes such as picking up an item, putting on clothing, or arriving somewhere, but waits for you to approve them. State changes use the current Storydate when Internal Day Tracker is enabled."],"\n",["p",{"class":"hint"},"The tracker stores state locally. If the bot needs to know the state, QoL sends a compact visible OOC state block with your message, which still uses some tokens. “When the state changes” avoids repeating the same block on every message."],"\n"]));
})();

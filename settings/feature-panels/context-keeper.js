// Settings panel owned by context-keeper. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("context-keeper")) return;
  const host = document.getElementById("ds-feature-panel-context-keeper");
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
  host.replaceWith(make(["section",{"class":"card","id":"contextKeeperCard"},"\n",["h2",{},"Context Keeper — local story notes"],"\n",["p",{"class":"hint"},"Experimental — this still needs testing. Keep backups and double-check saved facts and anything QoL adds to a message."],"\n",["label",{"class":"row"},["input",{"id":"enableContextKeeper","type":"checkbox"}],["span",{},"Enable Context Keeper (works without native Memories)"]],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperAutoCapture","type":"checkbox"}],["span",{},"Automatically save important story facts from new messages"]],"\n",["label",{},"How careful should automatic saving be?\n          ",["select",{"id":"contextKeeperAutoSensitivity"},"\n",["option",{"value":"strict"},"Strict — only obvious story facts"],"\n",["option",{"value":"balanced"},"Balanced — recommended"],"\n",["option",{"value":"broad"},"Broad — may save less important details"],"\n"],"\n"],"\n",["label",{},"Check for new facts every X messages\n          ",["input",{"id":"contextKeeperAutoEveryMessages","type":"number","min":"1","max":"20","step":"1","value":"4"}],"\n"],"\n",["label",{},"Maximum automatically saved facts per chat\n          ",["input",{"id":"contextKeeperAutoMaxDetails","type":"number","min":"20","max":"300","step":"10","value":"120"}],"\n"],"\n",["div",{"class":"button-row"},["button",{"data-context-keeper-preset":"light","type":"button"},"Light"],["button",{"data-context-keeper-preset":"recommended","type":"button"},"Recommended"],["button",{"data-context-keeper-preset":"detailed","type":"button"},"Detailed"]],"\n",["p",{"class":"hint"},"Light saves less, Recommended is the usual middle ground, and Detailed collects more. You can change the individual options afterward."],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperMessageButtons","type":"checkbox"}],["span",{},"Show a Keep button on messages"]],"\n",["label",{"class":"row"},["input",{"id":"enableSelectionRemember","type":"checkbox"}],["span",{},"Show Remember when selecting chat text"]],"\n",["p",{"class":"hint"},["strong",{},"Saved facts don’t use chat context on their own."]," They only take up context when you add a recap to a message. Larger recaps use more space."],"\n",["label",{},"How much should a recap include?\n          ",["select",{"id":"contextKeeperRecapSize"},"\n",["option",{"value":"compact"},"Compact - up to 6 details"],"\n",["option",{"value":"balanced"},"Balanced - up to 12 details"],"\n",["option",{"value":"full"},"Full - up to 30 details"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperAutoRecall","type":"checkbox"}],["span",{},"Automatically add saved facts to messages I send (OFF by default)"]],["label",{"class":"row"},["input",{"id":"contextKeeperRelevantRecall","type":"checkbox"}],["span",{},"Prioritize facts related to my message (local keyword matching)"]],"\n",["label",{},"Include a recap every X messages I send\n          ",["select",{"id":"contextKeeperRecallEverySends"},["option",{"value":"1"},"Every message"],["option",{"value":"3"},"Every 3 messages"],["option",{"value":"5"},"Every 5 messages"],["option",{"value":"10"},"Every 10 messages"]],"\n"],"\n",["label",{},"Maximum recap length\n          ",["select",{"id":"contextKeeperRecallMaxChars"},["option",{"value":"450"},"Compact — 450 characters"],["option",{"value":"900"},"Balanced — 900 characters"],["option",{"value":"1400"},"Extended — 1,400 characters"]],"\n"],"\n",["p",{"class":"hint"},"Context Keeper stores notes locally and does not need native Memories or Memory Manager. Automatic recall is disabled by default, adds a visible OOC reminder only when you send a normal message, and uses ordinary chat context/tokens. It never sends a separate message. Pin important details to prioritize them; optional relevant recall favors matching details without external AI. Superseded memories are kept as inactive history and excluded from recap."],"\n",["p",{"class":"hint"},"Open Context Keeper from the chat menu or QoL panel. It checks recent finished messages and tries to keep important facts without saving the same thing over and over."],"\n"]));
  // Only installed modules contribute Settings read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableContextKeeper"] = () => (checked("enableContextKeeper"));
  loaders["enableContextKeeper"] = (settings) => { setChecked("enableContextKeeper", !!settings.enableContextKeeper); }
  readers["contextKeeperAutoCapture"] = () => (checked("contextKeeperAutoCapture", true));
  loaders["contextKeeperAutoCapture"] = (settings) => { setChecked("contextKeeperAutoCapture", settings.contextKeeperAutoCapture !== false); }
  readers["contextKeeperAutoSensitivity"] = () => (["strict", "balanced", "broad"].includes(value("contextKeeperAutoSensitivity")) ? value("contextKeeperAutoSensitivity") : "balanced");
  loaders["contextKeeperAutoSensitivity"] = (settings) => { setValue("contextKeeperAutoSensitivity", ["strict", "balanced", "broad"].includes(settings.contextKeeperAutoSensitivity) ? settings.contextKeeperAutoSensitivity : "balanced"); }
  readers["contextKeeperAutoEveryMessages"] = () => (Math.max(1, Math.min(20, Number(value("contextKeeperAutoEveryMessages", "4")) || 4)));
  loaders["contextKeeperAutoEveryMessages"] = (settings) => { setValue("contextKeeperAutoEveryMessages", String(Math.max(1, Math.min(20, Number(settings.contextKeeperAutoEveryMessages) || 4)))); }
  readers["contextKeeperAutoMaxDetails"] = () => (Math.max(20, Math.min(300, Number(value("contextKeeperAutoMaxDetails", "120")) || 120)));
  loaders["contextKeeperAutoMaxDetails"] = (settings) => { setValue("contextKeeperAutoMaxDetails", String(Math.max(20, Math.min(300, Number(settings.contextKeeperAutoMaxDetails) || 120)))); }
  readers["contextKeeperMessageButtons"] = () => (checked("contextKeeperMessageButtons"));
  loaders["contextKeeperMessageButtons"] = (settings) => { setChecked("contextKeeperMessageButtons", !!settings.contextKeeperMessageButtons); }
  readers["contextKeeperRecapSize"] = () => (["compact", "balanced", "full"].includes(value("contextKeeperRecapSize")) ? value("contextKeeperRecapSize") : "balanced");
  loaders["contextKeeperRecapSize"] = (settings) => { setValue("contextKeeperRecapSize", ["compact", "balanced", "full"].includes(settings.contextKeeperRecapSize) ? settings.contextKeeperRecapSize : "balanced"); }
  readers["contextKeeperAutoRecall"] = () => (checked("contextKeeperAutoRecall"));
  loaders["contextKeeperAutoRecall"] = (settings) => { setChecked("contextKeeperAutoRecall", !!settings.contextKeeperAutoRecall); }
  readers["contextKeeperRelevantRecall"] = () => (checked("contextKeeperRelevantRecall"));
  loaders["contextKeeperRelevantRecall"] = (settings) => { setChecked("contextKeeperRelevantRecall", !!settings.contextKeeperRelevantRecall); }
  readers["contextKeeperRecallEverySends"] = () => ([1,3,5,10].includes(Number(value("contextKeeperRecallEverySends"))) ? Number(value("contextKeeperRecallEverySends")) : 5);
  loaders["contextKeeperRecallEverySends"] = (settings) => { setValue("contextKeeperRecallEverySends", String([1,3,5,10].includes(Number(settings.contextKeeperRecallEverySends)) ? settings.contextKeeperRecallEverySends : 5)); }
  readers["contextKeeperRecallMaxChars"] = () => ([450,900,1400].includes(Number(value("contextKeeperRecallMaxChars"))) ? Number(value("contextKeeperRecallMaxChars")) : 900);
  loaders["contextKeeperRecallMaxChars"] = (settings) => { setValue("contextKeeperRecallMaxChars", String([450,900,1400].includes(Number(settings.contextKeeperRecallMaxChars)) ? settings.contextKeeperRecallMaxChars : 900)); }
})();

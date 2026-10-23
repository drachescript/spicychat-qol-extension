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
  host.replaceWith(make(["section",{"class":"card","id":"contextKeeperCard"},"\n",["h2",{},"Context Keeper — local, standalone memories"],"\n",["label",{"class":"row"},["input",{"id":"enableContextKeeper","type":"checkbox"}],["span",{},"Enable standalone Context Keeper (native Memory Manager not required)"]],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperAutoCapture","type":"checkbox"}],["span",{},"Automatically keep durable continuity details from settled chat messages"]],"\n",["label",{},"Automatic capture strictness\n          ",["select",{"id":"contextKeeperAutoSensitivity"},"\n",["option",{"value":"strict"},"Strict - only very strong continuity cues"],"\n",["option",{"value":"balanced"},"Balanced - recommended"],"\n",["option",{"value":"broad"},"Broad - keep more possible continuity details"],"\n"],"\n"],"\n",["label",{},"Run automatic capture after this many new messages\n          ",["input",{"id":"contextKeeperAutoEveryMessages","type":"number","min":"1","max":"20","step":"1","value":"4"}],"\n"],"\n",["label",{},"Maximum automatically kept details per chat\n          ",["input",{"id":"contextKeeperAutoMaxDetails","type":"number","min":"20","max":"300","step":"10","value":"120"}],"\n"],"\n",["div",{"class":"button-row"},["button",{"data-context-keeper-preset":"light","type":"button"},"Light"],["button",{"data-context-keeper-preset":"recommended","type":"button"},"Recommended"],["button",{"data-context-keeper-preset":"detailed","type":"button"},"Detailed"]],"\n",["p",{"class":"hint"},"Quick setup: Light checks less often and keeps fewer details. Recommended uses the normal balanced defaults. Detailed checks more often and keeps more possible continuity."],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperMessageButtons","type":"checkbox"}],["span",{},"Also show manual Keep buttons on chat messages"]],"\n",["label",{"class":"row"},["input",{"id":"enableSelectionRemember","type":"checkbox"}],["span",{},"Show Remember action when selecting text inside chat messages"]],"\n",["p",{"class":"hint"},["strong",{},"Saved details do not use chat tokens by themselves."]," They stay local. Tokens are only used when you insert/send a Context Keeper recap; the recap size below has the biggest effect on how much context it uses."],"\n",["label",{},"OOC recap size\n          ",["select",{"id":"contextKeeperRecapSize"},"\n",["option",{"value":"compact"},"Compact - up to 6 details"],"\n",["option",{"value":"balanced"},"Balanced - up to 12 details"],"\n",["option",{"value":"full"},"Full - up to 30 details"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"contextKeeperAutoRecall","type":"checkbox"}],["span",{},"Include selected local continuity in outgoing messages automatically (opt-in)"]],["label",{"class":"row"},["input",{"id":"contextKeeperRelevantRecall","type":"checkbox"}],["span",{},"Prioritize continuity relevant to my message (local keyword matching, no paid AI)"]],"\n",["label",{},"Recall after this many messages you send\n          ",["select",{"id":"contextKeeperRecallEverySends"},["option",{"value":"1"},"Every message"],["option",{"value":"3"},"Every 3 messages"],["option",{"value":"5"},"Every 5 messages"],["option",{"value":"10"},"Every 10 messages"]],"\n"],"\n",["label",{},"Maximum automatic recall text\n          ",["select",{"id":"contextKeeperRecallMaxChars"},["option",{"value":"450"},"Compact — 450 characters"],["option",{"value":"900"},"Balanced — 900 characters"],["option",{"value":"1400"},"Extended — 1,400 characters"]],"\n"],"\n",["p",{"class":"hint"},"Context Keeper stores notes locally and does not need native Memories or Memory Manager. Automatic recall is disabled by default, adds a visible OOC reminder only when you send a normal message, and uses ordinary chat context/tokens. It never sends a separate message. Pin important details to prioritize them; optional relevant recall favors matching details without external AI. Superseded memories are kept as inactive history and excluded from recap."],"\n",["p",{"class":"hint"},"Open Context Keeper from the chat three-dot menu or QoL panel. Automatic capture checks only small batches of new settled messages, favors durable facts over moment-to-moment narration, removes near-duplicates, and keeps manual/Memory details separate from the automatic cap."],"\n"]));
  // Optional native Memory-quality experiment. No dependency on the paid Memory Manager UI.
  const memoryRow=document.createElement('label');memoryRow.className='row';
  const memoryInput=document.createElement('input');memoryInput.id='nativeMemoryQualityProbe';memoryInput.type='checkbox';
  const memoryLabel=document.createElement('span');memoryLabel.textContent='Experimental: read-only native Memory checks after two completed normal chat exchanges (off by default)';
  memoryRow.append(memoryInput,memoryLabel);
  document.getElementById('contextKeeperCard')?.append(memoryRow);
  const memoryHelp=document.createElement('p');memoryHelp.className='hint';
  memoryHelp.textContent='Works even if standalone Context Keeper is off (main QoL must stay on). Checks native Memories after two completed normal exchanges, no more than once per minute. Excludes regenerate/continue and compares IDs and fingerprints. No native Memory contents are stored in QoL or exported.';
  document.getElementById('contextKeeperCard')?.append(memoryHelp);
  const memoryStatus=document.createElement('p');memoryStatus.className='hint';
  memoryStatus.textContent='Native Memory check: no results yet.';
  document.getElementById('contextKeeperCard')?.append(memoryStatus);
  function renderMemoryStatus(raw){
    if(!raw?.checkedAt){memoryStatus.textContent='Native Memory check: no results yet.';return;}
    const when=new Date(raw.checkedAt).toLocaleString();
    if(!raw.ok){memoryStatus.textContent=`Native Memory check: ${raw.status||'unavailable'} (${when}).`;return;}
    const q=raw.changed&&raw.quality ? ` · quality flags: ${Number(raw.quality.empty||0)} empty, ${Number(raw.quality.veryShort||0)} short, ${Number(raw.quality.long||0)} long, ${Number(raw.quality.exactDuplicateTexts||0)} exact duplicates, ${Number(raw.quality.uncertain||0)} uncertain, ${Number(raw.quality.ambiguousReference||0)} unclear references, ${Number(raw.quality.unstructured||0)} unstructured, ${Number(raw.quality.possibleConflicts||0)} possible conflicts (heuristic only)` : '';
    memoryStatus.textContent=`Native Memory check: ${raw.baseline?'initial baseline':raw.changed?'changes detected':'unchanged'} · ${Number(raw.count||0)} memories · +${Number(raw.added||0)} / -${Number(raw.removed||0)} / ~${Number(raw.updated||0)}${q} · ${when}.`;
  }
  chrome.storage.local.get('dsNativeMemoryProbeLastResultV1',v=>renderMemoryStatus(v?.dsNativeMemoryProbeLastResultV1));
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes.dsNativeMemoryProbeLastResultV1)
      renderMemoryStatus(changes.dsNativeMemoryProbeLastResultV1.newValue);
  });

  // Only installed modules contribute Settings read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["nativeMemoryQualityProbe"] = () => !!document.getElementById("nativeMemoryQualityProbe")?.checked;
  loaders["nativeMemoryQualityProbe"] = settings => { const el=document.getElementById("nativeMemoryQualityProbe");if(el)el.checked=settings.nativeMemoryQualityProbe===true; };
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

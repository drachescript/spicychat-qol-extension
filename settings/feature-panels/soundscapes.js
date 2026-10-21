// Settings panel owned by soundscapes. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("soundscapes")) return;
  const host = document.getElementById("ds-feature-panel-soundscapes");
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
  host.replaceWith(make(["section",{"class":"card","id":"soundscapesCard"},"\n",["h2",{},"Soundscapes / Ambience"],"\n",["label",{"class":"row"},["input",{"id":"enableSoundscapes","type":"checkbox"}],["span",{},"Enable Soundscapes / Ambience"]],"\n",["p",{"class":"hint"},"Local-first ambience mixer for reading/writing/generating. Soundscapes only play after you press Play; QoL does not generate audio or send chat text anywhere."],"\n",["label",{"class":"row"},["input",{"id":"soundscapeShowChatControl","type":"checkbox"}],["span",{},"Show a Soundscape play button beside the chat composer"]],"\n",["p",{"class":"hint"},"Recommended when Soundscapes are enabled. This gives chats a direct scene selector and Play/Pause button even if the Mini Panel is disabled."],"\n",["label",{},"Master volume\n          ",["input",{"id":"soundscapeMasterVolume","max":"100","min":"0","step":"1","type":"range","value":"65"}],"\n",["span",{"class":"manager-count","id":"soundscapeMasterVolumeValue"},"65%"],"\n"],"\n",["div",{"class":"sub-card"},"\n",["strong",{},"Allow Soundscape controls/playback on"],"\n",["label",{"class":"row"},["input",{"id":"soundscapeOnChat","type":"checkbox"}],["span",{},"Individual chats"]],"\n",["label",{"class":"row"},["input",{"id":"soundscapeOnHome","type":"checkbox"}],["span",{},"Home / discovery"]],"\n",["label",{"class":"row"},["input",{"id":"soundscapeOnChats","type":"checkbox"}],["span",{},"Chats list"]],"\n",["label",{"class":"row"},["input",{"id":"soundscapeOnProfiles","type":"checkbox"}],["span",{},"Character profiles and Lorebooks"]],"\n",["label",{"class":"row"},["input",{"id":"soundscapeOnOther","type":"checkbox"}],["span",{},"Other SpicyChat pages"]],"\n"],"\n",["h3",{},"Saved local audio"],"\n",["div",{"class":"button-row"},"\n",["input",{"accept":"audio/*","id":"soundscapeAudioUpload","multiple":"","type":"file"}],"\n"],"\n",["p",{"class":"hint","id":"soundscapeAudioStatus"},"Import short ambience/audio files here. QoL stores them locally in extension storage and excludes the audio bytes from normal text/settings backups."],"\n",["div",{"class":"soundscape-audio-list","id":"soundscapeAudioList"}],"\n",["h3",{},"Saved scenes"],"\n",["div",{"class":"manager-add-row soundscape-add-row"},"\n",["label",{},"Scene name",["input",{"id":"soundscapeNewSceneName","placeholder":"Cabin at night","type":"text"}]],"\n",["button",{"id":"soundscapeAddScene","type":"button"},"Add scene"],"\n"],"\n",["div",{"class":"soundscape-scene-list","id":"soundscapeSceneList"}],"\n",["p",{"class":"hint"},"Each scene supports up to five layers. Turn layers on/off individually, loop them continuously, or replay them at an interval for occasional sounds such as traffic or a passing train. Direct audio URLs are supported too; playing one contacts the host that serves that audio."],"\n"]));
  // Only installed modules contribute Settings read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableSoundscapes"] = () => (checked("enableSoundscapes"));
  loaders["enableSoundscapes"] = (settings) => { setChecked("enableSoundscapes", !!settings.enableSoundscapes); }
  readers["soundscapeShowChatControl"] = () => (checked("soundscapeShowChatControl", true));
  loaders["soundscapeShowChatControl"] = (settings) => { setChecked("soundscapeShowChatControl", settings.soundscapeShowChatControl !== false); }
  readers["soundscapeMasterVolume"] = () => (Number.isFinite(Number(value("soundscapeMasterVolume", "65"))) ? Math.min(100, Math.max(0, Number(value("soundscapeMasterVolume", "65")))) : 65);
  loaders["soundscapeMasterVolume"] = (settings) => {
    const soundscapeMaster = Number.isFinite(Number(settings.soundscapeMasterVolume)) ? Math.min(100, Math.max(0, Number(settings.soundscapeMasterVolume))) : 65;
    setValue("soundscapeMasterVolume", soundscapeMaster);
    if ($("soundscapeMasterVolumeValue")) $("soundscapeMasterVolumeValue").textContent = `${soundscapeMaster}%`;
  };
  readers["soundscapeOnChat"] = () => (checked("soundscapeOnChat", true));
  loaders["soundscapeOnChat"] = (settings) => { setChecked("soundscapeOnChat", settings.soundscapeOnChat !== false); }
  readers["soundscapeOnHome"] = () => (checked("soundscapeOnHome"));
  loaders["soundscapeOnHome"] = (settings) => { setChecked("soundscapeOnHome", !!settings.soundscapeOnHome); }
  readers["soundscapeOnChats"] = () => (checked("soundscapeOnChats"));
  loaders["soundscapeOnChats"] = (settings) => { setChecked("soundscapeOnChats", !!settings.soundscapeOnChats); }
  readers["soundscapeOnProfiles"] = () => (checked("soundscapeOnProfiles"));
  loaders["soundscapeOnProfiles"] = (settings) => { setChecked("soundscapeOnProfiles", !!settings.soundscapeOnProfiles); }
  readers["soundscapeOnOther"] = () => (checked("soundscapeOnOther"));
  loaders["soundscapeOnOther"] = (settings) => { setChecked("soundscapeOnOther", !!settings.soundscapeOnOther); }
})();

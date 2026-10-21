// Settings panel owned by story-day-tracker. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("story-day-tracker")) return;
  const host = document.getElementById("ds-feature-panel-story-day-tracker");
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
  host.replaceWith(make(["section",{"class":"card","id":"storyDayTrackerCard"},"\n",["h2",{},"Internal Day Tracker"],"\n",["p",{"class":"hint"},"Optional RP timeline helper suggested by Chibs. It keeps a local numbered story day and compact Storydate code so “yesterday”, “tomorrow”, “last night”, and older events have a stable reference point. Storydate uses day.phase: 35.3 means Day 35, evening."],"\n",["label",{"class":"row"},["input",{"id":"enableStoryDayTracker","type":"checkbox"}],["span",{},"Enable Internal Day Tracker in chats"]],"\n",["label",{},"Tracking mode\n          ",["select",{"id":"storyDayTrackerMode"},"\n",["option",{"value":"manual"},"Manual only"],"\n",["option",{"value":"conservative"},"Conservative automatic (recommended)"],"\n",["option",{"value":"assisted"},"Assisted — suggest weaker transitions for review"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"storyDayTrackerIncludeInContext","type":"checkbox"}],["span",{},"Include the current Storydate + relative-day map in Context Keeper recaps"]],"\n",["label",{"class":"row"},["input",{"id":"storyDayTrackerShowQuickPanel","type":"checkbox"}],["span",{},"Show Storydate in the QoL quick panel"]],"\n",["p",{"class":"hint"},"Conservative mode only auto-applies strong transitions such as “the next morning”, “three days later”, an explicit “Day 35:” marker, or a numeric “Storydate 35.3”. Text after an explicit Day/Storydate marker becomes a compact timeline anchor, matching Chibs’ long-chat workflow. Assisted mode leaves weaker phrases such as “later that night” for you to accept or dismiss. Bare references such as “last night” or “tomorrow” do not advance the day by themselves. Existing chats start tracking from the current point unless you explicitly choose Scan loaded history in the tracker."],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableStoryDayTracker"] = () => (checked("enableStoryDayTracker"));
  loaders["enableStoryDayTracker"] = (settings) => { setChecked("enableStoryDayTracker", !!settings.enableStoryDayTracker); };
  readers["storyDayTrackerMode"] = () => (["manual", "conservative", "assisted"].includes(value("storyDayTrackerMode")) ? value("storyDayTrackerMode") : "conservative");
  loaders["storyDayTrackerMode"] = (settings) => { setValue("storyDayTrackerMode", ["manual", "conservative", "assisted"].includes(settings.storyDayTrackerMode) ? settings.storyDayTrackerMode : "conservative"); };
  readers["storyDayTrackerIncludeInContext"] = () => (checked("storyDayTrackerIncludeInContext", true));
  loaders["storyDayTrackerIncludeInContext"] = (settings) => { setChecked("storyDayTrackerIncludeInContext", settings.storyDayTrackerIncludeInContext !== false); };
  readers["storyDayTrackerShowQuickPanel"] = () => (checked("storyDayTrackerShowQuickPanel", true));
  loaders["storyDayTrackerShowQuickPanel"] = (settings) => { setChecked("storyDayTrackerShowQuickPanel", settings.storyDayTrackerShowQuickPanel === true); };

})();

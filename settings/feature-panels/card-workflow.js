// Settings panel owned by card-workflow. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("card-workflow")) return;
  const host = document.getElementById("ds-feature-panel-card-workflow");
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
  host.replaceWith(make(["section",{"class":"card","id":"cardWorkflowCard"},"\n",["h2",{},"Card / discovery workflow"],"\n",["p",{"class":"hint"},"Optional local tools for browsing lots of bots without changing the public bot or SpicyChat account data."],"\n",["label",{},"Card density\n          ",["select",{"id":"cardDensityMode"},"\n",["option",{"value":"normal"},"Normal"],"\n",["option",{"value":"compact"},"Compact"],"\n",["option",{"value":"dense"},"Dense"],"\n"],"\n"],"\n",["label",{},"Discovery/listing card click behavior\n          ",["select",{"id":"cardClickBehavior"},"\n",["option",{"value":"default"},"SpicyChat default"],"\n",["option",{"value":"profile"},"Open character profile"],"\n"],"\n"],"\n",["p",{"class":"hint"},"Profile mode redirects normal bot-card body clicks on discovery/listing pages to the bot profile so you can inspect it before chatting. Explicit creator/Profile/Info/Chat controls keep their normal behavior, and Chats/My Creations rows are left alone."],"\n",["label",{"class":"row"},["input",{"id":"showCopyBotInfoButtons","type":"checkbox"}],["span",{},"Add Copy Bot Info to bot cards"]],"\n",["label",{"class":"row"},["input",{"id":"trackRecentlySeenBots","type":"checkbox"}],["span",{},"Keep a local Recently Seen bot history"]],"\n",["label",{"class":"row"},["input",{"id":"showRecentlySeenButton","type":"checkbox"}],["span",{},"Show Recently Seen on bot listing pages"]],"\n",["label",{},"Recently Seen history limit",["input",{"id":"recentlySeenLimit","max":"250","min":"10","step":"10","type":"number"}]],"\n",["label",{"class":"row"},["input",{"id":"enableBotComparison","type":"checkbox"}],["span",{},"Enable local side-by-side bot comparison"]],"\n",["label",{"class":"row"},["input",{"id":"showQuickNotInterestedButtons","type":"checkbox"}],["span",{},"Add a quick Not Interested button to bot cards"]],"\n",["label",{"class":"row"},["input",{"id":"showQuickLessLikeButtons","type":"checkbox"}],["span",{},"Add a quick Stop recommending me this button to bot cards"]],"\n",["label",{"class":"row"},["input",{"id":"showQuickMoreLikeButtons","type":"checkbox"}],["span",{},"Add a quick More Like This button (positive recommendation feedback; experimental)"]],"\n",["label",{"class":"row"},["input",{"id":"showQuickDislikeButtons","type":"checkbox"}],["span",{},"Add a separate quick Dislike button to bot cards (desktop browser only)"]],"\n",["p",{"class":"hint"},"These actions are separate and opt-in: Not Interested is only a local QoL filter; More Like This submits a positive recommendation preference (+1) without a public bot rating (not yet live-verified); Stop recommending me this uses SpicyChat's own Less Like This action for recommendation preferences; Dislike sends the native chat rating event as well as the negative rating, and keeps a separate confirmed history."],"\n"]));
  // Only an installed panel registers its read/load handlers.
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["cardDensityMode"] = () => (["normal", "compact", "dense"].includes(value("cardDensityMode")) ? value("cardDensityMode") : "normal");
  loaders["cardDensityMode"] = (settings) => { setValue("cardDensityMode", ["normal", "compact", "dense"].includes(settings.cardDensityMode) ? settings.cardDensityMode : "normal"); };
  readers["cardClickBehavior"] = () => (["default", "profile"].includes(value("cardClickBehavior")) ? value("cardClickBehavior") : "default");
  loaders["cardClickBehavior"] = (settings) => { setValue("cardClickBehavior", ["default", "profile"].includes(settings.cardClickBehavior) ? settings.cardClickBehavior : "default"); };
  readers["showCopyBotInfoButtons"] = () => (checked("showCopyBotInfoButtons"));
  loaders["showCopyBotInfoButtons"] = (settings) => { setChecked("showCopyBotInfoButtons", !!settings.showCopyBotInfoButtons); };
  readers["trackRecentlySeenBots"] = () => (checked("trackRecentlySeenBots"));
  loaders["trackRecentlySeenBots"] = (settings) => { setChecked("trackRecentlySeenBots", !!settings.trackRecentlySeenBots); };
  readers["showRecentlySeenButton"] = () => (checked("showRecentlySeenButton"));
  loaders["showRecentlySeenButton"] = (settings) => { setChecked("showRecentlySeenButton", !!settings.showRecentlySeenButton); };
  readers["recentlySeenLimit"] = () => (Math.max(10, Math.min(250, Number(value("recentlySeenLimit", "100")) || 100)));
  loaders["recentlySeenLimit"] = (settings) => { setValue("recentlySeenLimit", Math.max(10, Math.min(250, Number(settings.recentlySeenLimit) || 100))); };
  readers["enableBotComparison"] = () => (checked("enableBotComparison"));
  loaders["enableBotComparison"] = (settings) => { setChecked("enableBotComparison", !!settings.enableBotComparison); };
  readers["showQuickNotInterestedButtons"] = () => (checked("showQuickNotInterestedButtons"));
  loaders["showQuickNotInterestedButtons"] = (settings) => { setChecked("showQuickNotInterestedButtons", !!settings.showQuickNotInterestedButtons); };
  readers["showQuickLessLikeButtons"] = () => (checked("showQuickLessLikeButtons"));
  loaders["showQuickLessLikeButtons"] = (settings) => { setChecked("showQuickLessLikeButtons", !!settings.showQuickLessLikeButtons); };
  readers["showQuickMoreLikeButtons"] = () => (checked("showQuickMoreLikeButtons"));
  loaders["showQuickMoreLikeButtons"] = (settings) => { setChecked("showQuickMoreLikeButtons", !!settings.showQuickMoreLikeButtons); };
  readers["showQuickDislikeButtons"] = () => (checked("showQuickDislikeButtons"));
  loaders["showQuickDislikeButtons"] = (settings) => { setChecked("showQuickDislikeButtons", !!settings.showQuickDislikeButtons); };

})();

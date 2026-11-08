// top-bar: feature-owned Settings markup and persistence.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("top-bar")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-top-bar-1")) return;
  if (!document.getElementById("ds-feature-panel-top-bar-2")) return;
  { const host = document.getElementById("ds-feature-panel-top-bar-1"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Top bar cleanup"],"\n",["p",{"class":"hint"},"Controls the right side of the SpicyChat top bar: language, notifications, theme, and the avatar name area."],"\n",["label",{"class":"row"},["input",{"id":"hideTopBarLanguage","type":"checkbox"}],["span",{},"Hide language selector / EN button"]],"\n",["label",{"class":"row"},["input",{"id":"hideTopBarNotifications","type":"checkbox"}],["span",{},"Hide notification bell"]],"\n",["label",{"class":"row"},["input",{"id":"hideTopBarTheme","type":"checkbox"}],["span",{},"Hide theme switcher"]],"\n"])); }
  { const host = document.getElementById("ds-feature-panel-top-bar-2"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Avatar name"],"\n",["p",{"class":"hint"},"Controls the text next to your avatar, like True Supporter, Get a Taste, or a custom name."],"\n",["label",{},"\n          Display mode\n          ",["select",{"id":"topBarProfilePillMode"},"\n",["option",{"value":"normal"},"Keep normal SpicyChat text"],"\n",["option",{"value":"persona"},"Show current/default persona name"],"\n",["option",{"value":"custom"},"Show custom text"],"\n",["option",{"value":"hide"},"Hide the avatar name area"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"topBarProfilePillPersonaPrefix","type":"checkbox"}],["span",{},"Prefix persona display with \"Persona:\""]],"\n",["label",{},"Custom name text",["input",{"id":"topBarProfilePillCustomText","placeholder":"Example: User","type":"text"}]],"\n",["p",{"class":"hint"},"Persona mode uses the active/saved persona when the extension can detect it. If it cannot detect one, it falls back to Default."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["hideTopBarLanguage"] = () => checked("hideTopBarLanguage");
  loaders["hideTopBarLanguage"] = settings => { setChecked("hideTopBarLanguage", settings.hideTopBarLanguage); };
  readers["hideTopBarNotifications"] = () => checked("hideTopBarNotifications");
  loaders["hideTopBarNotifications"] = settings => { setChecked("hideTopBarNotifications", settings.hideTopBarNotifications); };
  readers["hideTopBarTheme"] = () => checked("hideTopBarTheme");
  loaders["hideTopBarTheme"] = settings => { setChecked("hideTopBarTheme", settings.hideTopBarTheme); };
  readers["topBarProfilePillMode"] = () => value("topBarProfilePillMode", "normal");
  loaders["topBarProfilePillMode"] = settings => { setValue("topBarProfilePillMode", settings.topBarProfilePillMode || "normal"); };
  readers["topBarProfilePillPersonaPrefix"] = () => checked("topBarProfilePillPersonaPrefix");
  loaders["topBarProfilePillPersonaPrefix"] = settings => { setChecked("topBarProfilePillPersonaPrefix", !!settings.topBarProfilePillPersonaPrefix); };
  readers["topBarProfilePillCustomText"] = () => value("topBarProfilePillCustomText", "");
  loaders["topBarProfilePillCustomText"] = settings => { setValue("topBarProfilePillCustomText", settings.topBarProfilePillCustomText || ""); };
})();

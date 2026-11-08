// android-app: Settings markup, load and save handlers for this feature.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("android-app")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-android-app-1")) return;
  if (!document.getElementById("ds-feature-panel-android-app-2")) return;
  { const host = document.getElementById("ds-feature-panel-android-app-1"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Mobile / compact environment"],"\n",["p",{"class":"hint","id":"androidSettingsEnvironmentStatus"},"Environment status will appear here."],"\n",["label",{},"Automatically enable mobile/compact controls when\n          ",["select",{"id":"androidAppControlsMode"},"\n",["option",{"value":"auto"},"Android WebView is detected (APK-safe default)"],"\n",["option",{"value":"android"},"Any Android/mobile browser is detected"],"\n",["option",{"value":"always"},"Always in supported browsers"],"\n",["option",{"value":"off"},"Never"],"\n"],"\n"],"\n",["div",{"class":"button-row"},"\n",["button",{"id":"applyAndroidRecommended","type":"button"},"Apply Mobile Recommended"],"\n",["button",{"id":"hideAndroidAppSettings","type":"button"},"Hide this tab"],"\n"],"\n"])); }
  { const host = document.getElementById("ds-feature-panel-android-app-2"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Compact chat top-bar controls"],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarMenu","type":"checkbox"}],["span",{},"Show one compact QoL menu in the chat top bar"]],"\n",["label",{"class":"row"},["input",{"id":"androidHideComposerShortcuts","type":"checkbox"}],["span",{},"Use the compact top-bar menu instead of separate * composer buttons"]],"\n",["p",{"class":"hint"},"The compact menu can be enabled on desktop or Android browsers. Never disables it entirely; OOC has its own setting."],"\n",["h3",{},"Actions in the compact QoL menu"],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarOoc","type":"checkbox"}],["span",{},"OOC"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarAsterisk","type":"checkbox"}],["span",{},"* action wrapper"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarFormatting","type":"checkbox"}],["span",{},"Formatting shortcuts"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarTranslation","type":"checkbox"}],["span",{},"Translate visible messages (when chat translation is enabled)"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarScroll","type":"checkbox"}],["span",{},"Scroll top / bottom"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarPersona","type":"checkbox"}],["span",{},"Change Persona"]],"\n",["label",{"class":"row"},["input",{"id":"androidTopBarModel","type":"checkbox"}],["span",{},"Model picker"]],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["androidAppControlsMode"] = () => ["auto", "android", "always", "off"].includes(value("androidAppControlsMode")) ? value("androidAppControlsMode") : "auto";
  loaders["androidAppControlsMode"] = settings => { setValue("androidAppControlsMode", ["auto", "android", "always", "off"].includes(settings.androidAppControlsMode) ? settings.androidAppControlsMode : "auto"); };
  readers["androidTopBarMenu"] = () => checked("androidTopBarMenu");
  loaders["androidTopBarMenu"] = settings => { setChecked("androidTopBarMenu", !!settings.androidTopBarMenu); };
  readers["androidHideComposerShortcuts"] = () => checked("androidHideComposerShortcuts", true);
  loaders["androidHideComposerShortcuts"] = settings => { setChecked("androidHideComposerShortcuts", settings.androidHideComposerShortcuts !== false); };
  readers["androidTopBarOoc"] = () => checked("androidTopBarOoc", true);
  loaders["androidTopBarOoc"] = settings => { setChecked("androidTopBarOoc", settings.androidTopBarOoc !== false); };
  readers["androidTopBarAsterisk"] = () => checked("androidTopBarAsterisk", true);
  loaders["androidTopBarAsterisk"] = settings => { setChecked("androidTopBarAsterisk", settings.androidTopBarAsterisk !== false); };
  readers["androidTopBarFormatting"] = () => checked("androidTopBarFormatting", true);
  loaders["androidTopBarFormatting"] = settings => { setChecked("androidTopBarFormatting", settings.androidTopBarFormatting !== false); };
  readers["androidTopBarTranslation"] = () => checked("androidTopBarTranslation");
  loaders["androidTopBarTranslation"] = settings => { setChecked("androidTopBarTranslation", !!settings.androidTopBarTranslation); };
  readers["androidTopBarScroll"] = () => checked("androidTopBarScroll", true);
  loaders["androidTopBarScroll"] = settings => { setChecked("androidTopBarScroll", settings.androidTopBarScroll !== false); };
  readers["androidTopBarPersona"] = () => checked("androidTopBarPersona", true);
  loaders["androidTopBarPersona"] = settings => { setChecked("androidTopBarPersona", settings.androidTopBarPersona !== false); };
  readers["androidTopBarModel"] = () => checked("androidTopBarModel", true);
  loaders["androidTopBarModel"] = settings => { setChecked("androidTopBarModel", settings.androidTopBarModel !== false); };
})();

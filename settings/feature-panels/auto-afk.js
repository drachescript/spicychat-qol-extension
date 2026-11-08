// auto-afk: feature-owned Settings markup and persistence.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("auto-afk")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-auto-afk")) return;
  { const host = document.getElementById("ds-feature-panel-auto-afk"); host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Inactive tab cleanup (Auto-AFK)"],"\n",["label",{"class":"row"},["input",{"id":"autoAfkEnabled","type":"checkbox"}],["span",{},"Enable automatic cleanup for inactive SpicyChat tabs"]],"\n",["label",{},"AFK after\n",["select",{"id":"autoAfkMinutes"},"\n",["option",{"value":"15"},"15 minutes"],"\n",["option",{"value":"30"},"30 minutes"],"\n",["option",{"value":"60"},"1 hour"],"\n",["option",{"value":"120"},"2 hours"],"\n",["option",{"value":"240"},"4 hours"],"\n",["option",{"value":"360"},"6 hours"],"\n",["option",{"selected":"","value":"720"},"12 hours"],"\n",["option",{"value":"1440"},"1 day"],"\n",["option",{"value":"2880"},"2 days"],"\n",["option",{"value":"10080"},"7 days"],"\n",["option",{"value":"43200"},"30 days"],"\n"],"\n"],"\n",["h3",{},"Applies to"],"\n",["label",{"class":"row"},["input",{"checked":"","id":"autoAfkChats","type":"checkbox"}],["span",{},"Chat pages (/chat/*)"]],"\n",["label",{"class":"row"},["input",{"id":"autoAfkHome","type":"checkbox"}],["span",{},"SpicyChat Home"]],"\n",["label",{"class":"row"},["input",{"id":"autoAfkProfiles","type":"checkbox"}],["span",{},"Character / profile pages"]],"\n",["h3",{},"When the timer expires"],"\n",["label",{"class":"row"},["input",{"id":"autoAfkActionDiscard","name":"autoAfkAction","type":"radio","value":"discard"}],["span",{},"Unload tab and keep it open"]],"\n",["label",{"class":"row"},["input",{"id":"autoAfkActionClose","name":"autoAfkAction","type":"radio","value":"close"}],["span",{},"Close tab"]],"\n",["label",{"class":"row"},["input",{"checked":"","id":"autoAfkProtectActive","type":"checkbox"}],["span",{},"Never unload or close the currently active tab"]],"\n",["label",{"class":"row"},["input",{"checked":"","id":"autoAfkResetOnActivate","type":"checkbox"}],["span",{},"Reset the timer when the tab is opened or selected"]],"\n",["p",{"class":"hint"},"Unload or close unused SpicyChat tabs after a set time. Unloaded tabs reload when opened."],"\n",["div",{"class":"button-row"},"\n",["button",{"id":"autoAfkCheckNow","type":"button"},"Run cleanup check now"],"\n"],"\n",["p",{"class":"hint","id":"autoAfkStatus"},"No cleanup check recorded yet."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["autoAfkEnabled"] = () => checked("autoAfkEnabled");
  loaders["autoAfkEnabled"] = settings => { setChecked("autoAfkEnabled", !!settings.autoAfkEnabled); };
  readers["autoAfkMinutes"] = () => Math.min(43200, Math.max(15, Number(value("autoAfkMinutes", "720")) || 720));
  loaders["autoAfkMinutes"] = settings => { setValue("autoAfkMinutes", String(Math.min(43200, Math.max(15, Number(settings.autoAfkMinutes) || 720)))); };
  readers["autoAfkChats"] = () => checked("autoAfkChats", true);
  loaders["autoAfkChats"] = settings => { setChecked("autoAfkChats", settings.autoAfkChats !== false); };
  readers["autoAfkHome"] = () => checked("autoAfkHome");
  loaders["autoAfkHome"] = settings => { setChecked("autoAfkHome", !!settings.autoAfkHome); };
  readers["autoAfkProfiles"] = () => checked("autoAfkProfiles");
  loaders["autoAfkProfiles"] = settings => { setChecked("autoAfkProfiles", !!settings.autoAfkProfiles); };
  readers["autoAfkProtectActive"] = () => checked("autoAfkProtectActive", true);
  loaders["autoAfkProtectActive"] = settings => { setChecked("autoAfkProtectActive", settings.autoAfkProtectActive !== false); };
  readers["autoAfkResetOnActivate"] = () => checked("autoAfkResetOnActivate", true);
  loaders["autoAfkResetOnActivate"] = settings => { setChecked("autoAfkResetOnActivate", settings.autoAfkResetOnActivate !== false); };
  readers["autoAfkAction"] = () => $("autoAfkActionClose")?.checked ? "close" : "discard";
  loaders["autoAfkAction"] = settings => { setChecked("autoAfkActionDiscard", (settings.autoAfkAction || "discard") !== "close"); setChecked("autoAfkActionClose", (settings.autoAfkAction || "discard") === "close"); };
  readers["autoAfkHours"] = () => Math.min(720, Math.max(0.25, (Number(value("autoAfkMinutes", "720")) || 720) / 60));
  loaders["autoAfkHours"] = () => {}; // Derived compatibility value; minutes control is authoritative.
})();

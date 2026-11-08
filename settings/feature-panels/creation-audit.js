// creation-audit: feature-owned Settings panel and persistence. Omitted packages do not mount this panel.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("creation-audit")) return;
  const host = document.getElementById("ds-feature-panel-creation-audit");
  if (!host) return;
  const make = entry => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
    for (const child of children) element.appendChild(make(child));
    return element;
  };
  host.replaceWith(make(["section",{"class":"card"},"\n",["h2",{},"Creation audit"],"\n",["label",{"class":"row"},["input",{"id":"enableCreationAudit","type":"checkbox"}],["span",{},"Enable Creation Audit"]],"\n",["label",{"class":"row"},["input",{"id":"creationAuditQuickStatus","type":"checkbox"}],["span",{},"Add local Needs work / Testing / Finished status controls to audited creation cards"]],"\n",["p",{"class":"hint"},"Checks your bot for possible problems before publishing. It's only a checklist; QoL won't change your bot. It checks things like missing or very short fields, duplicate tags, broken {{char}}/{{user}} placeholders, unusual definition sizes, Lorebook setup, repeated text, and a few common writing/setup problems. Results are advisory only and can be refreshed manually."],"\n"]));
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableCreationAudit"] = () => checked("enableCreationAudit");
  loaders["enableCreationAudit"] = settings => { setChecked("enableCreationAudit", !!settings.enableCreationAudit); };
  readers["creationAuditQuickStatus"] = () => checked("creationAuditQuickStatus");
  loaders["creationAuditQuickStatus"] = settings => { setChecked("creationAuditQuickStatus", settings.creationAuditQuickStatus !== false); };
})();

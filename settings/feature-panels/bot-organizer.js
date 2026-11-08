// bot-organizer: Settings markup, load and save handlers for this feature.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("bot-organizer")) return;
  const make = entry => {
    if (typeof entry === "string") return document.createTextNode(entry);
    const [tag, attrs, ...children] = entry;
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
    for (const child of children) el.appendChild(make(child));
    return el;
  };
  if (!document.getElementById("ds-feature-panel-bot-organizer")) return;
  { const host = document.getElementById("ds-feature-panel-bot-organizer"); host.replaceWith(make(["section",{"class":"card","id":"botOrganizerCard"},"\n",["h2",{},"Bot folders & labels"],"\n",["p",{"class":"hint"},"Organize bot profiles with local folders, notes, tags and creator labels. Nothing changes on SpicyChat."],"\n",["label",{"class":"row"},["input",{"id":"enableBotOrganizer","type":"checkbox"}],["span",{},"Enable Bot Organizer (bot folders & labels)"]],"\n",["label",{"class":"row"},["input",{"id":"botOrganizerExplorerFolders","type":"checkbox"}],["span",{},"Show folder tiles on Favorites and My Creations"]],"\n",["p",{"class":"hint"},"Show folder tiles above bots on Favorites and My Creations. Open folders to view their bots; use the pencil to change their location, icon or cover. Covers are included in Bot Organizer backups."],"\n",["label",{"class":"row"},["input",{"id":"botOrganizerShowCardMeta","type":"checkbox"}],["span",{},"Show my bot labels on cards"]],"\n",["label",{"class":"row"},["input",{"id":"botOrganizerBulkTools","type":"checkbox"}],["span",{},"Show listing filters and bulk selection tools"]],"\n",["label",{},"Bot folders",["textarea",{"id":"botCollections","placeholder":"Testing\nCreature POV\nFavorites to revisit","spellcheck":"false"}]],"\n",["p",{"class":"hint"},"A bot can be in multiple local folders. Create and manage folders on My Creations; deleting a folder never deletes its bots. Bulk actions can update folders and tags."],"\n"])); }
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["enableBotOrganizer"] = () => checked("enableBotOrganizer");
  loaders["enableBotOrganizer"] = settings => { setChecked("enableBotOrganizer", !!settings.enableBotOrganizer); };
  readers["botOrganizerExplorerFolders"] = () => checked("botOrganizerExplorerFolders");
  loaders["botOrganizerExplorerFolders"] = settings => { setChecked("botOrganizerExplorerFolders", !!settings.botOrganizerExplorerFolders); };
  readers["botOrganizerShowCardMeta"] = () => checked("botOrganizerShowCardMeta", true);
  loaders["botOrganizerShowCardMeta"] = settings => { setChecked("botOrganizerShowCardMeta", settings.botOrganizerShowCardMeta !== false); };
  readers["botOrganizerBulkTools"] = () => checked("botOrganizerBulkTools", true);
  loaders["botOrganizerBulkTools"] = settings => { setChecked("botOrganizerBulkTools", settings.botOrganizerBulkTools !== false); };
  readers["botCollections"] = () => value("botCollections", "");
  loaders["botCollections"] = settings => { setValue("botCollections", settings.botCollections || ""); };
})();

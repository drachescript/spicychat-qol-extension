// Feature-owned Settings persistence; existing native Settings markup remains shared.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("bot-archive")) return;
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["botArchiveRememberSeenPublic"] = () => checked("botArchiveRememberSeenPublic");
  loaders["botArchiveRememberSeenPublic"] = (settings) => { setChecked("botArchiveRememberSeenPublic", !!settings.botArchiveRememberSeenPublic); };
  readers["botArchiveOnProfileVisit"] = () => checked("botArchiveOnProfileVisit");
  loaders["botArchiveOnProfileVisit"] = (settings) => { setChecked("botArchiveOnProfileVisit", !!settings.botArchiveOnProfileVisit); };
  readers["botArchiveOnChatOpen"] = () => checked("botArchiveOnChatOpen");
  loaders["botArchiveOnChatOpen"] = (settings) => { setChecked("botArchiveOnChatOpen", !!settings.botArchiveOnChatOpen); };
  readers["botArchiveRefreshHours"] = () => [6, 24, 72, 168].includes(Number(value("botArchiveRefreshHours"))) ? Number(value("botArchiveRefreshHours")) : 24;
  loaders["botArchiveRefreshHours"] = (settings) => { setValue("botArchiveRefreshHours", [6, 24, 72, 168].includes(Number(settings.botArchiveRefreshHours)) ? String(Number(settings.botArchiveRefreshHours)) : "24"); };
})();

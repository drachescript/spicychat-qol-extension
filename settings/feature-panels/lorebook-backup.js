// Feature-owned Settings persistence; existing native Settings markup remains shared.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("lorebook-backup")) return;
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["lorebookBackupToolsEnabled"] = () => checked("lorebookBackupToolsEnabled");
  loaders["lorebookBackupToolsEnabled"] = (settings) => { setChecked("lorebookBackupToolsEnabled", !!settings.lorebookBackupToolsEnabled); };
  readers["lorebookBackupsEnabled"] = () => checked("lorebookBackupsEnabled");
  loaders["lorebookBackupsEnabled"] = (settings) => { setChecked("lorebookBackupsEnabled", !!settings.lorebookBackupsEnabled); };
})();

// Feature-owned Settings persistence; existing native Settings markup remains shared.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("bot-backup")) return;
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["botBackupToolsEnabled"] = () => checked("botBackupToolsEnabled");
  loaders["botBackupToolsEnabled"] = (settings) => { setChecked("botBackupToolsEnabled", !!settings.botBackupToolsEnabled); if ($("botBackupToolsEnabled")) $("botBackupToolsEnabled").dataset.dsAutoBackupDefaultUsed = settings.botBackupToolsEnabled ? "1" : "0"; };
  readers["botArchiveOwnEditorBackups"] = () => checked("botArchiveOwnEditorBackups");
  loaders["botArchiveOwnEditorBackups"] = (settings) => { setChecked("botArchiveOwnEditorBackups", !!settings.botArchiveOwnEditorBackups); };
  readers["botArchiveOwnRevisionLimit"] = () => Math.max(1, Math.min(50, Number(value("botArchiveOwnRevisionLimit", "10")) || 10));
  loaders["botArchiveOwnRevisionLimit"] = (settings) => { setValue("botArchiveOwnRevisionLimit", String(Math.max(1, Math.min(50, Number(settings.botArchiveOwnRevisionLimit) || 10)))); };
})();

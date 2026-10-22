// Feature-owned Settings persistence; existing native Settings markup remains shared.
(() => {
  "use strict";
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) && !profile.features.includes("bot-status")) return;
  const readers = window.__DSQ_FEATURE_SETTINGS_READERS__ ||= Object.create(null);
  const loaders = window.__DSQ_FEATURE_SETTINGS_LOADERS__ ||= Object.create(null);
  readers["botStatusScanSpeed"] = () => Object.prototype.hasOwnProperty.call(BOT_STATUS_SCAN_SPEED_DELAYS, value("botStatusScanSpeed", "safe")) ? value("botStatusScanSpeed", "safe") : "safe";
  loaders["botStatusScanSpeed"] = (settings) => { setValue("botStatusScanSpeed", Object.prototype.hasOwnProperty.call(BOT_STATUS_SCAN_SPEED_DELAYS, settings.botStatusScanSpeed) ? settings.botStatusScanSpeed : "safe"); };
  readers["botStatusStaleDays"] = () => [1, 7, 14, 30].includes(Number(value("botStatusStaleDays", "7"))) ? Number(value("botStatusStaleDays", "7")) : 7;
  loaders["botStatusStaleDays"] = (settings) => { setValue("botStatusStaleDays", [1, 7, 14, 30].includes(Number(settings.botStatusStaleDays)) ? String(Number(settings.botStatusStaleDays)) : "7"); };
  readers["botStatusMaxBots"] = () => Math.min(100000, Math.max(0, Math.floor(Number(value("botStatusMaxBots", "0")) || 0)));
  loaders["botStatusMaxBots"] = (settings) => { setValue("botStatusMaxBots", Number(settings.botStatusMaxBots) > 0 ? String(Math.min(100000, Math.floor(Number(settings.botStatusMaxBots)))) : ""); };
  readers["botStatusMaxMinutes"] = () => Math.min(1440, Math.max(0, Math.floor(Number(value("botStatusMaxMinutes", "0")) || 0)));
  loaders["botStatusMaxMinutes"] = (settings) => { setValue("botStatusMaxMinutes", Number(settings.botStatusMaxMinutes) > 0 ? String(Math.min(1440, Math.floor(Number(settings.botStatusMaxMinutes)))) : ""); };
})();

// Feature-owned options helpers: navigation. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizePendingOptionsNavigation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const age = Date.now() - Number(value.at || 0);
  if (!Number.isFinite(age) || age < -60_000 || age > 5 * 60_000) return null;
  const target = String(value.target || "general").replace(/[^a-z0-9_-]/gi, "") || "general";
  return {
    target,
    search: String(value.search || "").slice(0, 300),
    backup: String(value.backup || "").slice(0, 160),
    lorebookBackup: String(value.lorebookBackup || "").slice(0, 160)
  };
}

async function applyPendingOptionsNavigation(value) {
  const pending = normalizePendingOptionsNavigation(value);
  if (!pending) {
    if (value != null) storageSet({ [PENDING_OPTIONS_NAV_KEY]: null }).catch?.(() => {});
    return false;
  }

  // Clear first so a reload/back-navigation cannot replay an old deep link.
  await storageSet({ [PENDING_OPTIONS_NAV_KEY]: null });

  const validTabs = new Set([...document.querySelectorAll(".tab-button")].map(button => button.dataset.tab));
  const target = validTabs.has(pending.target) ? pending.target : "general";
  if (pending.backup) creatorBackupPendingFocus = { kind: "bot", id: pending.backup };
  else if (pending.lorebookBackup) creatorBackupPendingFocus = { kind: "lorebook", id: pending.lorebookBackup };

  setActiveTab(target);

  if (pending.search) {
    const input = $("settingsSearch");
    if (input) {
      setSettingsSearchExpanded(true);
      input.value = pending.search;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      window.setTimeout(() => input.focus(), 80);
    }
  }

  if (target === "bot-tools" && creatorBackupPendingFocus) {
    creatorBackupManagerLoaded = false;
    loadCreatorBackupManager({ force: true }).catch(() => {});
  }
  return true;
}

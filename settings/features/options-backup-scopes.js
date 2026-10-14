// Feature-owned options helpers: backup-scopes. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function settingBackupScopeForKey(key) {
  if (SETTINGS_BACKUP_OVERRIDES[key]) return SETTINGS_BACKUP_OVERRIDES[key];
  const element = $(key);
  const page = element?.closest?.(".tab-page[data-page]")?.dataset?.page || "";
  for (const [scope, def] of Object.entries(SETTINGS_BACKUP_GROUPS)) {
    if (def.pages.includes(page)) return scope;
  }
  return "settingsGeneral";
}

function settingKeysForBackupScope(scope) {
  return Object.keys(DEFAULT_SETTINGS).filter(key => settingBackupScopeForKey(key) === scope);
}

function isSettingsBackupScope(scope) {
  return SETTINGS_BACKUP_SCOPE_IDS.includes(String(scope || ""));
}

function settingsSubsetForScopes(settingsValue, scopes) {
  const source = { ...DEFAULT_SETTINGS, ...(settingsValue || {}) };
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const out = {};
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    if (!selected.has(scope)) continue;
    for (const key of settingKeysForBackupScope(scope)) out[key] = source[key];
  }
  return out;
}

function settingsPresentSubsetForScopes(settingsValue, scopes) {
  const source = settingsValue && typeof settingsValue === "object" ? settingsValue : {};
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const out = {};
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    if (!selected.has(scope)) continue;
    for (const key of settingKeysForBackupScope(scope)) {
      if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
    }
  }
  return out;
}

function settingsScopeUsageCount(settingsValue, scope) {
  const source = { ...DEFAULT_SETTINGS, ...(settingsValue || {}) };
  return settingKeysForBackupScope(scope).reduce((count, key) => (
    JSON.stringify(source[key]) === JSON.stringify(DEFAULT_SETTINGS[key]) ? count : count + 1
  ), 0);
}

async function readBackupSourceData() {
  const result = await storageGetChecked(BACKUP_STORAGE_KEYS);
  if (!result.ok) throw new Error(result.error || "Browser storage could not be read");

  const largeKeys = [BOT_AVAILABILITY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_STATUS_KEY];
  const data = await retryMissingLargeSavedStores(result.data, largeKeys);
  let stats = {};
  try { stats = await readLargeStorageStats(); } catch {}
  const unresolved = largeKeys.filter(key => (
    Number(stats?.[key] || 0) > 0 && largeSavedStoreRecordCount(key, data[key]) === 0
  ));
  if (unresolved.length) {
    throw new Error(`Large saved data is still loading (${unresolved.join(", ")}). Reopen Backup and try again so the export cannot silently omit recovery data.`);
  }
  return data;
}

function setExportScopeCount(scope, count, suffix = "saved") {
  document.querySelectorAll(`[data-export-count-for="${CSS.escape(scope)}"]`).forEach(node => {
    const numeric = Number(count) || 0;
    node.textContent = numeric ? `(${numeric.toLocaleString()} ${suffix})` : "";
  });
}

function refreshExportScopeCounts(result) {
  for (const scope of SETTINGS_BACKUP_SCOPE_IDS) {
    setExportScopeCount(scope, settingsScopeUsageCount(result.settings, scope), "active/customized");
  }
  for (const [scope, def] of Object.entries(BACKUP_DATA_SCOPE_DEFS)) {
    setExportScopeCount(scope, def.count(result), "saved");
  }
}

async function selectActiveUsedExportScopes({ initialize = false } = {}) {
  let result;
  try {
    result = await readBackupSourceData();
  } catch {
    if (!initialize) showSettingsToast("Could not read local data to build the Active / Used selection.");
    return;
  }
  refreshExportScopeCounts(result);
  document.querySelectorAll("[data-export-scope]").forEach(input => {
    const scope = String(input.dataset.exportScope || "");
    if (isSettingsBackupScope(scope)) {
      input.checked = settingsScopeUsageCount(result.settings, scope) > 0;
      return;
    }
    const def = BACKUP_DATA_SCOPE_DEFS[scope];
    input.checked = !!def && !def.large && def.count(result) > 0;
  });
  exportScopesInitialized = true;
}

async function initializeExportScopeSelection() {
  if (exportScopesInitialized) return;
  await selectActiveUsedExportScopes({ initialize: true });
}

async function exportSettings() {
  let result;
  try {
    result = await readBackupSourceData();
  } catch {
    showSettingsToast("Backup export cancelled because browser storage could not be read safely.");
    return;
  }

  const scopes = selectedExportScopes();
  if (!scopes.size) {
    showSettingsToast("Select at least one data set to export.");
    return;
  }
  $("settingsJson").value = JSON.stringify(buildExportPayload(scopes, result), null, 2);
}

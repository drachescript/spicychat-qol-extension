// Account linking, sync direction selection, saved-list and selected-settings controls.
// Loaded before options.js; controllers execute only after Settings initialization.
function randomSyncDeviceId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizeQolSyncState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schemaVersion: QOL_SYNC_DEVICE_SCHEMA_VERSION,
    deviceId: String(source.deviceId || "").trim(),
    deviceCreatedAt: Number(source.deviceCreatedAt || 0),
    accountId: String(source.accountId || "").trim(),
    linkedAt: Number(source.linkedAt || 0),
    automatic: source.automatic !== false,
    paused: source.paused === true,
    lastRevision: Math.max(0, Number(source.lastRevision || 0)),
    lastSyncAt: Math.max(0, Number(source.lastSyncAt || 0)),
    lastSyncAttemptAt: Math.max(0, Number(source.lastSyncAttemptAt || 0)),
    lastLocalStorageRevision: Math.max(0, Number(source.lastLocalStorageRevision || 0)),
    lastError: String(source.lastError || ""),
    lastErrorAt: Math.max(0, Number(source.lastErrorAt || 0)),
    lastStatus: String(source.lastStatus || "")
  };
}

async function ensureQolSyncState({ resetDevice = false } = {}) {
  const data = await storageGet([QOL_SYNC_STATE_KEY]);
  const state = normalizeQolSyncState(data[QOL_SYNC_STATE_KEY]);
  if (resetDevice || !state.deviceId) {
    state.deviceId = randomSyncDeviceId();
    state.deviceCreatedAt = Date.now();
    state.accountId = resetDevice ? "" : state.accountId;
    state.linkedAt = resetDevice ? 0 : state.linkedAt;
    state.lastRevision = resetDevice ? 0 : state.lastRevision;
    state.lastSyncAt = resetDevice ? 0 : state.lastSyncAt;
    state.lastSyncAttemptAt = resetDevice ? 0 : state.lastSyncAttemptAt;
    state.lastLocalStorageRevision = resetDevice ? 0 : state.lastLocalStorageRevision;
    state.lastError = resetDevice ? "" : state.lastError;
    state.lastErrorAt = resetDevice ? 0 : state.lastErrorAt;
    state.lastStatus = resetDevice ? "Not linked" : state.lastStatus;
    await storageSet({ [QOL_SYNC_STATE_KEY]: state });
  }
  return state;
}

function browserLabelForSync(env) {
  const ua = String(navigator.userAgent || "");
  let browser = "Browser";
  if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua)) browser = "Chrome / Chromium";
  return env.android ? env.label : `${browser} · Desktop`;
}

function syncDeviceMeta() {
  const env = PLATFORM_API?.detectEnvironment?.() || detectSettingsEnvironment();
  let clientVersion = "0.2.25";
  try { clientVersion = chrome.runtime.getManifest?.().version || clientVersion; } catch {}
  return {
    deviceName: browserLabelForSync(env),
    platform: env.android ? "android" : "desktop",
    clientVersion
  };
}

function formatSyncTime(value) {
  const time = Number(value || 0);
  if (!time) return "Never";
  try { return new Date(time).toLocaleString(); }
  catch { return "Unknown"; }
}

const ACCOUNT_SYNC_LIST_NAMES = ["blockedBots", "favoriteBots", "laterBots", "notInterestedBots", "openedChats"];
let accountSyncSelectedPrefs = null;
let accountSyncUserEditing = false;
function readSyncDevicePrefsUi() {
  const previous = accountSyncSelectedPrefs || {};
  const mode = $("accountSyncSettingsMode")?.value || "off";
  const limited = !!$("accountSyncLimitSettings")?.checked;
  const checklist = $("accountSyncSettingsChecklist");
  const allowedKeys = limited
    ? checklist?.children.length
      ? [...checklist.querySelectorAll("input[data-setting-key]:checked")].map(el => el.dataset.settingKey).sort()
      : Array.isArray(previous.allowedKeys) ? [...previous.allowedKeys] : []
    : null;
  const listModes = {};
  for (const name of ACCOUNT_SYNC_LIST_NAMES) {
    listModes[name] = document.querySelector(`[data-sync-list="${name}"]`)?.value || "off";
  }
  return { ...previous, mode, allowedKeys, listModes };
}
function setupSyncSettingsChecklist(prefs) {
  const root = $("accountSyncSettingsChecklist");
  if (!root) return;
  const index = Object.keys(DEFAULT_SETTINGS).sort();
  const previous = new Set(Array.isArray(prefs?.allowedKeys) ? prefs.allowedKeys : index);
  const fragment = document.createDocumentFragment();
  for (const key of index) {
    const label = document.createElement("label");
    label.className = "row account-sync-setting-entry";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.settingKey = key;
    input.checked = previous.has(key);
    const text = document.createElement("span");
    text.textContent = key;
    label.append(input, text);
    fragment.append(label);
  }
  root.replaceChildren(fragment);
  root.onchange = () => { accountSyncUserEditing = true; };
}
function renderSyncDevicePrefs(prefs) {
  if (!prefs || accountSyncUserEditing) return;
  accountSyncSelectedPrefs = prefs;
  const mode = $("accountSyncSettingsMode");
  if (mode) mode.value = prefs.mode || "two-way";
  const limited = $("accountSyncLimitSettings");
  if (limited) limited.checked = Array.isArray(prefs.allowedKeys);
  const selection = $("accountSyncSettingSelection");
  if (selection) selection.hidden = !Array.isArray(prefs.allowedKeys);
  if (Array.isArray(prefs.allowedKeys)) setupSyncSettingsChecklist(prefs);
  else $("accountSyncSettingsChecklist")?.replaceChildren();
  for (const name of ACCOUNT_SYNC_LIST_NAMES) {
    const element = document.querySelector(`[data-sync-list="${name}"]`);
    if (element) element.value = prefs.listModes?.[name] || "off";
  }
  const summary = $("accountSyncSelectionSummary");
  if (summary) summary.textContent = `${Array.isArray(prefs.allowedKeys) ? prefs.allowedKeys.length + " selected settings" : "All syncable settings"}; saved lists use separate per-device directions.`;
}

// Portable backup intentionally contains only non-secret sync choices.
// Device ID, account link, cloud revision and credentials stay local.
function portableAccountSyncRules(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const validModes = new Set(["off", "manual", "two-way", "upload-only", "download-only"]);
  const validListModes = new Set(["off", "two-way", "upload-only", "download-only"]);
  const mode = String(source.mode || "off");
  const keys = Array.isArray(source.allowedKeys)
    ? [...new Set(source.allowedKeys.filter(key => typeof key === "string" && key.length <= 120 && key in DEFAULT_SETTINGS))].sort()
    : null;
  const scopes = Array.isArray(source.scopes)
    ? [...new Set(source.scopes.filter(scope => typeof scope === "string" && scope.length <= 80 &&
        (typeof SETTINGS_BACKUP_SCOPE_IDS === "undefined" || SETTINGS_BACKUP_SCOPE_IDS.includes(scope))))]
    : [];
  const listModes = {};
  for (const name of ACCOUNT_SYNC_LIST_NAMES) {
    const chosen = String(source.listModes?.[name] || "off");
    listModes[name] = validListModes.has(chosen) ? chosen : "off";
  }
  return { schemaVersion: 2, mode: validModes.has(mode) ? mode : "off", allowedKeys: keys, scopes, listModes };
}

// The optional grouped sync picker is injected separately on some builds,
// including Android. Older handlers can race: the first async response may
// re-check boxes which the user has already unchecked. Intercept those events
// before the older bubbling handlers, and serialize the latest full selection.
function setupAccountSyncCategorySelectionGuard() {
  let revision = 0;
  let savedRevision = 0;
  let saving = false;
  let pending = null;
  const groupHost = () => document.getElementById("accountSyncCategoryList");
  const categoryDetails = () => groupHost()?.closest("details");
  const statusNode = () => {
    const details = categoryDetails();
    if (!details) return null;
    let status = document.getElementById("accountSyncCategorySaveStatus");
    if (!status) {
      status = document.createElement("p");
      status.id = "accountSyncCategorySaveStatus";
      status.className = "hint";
      status.setAttribute("role", "status");
      details.append(status);
    }
    return status;
  };
  const selection = () => {
    const host = groupHost();
    if (!host) return null;
    const scopes = [...host.querySelectorAll("input[data-sync-scope]:checked")].map(el => el.dataset.syncScope);
    const keys = [...new Set(scopes.flatMap(scope => {
      if (typeof settingKeysForBackupScope !== "function") return [];
      return settingKeysForBackupScope(scope);
    }))].sort();
    return {
      mode: document.getElementById("accountSyncMode")?.value || "two-way",
      scopes,
      allowedKeys: keys // Even [] is intentional; null means ALL settings.
    };
  };
  const drain = async () => {
    if (saving) return;
    saving = true;
    try {
      while (pending && revision > savedRevision) {
        const attempt = revision;
        const prefs = pending;
        let result;
        try { result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_SET_DEVICE_PREFS", prefs }, 30000); }
        catch (error) { result = { ok: false, message: error?.message || "Sync settings could not be saved" }; }
        if (!result?.ok) {
          if (attempt === revision) {
            const status = statusNode();
            if (status) status.textContent = `Not saved: ${result?.message || "Please try again"}. Your current selections have been kept.`;
            break;
          }
          // A newer change was made while the last request failed; try it.
          savedRevision = attempt;
          continue;
        }
        savedRevision = attempt;
        if (attempt === revision) {
          accountSyncSelectedPrefs = result.prefs || { ...(accountSyncSelectedPrefs || {}), ...prefs };
          const mode = document.getElementById("accountSyncSettingsMode");
          if (mode) mode.value = prefs.mode;
          // Keep the separately-rendered detailed picker consistent; do not
          // rebuild hundreds of mobile checkboxes until they are expanded.
          const limited = document.getElementById("accountSyncLimitSettings");
          if (limited) limited.checked = true;
          const selection = document.getElementById("accountSyncSettingSelection");
          if (selection) selection.hidden = false;
          const checklist = document.getElementById("accountSyncSettingsChecklist");
          if (checklist?.children.length && typeof setupSyncSettingsChecklist === "function") {
            setupSyncSettingsChecklist(accountSyncSelectedPrefs);
          }
          const status = statusNode();
          if (status) status.textContent = `Saved ${prefs.scopes.length} selected group${prefs.scopes.length === 1 ? "" : "s"} on this device.`;
        }
      }
    } finally { saving = false; }
  };
  const change = () => {
    pending = selection();
    if (!pending) return;
    revision++;
    const status = statusNode();
    if (status) status.textContent = "Saving this device's sync selection…";
    void drain();
  };
  document.addEventListener("change", event => {
    if (!groupHost()) return;
    if (event.target?.matches?.("#accountSyncMode, #accountSyncCategoryList input[data-sync-scope]")) {
      event.stopImmediatePropagation();
      change();
    }
  }, true);
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("#accountSyncSelectAll, #accountSyncSelectNone");
    if (!button || !groupHost()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const checked = button.id === "accountSyncSelectAll";
    for (const checkbox of groupHost().querySelectorAll("input[data-sync-scope]")) checkbox.checked = checked;
    change();
  }, true);
}

let accountSyncDevicesCache = [];
let accountSyncLastLinkCode = null;
let accountSyncBusy = false;

function setAccountSyncBusy(busy, status = "") {
  accountSyncBusy = !!busy;
  document.querySelectorAll("#accountSyncCard button, #accountSyncCard input").forEach(control => {
    if (control.id === "accountSyncLinkCode") return;
    control.disabled = accountSyncBusy;
  });
  const node = $("accountSyncActionStatus");
  if (node && status) node.textContent = status;
}

function renderAccountSyncDevices(devices = [], currentDeviceId = "") {
  const host = $("accountSyncDevices");
  if (!host) return;
  host.replaceChildren();
  const list = Array.isArray(devices) ? devices : [];
  if (!list.length) {
    host.append(makeElement("p", { className: "hint", text: "No linked devices were returned yet." }));
    return;
  }
  for (const device of list) {
    const row = makeElement("div", { className: "account-sync-device-row" });
    const text = makeElement("div", { className: "account-sync-device-copy" });
    const title = `${device.name || device.platform || "QoL device"}${device.current || device.id === currentDeviceId ? " · This device" : ""}`;
    text.append(
      makeElement("strong", { text: title }),
      makeElement("span", { className: "hint", text: `${device.platform || "unknown"}${device.clientVersion ? ` · v${device.clientVersion}` : ""} · last seen ${formatSyncTime(device.lastSeenAt)}` })
    );
    row.append(text);
    if (!(device.current || device.id === currentDeviceId)) {
      const remove = makeElement("button", { text: "Unlink", attrs: { type: "button" } });
      remove.addEventListener("click", async () => {
        if (!confirm(`Unlink ${device.name || "this device"} from the QoL account?`)) return;
        setAccountSyncBusy(true, "Unlinking device…");
        const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_REVOKE_DEVICE", deviceId: device.id }, 18000);
        setAccountSyncBusy(false);
        if (!result?.ok) {
          $("accountSyncActionStatus").textContent = result?.message || "Could not unlink that device.";
          return;
        }
        showSettingsToast("Device unlinked.");
        await refreshAccountSyncUi({ refreshDevices: true });
      });
      row.append(remove);
    }
    host.append(row);
  }
}

function renderAccountSyncLinkCode() {
  const box = $("accountSyncGeneratedCodeBox");
  const code = $("accountSyncGeneratedCode");
  const expiry = $("accountSyncGeneratedCodeExpiry");
  if (!box || !code || !expiry) return;
  const value = accountSyncLastLinkCode;
  const valid = !!(value?.code && Number(value.expiresAt || 0) > Date.now());
  box.hidden = !valid;
  if (!valid) return;
  code.textContent = value.code;
  expiry.textContent = `Expires ${formatSyncTime(value.expiresAt)} · one use only`;
}

async function refreshAccountSyncUi({ refreshDevices = false } = {}) {
  const card = $("accountSyncCard");
  if (!card || !PLATFORM_API) return;
  const env = PLATFORM_API.detectEnvironment?.() || detectSettingsEnvironment();
  const localState = await ensureQolSyncState();
  const response = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_STATUS" }, 8000);
  const state = normalizeQolSyncState(response?.state || localState);
  const linked = !!response?.linked;
  const desired = { ...DEFAULT_SETTINGS, ...(loadedSettingsSnapshot || {}) };
  const effective = PLATFORM_API.applyEffectiveSettings?.(desired, DEFAULT_SETTINGS, env) || { dormant: {} };
  const dormantCount = Object.keys(effective.dormant || {}).length;
  const syncDocument = PLATFORM_API.syncableSettingsDocument?.(desired, { revision: state.lastRevision }) || { settings: desired };
  const settingCount = Object.keys(syncDocument.settings || {}).length;

  if ($("accountSyncLinkState")) $("accountSyncLinkState").textContent = linked ? "Linked" : "Not linked";
  if ($("accountSyncAutoState")) $("accountSyncAutoState").textContent = linked ? (state.paused ? "Paused" : "Automatic") : "Starts after linking";
  if ($("accountSyncSettingCount")) $("accountSyncSettingCount").textContent = `${settingCount} setting${settingCount === 1 ? "" : "s"}`;
  if ($("accountSyncDormantCount")) $("accountSyncDormantCount").textContent = `${dormantCount} inactive here`;
  if ($("accountSyncDeviceLabel")) $("accountSyncDeviceLabel").textContent = browserLabelForSync(env);
  if ($("accountSyncDeviceId")) $("accountSyncDeviceId").textContent = state.deviceId || "Preparing…";
  if ($("accountSyncRevision")) $("accountSyncRevision").textContent = String(state.lastRevision || 0);
  renderSyncDevicePrefs(response?.prefs);
  if ($("accountSyncLastSync")) $("accountSyncLastSync").textContent = formatSyncTime(state.lastSyncAt);
  if ($("accountSyncApiBase")) $("accountSyncApiBase").textContent = response?.apiBase || "https://syncqol.drache.uk";

  const caps = env.capabilities || {};
  const supported = [];
  if (caps.styling) supported.push("styles");
  if (caps.editing) supported.push("editing");
  if (caps.helperTabs) supported.push("helper tabs");
  if (caps.bulkOperations) supported.push("bulk");
  if ($("accountSyncCapabilitySummary")) {
    $("accountSyncCapabilitySummary").textContent = `Works here: ${supported.join(", ") || "current-page tools"}.`;
  }

  const setup = $("accountSyncSetup");
  const linkedArea = $("accountSyncLinked");
  const devicesCard = $("accountSyncDevicesCard");
  if (setup) setup.hidden = linked;
  if (linkedArea) linkedArea.hidden = !linked;
  if (devicesCard) devicesCard.hidden = !linked;

  const backendStatus = $("accountSyncBackendStatus");
  if (backendStatus) {
    backendStatus.textContent = linked
      ? `Connected to ${response?.apiBase || "https://syncqol.drache.uk"}. ${state.lastStatus || "Automatic sync is active."}`
      : `Cloudflare sync is ready at ${response?.apiBase || "https://syncqol.drache.uk"}. Create a QoL account here or enter a one-use code from another linked device.`;
  }
  const error = $("accountSyncError");
  if (error) {
    error.hidden = !state.lastError;
    error.textContent = state.lastError ? `Last sync error: ${state.lastError}` : "";
  }
  const pause = $("accountSyncPause");
  if (pause) pause.textContent = state.paused ? "Resume sync" : "Pause sync";

  if (linked && (refreshDevices || !accountSyncDevicesCache.length)) {
    const devices = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_LIST_DEVICES" }, 12000);
    if (devices?.ok) accountSyncDevicesCache = devices.devices || [];
  }
  if (linked) renderAccountSyncDevices(accountSyncDevicesCache, state.deviceId);
  else {
    accountSyncDevicesCache = [];
    accountSyncLastLinkCode = null;
    renderAccountSyncLinkCode();
  }
  renderAccountSyncLinkCode();
  return { state, linked };
}

function setupAccountSyncFoundation() {
  setupAccountSyncCategorySelectionGuard();
  refreshAccountSyncUi({ refreshDevices: true }).catch(() => {});
  $("accountSyncDevicePreferences")?.addEventListener("change", event => {
    if (event.target?.id === "accountSyncLimitSettings") {
      $("accountSyncSettingSelection").hidden = !event.target.checked;
      if (event.target.checked && !$("accountSyncSettingsChecklist")?.children.length) {
        setupSyncSettingsChecklist(accountSyncSelectedPrefs || {});
      }
    }
    accountSyncUserEditing = true;
  });
  $("accountSyncSearchSetting")?.addEventListener("input", event => {
    const term = String(event.target.value || "").toLowerCase();
    document.querySelectorAll("#accountSyncSettingsChecklist .account-sync-setting-entry").forEach(row => {
      row.hidden = !!term && !row.textContent.toLowerCase().includes(term);
    });
  });
  $("accountSyncSavePreferences")?.addEventListener("click", async () => {
    const prefs = readSyncDevicePrefsUi();
    setAccountSyncBusy(true, "Saving device sync choices…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_SET_DEVICE_PREFS", prefs }, 20000);
    setAccountSyncBusy(false);
    if (result?.ok) {
      accountSyncUserEditing = false;
      accountSyncSelectedPrefs = result.prefs;
      $("accountSyncActionStatus").textContent = "Device sync choices saved. Use Sync now to apply changes.";
      await refreshAccountSyncUi({ refreshDevices: false });
    } else $("accountSyncActionStatus").textContent = result?.message || "Could not save sync choices.";
  });

  $("copyAccountSyncDeviceId")?.addEventListener("click", async () => {
    const state = await ensureQolSyncState();
    try {
      await navigator.clipboard.writeText(state.deviceId);
      showSettingsToast("Sync device ID copied.");
    } catch {
      showSettingsToast("Could not copy the device ID.");
    }
  });

  $("accountSyncCreate")?.addEventListener("click", async () => {
    setAccountSyncBusy(true, "Creating QoL account…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_CREATE_ACCOUNT", meta: syncDeviceMeta() }, 120000);
    setAccountSyncBusy(false);
    if (!result?.ok) {
      $("accountSyncActionStatus").textContent = result?.message || "Could not create the QoL account.";
      return;
    }
    if (result.initialSyncOk === false || result.sync?.ok === false) {
      const detail = result.sync?.message ? ` ${result.sync.message}` : "";
      $("accountSyncActionStatus").textContent = `Account created, but the first settings sync failed.${detail} Use Sync now to retry.`;
      showSettingsToast("QoL account created; first sync needs a retry.");
    } else {
      $("accountSyncActionStatus").textContent = "Account created. Your current settings were uploaded and automatic sync is on.";
      showSettingsToast("QoL sync account created.");
    }
    await refreshAccountSyncUi({ refreshDevices: true });
  });

  $("accountSyncLink")?.addEventListener("click", async () => {
    const code = String($("accountSyncLinkCode")?.value || "").trim();
    if (!code) {
      $("accountSyncActionStatus").textContent = "Enter the one-use code from a linked device first.";
      return;
    }
    const initialChoice = $("accountSyncLinkChoice")?.value || "choose";
    const initialOptions = initialChoice === "blocked" ? { mode: "off", blockedOnly: true } :
      initialChoice === "settings" ? { mode: "download-only" } : { mode: "off" };
    setAccountSyncBusy(true, "Linking this device with the selected sync options…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_LINK_ACCOUNT", code, meta: syncDeviceMeta(), initialOptions }, 120000);
    setAccountSyncBusy(false);
    if (!result?.ok) {
      $("accountSyncActionStatus").textContent = result?.message || "Could not link this device.";
      return;
    }
    if ($("accountSyncLinkCode")) $("accountSyncLinkCode").value = "";
    if (result.initialSyncOk === false || result.sync?.ok === false) {
      const detail = result.sync?.message ? ` ${result.sync.message}` : "";
      $("accountSyncActionStatus").textContent = `Device linked, but the first settings download failed.${detail} Use Sync now to retry.`;
      showSettingsToast("Device linked; first sync needs a retry.");
    } else {
      $("accountSyncActionStatus").textContent = initialChoice === "choose"
        ? "Linked. Local settings were not changed. Choose which settings and lists to sync below."
        : initialChoice === "blocked" ? "Linked. Blocked bots were merged. Other settings were left alone."
        : "Linked. Account settings downloaded; other saved lists remain local.";
      showSettingsToast("Device linked to QoL sync.");
    }
    await refreshAccountSyncUi({ refreshDevices: true });
  });

  $("accountSyncNow")?.addEventListener("click", async () => {
    setAccountSyncBusy(true, "Syncing now…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_NOW" }, 120000);
    setAccountSyncBusy(false);
    $("accountSyncActionStatus").textContent = result?.ok ? "Sync complete." : (result?.message || "Sync failed.");
    if (result?.ok) showSettingsToast("QoL settings synced.");
    await refreshAccountSyncUi({ refreshDevices: false });
  });

  $("accountSyncPause")?.addEventListener("click", async () => {
    const current = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_STATUS" }, 8000);
    const state = normalizeQolSyncState(current?.state);
    setAccountSyncBusy(true, state.paused ? "Resuming sync…" : "Pausing sync…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_SET_PAUSED", paused: !state.paused }, 30000);
    setAccountSyncBusy(false);
    $("accountSyncActionStatus").textContent = result?.ok ? (!state.paused ? "Automatic sync paused on this device." : "Automatic sync resumed.") : (result?.message || "Could not change sync state.");
    await refreshAccountSyncUi({ refreshDevices: false });
  });

  $("accountSyncCreateLinkCode")?.addEventListener("click", async () => {
    setAccountSyncBusy(true, "Creating one-use link code…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_CREATE_LINK_CODE" }, 16000);
    setAccountSyncBusy(false);
    if (!result?.ok) {
      $("accountSyncActionStatus").textContent = result?.message || "Could not create a link code.";
      return;
    }
    accountSyncLastLinkCode = result;
    renderAccountSyncLinkCode();
    $("accountSyncActionStatus").textContent = "Link code ready. Enter it on the other device before it expires.";
  });

  $("accountSyncCopyLinkCode")?.addEventListener("click", async () => {
    if (!accountSyncLastLinkCode?.code) return;
    try {
      await navigator.clipboard.writeText(accountSyncLastLinkCode.code);
      showSettingsToast("Link code copied.");
    } catch {
      showSettingsToast("Could not copy the link code.");
    }
  });

  $("accountSyncRefreshDevices")?.addEventListener("click", async () => {
    setAccountSyncBusy(true, "Refreshing linked devices…");
    await refreshAccountSyncUi({ refreshDevices: true });
    setAccountSyncBusy(false);
    $("accountSyncActionStatus").textContent = "Device list refreshed.";
  });

  $("accountSyncDisconnectLocal")?.addEventListener("click", async () => {
    if (!confirm("Disconnect this browser from the QoL account locally? This does not delete your QoL settings. If you want to revoke the device from the account, use another linked device's Unlink button first.")) return;
    setAccountSyncBusy(true, "Disconnecting this browser…");
    const result = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_DISCONNECT_LOCAL" }, 12000);
    setAccountSyncBusy(false);
    if (!result?.ok) {
      $("accountSyncActionStatus").textContent = result?.message || "Could not disconnect this browser.";
      return;
    }
    accountSyncDevicesCache = [];
    accountSyncLastLinkCode = null;
    $("accountSyncActionStatus").textContent = "This browser is no longer linked. Local settings were kept.";
    showSettingsToast("QoL account disconnected on this browser.");
    await refreshAccountSyncUi({ refreshDevices: false });
  });

  $("resetAccountSyncDeviceId")?.addEventListener("click", async () => {
    const status = await runtimeMessageWithTimeout({ type: "DS_QOL_SYNC_STATUS" }, 8000);
    if (status?.linked) {
      showSettingsToast("Disconnect this device from Account & Sync before resetting its local identity.");
      return;
    }
    if (!confirm("Reset this device's local QoL sync identity? No settings are deleted.")) return;
    await ensureQolSyncState({ resetDevice: true });
    await refreshAccountSyncUi();
    showSettingsToast("Local sync device identity reset. Your settings were not changed.");
  });
}


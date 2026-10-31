// Feature-owned options helpers: backup-export. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function normalizeSmartFilterPresets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map((item, index) => {
    const name = String(item?.name || "").replace(/\s+/g, " ").trim();
    if (!name) return null;
    let id = String(item?.id || `preset-${index}`).trim();
    if (id.startsWith("builtin:")) id = `preset-${id.slice(8) || index}`;
    if (seen.has(id)) id = `${id}-${index}`;
    seen.add(id);
    const filters = item?.filters && typeof item.filters === "object" ? item.filters : {};
    const opened = ["any", "opened", "unopened"].includes(filters.opened)
      ? filters.opened
      : (filters.unopened === true ? "unopened" : "any");
    const followed = ["any", "followed", "not-followed"].includes(filters.followed)
      ? filters.followed
      : (filters.followed === true ? "followed" : "any");
    const favorites = ["any", "favorites", "not-favorites"].includes(filters.favorites)
      ? filters.favorites
      : (filters.favorites === true ? "favorites" : "any");
    const later = ["any", "later", "not-later"].includes(filters.later)
      ? filters.later
      : (filters.later === true ? "later" : "any");
    return {
      id,
      name,
      filters: {
        lorebook: ["any", "has", "none"].includes(filters.lorebook) ? filters.lorebook : "any",
        opened,
        followed,
        favorites,
        later
      }
    };
  }).filter(Boolean);
}

function mergeSmartFilterPresets(current, incoming) {
  const byName = new Map(normalizeSmartFilterPresets(current).map(item => [item.name.toLowerCase(), item]));
  for (const item of normalizeSmartFilterPresets(incoming)) byName.set(item.name.toLowerCase(), item);
  return [...byName.values()];
}

function normalizeSmartFilterPins(value, presetSource = null) {
  const valid = new Set([
    "builtin:fresh-finds", "builtin:already-opened", "builtin:followed-fresh", "builtin:favorites",
    "builtin:later", "builtin:favorite-lorebooks", "builtin:unfollowed-fresh", "builtin:unsaved-fresh",
    "builtin:lorebooks-only", "builtin:unopened-lorebooks", "builtin:followed-creators", "builtin:favorite-unopened",
    ...normalizeSmartFilterPresets(presetSource).map(item => item.id)
  ]);
  return uniqueClean(Array.isArray(value) ? value : []).filter(id => valid.has(id)).slice(0, 3);
}

function normalizeBotEditorDraftHistory(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const entries = source.entries && typeof source.entries === "object" && !Array.isArray(source.entries) ? source.entries : {};
  const output = {};
  for (const [key, rawList] of Object.entries(entries)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey || !Array.isArray(rawList)) continue;
    const list = rawList.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawFields = item.fields && typeof item.fields === "object" && !Array.isArray(item.fields) ? item.fields : {};
      const fields = {};
      for (const [field, rawValue] of Object.entries(rawFields)) {
        const cleanField = String(field || "").trim();
        if (!cleanField) continue;
        fields[cleanField] = String(rawValue ?? "");
      }
      if (!Object.keys(fields).length) return null;
      return {
        id: String(item.id || `snap-${Number(item.savedAt) || index}`).trim(),
        savedAt: Number(item.savedAt) || 0,
        reason: String(item.reason || "Snapshot").replace(/\s+/g, " ").trim().slice(0, 80),
        botName: String(item.botName || "").replace(/\s+/g, " ").trim().slice(0, 160),
        fields
      };
    }).filter(Boolean).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 20);
    if (list.length) output[cleanKey] = list;
  }
  return { entries: output };
}

function mergeBotEditorDraftHistory(current, incoming) {
  const left = normalizeBotEditorDraftHistory(current);
  const right = normalizeBotEditorDraftHistory(incoming);
  const entries = { ...left.entries };
  for (const [key, list] of Object.entries(right.entries)) {
    const merged = [...(entries[key] || []), ...list];
    const byId = new Map();
    for (const item of merged) {
      const id = String(item.id || `${item.savedAt}`).trim();
      if (!id) continue;
      const previous = byId.get(id);
      if (!previous || Number(item.savedAt || 0) >= Number(previous.savedAt || 0)) byId.set(id, item);
    }
    entries[key] = [...byId.values()].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, 20);
  }
  return { entries };
}

function selectedExportScopes() {
  return new Set([...document.querySelectorAll("[data-export-scope]")]
    .filter(input => input.checked)
    .map(input => String(input.dataset.exportScope || "").trim())
    .filter(Boolean));
}

function normalizeMemoryVault(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const entries = Array.isArray(value.entries) ? value.entries : [];
  return { version: 1, entries: entries.filter(item => item && typeof item.id === "string" && typeof item.chatId === "string" && typeof item.text === "string" && ["stored", "saved-pending-delete", "restored"].includes(item.status)).map(item => ({ ...item })) };
}

function mergeMemoryVault(current, incoming) {
  const entries = new Map(normalizeMemoryVault(current).entries.map(item => [item.id, item]));
  for (const item of normalizeMemoryVault(incoming).entries) {
    const existing = entries.get(item.id);
    if (!existing || Number(item.updatedAt || 0) >= Number(existing.updatedAt || 0)) entries.set(item.id, item);
  }
  return { version: 1, entries: [...entries.values()] };
}

function buildExportPayload(scopes, result) {
  const selected = scopes instanceof Set ? scopes : new Set(scopes || []);
  const has = key => selected.has(key);
  const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  const payload = {
    _qolBackup: {
      formatVersion: BACKUP_FORMAT_VERSION,
      extensionVersion: chrome.runtime.getManifest()?.version || "",
      exportedAt: new Date().toISOString(),
      ...(PLATFORM_API?.backupMetadata?.(PLATFORM_API.detectEnvironment?.()) || {})
    }
  };

  const selectedSettingScopes = new Set([...selected].filter(isSettingsBackupScope));
  if (has("settings")) {
    payload.settings = settings;
    payload._qolBackup.settingsScopes = ["settings"];
  } else if (selectedSettingScopes.size) {
    payload.settings = settingsSubsetForScopes(settings, selectedSettingScopes);
    payload._qolBackup.settingsScopes = [...selectedSettingScopes];
  }
  if (has("accountSyncRules") && result[QOL_SYNC_DEVICE_PREFS_KEY]) {
    payload.accountSyncRules = portableAccountSyncRules(result[QOL_SYNC_DEVICE_PREFS_KEY]);
  }
  if (has("opened")) {
    payload.openedChats = Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY] : [];
    payload.openedChatMeta = result[OPENED_META_KEY] || {};
  }
  if (has("blocked")) {
    payload.blockedBots = result[BLOCKED_BOTS_KEY] || { ids: [], names: [], meta: {} };
    payload.quickDislikeHistory = normalizeQuickDislikeHistory(result[QUICK_DISLIKE_HISTORY_KEY]);
    payload.quickDislikeBulkState = normalizeQuickDislikeBulkState(result[QUICK_DISLIKE_BULK_STATE_KEY]);
    payload.quickLessLikeHistory = normalizeQuickLessLikeHistory(result[QUICK_LESS_LIKE_HISTORY_KEY]);
    payload.quickLessLikeBulkState = normalizeQuickLessLikeBulkState(result[QUICK_LESS_LIKE_BULK_STATE_KEY]);
  }
  if (has("notInterested")) payload.notInterestedBots = result[NOT_INTERESTED_KEY] || { ids: [], meta: {} };
  if (has("favoriteCreators")) payload.favoriteCreators = result[FAVORITE_CREATORS_KEY] || { handles: [], meta: {} };
  if (has("followedCreators")) payload.followedCreators = result[FOLLOWED_CREATORS_KEY] || { handles: [], meta: {} };
  if (has("creatorBotWatch")) payload.creatorBotWatch = normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]);
  if (has("favoriteBots")) payload.favoriteBots = result[FAVORITE_BOTS_KEY] || { ids: [], meta: {} };
  if (has("laterBots")) payload.laterBots = result[LATER_BOTS_KEY] || { ids: [], meta: {} };
  if (has("memoryVault")) payload.memoryVault = normalizeMemoryVault(result.dsMemoryVaultV1);
  if (has("botOrganization")) {
    const organizer = normalizeBotOrganization(result[BOT_ORGANIZER_KEY]);
    organizer.collections = uniqueClean([
      ...(organizer.collections || []),
      ...String(settings.botCollections || "").split(/[\n,]+/g)
    ]);
    organizer.config = {
      enableBotOrganizer: !!settings.enableBotOrganizer,
      botOrganizerShowCardMeta: settings.botOrganizerShowCardMeta !== false,
      botOrganizerBulkTools: settings.botOrganizerBulkTools !== false
    };
    payload.botOrganization = organizer;
  }
  if (has("chatOrganization")) payload.chatOrganization = normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]);
  if (has("characterQolProfiles")) payload.characterQolProfiles = normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY]);
  if (has("botAvailability")) {
    payload.botAvailability = normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]);
    payload.botUnavailableRecovery = normalizeBotUnavailableRecovery(result[BOT_UNAVAILABLE_RECOVERY_KEY]);
  }
  if (has("botArchive")) payload.botArchive = normalizeBotArchive(result[BOT_ARCHIVE_KEY]);
  if (has("lorebookStatus")) payload.lorebookStatus = normalizeLorebookStatusStore(result[LOREBOOK_STATUS_KEY]);
  if (has("lorebookBackups")) payload.lorebookBackups = normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]);
  if (has("chatbotLorebookLinks")) payload.chatbotLorebookLinks = result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {};
  if (has("savedTextSnippets")) payload.savedTextSnippets = Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY] : [];
  if (has("contextKeeperData")) payload.contextKeeperData = result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {};
  if (has("chatSceneNotes")) payload.chatSceneNotes = result[CHAT_SCENE_NOTES_KEY] && typeof result[CHAT_SCENE_NOTES_KEY] === "object" ? result[CHAT_SCENE_NOTES_KEY] : {};
  if (has("storyDayTrackerData")) payload.storyDayTrackerData = result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {};
  if (has("rpStateTrackerData")) payload.rpStateTrackerData = result[RP_STATE_TRACKER_KEY] && typeof result[RP_STATE_TRACKER_KEY] === "object" ? result[RP_STATE_TRACKER_KEY] : {};
  if (has("chatNudges")) payload.chatNudges = normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]);
  if (has("personas")) {
    payload.personas = Array.isArray(result[PERSONAS_KEY])
      ? result[PERSONAS_KEY]
      : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY] : []);
  }
  if (has("personaOrganization")) {
    payload.personaOrganization = result[PERSONA_ORG_KEY] && typeof result[PERSONA_ORG_KEY] === "object"
      ? result[PERSONA_ORG_KEY]
      : { meta: {} };
  }
  if (has("ooc")) payload.oocTemplates = normalizeOocTemplates(result[OOC_TEMPLATES_KEY] || settings.oocTemplates);
  if (has("generationProfiles")) payload.generationProfiles = normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY]);
  if (has("smartFilterPresets")) payload.smartFilterPresets = normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]);
  if (has("smartFilterPins")) payload.smartFilterPinnedPresets = normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]);
  if (has("botEditorDraftHistory")) payload.botEditorDraftHistory = normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]);
  if (has("chatBookmarks")) payload.chatBookmarks = result[CHAT_BOOKMARKS_KEY] && typeof result[CHAT_BOOKMARKS_KEY] === "object" ? result[CHAT_BOOKMARKS_KEY] : {};
  if (has("recentlySeenBots")) payload.recentlySeenBots = result[RECENTLY_SEEN_BOTS_KEY] && typeof result[RECENTLY_SEEN_BOTS_KEY] === "object" ? result[RECENTLY_SEEN_BOTS_KEY] : { entries: [] };
  if (has("soundscapes")) payload.soundscapes = normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]);
  if (has("tabCleanupSessions")) payload.tabCleanupSessions = normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]);
  if (has("tabCleanupTopics")) payload.tabCleanupTopics = normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]);
  if (has("tabCleanupEnrichment")) payload.tabCleanupEnrichment = result[TAB_CLEANUP_ENRICHMENT_KEY] && typeof result[TAB_CLEANUP_ENRICHMENT_KEY] === "object" ? result[TAB_CLEANUP_ENRICHMENT_KEY] : { meta: {} };
  if (has("localChangeHistory")) payload.localChangeHistory = Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY] : [];
  if (has("localMedia")) {
    payload.localMedia = {
      soundscapeAudio: normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]),
      chatBackgroundMedia: normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY])
    };
  }

  return payload;
}

function backupFilename(ext = "json") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  return `spicychat-qol-backup-${stamp}.${String(ext || "json").replace(/^\./, "")}`;
}

async function ensureBackupTextInBox() {
  // Download buttons are export actions, so always rebuild the box from the
  // currently selected export scopes instead of accidentally downloading a
  // stale/pasted import payload.
  await exportSettings();
  return value("settingsJson").trim();
}

function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function tryNativeBackupSave(text, filename, mimeType) {
  const bytes = new TextEncoder().encode(String(text || "")).byteLength;
  if (!bytes) return false;
  // A native bridge acknowledgement is not evidence of a nonempty file.
  const verified = raw => {
    let value = raw;
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try { value = JSON.parse(value); } catch {}
    }
    if (value === false || value?.ok === false || value?.success === false || value?.error) return false;
    const written = value && typeof value === "object"
      ? Number(value.bytesWritten ?? value.savedBytes ?? value.fileSize ?? value.byteCount ?? NaN)
      : NaN;
    return Number.isFinite(written) && written >= bytes;
  };
  try {
    if (typeof window._dsRequestExport === "function") {
      return verified(await window._dsRequestExport(text, filename));
    }
  } catch { return false; }
  const bridge = window.flutter_inappwebview;
  if (!bridge?.callHandler) return false;
  try {
    return verified(await bridge.callHandler("exportChat", JSON.stringify({
      text, content: text, filename, fileName: filename, mimeType, byteLength: bytes
    })));
  } catch { return false; }
}

function decodeNativePickedFile(result) {
  if (result == null || result === false) return null;
  if (Array.isArray(result)) {
    if (!result.length) return null;
    if (result.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
      try {
        const bytes = new Uint8Array(result);
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          return { blob: new Blob([bytes], { type: "application/gzip" }), name: "Android-backup.json.gz" };
        }
        return { text: new TextDecoder().decode(bytes), name: "Android backup file" };
      } catch { return null; }
    }
    return decodeNativePickedFile(result[0]);
  }
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        const nested = decodeNativePickedFile(parsed);
        if (nested) return nested;
      } catch {}
      return { text: result, name: "Android backup file" };
    }
    return null;
  }
  if (typeof result !== "object") return null;
  const name = String(result.name || result.fileName || result.filename || "Android backup file");
  for (const key of ["text", "content", "data"]) {
    if (typeof result[key] === "string" && result[key].trim()) return { text: result[key], name };
  }
  if (typeof result.base64 === "string" && result.base64) {
    try {
      const binary = atob(result.base64.replace(/^data:[^,]*,/, ""));
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      if (/\.gz$/i.test(name) || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
        return { blob: new Blob([bytes], { type: "application/gzip" }), name: /\.gz$/i.test(name) ? name : `${name}.json.gz` };
      }
      return { text: new TextDecoder().decode(bytes), name };
    } catch {}
  }
  if (Array.isArray(result.bytes)) {
    try {
      const bytes = new Uint8Array(result.bytes);
      if (/\.gz$/i.test(name) || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
        return { blob: new Blob([bytes], { type: "application/gzip" }), name: /\.gz$/i.test(name) ? name : `${name}.json.gz` };
      }
      return { text: new TextDecoder().decode(bytes), name };
    } catch {}
  }
  return null;
}

async function tryNativeBackupPicker() {
  const bridge = window.flutter_inappwebview;
  if (!bridge?.callHandler) return null;
  try {
    const result = await bridge.callHandler("pickFiles", JSON.stringify({
      allowMultiple: false,
      allowedExtensions: ["json", "gz", "txt", "qol", "backup"]
    }));
    return decodeNativePickedFile(result);
  } catch {
    // If this wrapper does not expose the native helper, the hidden HTML file
    // input below remains the normal browser/WebView fallback.
    return null;
  }
}

function requestBrowserDownloadsPermission() {
  return new Promise(resolve => {
    if (!chrome.permissions?.contains || !chrome.permissions?.request) { resolve(false); return; }
    chrome.permissions.contains({ permissions: ["downloads"] }, already => {
      if (chrome.runtime.lastError) { resolve(false); return; }
      if (already) { resolve(true); return; }
      chrome.permissions.request({ permissions: ["downloads"] }, granted => {
        if (chrome.runtime.lastError) resolve(false);
        else resolve(!!granted);
      });
    });
  });
}

async function browserManagerDownload(text, filename, mimeType, permissionAlreadyGranted = false) {
  const allowed = permissionAlreadyGranted || await requestBrowserDownloadsPermission();
  if (!allowed) return false;

  // Prefer the background download path. It survives the async backup build on
  // Firefox/Opera where an extension-page <a download> can lose its user
  // gesture and silently do nothing.
  try {
    const response = await runtimeMessage({
      type: "DS_DOWNLOAD_TEXT_FILE",
      text: String(text ?? ""),
      filename: String(filename || "spicychat-qol-export.txt"),
      mimeType: String(mimeType || "text/plain;charset=utf-8")
    });
    if (response?.ok) return true;
  } catch {}

  if (!chrome.downloads?.download) return false;
  return new Promise(resolve => {
    const blob = new Blob([String(text ?? "")], { type: mimeType });
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      resolve(!!ok);
    };
    try {
      chrome.downloads.download({ url, filename, conflictAction: "uniquify", saveAs: false }, id => {
        if (chrome.runtime.lastError || !Number.isFinite(Number(id))) finish(false);
        else finish(true);
      });
    } catch {
      finish(false);
    }
  });
}

async function downloadBinaryBackup(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

async function gzipBackupText(text) {
  if (typeof CompressionStream !== "function") {
    throw new Error("This browser does not support gzip backups. Use Download .json instead.");
  }
  // Compression happens inside the browser. No file data leaves the device.
  const input = new Blob([text], { type: "application/json;charset=utf-8" });
  return new Response(input.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

async function readGzipBackup(file) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot open .json.gz backups. Decompress the file before importing.");
  }
  if (file.size > MAX_GZIP_FILE_BYTES) {
    throw new Error("Compressed backup exceeds the 100 MB import limit.");
  }
  const reader = file.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMPORT_BACKUP_BYTES) {
        await reader.cancel();
        throw new Error("Decompressed backup exceeds the 250 MB safety limit.");
      }
      chunks.push(value);
    }
    // Join once to avoid quadratic string concatenations on large exports.
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    reader.releaseLock();
  }
}

async function downloadBackupFile(ext = "json") {
  // Ask for download-manager permission on the click, before asynchronous work.
  const managerAllowed = chrome.permissions?.request
    ? await requestBrowserDownloadsPermission()
    : false;
  const scopes = selectedExportScopes();
  if (!scopes.size) { showSettingsToast("Select at least one data set to export."); return; }
  let text = "";
  try {
    const data = await readBackupSourceData();
    // Download directly from the selected data. Avoid formatting a huge JSON
    // string into the settings textarea and omit whitespace from the file.
    text = JSON.stringify(buildExportPayload(scopes, data));
  } catch (error) {
    showSettingsToast(`Backup export failed: ${error?.message || "local data unavailable"}`);
    return;
  }
  if (!text) { showSettingsToast("Nothing to export yet."); return; }

  const bytes = new TextEncoder().encode(text).byteLength;
  const wantGzip = ext === "json.gz" || (ext === "json" && bytes > GZIP_BACKUP_THRESHOLD);
  if (wantGzip) {
    try {
      const blob = await gzipBackupText(text);
      await downloadBinaryBackup(blob, backupFilename("json.gz"));
      showSettingsToast(`Compressed backup downloaded (${(blob.size / 1048576).toFixed(1)} MB from ${(bytes / 1048576).toFixed(1)} MB).`);
    } catch (error) {
      showSettingsToast(`Compressed backup failed: ${error?.message || String(error)}`);
    }
    return;
  }

  const normalizedExt = ext === "txt" ? "txt" : "json";
  const filename = backupFilename(normalizedExt);
  const mime = normalizedExt === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
  const androidBridgePresent = !!(window._dsRequestExport || window.flutter_inappwebview?.callHandler);
  if (androidBridgePresent) {
    const saved = await tryNativeBackupSave(text, filename, mime);
    showSettingsToast(saved
      ? `Android saved the backup (${bytes} bytes).`
      : "Android did not confirm the backup was saved. Use Copy JSON instead; no second download was started.");
    if (!saved) {
      const box = $("settingsJson");
      if (box) box.value = text;
    }
    return;
  }
  if (managerAllowed && bytes <= 12_000_000 && await browserManagerDownload(text, filename, mime, true)) {
    showSettingsToast(`Backup sent to the browser download manager as .${normalizedExt}.`);
    return;
  }
  await downloadBinaryBackup(new Blob([text], { type: mime }), filename);
  showSettingsToast(`Backup downloaded as .${normalizedExt}.`);
}

async function loadBackupFileObject(file) {
  if (!file) return;
  const status = $("status");
  try {
    const gz = /\.gz$/i.test(String(file.name || "")) || file.type === "application/gzip";
    if (Number(file.size || 0) > (gz ? MAX_GZIP_FILE_BYTES : MAX_IMPORT_BACKUP_BYTES)) {
      throw new Error("Backup file is larger than the allowed import size.");
    }
    const text = gz ? await readGzipBackup(file) : await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BACKUP_BYTES) {
      throw new Error("Backup exceeds the 250 MB import limit.");
    }
    const parsed = JSON.parse(text);
    const validation = validateBackupObject(parsed);
    if (!validation.ok) throw new Error(validation.warnings.join(" ") || "No importable QoL categories found.");
    const box = $("settingsJson");
    if (box) box.value = text;
    pendingImportPayload = null;
    cancelImportPreview();
    previewImportSettings();
    if (status) status.textContent = `Loaded ${file.name || "backup file"}. Review the import preview below.`;
  } catch (error) {
    pendingImportPayload = null;
    cancelImportPreview();
    if (status) status.textContent = `Could not load backup file: ${error?.message || "invalid backup"}`;
  }
}

function setupBackupFileIo() {
  const input = $("settingsBackupFile");
  const box = $("settingsJson");
  $("loadBackupFile")?.addEventListener("click", async () => {
    const native = await tryNativeBackupPicker();
    if (native?.blob) {
      const file = new File([native.blob], native.name || "Android-backup.json.gz", { type: "application/gzip" });
      await loadBackupFileObject(file);
      return;
    }
    if (native?.text) {
      const synthetic = { name: native.name || "Android backup file", size: new TextEncoder().encode(native.text).length, text: async () => native.text };
      await loadBackupFileObject(synthetic);
      return;
    }
    if (!input) return;
    input.value = "";
    input.click();
  });
  input?.addEventListener("change", () => loadBackupFileObject(input.files?.[0]));
  $("downloadBackupJson")?.addEventListener("click", () => downloadBackupFile("json"));
  $("downloadBackupGzip")?.addEventListener("click", () => downloadBackupFile("json.gz"));
  $("downloadBackupTxt")?.addEventListener("click", () => downloadBackupFile("txt"));

  if (box) {
    ["dragenter", "dragover"].forEach(type => box.addEventListener(type, event => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      box.classList.add("ds-backup-drop-active");
    }));
    ["dragleave", "drop"].forEach(type => box.addEventListener(type, event => {
      box.classList.remove("ds-backup-drop-active");
      if (type !== "drop" || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      loadBackupFileObject(event.dataTransfer.files[0]);
    }));
  }
}

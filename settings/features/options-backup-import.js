// Feature-owned options helpers: backup-import. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

function replaceSettingsForImport(importedSettings) {
  const imported = importedSettings && typeof importedSettings === "object" ? importedSettings : {};
  const next = { ...DEFAULT_SETTINGS, ...imported };

  [
    "includeTags",
    "excludeTags",
    "blockedTags",
    "blockedWords",
    "blockedCreators",
    "lorebookBlockedIds",
    "blockedBotIds",
    "blockedBotNames",
    "allowedLanguages"
  ].forEach(key => {
    next[key] = uniqueClean(Array.isArray(imported[key]) ? imported[key] : DEFAULT_SETTINGS[key]);
  });

  next.oocTemplates = Array.isArray(imported.oocTemplates)
    ? normalizeOocTemplates(imported.oocTemplates)
    : normalizeOocTemplates(DEFAULT_SETTINGS.oocTemplates);
  next.botEditorSnippets = Array.isArray(imported.botEditorSnippets)
    ? normalizeBotEditorSnippets(imported.botEditorSnippets)
    : [];
  next.replyInstructionBotOverrides = normalizeReplyInstructionOverrides(imported.replyInstructionBotOverrides);

  return next;
}

function selectedSettingsScopesForImport(importScopes) {
  const selected = new Set([...importScopes].filter(isSettingsBackupScope));
  if (importScopes.has("settings")) return new Set(["settings"]);
  return selected;
}

function mergeSettingsGroupsForImport(currentSettings, importedSettings, selectedScopes) {
  if (selectedScopes.has("settings")) return mergeSettingsForImport(currentSettings, importedSettings);
  const subset = settingsPresentSubsetForScopes(importedSettings, selectedScopes);
  return mergeSettingsForImport(currentSettings, subset);
}

function replaceSettingsGroupsForImport(currentSettings, importedSettings, selectedScopes) {
  if (selectedScopes.has("settings")) return replaceSettingsForImport(importedSettings);
  const current = { ...DEFAULT_SETTINGS, ...(currentSettings || {}) };
  const replacement = replaceSettingsForImport(settingsSubsetForScopes(importedSettings, selectedScopes));
  for (const scope of selectedScopes) {
    for (const key of settingKeysForBackupScope(scope)) current[key] = replacement[key];
  }
  return current;
}

function normalizeBotOrganization(value) {
  const source = value && typeof value === "object" ? value : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const out = {};
  for (const [id, raw] of Object.entries(meta)) {
    const key = String(id || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    out[key] = {
      ...raw,
      id: key,
      collections: uniqueClean(raw.collections || []),
      tags: uniqueClean(raw.tags || []).slice(0, 40),
      note: String(raw.note || "").replace(/\s+/g, " ").trim().slice(0, 1000),
      status: ["needs-work", "testing", "finished"].includes(raw.status) ? raw.status : ""
    };
  }
  const config = source.config && typeof source.config === "object" ? {
    enableBotOrganizer: source.config.enableBotOrganizer !== false,
    botOrganizerShowCardMeta: source.config.botOrganizerShowCardMeta !== false,
    botOrganizerBulkTools: source.config.botOrganizerBulkTools !== false
  } : null;
  const folderCovers = {};
  if (source.folderCovers && typeof source.folderCovers === "object") {
    for (const [name, raw] of Object.entries(source.folderCovers)) {
      if (!raw || typeof raw !== "object") continue;
      const key = String(name || "").trim();
      if (!key) continue;
      const mode = ["icon", "auto", "selected", "custom"].includes(raw.mode) ? raw.mode : "icon";
      const image = typeof raw.image === "string" && raw.image.length <= 55000 &&
        /^data:image\/(?:webp|jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(raw.image) ? raw.image : "";
      folderCovers[key] = {
        mode: mode === "custom" && !image ? "icon" : mode,
        ids: uniqueClean(Array.isArray(raw.ids) ? raw.ids : []).slice(0, 2),
        image,
        updatedAt: Number(raw.updatedAt) || 0
      };
    }
  }
  return {
    collections: uniqueClean(source.collections || []),
    folderCovers,
    folderScopes: Object.fromEntries(Object.entries(source.folderScopes && typeof source.folderScopes === "object" && !Array.isArray(source.folderScopes) ? source.folderScopes : {})
      .filter(([name]) => String(name || "").trim())
      .map(([name, scope]) => [String(name).trim(), ["favorites", "chatbots", "shared"].includes(scope) ? scope : "shared"])),
    ...(config ? { config } : {}),
    meta: out
  };
}

function mergeBotOrganizations(current, incoming) {
  const left = normalizeBotOrganization(current);
  const right = normalizeBotOrganization(incoming);
  const meta = { ...left.meta };
  for (const [id, raw] of Object.entries(right.meta)) {
    const previous = meta[id] || {};
    meta[id] = {
      ...previous,
      ...raw,
      collections: uniqueClean([...(previous.collections || []), ...(raw.collections || [])]),
      tags: uniqueClean([...(previous.tags || []), ...(raw.tags || [])]).slice(0, 40)
    };
  }
  return {
    collections: uniqueClean([...(left.collections || []), ...(right.collections || [])]),
    folderCovers: { ...left.folderCovers, ...right.folderCovers },
    folderScopes: { ...left.folderScopes, ...right.folderScopes },
    ...(right.config ? { config: right.config } : (left.config ? { config: left.config } : {})),
    meta
  };
}

function normalizeChatOrganization(value) {
  const source = value && typeof value === "object" ? value : {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const out = {};
  for (const [keyRaw, raw] of Object.entries(meta)) {
    const key = String(keyRaw || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    const collections = uniqueClean(raw.collections || []);
    if (!collections.length) continue;
    out[key] = {
      key,
      title: String(raw.title || "").replace(/\s+/g, " ").trim().slice(0, 200),
      url: String(raw.url || "").trim().slice(0, 1200),
      botId: String(raw.botId || "").trim().slice(0, 120),
      collections,
      updatedAt: Number(raw.updatedAt) || 0
    };
  }
  return { meta: out };
}

function mergeChatOrganizations(current, incoming) {
  const left = normalizeChatOrganization(current);
  const right = normalizeChatOrganization(incoming);
  const meta = { ...left.meta };
  for (const [key, raw] of Object.entries(right.meta)) {
    const previous = meta[key] || {};
    meta[key] = {
      ...previous,
      ...raw,
      collections: uniqueClean([...(previous.collections || []), ...(raw.collections || [])])
    };
  }
  return { meta };
}

function normalizeCharacterQolProfiles(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const output = {};
  const rpState = new Set(["inherit", "on", "off"]);
  const rpStyle = new Set(["inherit", "clean", "quoted"]);
  const rpDetection = new Set(["inherit", "conservative", "balanced", "aggressive"]);
  const autoVoice = new Set(["inherit", "on", "off"]);
  for (const [id, raw] of Object.entries(source)) {
    const key = String(id || raw?.id || "").trim();
    if (!key || !raw || typeof raw !== "object") continue;
    const profile = {
      id: key,
      name: String(raw.name || "").replace(/\s+/g, " ").trim(),
      rpFormatRepair: rpState.has(raw.rpFormatRepair) ? raw.rpFormatRepair : "inherit",
      rpFormatStyle: rpStyle.has(raw.rpFormatStyle) ? raw.rpFormatStyle : "inherit",
      rpFormatDetection: rpDetection.has(raw.rpFormatDetection) ? raw.rpFormatDetection : "inherit",
      autoVoiceOnOpen: autoVoice.has(raw.autoVoiceOnOpen) ? raw.autoVoiceOnOpen : "inherit",
      updatedAt: Number(raw.updatedAt) || 0
    };
    if (profile.rpFormatRepair !== "inherit" || profile.rpFormatStyle !== "inherit" || profile.rpFormatDetection !== "inherit" || profile.autoVoiceOnOpen !== "inherit") {
      output[key] = profile;
    }
  }
  return output;
}

function mergeCharacterQolProfiles(current, incoming) {
  return {
    ...normalizeCharacterQolProfiles(current),
    ...normalizeCharacterQolProfiles(incoming)
  };
}

function migrateBackupPayload(parsed) {
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : parsed;
  const migrations = [];
  if (!source || typeof source !== "object" || Array.isArray(source)) return { payload: source, migrations };

  const botListFields = ["blockedBots", "notInterestedBots", "favoriteBots", "laterBots"];
  for (const key of botListFields) {
    if (!Array.isArray(source[key])) continue;
    source[key] = { ids: uniqueClean(source[key]), meta: {} };
    migrations.push(`${key}: legacy array → saved-bot store`);
  }
  for (const key of ["favoriteCreators", "followedCreators"]) {
    if (!Array.isArray(source[key])) continue;
    source[key] = { handles: uniqueClean(source[key]), meta: {} };
    migrations.push(`${key}: legacy array → creator store`);
  }
  if (!Array.isArray(source.personas) && Array.isArray(source.savedPersonas)) {
    source.personas = source.savedPersonas;
    delete source.savedPersonas;
    migrations.push("savedPersonas → personas");
  }
  if (!Array.isArray(source.openedChats) && source.openedChatMeta && typeof source.openedChatMeta === "object") {
    const ids = uniqueClean(Object.keys(source.openedChatMeta));
    if (ids.length) {
      source.openedChats = ids;
      migrations.push("openedChats rebuilt from openedChatMeta");
    }
  }
  return { payload: source, migrations };
}

function looksLikeAppLogExport(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  if (typeof source.logcat === "string" && source.logcat.trim()) return true;
  if (Array.isArray(source.logs) && source.logs.length) return true;
  const recordLists = [source.entries, source.records, source.events].filter(Array.isArray);
  for (const list of recordLists) {
    if (!list.length) continue;
    const sample = list.slice(0, 8).filter(item => item && typeof item === "object" && !Array.isArray(item));
    if (!sample.length) continue;
    const logish = sample.filter(item => {
      const keys = new Set(Object.keys(item).map(key => String(key).toLowerCase()));
      const signals = ["level", "message", "tag", "stack", "thread", "exception", "timestamp"].filter(key => keys.has(key)).length;
      return signals >= 2 || (keys.has("message") && (keys.has("level") || keys.has("tag")));
    }).length;
    if (logish >= Math.max(1, Math.ceil(sample.length / 2))) return true;
  }
  return false;
}

function importCategoryEntries(parsed) {
  const entries = [];
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const logExport = looksLikeAppLogExport(source);
  const settingsLike = !logExport && (source.settings || (
    !source.openedChats && !source.blockedBots && !source.quickDislikeHistory && !source.quickDislikeBulkState && !source.quickLessLikeHistory && !source.quickLessLikeBulkState && !source.notInterestedBots &&
    !source.favoriteCreators && !source.followedCreators && !source.favoriteBots &&
    !source.laterBots && !source.memoryVault && !source.botOrganization && !source.chatOrganization && !source.characterQolProfiles &&
    !source.botAvailability && !source.botArchive && !source.lorebookBackups && !source.savedTextSnippets &&
    !source.contextKeeperData && !source.storyDayTrackerData && !source.rpStateTrackerData && !source.chatNudges && !source.personas && !source.personaOrganization &&
    !source.oocTemplates && !source.generationProfiles && !source.smartFilterPresets && !source.smartFilterPinnedPresets &&
    !source.botEditorDraftHistory && !source.chatBookmarks && !source.recentlySeenBots && !source.creatorBotWatch &&
    !source.chatbotLorebookLinks && !source.soundscapes && !source.tabCleanupSessions && !source.tabCleanupTopics &&
    !source.tabCleanupEnrichment && !source.localChangeHistory && !source.localMedia && !source.accountSyncRules && !source._qolBackup
  ));
  const add = (scope, label, count) => entries.push({ scope, label, count: Number(count) || 0 });
  if (settingsLike) {
    const settingsSource = source.settings || source || {};
    const declaredScopes = Array.isArray(source?._qolBackup?.settingsScopes)
      ? source._qolBackup.settingsScopes.map(String)
      : [];
    const grouped = declaredScopes.filter(isSettingsBackupScope);
    if (grouped.length) {
      for (const scope of grouped) {
        const keys = settingKeysForBackupScope(scope).filter(key => Object.prototype.hasOwnProperty.call(settingsSource, key));
        add(scope, SETTINGS_BACKUP_GROUPS[scope]?.label || scope, keys.length);
      }
    } else {
      add("settings", "Settings (legacy/all)", Object.keys(settingsSource).filter(k => k !== "_qolBackup").length);
    }
  }
  if (source.accountSyncRules && typeof source.accountSyncRules === "object" && !Array.isArray(source.accountSyncRules)) add("accountSyncRules", "Account & Sync choices (no credentials)", 1);
  if (Array.isArray(source.openedChats)) add("opened", "Bot Status Center opened history", source.openedChats.length);
  if (source.blockedBots && typeof source.blockedBots === "object") add("blocked", "Blocked bots", uniqueClean([...(source.blockedBots.ids || []), ...(source.blockedBots.names || [])]).length);
  if (source.notInterestedBots && typeof source.notInterestedBots === "object") add("notInterested", "Not interested", uniqueClean(source.notInterestedBots.ids || []).length);
  if (source.favoriteCreators && typeof source.favoriteCreators === "object") add("favoriteCreators", "Favorite creators", uniqueClean(source.favoriteCreators.handles || []).length);
  if (source.followedCreators && typeof source.followedCreators === "object") add("followedCreators", "Followed creators", uniqueClean(source.followedCreators.handles || []).length);
  if (source.creatorBotWatch && typeof source.creatorBotWatch === "object") add("creatorBotWatch", "Creator follow/watch history", Object.keys(normalizeCreatorBotWatchState(source.creatorBotWatch).creators || {}).length);
  if (source.favoriteBots && typeof source.favoriteBots === "object") add("favoriteBots", "Favorite bots", uniqueClean(source.favoriteBots.ids || []).length);
  if (source.laterBots && typeof source.laterBots === "object") add("laterBots", "Later bots", uniqueClean(source.laterBots.ids || []).length);
  if (source.memoryVault && typeof source.memoryVault === "object") add("memoryVault", "Memory Vault", normalizeMemoryVault(source.memoryVault).entries.length);
  if (source.botOrganization && typeof source.botOrganization === "object") {
    const organizer = normalizeBotOrganization(source.botOrganization);
    add("botOrganization", "Bot organization", Object.keys(organizer.meta || {}).length + (organizer.collections || []).length);
  }
  if (source.chatOrganization && typeof source.chatOrganization === "object") add("chatOrganization", "Chat organization", Object.keys(normalizeChatOrganization(source.chatOrganization).meta).length);
  if (source.chatBookmarks && typeof source.chatBookmarks === "object") add("chatBookmarks", "Message bookmarks", Object.values(source.chatBookmarks).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0));
  if (source.characterQolProfiles && typeof source.characterQolProfiles === "object") add("characterQolProfiles", "Character QoL profiles", Object.keys(normalizeCharacterQolProfiles(source.characterQolProfiles)).length);
  if (source.botAvailability && typeof source.botAvailability === "object") add("botAvailability", "Bot availability checks", Object.keys(normalizeBotAvailability(source.botAvailability).meta).length);
  if (source.botArchive && typeof source.botArchive === "object") add("botArchive", "Saved bot copies", Object.keys(normalizeBotArchive(source.botArchive).meta).length);
  if (source.lorebookStatus && typeof source.lorebookStatus === "object") add("lorebookStatus", "Lorebook Status / recovery history", Object.keys(normalizeLorebookStatusStore(source.lorebookStatus).meta).length);
  if (source.lorebookBackups && typeof source.lorebookBackups === "object") add("lorebookBackups", "Lorebook backups", Object.keys(normalizeLorebookBackups(source.lorebookBackups).meta).length);
  if (source.chatbotLorebookLinks && typeof source.chatbotLorebookLinks === "object") add("chatbotLorebookLinks", "Chatbot ↔ Lorebook links", Object.keys(source.chatbotLorebookLinks).length);
  if (Array.isArray(source.savedTextSnippets)) add("savedTextSnippets", "Saved snippets", source.savedTextSnippets.length);
  if (source.contextKeeperData && typeof source.contextKeeperData === "object") add("contextKeeperData", "Context Keeper chats", Object.keys(source.contextKeeperData).length);
  if (source.storyDayTrackerData && typeof source.storyDayTrackerData === "object") add("storyDayTrackerData", "Internal Day Tracker chats", Object.keys(source.storyDayTrackerData).length);
  if (source.rpStateTrackerData && typeof source.rpStateTrackerData === "object") add("rpStateTrackerData", "RP State Tracker chats", Object.keys(source.rpStateTrackerData).length);
  if (Array.isArray(source.chatNudges)) add("chatNudges", "Chat Nudges", normalizeChatNudgeStore(source.chatNudges).length);
  if (Array.isArray(source.personas)) add("personas", "Personas", source.personas.length);
  if (source.personaOrganization && typeof source.personaOrganization === "object") add("personaOrganization", "Persona organization", Object.keys(source.personaOrganization.meta || {}).length);
  if (Array.isArray(source.oocTemplates)) add("ooc", "OOC presets", source.oocTemplates.length);
  if (source.generationProfiles && typeof source.generationProfiles === "object") add("generationProfiles", "Generation profiles", Object.keys(source.generationProfiles).length);
  if (Array.isArray(source.smartFilterPresets)) add("smartFilterPresets", "Smart filter presets", normalizeSmartFilterPresets(source.smartFilterPresets).length);
  if (Array.isArray(source.smartFilterPinnedPresets)) add("smartFilterPins", "Pinned Smart Filter presets", normalizeSmartFilterPins(source.smartFilterPinnedPresets, source.smartFilterPresets).length);
  if (source.botEditorDraftHistory && typeof source.botEditorDraftHistory === "object") add("botEditorDraftHistory", "Chatbot editor draft history", Object.values(normalizeBotEditorDraftHistory(source.botEditorDraftHistory).entries).reduce((n, list) => n + list.length, 0));
  if (source.recentlySeenBots && typeof source.recentlySeenBots === "object") add("recentlySeenBots", "Recently seen bots", Array.isArray(source.recentlySeenBots.entries) ? source.recentlySeenBots.entries.length : 0);
  if (source.soundscapes && typeof source.soundscapes === "object") add("soundscapes", "Soundscape scene configuration", normalizeSoundscapeScenes(source.soundscapes).scenes.length);
  if (source.tabCleanupSessions && typeof source.tabCleanupSessions === "object") add("tabCleanupSessions", "Saved tab sessions", normalizeTabCleanupSessions(source.tabCleanupSessions).sessions.length);
  if (source.tabCleanupTopics && typeof source.tabCleanupTopics === "object") add("tabCleanupTopics", "Tab Cleanup topics", normalizeTabCleanupTopics(source.tabCleanupTopics).topics.length);
  if (source.tabCleanupEnrichment && typeof source.tabCleanupEnrichment === "object") add("tabCleanupEnrichment", "Tab Cleanup profile metadata", Object.keys(source.tabCleanupEnrichment.meta || {}).length);
  if (Array.isArray(source.localChangeHistory)) add("localChangeHistory", "Recent QoL change history", source.localChangeHistory.length);
  if (source.localMedia && typeof source.localMedia === "object") {
    const audioCount = normalizeSoundscapeAudio(source.localMedia.soundscapeAudio).items.length;
    const backgrounds = normalizeChatBackgroundMediaStore(source.localMedia.chatBackgroundMedia);
    add("localMedia", "Local media", audioCount + (backgrounds.global ? 1 : 0) + Object.keys(backgrounds.chats || {}).length);
  }
  return entries;
}

function importCategoryCounts(parsed) {
  return importCategoryEntries(parsed).map(item => [item.label, item.count]);
}

function validateBackupObject(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, warnings: ["Backup root must be a JSON object."], entries: [], migrated: parsed, migrations: [] };
  const originalMeta = parsed._qolBackup && typeof parsed._qolBackup === "object" ? parsed._qolBackup : null;
  const futureSchema = Number(originalMeta?.formatVersion || 0) > BACKUP_FORMAT_VERSION;
  const migration = migrateBackupPayload(parsed);
  const source = migration.payload;
  const entries = importCategoryEntries(source);
  const known = new Set(["_qolBackup", "settings", "memoryVault", "openedChats", "openedChatMeta", "blockedBots", "quickDislikeHistory", "quickDislikeBulkState", "quickLessLikeHistory", "quickLessLikeBulkState", "notInterestedBots", "favoriteCreators", "followedCreators", "creatorBotWatch", "favoriteBots", "laterBots", "botOrganization", "chatOrganization", "characterQolProfiles", "botAvailability", "botArchive", "lorebookStatus", "lorebookBackups", "chatbotLorebookLinks", "savedTextSnippets", "contextKeeperData", "storyDayTrackerData", "rpStateTrackerData", "chatNudges", "personas", "personaOrganization", "oocTemplates", "generationProfiles", "smartFilterPresets", "smartFilterPinnedPresets", "botEditorDraftHistory", "chatBookmarks", "recentlySeenBots", "soundscapes", "tabCleanupSessions", "tabCleanupTopics", "tabCleanupEnrichment", "localChangeHistory", "localMedia", "accountSyncRules"]);
  const warnings = Object.keys(source).filter(key => !known.has(key)).map(key => `Unknown top-level field: ${key}`);
  const meta = source._qolBackup && typeof source._qolBackup === "object" ? source._qolBackup : null;
  if (!meta) warnings.push("Legacy backup: no QoL backup metadata found (still importable after preview). ");
  if (migration.migrations.length) warnings.push(`Legacy layout migration: ${migration.migrations.join("; ")}.`);
  if (futureSchema) warnings.push(`Backup format ${originalMeta.formatVersion} is newer than this build supports (${BACKUP_FORMAT_VERSION}). Recognized categories can still be restored; unknown/newer categories will be skipped rather than blocking the whole import.`);
  const looksLikeLog = looksLikeAppLogExport(source);
  if (looksLikeLog) warnings.push("This looks like an app/log export rather than a SpicyChat QoL backup.");
  if (!entries.length && !looksLikeLog) warnings.push("No importable QoL categories were found.");
  return { ok: entries.length > 0, warnings, entries, meta, migrated: source, migrations: migration.migrations, futureSchema };
}

function selectedImportScopes() {
  return new Set([...document.querySelectorAll("[data-import-scope]")].filter(input => input.checked).map(input => input.dataset.importScope));
}

function importPreviewDetails(parsed, validation) {
  const meta = validation?.meta || {};
  const details = [];
  if (meta.formatVersion) details.push(`Backup schema v${meta.formatVersion}`);
  else details.push("Legacy backup schema");
  if (meta.extensionVersion) details.push(`exported by QoL v${meta.extensionVersion}`);
  if (meta.exportedAt) {
    const when = new Date(meta.exportedAt);
    if (!Number.isNaN(when.getTime())) details.push(`exported ${when.toLocaleString()}`);
  }

  const personas = Array.isArray(parsed?.personas) ? parsed.personas : [];
  if (personas.length) {
    const withText = personas.filter(item => String(item?.description || item?.highlights || "").trim()).length;
    const withAvatar = personas.filter(item => String(item?.avatarDataUrl || "").startsWith("data:image/")).length;
    details.push(`Personas: ${personas.length} total · ${withText} with text · ${withAvatar} with local avatar data`);
  }

  if (parsed?.localMedia) details.push("Local media is included in this backup and may make the file much larger");
  else details.push("Local soundscape audio and chat-background image bytes are not included unless Local media is selected");
  return details;
}

function refreshImportPreviewImpact() {
  const impact = $("importPreviewImpact");
  if (!impact || !pendingImportPayload) return;
  const validation = validateBackupObject(pendingImportPayload);
  const selected = selectedImportScopes();
  const mode = document.querySelector("input[name='importMode']:checked")?.value === "replace" ? "replace" : "merge";
  const chosen = validation.entries.filter(item => selected.has(item.scope));
  const total = chosen.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const modeText = mode === "replace"
    ? "Replace mode: only the selected categories will be replaced; categories not selected remain untouched."
    : "Merge mode: selected categories are combined with current local data and supported duplicates are removed.";
  const details = importPreviewDetails(pendingImportPayload, validation);
  if (validation.futureSchema) details.unshift("Newer backup schema: partial/version-tolerant restore mode");
  const unknownCount = validation.warnings.filter(text => text.startsWith("Unknown top-level field:")).length;
  if (unknownCount) details.unshift(`${unknownCount} unknown/newer top-level field${unknownCount === 1 ? "" : "s"} will be skipped`);
  impact.replaceChildren(
    makeElement("strong", { text: `${chosen.length} selected categor${chosen.length === 1 ? "y" : "ies"} · ${total.toLocaleString()} saved item${total === 1 ? "" : "s"}` }),
    makeElement("p", { className: "hint", text: modeText }),
    makeElement("p", { className: "hint", text: details.join(" · ") })
  );
}

function previewImportSettings() {
  hideImportRecoveryActions();
  const preview = $("importPreview");
  const summary = $("importPreviewSummary");
  const countsHost = $("importPreviewCounts");

  try {
    const parsed = JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(parsed);
    if (!validation.ok) {
      pendingImportPayload = null;
      if (preview) preview.hidden = true;
      const status = $("status");
      if (status) status.textContent = `Import preview stopped: ${validation.warnings.join(" ") || "No importable QoL categories were found."}`;
      return;
    }

    pendingImportPayload = validation.migrated || parsed;
    if (preview) preview.hidden = false;
    if (summary) {
      const warningText = validation.warnings.length ? ` ${validation.warnings.join(" ")}` : " Backup structure looks valid.";
      summary.textContent = `${validation.entries.length} categor${validation.entries.length === 1 ? "y" : "ies"} found. Choose exactly what to restore; nothing changes until Import now.${warningText}`;
    }
    if (countsHost) {
      countsHost.replaceChildren(...validation.entries.map(item => {
        const label = makeElement("label", { className: "row import-scope-row" });
        const input = makeElement("input", { attrs: { type: "checkbox", "data-import-scope": item.scope } });
        input.checked = true;
        input.addEventListener("change", refreshImportPreviewImpact);
        label.append(input, makeElement("span", { text: `${item.label}: ${item.count}` }));
        return label;
      }));
    }
    refreshImportPreviewImpact();
  } catch {
    pendingImportPayload = null;
    if (preview) preview.hidden = true;
    const status = $("status");
    if (status) status.textContent = "Import preview failed: that does not look like a valid QoL backup.";
  }
}

function validateImportBackup() {
  try {
    const parsed = JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(parsed);
    const status = $("status");
    if (!validation.ok) {
      if (status) status.textContent = `Backup validation failed. ${validation.warnings.join(" ")}`;
      return;
    }
    const metaText = validation.meta?.extensionVersion ? ` Exported by v${validation.meta.extensionVersion}.` : "";
    const warningText = validation.warnings.length ? ` Warnings: ${validation.warnings.join(" ")}` : " No structural warnings found.";
    if (status) status.textContent = `Valid QoL backup with ${validation.entries.length} importable categories.${metaText}${warningText}`;
  } catch {
    const status = $("status");
    if (status) status.textContent = "Backup validation failed: invalid JSON.";
  }
}

function cancelImportPreview() {
  pendingImportPayload = null;
  pendingImportSafetyDownload = null;
  hideImportRecoveryActions();
  const preview = $("importPreview");
  if (preview) preview.hidden = true;
  $("importPreviewImpact")?.replaceChildren();
}

async function importSettings() {
  try {
    const rawParsed = pendingImportPayload || JSON.parse(value("settingsJson"));
    const validation = validateBackupObject(rawParsed);
    if (!validation.ok) throw new Error(validation.warnings.join(" ") || "Backup is not safely importable");
    const parsed = validation.migrated || rawParsed;
    const mode = document.querySelector("input[name='importMode']:checked")?.value === "replace" ? "replace" : "merge";
    const importScopes = selectedImportScopes();
    const hasImportScope = scope => !document.querySelector("[data-import-scope]") || importScopes.has(scope);
    if (document.querySelector("[data-import-scope]") && !importScopes.size) throw new Error("No import categories selected");
    const currentRead = await storageGetChecked([
      "settings",
      QOL_SYNC_DEVICE_PREFS_KEY,
      OPENED_KEY,
      OPENED_META_KEY,
      BLOCKED_BOTS_KEY,
      QUICK_DISLIKE_HISTORY_KEY,
      QUICK_DISLIKE_BULK_STATE_KEY,
      QUICK_LESS_LIKE_HISTORY_KEY,
      QUICK_LESS_LIKE_BULK_STATE_KEY,
      NOT_INTERESTED_KEY,
      PERSONAS_KEY,
      LEGACY_PERSONAS_KEY,
      PERSONA_ORG_KEY,
      OOC_TEMPLATES_KEY,
      FAVORITE_CREATORS_KEY,
      FOLLOWED_CREATORS_KEY,
      FAVORITE_BOTS_KEY,
      LATER_BOTS_KEY,
      BOT_ORGANIZER_KEY,
      CHAT_ORGANIZER_KEY,
      CHARACTER_QOL_PROFILES_KEY,
      BOT_AVAILABILITY_KEY,
      BOT_ARCHIVE_KEY,
      LOREBOOK_STATUS_KEY,
      LOREBOOK_BACKUPS_KEY,
      SAVED_TEXT_SNIPPETS_KEY,
      CONTEXT_KEEPER_DATA_KEY,
      STORY_DAY_TRACKER_KEY,
      RP_STATE_TRACKER_KEY,
      CHAT_NUDGE_STORE_KEY,
      GENERATION_PROFILES_KEY,
      SMART_FILTER_PRESETS_KEY,
      SMART_FILTER_PINNED_KEY,
      BOT_EDITOR_DRAFT_HISTORY_KEY,
      CHAT_BOOKMARKS_KEY,
      RECENTLY_SEEN_BOTS_KEY,
      CREATOR_BOT_WATCH_KEY,
      CHATBOT_LOREBOOK_LINKS_KEY,
      SOUNDSCAPES_KEY,
      SOUNDSCAPE_AUDIO_KEY,
      CHAT_BACKGROUNDS_KEY,
      TAB_CLEANUP_SESSIONS_KEY,
      TAB_CLEANUP_TOPICS_KEY,
      TAB_CLEANUP_ENRICHMENT_KEY,
      LOCAL_CHANGE_HISTORY_KEY
    ]);
    if (!currentRead.ok) throw new Error(currentRead.error || "Current QoL data could not be read safely");
    const current = currentRead.data;

    const payload = {};
    const parsedLooksLikeSettings =
      parsed.settings ||
      (!parsed.openedChats &&
        !parsed.blockedBots &&
        !parsed.quickDislikeHistory &&
        !parsed.notInterestedBots &&
        !parsed.favoriteCreators &&
        !parsed.followedCreators &&
        !parsed.favoriteBots &&
        !parsed.laterBots &&
        !parsed.botOrganization &&
        !parsed.chatOrganization &&
        !parsed.characterQolProfiles &&
        !parsed.botAvailability &&
        !parsed.botArchive &&
        !parsed.lorebookBackups &&
        !parsed.savedTextSnippets &&
        !parsed.contextKeeperData &&
        !parsed.storyDayTrackerData &&
        !parsed.rpStateTrackerData &&
        !parsed.chatNudges &&
        !parsed.personas &&
        !parsed.personaOrganization &&
        !parsed.oocTemplates &&
        !parsed.generationProfiles &&
        !parsed.smartFilterPresets &&
        !parsed.smartFilterPinnedPresets &&
        !parsed.botEditorDraftHistory &&
        !parsed.chatBookmarks &&
        !parsed.recentlySeenBots &&
        !parsed.creatorBotWatch &&
        !parsed.chatbotLorebookLinks &&
        !parsed.soundscapes &&
        !parsed.tabCleanupSessions &&
        !parsed.tabCleanupTopics &&
        !parsed.tabCleanupEnrichment &&
        !parsed.localChangeHistory &&
        !parsed.localMedia);

    const selectedSettingsScopes = selectedSettingsScopesForImport(importScopes);
    if (parsedLooksLikeSettings && selectedSettingsScopes.size) {
      payload.settings = mode === "replace"
        ? replaceSettingsGroupsForImport(current.settings, parsed.settings || parsed, selectedSettingsScopes)
        : mergeSettingsGroupsForImport(current.settings, parsed.settings || parsed, selectedSettingsScopes);
    }

    if (hasImportScope("accountSyncRules") && parsed.accountSyncRules && typeof parsed.accountSyncRules === "object" && !Array.isArray(parsed.accountSyncRules)) {
      const rules = portableAccountSyncRules(parsed.accountSyncRules);
      // Restore portable device choices only. The linked account/device identity
      // and credentials in this browser remain untouched. Request a full sync
      // when the restored mode permits it; never import old cloud cursors.
      payload[QOL_SYNC_DEVICE_PREFS_KEY] = {
        ...rules,
        fullUploadNeeded: rules.mode === "two-way" || rules.mode === "upload-only",
        fullDownloadNeeded: rules.mode === "two-way" || rules.mode === "download-only"
      };
    }

    if (hasImportScope("opened") && Array.isArray(parsed.openedChats)) {
      payload[OPENED_KEY] = mode === "replace"
        ? uniqueClean(parsed.openedChats)
        : uniqueClean([...(Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : []), ...parsed.openedChats]);
    }

    if (hasImportScope("opened") && parsed.openedChatMeta && typeof parsed.openedChatMeta === "object") {
      payload[OPENED_META_KEY] = mode === "replace"
        ? normalizeMetaStore(parsed.openedChatMeta)
        : mergeMetaStores(current[OPENED_META_KEY], parsed.openedChatMeta);
    }

    if (hasImportScope("blocked") && parsed.blockedBots && typeof parsed.blockedBots === "object") {
      payload[BLOCKED_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.blockedBots)
        : mergeBotStores(current[BLOCKED_BOTS_KEY], parsed.blockedBots);
    }

    if (hasImportScope("blocked") && parsed.quickDislikeHistory && typeof parsed.quickDislikeHistory === "object") {
      payload[QUICK_DISLIKE_HISTORY_KEY] = mode === "replace"
        ? normalizeQuickDislikeHistory(parsed.quickDislikeHistory)
        : mergeQuickDislikeHistories(current[QUICK_DISLIKE_HISTORY_KEY], parsed.quickDislikeHistory);
    }
    if (hasImportScope("blocked") && parsed.quickDislikeBulkState && typeof parsed.quickDislikeBulkState === "object") {
      payload[QUICK_DISLIKE_BULK_STATE_KEY] = normalizeQuickDislikeBulkState(parsed.quickDislikeBulkState);
    }

    if (hasImportScope("blocked") && parsed.quickLessLikeHistory && typeof parsed.quickLessLikeHistory === "object") {
      payload[QUICK_LESS_LIKE_HISTORY_KEY] = mode === "replace"
        ? normalizeQuickLessLikeHistory(parsed.quickLessLikeHistory)
        : mergeQuickLessLikeHistories(current[QUICK_LESS_LIKE_HISTORY_KEY], parsed.quickLessLikeHistory);
    }
    if (hasImportScope("blocked") && parsed.quickLessLikeBulkState && typeof parsed.quickLessLikeBulkState === "object") {
      payload[QUICK_LESS_LIKE_BULK_STATE_KEY] = normalizeQuickLessLikeBulkState(parsed.quickLessLikeBulkState);
    }

    if (hasImportScope("notInterested") && parsed.notInterestedBots && typeof parsed.notInterestedBots === "object") {
      payload[NOT_INTERESTED_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.notInterestedBots)
        : mergeBotStores(current[NOT_INTERESTED_KEY], parsed.notInterestedBots);
    }

    if (hasImportScope("favoriteCreators") && parsed.favoriteCreators && typeof parsed.favoriteCreators === "object") {
      payload[FAVORITE_CREATORS_KEY] = mode === "replace"
        ? normalizeCreatorStore(parsed.favoriteCreators)
        : mergeCreatorStores(current[FAVORITE_CREATORS_KEY], parsed.favoriteCreators);
    }

    if (hasImportScope("followedCreators") && parsed.followedCreators && typeof parsed.followedCreators === "object") {
      payload[FOLLOWED_CREATORS_KEY] = mode === "replace"
        ? normalizeCreatorStore(parsed.followedCreators)
        : mergeCreatorStores(current[FOLLOWED_CREATORS_KEY], parsed.followedCreators);
    }

    if (hasImportScope("creatorBotWatch") && parsed.creatorBotWatch && typeof parsed.creatorBotWatch === "object") {
      const incoming = normalizeCreatorBotWatchState(parsed.creatorBotWatch);
      if (mode === "replace") payload[CREATOR_BOT_WATCH_KEY] = incoming;
      else {
        const existing = normalizeCreatorBotWatchState(current[CREATOR_BOT_WATCH_KEY]);
        payload[CREATOR_BOT_WATCH_KEY] = normalizeCreatorBotWatchState({
          ...existing,
          ...incoming,
          creators: { ...(existing.creators || {}), ...(incoming.creators || {}) },
          recent: [...(existing.recent || []), ...(incoming.recent || [])]
        });
      }
    }

    if (hasImportScope("favoriteBots") && parsed.favoriteBots && typeof parsed.favoriteBots === "object") {
      payload[FAVORITE_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.favoriteBots)
        : mergeBotStores(current[FAVORITE_BOTS_KEY], parsed.favoriteBots);
    }

    if (hasImportScope("laterBots") && parsed.laterBots && typeof parsed.laterBots === "object") {
      payload[LATER_BOTS_KEY] = mode === "replace"
        ? normalizeBotStore(parsed.laterBots)
        : mergeBotStores(current[LATER_BOTS_KEY], parsed.laterBots);
    }

    if (hasImportScope("memoryVault") && parsed.memoryVault && typeof parsed.memoryVault === "object") {
      payload.dsMemoryVaultV1 = mode === "replace"
        ? normalizeMemoryVault(parsed.memoryVault)
        : mergeMemoryVault(current.dsMemoryVaultV1, parsed.memoryVault);
    }

    if (hasImportScope("botOrganization") && parsed.botOrganization && typeof parsed.botOrganization === "object") {
      const incomingOrganizer = normalizeBotOrganization(parsed.botOrganization);
      payload[BOT_ORGANIZER_KEY] = mode === "replace"
        ? incomingOrganizer
        : mergeBotOrganizations(current[BOT_ORGANIZER_KEY], incomingOrganizer);

      const hasFolderDefinitions = Array.isArray(parsed.botOrganization.collections);
      const hasOrganizerConfig = parsed.botOrganization.config && typeof parsed.botOrganization.config === "object";
      if (hasFolderDefinitions || hasOrganizerConfig) {
        const settings = { ...DEFAULT_SETTINGS, ...(current.settings || {}), ...(payload.settings || {}) };
        if (hasFolderDefinitions) {
          const currentFolders = uniqueClean(String(current.settings?.botCollections || "").split(/[\n,]+/g));
          const importedFolders = incomingOrganizer.collections || [];
          settings.botCollections = (mode === "replace"
            ? importedFolders
            : uniqueClean([...currentFolders, ...importedFolders])).join("\n");
        }
        if (hasOrganizerConfig) {
          settings.enableBotOrganizer = incomingOrganizer.config?.enableBotOrganizer !== false;
          settings.botOrganizerShowCardMeta = incomingOrganizer.config?.botOrganizerShowCardMeta !== false;
          settings.botOrganizerBulkTools = incomingOrganizer.config?.botOrganizerBulkTools !== false;
        }
        payload.settings = settings;
      }
    }

    if (hasImportScope("chatOrganization") && parsed.chatOrganization && typeof parsed.chatOrganization === "object") {
      payload[CHAT_ORGANIZER_KEY] = mode === "replace"
        ? normalizeChatOrganization(parsed.chatOrganization)
        : mergeChatOrganizations(current[CHAT_ORGANIZER_KEY], parsed.chatOrganization);
    }

    if (hasImportScope("characterQolProfiles") && parsed.characterQolProfiles && typeof parsed.characterQolProfiles === "object") {
      payload[CHARACTER_QOL_PROFILES_KEY] = mode === "replace"
        ? normalizeCharacterQolProfiles(parsed.characterQolProfiles)
        : mergeCharacterQolProfiles(current[CHARACTER_QOL_PROFILES_KEY], parsed.characterQolProfiles);
    }

    if (hasImportScope("botAvailability") && parsed.botAvailability && typeof parsed.botAvailability === "object") {
      payload[BOT_AVAILABILITY_KEY] = mode === "replace"
        ? normalizeBotAvailability(parsed.botAvailability)
        : mergeBotAvailability(current[BOT_AVAILABILITY_KEY], parsed.botAvailability);
      if (parsed.botUnavailableRecovery && typeof parsed.botUnavailableRecovery === "object") {
        payload[BOT_UNAVAILABLE_RECOVERY_KEY] = mode === "replace"
          ? normalizeBotUnavailableRecovery(parsed.botUnavailableRecovery)
          : mergeBotUnavailableRecovery(current[BOT_UNAVAILABLE_RECOVERY_KEY], parsed.botUnavailableRecovery);
      }
    }

    if (hasImportScope("botArchive") && parsed.botArchive && typeof parsed.botArchive === "object") {
      payload[BOT_ARCHIVE_KEY] = mode === "replace"
        ? normalizeBotArchive(parsed.botArchive)
        : mergeBotArchives(current[BOT_ARCHIVE_KEY], parsed.botArchive);
    }

    if (hasImportScope("lorebookStatus") && parsed.lorebookStatus && typeof parsed.lorebookStatus === "object") {
      payload[LOREBOOK_STATUS_KEY] = mode === "replace"
        ? normalizeLorebookStatusStore(parsed.lorebookStatus)
        : mergeLorebookStatusStores(current[LOREBOOK_STATUS_KEY], parsed.lorebookStatus);
    }

    if (hasImportScope("lorebookBackups") && parsed.lorebookBackups && typeof parsed.lorebookBackups === "object") {
      payload[LOREBOOK_BACKUPS_KEY] = mode === "replace"
        ? normalizeLorebookBackups(parsed.lorebookBackups)
        : mergeLorebookBackups(current[LOREBOOK_BACKUPS_KEY], parsed.lorebookBackups);
    }

    if (hasImportScope("chatbotLorebookLinks") && parsed.chatbotLorebookLinks && typeof parsed.chatbotLorebookLinks === "object") {
      const existing = current[CHATBOT_LOREBOOK_LINKS_KEY] && typeof current[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? current[CHATBOT_LOREBOOK_LINKS_KEY] : {};
      payload[CHATBOT_LOREBOOK_LINKS_KEY] = mode === "replace" ? parsed.chatbotLorebookLinks : { ...existing, ...parsed.chatbotLorebookLinks };
    }

    if (hasImportScope("savedTextSnippets") && Array.isArray(parsed.savedTextSnippets)) {
      const incoming = parsed.savedTextSnippets.filter(item => item && typeof item === "object" && String(item.text || "").trim());
      const existing = Array.isArray(current[SAVED_TEXT_SNIPPETS_KEY]) ? current[SAVED_TEXT_SNIPPETS_KEY] : [];
      payload[SAVED_TEXT_SNIPPETS_KEY] = mode === "replace" ? incoming : [...existing, ...incoming].filter((item, index, arr) => {
        const key = `${String(item.name || "").trim().toLowerCase()}\n${String(item.text || "").trim().toLowerCase()}`;
        return arr.findIndex(other => `${String(other.name || "").trim().toLowerCase()}\n${String(other.text || "").trim().toLowerCase()}` === key) === index;
      });
    }

    if (hasImportScope("contextKeeperData") && parsed.contextKeeperData && typeof parsed.contextKeeperData === "object") {
      const existing = current[CONTEXT_KEEPER_DATA_KEY] && typeof current[CONTEXT_KEEPER_DATA_KEY] === "object" ? current[CONTEXT_KEEPER_DATA_KEY] : {};
      payload[CONTEXT_KEEPER_DATA_KEY] = mode === "replace" ? parsed.contextKeeperData : { ...existing, ...parsed.contextKeeperData };
    }

    if (hasImportScope("storyDayTrackerData") && parsed.storyDayTrackerData && typeof parsed.storyDayTrackerData === "object") {
      const existing = current[STORY_DAY_TRACKER_KEY] && typeof current[STORY_DAY_TRACKER_KEY] === "object" ? current[STORY_DAY_TRACKER_KEY] : {};
      payload[STORY_DAY_TRACKER_KEY] = mode === "replace" ? parsed.storyDayTrackerData : { ...existing, ...parsed.storyDayTrackerData };
    }

    if (hasImportScope("rpStateTrackerData") && parsed.rpStateTrackerData && typeof parsed.rpStateTrackerData === "object") {
      const existing = current[RP_STATE_TRACKER_KEY] && typeof current[RP_STATE_TRACKER_KEY] === "object" ? current[RP_STATE_TRACKER_KEY] : {};
      payload[RP_STATE_TRACKER_KEY] = mode === "replace" ? parsed.rpStateTrackerData : { ...existing, ...parsed.rpStateTrackerData };
    }

    if (hasImportScope("chatNudges") && Array.isArray(parsed.chatNudges)) {
      const incoming = normalizeChatNudgeStore(parsed.chatNudges);
      const existing = normalizeChatNudgeStore(current[CHAT_NUDGE_STORE_KEY]);
      payload[CHAT_NUDGE_STORE_KEY] = mode === "replace"
        ? incoming
        : normalizeChatNudgeStore([...existing, ...incoming]);
    }

    if (hasImportScope("personas") && Array.isArray(parsed.personas)) {
      payload[PERSONAS_KEY] = mode === "replace"
        ? mergePersonas([], parsed.personas)
        : mergePersonas(
            Array.isArray(current[PERSONAS_KEY])
              ? current[PERSONAS_KEY]
              : (Array.isArray(current[LEGACY_PERSONAS_KEY]) ? current[LEGACY_PERSONAS_KEY] : []),
            parsed.personas
          );
    }

    if (hasImportScope("chatBookmarks") && parsed.chatBookmarks && typeof parsed.chatBookmarks === "object") {
      const existing = current[CHAT_BOOKMARKS_KEY] && typeof current[CHAT_BOOKMARKS_KEY] === "object" ? current[CHAT_BOOKMARKS_KEY] : {};
      if (mode === "replace") {
        payload[CHAT_BOOKMARKS_KEY] = parsed.chatBookmarks;
      } else {
        const merged = { ...existing };
        for (const [chatId, raw] of Object.entries(parsed.chatBookmarks)) {
          const left = Array.isArray(merged[chatId]?.entries) ? merged[chatId].entries : [];
          const right = Array.isArray(raw?.entries) ? raw.entries : [];
          const byMessage = new Map(left.map(entry => [String(entry?.messageId || entry?.id || ""), entry]));
          for (const entry of right) {
            const key = String(entry?.messageId || entry?.id || "");
            if (key) byMessage.set(key, { ...(byMessage.get(key) || {}), ...entry });
          }
          merged[chatId] = { ...(merged[chatId] || {}), ...(raw || {}), entries: [...byMessage.values()] };
        }
        payload[CHAT_BOOKMARKS_KEY] = merged;
      }
    }

    if (hasImportScope("recentlySeenBots") && parsed.recentlySeenBots && typeof parsed.recentlySeenBots === "object") {
      const incoming = Array.isArray(parsed.recentlySeenBots.entries) ? parsed.recentlySeenBots.entries : [];
      const existing = current[RECENTLY_SEEN_BOTS_KEY] && typeof current[RECENTLY_SEEN_BOTS_KEY] === "object" && Array.isArray(current[RECENTLY_SEEN_BOTS_KEY].entries)
        ? current[RECENTLY_SEEN_BOTS_KEY].entries
        : [];
      if (mode === "replace") {
        payload[RECENTLY_SEEN_BOTS_KEY] = { entries: incoming };
      } else {
        const byId = new Map();
        for (const item of [...existing, ...incoming]) {
          const id = String(item?.id || "").trim();
          if (!id) continue;
          const prev = byId.get(id);
          if (!prev || Number(item?.lastSeenAt || 0) >= Number(prev?.lastSeenAt || 0)) {
            byId.set(id, { ...(prev || {}), ...item, id });
          }
        }
        payload[RECENTLY_SEEN_BOTS_KEY] = {
          entries: [...byId.values()].sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0))
        };
      }
    }

    if (hasImportScope("personaOrganization") && parsed.personaOrganization && typeof parsed.personaOrganization === "object") {
      const importedMeta = parsed.personaOrganization.meta && typeof parsed.personaOrganization.meta === "object" ? parsed.personaOrganization.meta : {};
      const currentOrg = current[PERSONA_ORG_KEY] && typeof current[PERSONA_ORG_KEY] === "object" ? current[PERSONA_ORG_KEY] : {};
      const currentMeta = currentOrg.meta && typeof currentOrg.meta === "object" ? currentOrg.meta : {};
      const importedOrder = uniqueClean(Array.isArray(parsed.personaOrganization.order) ? parsed.personaOrganization.order : []);
      const currentOrder = uniqueClean(Array.isArray(currentOrg.order) ? currentOrg.order : []);
      payload[PERSONA_ORG_KEY] = {
        meta: mode === "replace" ? importedMeta : { ...currentMeta, ...importedMeta },
        order: mode === "replace" ? importedOrder : uniqueClean([...currentOrder, ...importedOrder]),
        customOrder: mode === "replace" ? !!parsed.personaOrganization.customOrder : !!(currentOrg.customOrder || parsed.personaOrganization.customOrder)
      };
    }

    if (hasImportScope("ooc") && Array.isArray(parsed.oocTemplates)) {
      payload[OOC_TEMPLATES_KEY] = mode === "replace"
        ? normalizeOocTemplates(parsed.oocTemplates)
        : mergeOocTemplateLists(current[OOC_TEMPLATES_KEY], parsed.oocTemplates);
    }

    if (hasImportScope("generationProfiles") && parsed.generationProfiles && typeof parsed.generationProfiles === "object") {
      payload[GENERATION_PROFILES_KEY] = mode === "replace"
        ? normalizeGenerationProfiles(parsed.generationProfiles)
        : mergeGenerationProfiles(current[GENERATION_PROFILES_KEY], parsed.generationProfiles);
    }

    if (hasImportScope("smartFilterPresets") && Array.isArray(parsed.smartFilterPresets)) {
      payload[SMART_FILTER_PRESETS_KEY] = mode === "replace"
        ? normalizeSmartFilterPresets(parsed.smartFilterPresets)
        : mergeSmartFilterPresets(current[SMART_FILTER_PRESETS_KEY], parsed.smartFilterPresets);
    }

    if (hasImportScope("smartFilterPins") && Array.isArray(parsed.smartFilterPinnedPresets)) {
      const presetSource = payload[SMART_FILTER_PRESETS_KEY] || current[SMART_FILTER_PRESETS_KEY];
      const incomingPins = normalizeSmartFilterPins(parsed.smartFilterPinnedPresets, parsed.smartFilterPresets || presetSource);
      payload[SMART_FILTER_PINNED_KEY] = mode === "replace"
        ? normalizeSmartFilterPins(incomingPins, presetSource)
        : normalizeSmartFilterPins([...(current[SMART_FILTER_PINNED_KEY] || []), ...incomingPins], presetSource);
    }

    if (hasImportScope("botEditorDraftHistory") && parsed.botEditorDraftHistory && typeof parsed.botEditorDraftHistory === "object") {
      payload[BOT_EDITOR_DRAFT_HISTORY_KEY] = mode === "replace"
        ? normalizeBotEditorDraftHistory(parsed.botEditorDraftHistory)
        : mergeBotEditorDraftHistory(current[BOT_EDITOR_DRAFT_HISTORY_KEY], parsed.botEditorDraftHistory);
    }

    if (hasImportScope("soundscapes") && parsed.soundscapes && typeof parsed.soundscapes === "object") {
      if (mode === "replace") payload[SOUNDSCAPES_KEY] = normalizeSoundscapeScenes(parsed.soundscapes);
      else {
        const existing = normalizeSoundscapeScenes(current[SOUNDSCAPES_KEY]);
        const incoming = normalizeSoundscapeScenes(parsed.soundscapes);
        const byId = new Map(existing.scenes.map(scene => [String(scene.id || scene.name || ""), scene]));
        for (const scene of incoming.scenes) byId.set(String(scene.id || scene.name || ""), scene);
        payload[SOUNDSCAPES_KEY] = { ...existing, ...incoming, scenes: [...byId.values()] };
      }
    }

    if (hasImportScope("tabCleanupSessions") && parsed.tabCleanupSessions && typeof parsed.tabCleanupSessions === "object") {
      if (mode === "replace") payload[TAB_CLEANUP_SESSIONS_KEY] = normalizeTabCleanupSessions(parsed.tabCleanupSessions);
      else {
        const existing = normalizeTabCleanupSessions(current[TAB_CLEANUP_SESSIONS_KEY]);
        const incoming = normalizeTabCleanupSessions(parsed.tabCleanupSessions);
        const byId = new Map(existing.sessions.map(session => [String(session.id || session.createdAt || ""), session]));
        for (const session of incoming.sessions) byId.set(String(session.id || session.createdAt || ""), session);
        payload[TAB_CLEANUP_SESSIONS_KEY] = { version: 2, sessions: [...byId.values()].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 40) };
      }
    }

    if (hasImportScope("tabCleanupTopics") && parsed.tabCleanupTopics && typeof parsed.tabCleanupTopics === "object") {
      if (mode === "replace") payload[TAB_CLEANUP_TOPICS_KEY] = normalizeTabCleanupTopics(parsed.tabCleanupTopics);
      else {
        const existing = normalizeTabCleanupTopics(current[TAB_CLEANUP_TOPICS_KEY]);
        const incoming = normalizeTabCleanupTopics(parsed.tabCleanupTopics);
        const byId = new Map(existing.topics.map(topic => [String(topic.id || topic.name || ""), topic]));
        for (const topic of incoming.topics) byId.set(String(topic.id || topic.name || ""), topic);
        payload[TAB_CLEANUP_TOPICS_KEY] = { version: 1, topics: [...byId.values()] };
      }
    }

    if (hasImportScope("tabCleanupEnrichment") && parsed.tabCleanupEnrichment && typeof parsed.tabCleanupEnrichment === "object") {
      const existing = current[TAB_CLEANUP_ENRICHMENT_KEY] && typeof current[TAB_CLEANUP_ENRICHMENT_KEY] === "object" ? current[TAB_CLEANUP_ENRICHMENT_KEY] : { meta: {} };
      payload[TAB_CLEANUP_ENRICHMENT_KEY] = mode === "replace"
        ? parsed.tabCleanupEnrichment
        : { ...existing, ...parsed.tabCleanupEnrichment, meta: { ...(existing.meta || {}), ...(parsed.tabCleanupEnrichment.meta || {}) } };
    }

    if (hasImportScope("localChangeHistory") && Array.isArray(parsed.localChangeHistory)) {
      if (mode === "replace") payload[LOCAL_CHANGE_HISTORY_KEY] = parsed.localChangeHistory.slice(0, 100);
      else {
        const existing = Array.isArray(current[LOCAL_CHANGE_HISTORY_KEY]) ? current[LOCAL_CHANGE_HISTORY_KEY] : [];
        const byId = new Map();
        for (const item of [...existing, ...parsed.localChangeHistory]) {
          const key = String(item?.id || `${item?.at || ""}:${item?.label || ""}`);
          if (key) byId.set(key, item);
        }
        payload[LOCAL_CHANGE_HISTORY_KEY] = [...byId.values()].sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0)).slice(0, 100);
      }
    }

    if (hasImportScope("localMedia") && parsed.localMedia && typeof parsed.localMedia === "object") {
      const incomingAudio = normalizeSoundscapeAudio(parsed.localMedia.soundscapeAudio);
      const incomingBackgrounds = normalizeChatBackgroundMediaStore(parsed.localMedia.chatBackgroundMedia);
      if (mode === "replace") {
        payload[SOUNDSCAPE_AUDIO_KEY] = incomingAudio;
        payload[CHAT_BACKGROUNDS_KEY] = incomingBackgrounds;
      } else {
        const existingAudio = normalizeSoundscapeAudio(current[SOUNDSCAPE_AUDIO_KEY]);
        const audioById = new Map(existingAudio.items.map(item => [String(item.id || item.name || ""), item]));
        for (const item of incomingAudio.items) audioById.set(String(item.id || item.name || ""), item);
        payload[SOUNDSCAPE_AUDIO_KEY] = { ...existingAudio, ...incomingAudio, items: [...audioById.values()] };

        const existingBackgrounds = normalizeChatBackgroundMediaStore(current[CHAT_BACKGROUNDS_KEY]);
        payload[CHAT_BACKGROUNDS_KEY] = {
          global: incomingBackgrounds.global || existingBackgrounds.global || null,
          chats: { ...(existingBackgrounds.chats || {}), ...(incomingBackgrounds.chats || {}) },
          galleries: { ...(existingBackgrounds.galleries || {}), ...(incomingBackgrounds.galleries || {}) }
        };
      }
    }

    if (!Object.keys(payload).length) throw new Error("Nothing importable found");

    if (payload[OPENED_KEY] || payload[OPENED_META_KEY] || payload[BLOCKED_BOTS_KEY]) {
      const effectiveBlocked = normalizeBotStore(payload[BLOCKED_BOTS_KEY] || current[BLOCKED_BOTS_KEY]);
      const effectiveOpenedIds = Array.isArray(payload[OPENED_KEY])
        ? payload[OPENED_KEY]
        : (Array.isArray(current[OPENED_KEY]) ? current[OPENED_KEY] : []);
      const effectiveOpenedMeta = payload[OPENED_META_KEY] || current[OPENED_META_KEY] || {};
      const cleanedOpened = enforceBlockedPriorityOverOpenedState({
        blockedStore: effectiveBlocked,
        openedIds: effectiveOpenedIds,
        openedMeta: effectiveOpenedMeta,
        detached: true
      });
      payload[OPENED_KEY] = cleanedOpened.ids;
      payload[OPENED_META_KEY] = cleanedOpened.meta;
    }

    const recoveryScopes = new Set(importScopes.size
      ? importScopes
      : validation.entries.map(entry => String(entry?.scope || "").trim()).filter(Boolean));

    // Importing Blocked can also remove those bots from Opened, so preserve both.
    if (recoveryScopes.has("blocked")) recoveryScopes.add("opened");

    pendingImportSafetyDownload = buildExportPayload(recoveryScopes, current);
    await createRecoverySnapshot(`before ${mode} import`, current, recoveryScopes);
    const importStored = await storageSetVerified(payload);
    if (!importStored) {
      const error = new Error("The imported data could not be verified; your safety copy was kept");
      error.code = "IMPORT_WRITE_FAILED";
      throw error;
    }
    pendingImportPayload = null;
    pendingImportSafetyDownload = null;
    hideImportRecoveryActions();
    cancelImportPreview();
    await load();

    const status = $("status");
    if (status) {
      const importedCategories = validation.entries.filter(entry => importScopes.has(entry.scope)).length;
      const skippedUnknown = validation.warnings.filter(text => text.startsWith("Unknown top-level field:")).length;
      const base = mode === "replace" ? "Imported selected categories (replace mode)." : "Imported selected categories (merge mode).";
      const partial = validation.futureSchema || skippedUnknown
        ? ` Partial restore: ${importedCategories} recognized categor${importedCategories === 1 ? "y" : "ies"}${skippedUnknown ? `; ${skippedUnknown} unknown/newer field${skippedUnknown === 1 ? "" : "s"} skipped` : ""}.`
        : "";
      status.textContent = `${base}${partial}`;
      setTimeout(() => { status.textContent = ""; }, partial ? 5200 : 2600);
    }
  } catch (error) {
    const status = $("status");
    const detail = String(error?.message || "the backup could not be read").replace(/\s+/g, " ").trim();
    if (error?.code === "RECOVERY_SNAPSHOT_FAILED") {
      if (status) status.textContent = "Import stopped before changing anything.";
      showImportRecoveryActions("QoL couldn't create the safety copy for the selected data. You can retry, download the current selected data yourself first, or cancel.");
    } else if (error?.code === "IMPORT_WRITE_FAILED") {
      if (status) status.textContent = "Import could not be verified. Your safety copy was kept.";
      showImportRecoveryActions("The browser did not confirm the import write. QoL kept the safety copy instead of pretending the import succeeded.");
    } else {
      if (status) status.textContent = `Import failed: ${detail}.`;
    }
  }
}

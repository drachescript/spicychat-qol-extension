// Backup scopes, import limits, moderation metadata, and archive keys.
const GZIP_BACKUP_THRESHOLD = 50 * 1024 * 1024;
const MAX_IMPORT_BACKUP_BYTES = 250 * 1024 * 1024;
const MAX_GZIP_FILE_BYTES = 100 * 1024 * 1024;













const MODERATION_MANAGER_GROUPS = {
  Underage: [
    "child", "children", "childhood", "young", "baby", "boy", "girl", "short", "small", "petite", "tiny",
    "loli", "minor", "kid", "kids", "underage", "teen", "innocent", "infant", "little",
    "school", "teacher", "student", "adolescent", "juvenile", "brat", "youth",
    "backpack", "runaway", "insecure", "fragile", "uniform", "prodigy", "pupil", "born", "birth", "hatchling"
  ],
  Incest: [
    "mom", "dad", "sister", "brother", "cousin", "uncle", "aunt", "mother", "father", "grandpa", "grandparent", "grandparents",
    "daughter", "son", "relationship", "adopt", "family", "paternal", "twin", "sibling", "relative", "king", "queen", "prince", "princess", "lineage", "bloodline"
  ],
  Bestiality: ["dog", "horse", "bull", "minotaur", "beast", "monster", "creature", "animal", "farm", "bred", "breed", "breeding", "tail", "fur", "paw"],
  Abuse: ["rape", "force", "kill", "murder", "torture", "abuse", "abused", "violent", "violence", "violently", "trauma", "tremble", "intimidate", "intimidated", "intimidating", "intimidation", "push"],
  Other: ["god", "purity"]
};
const MODERATION_MANAGER_AGE_WORDS = [];
const MODERATION_MANAGER_CONTEXT_ONLY = [
  "young", "short", "small", "petite", "tiny", "innocent", "little", "school", "teacher", "student", "backpack", "insecure", "fragile", "uniform", "prodigy", "pupil",
  "born", "birth", "relationship", "family", "lineage", "bloodline", "dog", "horse", "bull", "beast", "monster", "creature", "animal", "farm", "tail", "fur", "paw", "god", "purity", "push", "tremble", "trauma"
];



















const SETTINGS_BACKUP_GROUPS = {
  settingsGeneral: { label: "General & Control Center", pages: ["general", "control", "features"] },
  settingsDiscovery: { label: "Discovery & Filters", pages: ["blocking"] },
  settingsSavedBots: { label: "Saved Bots & Lists", pages: ["saved"] },
  settingsChatList: { label: "Chat List", pages: ["chat-list"] },
  settingsChat: { label: "Chat", pages: ["chat-ui"] },
  settingsWriting: { label: "Writing & Generation", pages: ["writing"] },
  settingsPersonas: { label: "Personas & Memory", pages: ["personas-memory"] },
  settingsCreator: { label: "Creator Tools", pages: ["bot-tools"] },
  settingsAppearance: { label: "Appearance & Interface", pages: ["appearance", "custom-pictures"] },
  settingsBrowser: { label: "Browser, Tabs & Mobile", pages: ["browser", "android"] },
  settingsAdvanced: { label: "Advanced & Compatibility", pages: ["advanced"] }
};
const SETTINGS_BACKUP_SCOPE_IDS = Object.keys(SETTINGS_BACKUP_GROUPS);
const SETTINGS_BACKUP_OVERRIDES = {
  autoAfkAction: "settingsBrowser",
  botEditorSnippets: "settingsCreator",
  blockedBotIds: "settingsDiscovery",
  blockedBotNames: "settingsDiscovery",
  cardTokenShowDescription: "settingsDiscovery",
  cardTokenShowCombined: "settingsDiscovery",
  allowedLanguages: "settingsDiscovery",
  showListingRefillButton: "settingsDiscovery",
  quickPanelCustomX: "settingsGeneral",
  quickPanelCustomY: "settingsGeneral",
  showBlockCurrentBotButton: "settingsDiscovery",
  quickDislikeIdleEnabled: "settingsDiscovery",
  chatListSearchMode: "settingsChatList",
  autoLoadAllOpenedChats: "settingsChatList",
  deepImportMaxPages: "settingsChatList",
  oocTemplates: "settingsWriting",
  replyInstructionBotOverrides: "settingsWriting",
  chatBubblePreserveActionColors: "settingsAppearance",
  hideSidebarSocialLinks: "settingsAppearance",
  hideSidebarFooterLinks: "settingsAppearance",
  hideSidebarAppDownload: "settingsAppearance",
  enableMainFooterManagement: "settingsAppearance",
  hideMainFooterEntirely: "settingsAppearance",
  hideMainFooterCompany: "settingsAppearance",
  hideMainFooterResources: "settingsAppearance",
  hideMainFooterCommunity: "settingsAppearance",
  hideMainFooterJoinUs: "settingsAppearance",
  hideMainFooterAppDownload: "settingsAppearance",
  hideMainFooter2257: "settingsAppearance",
  enablePersonalUsageSummary: "settingsGeneral",
  enableLocalChangeHistory: "settingsAdvanced",
  showUpdateNotifications: "settingsGeneral",
  debug: "settingsAdvanced"
};













const BACKUP_STORAGE_KEYS = [
  "settings", QOL_SYNC_DEVICE_PREFS_KEY, "dsMemoryVaultV1", OPENED_KEY, OPENED_META_KEY, BLOCKED_BOTS_KEY, QUICK_DISLIKE_HISTORY_KEY, QUICK_DISLIKE_BULK_STATE_KEY, QUICK_LESS_LIKE_HISTORY_KEY, QUICK_LESS_LIKE_BULK_STATE_KEY,
  NOT_INTERESTED_KEY, PERSONAS_KEY, LEGACY_PERSONAS_KEY, PERSONA_ORG_KEY, OOC_TEMPLATES_KEY, FAVORITE_CREATORS_KEY,
  FOLLOWED_CREATORS_KEY, CREATOR_BOT_WATCH_KEY, FAVORITE_BOTS_KEY, LATER_BOTS_KEY, BOT_ORGANIZER_KEY, CHAT_ORGANIZER_KEY, CHARACTER_QOL_PROFILES_KEY,
  BOT_AVAILABILITY_KEY, BOT_UNAVAILABLE_RECOVERY_KEY, BOT_ARCHIVE_KEY, LOREBOOK_STATUS_KEY, LOREBOOK_BACKUPS_KEY, CHATBOT_LOREBOOK_LINKS_KEY, SAVED_TEXT_SNIPPETS_KEY, CONTEXT_KEEPER_DATA_KEY, CHAT_SCENE_NOTES_KEY,
  STORY_DAY_TRACKER_KEY, RP_STATE_TRACKER_KEY, CHAT_NUDGE_STORE_KEY, GENERATION_PROFILES_KEY, SMART_FILTER_PRESETS_KEY, SMART_FILTER_PINNED_KEY,
  BOT_EDITOR_DRAFT_HISTORY_KEY, CHAT_BOOKMARKS_KEY, RECENTLY_SEEN_BOTS_KEY, SOUNDSCAPES_KEY, SOUNDSCAPE_AUDIO_KEY, CHAT_BACKGROUNDS_KEY,
  TAB_CLEANUP_SESSIONS_KEY, TAB_CLEANUP_TOPICS_KEY, TAB_CLEANUP_ENRICHMENT_KEY, LOCAL_CHANGE_HISTORY_KEY
];
const BACKUP_SCOPE_IDS = [
  ...SETTINGS_BACKUP_SCOPE_IDS,
  "settings", "accountSyncRules",
  "opened", "blocked", "notInterested", "favoriteCreators", "followedCreators", "creatorBotWatch", "favoriteBots", "laterBots",
  "memoryVault", "botOrganization", "chatOrganization", "characterQolProfiles", "botAvailability", "botArchive", "lorebookStatus", "lorebookBackups", "chatbotLorebookLinks",
  "savedTextSnippets", "contextKeeperData", "storyDayTrackerData", "chatSceneNotes", "rpStateTrackerData", "chatNudges", "personas", "personaOrganization",
  "ooc", "generationProfiles", "smartFilterPresets", "smartFilterPins", "botEditorDraftHistory", "chatBookmarks", "recentlySeenBots",
  "soundscapes", "tabCleanupSessions", "tabCleanupTopics", "tabCleanupEnrichment", "localChangeHistory", "localMedia"
];
const LIGHTWEIGHT_BACKUP_SCOPE_IDS = BACKUP_SCOPE_IDS.filter(scope => scope !== "localMedia");

const BACKUP_DATA_SCOPE_DEFS = {
  accountSyncRules: { count: result => result[QOL_SYNC_DEVICE_PREFS_KEY] && typeof result[QOL_SYNC_DEVICE_PREFS_KEY] === "object" ? 1 : 0 },
  opened: { count: result => Array.isArray(result[OPENED_KEY]) ? result[OPENED_KEY].length : 0 },
  blocked: { count: result => uniqueClean([...(result[BLOCKED_BOTS_KEY]?.ids || []), ...(result[BLOCKED_BOTS_KEY]?.names || [])]).length },
  notInterested: { count: result => uniqueClean(result[NOT_INTERESTED_KEY]?.ids || []).length },
  favoriteCreators: { count: result => uniqueClean(result[FAVORITE_CREATORS_KEY]?.handles || []).length },
  followedCreators: { count: result => uniqueClean(result[FOLLOWED_CREATORS_KEY]?.handles || []).length },
  creatorBotWatch: { count: result => Object.keys(normalizeCreatorBotWatchState(result[CREATOR_BOT_WATCH_KEY]).creators || {}).length },
  favoriteBots: { count: result => uniqueClean(result[FAVORITE_BOTS_KEY]?.ids || []).length },
  laterBots: { count: result => uniqueClean(result[LATER_BOTS_KEY]?.ids || []).length },
  memoryVault: { count: result => normalizeMemoryVault(result.dsMemoryVaultV1).entries.length },
  botOrganization: { count: result => {
    const organizer = normalizeBotOrganization(result[BOT_ORGANIZER_KEY]);
    const folders = uniqueClean([
      ...(organizer.collections || []),
      ...String(result.settings?.botCollections || "").split(/[\n,]+/g)
    ]);
    return Object.keys(organizer.meta || {}).length + folders.length;
  } },
  chatOrganization: { count: result => Object.keys(normalizeChatOrganization(result[CHAT_ORGANIZER_KEY]).meta).length },
  characterQolProfiles: { count: result => Object.keys(normalizeCharacterQolProfiles(result[CHARACTER_QOL_PROFILES_KEY])).length },
  botAvailability: { count: result => Object.keys(normalizeBotAvailability(result[BOT_AVAILABILITY_KEY]).meta).length },
  botArchive: { count: result => Object.keys(normalizeBotArchive(result[BOT_ARCHIVE_KEY]).meta).length },
  lorebookStatus: { count: result => Object.keys(normalizeLorebookStatusStore(result[LOREBOOK_STATUS_KEY]).meta).length },
  lorebookBackups: { count: result => Object.keys(normalizeLorebookBackups(result[LOREBOOK_BACKUPS_KEY]).meta).length },
  chatbotLorebookLinks: { count: result => Object.keys(result[CHATBOT_LOREBOOK_LINKS_KEY] && typeof result[CHATBOT_LOREBOOK_LINKS_KEY] === "object" ? result[CHATBOT_LOREBOOK_LINKS_KEY] : {}).length },
  savedTextSnippets: { count: result => Array.isArray(result[SAVED_TEXT_SNIPPETS_KEY]) ? result[SAVED_TEXT_SNIPPETS_KEY].length : 0 },
  contextKeeperData: { count: result => Object.keys(result[CONTEXT_KEEPER_DATA_KEY] && typeof result[CONTEXT_KEEPER_DATA_KEY] === "object" ? result[CONTEXT_KEEPER_DATA_KEY] : {}).length },
  chatSceneNotes: { count: result => Object.keys(result[CHAT_SCENE_NOTES_KEY] && typeof result[CHAT_SCENE_NOTES_KEY] === "object" ? result[CHAT_SCENE_NOTES_KEY] : {}).length },
  storyDayTrackerData: { count: result => Object.keys(result[STORY_DAY_TRACKER_KEY] && typeof result[STORY_DAY_TRACKER_KEY] === "object" ? result[STORY_DAY_TRACKER_KEY] : {}).length },
  rpStateTrackerData: { count: result => Object.keys(result[RP_STATE_TRACKER_KEY] && typeof result[RP_STATE_TRACKER_KEY] === "object" ? result[RP_STATE_TRACKER_KEY] : {}).length },
  chatNudges: { count: result => normalizeChatNudgeStore(result[CHAT_NUDGE_STORE_KEY]).length },
  personas: { count: result => Array.isArray(result[PERSONAS_KEY]) ? result[PERSONAS_KEY].length : (Array.isArray(result[LEGACY_PERSONAS_KEY]) ? result[LEGACY_PERSONAS_KEY].length : 0) },
  personaOrganization: { count: result => Object.keys(result[PERSONA_ORG_KEY]?.meta || {}).length },
  ooc: { count: result => normalizeOocTemplates(result[OOC_TEMPLATES_KEY]).length },
  generationProfiles: { count: result => Object.keys(normalizeGenerationProfiles(result[GENERATION_PROFILES_KEY])).length },
  smartFilterPresets: { count: result => normalizeSmartFilterPresets(result[SMART_FILTER_PRESETS_KEY]).length },
  smartFilterPins: { count: result => normalizeSmartFilterPins(result[SMART_FILTER_PINNED_KEY], result[SMART_FILTER_PRESETS_KEY]).length },
  botEditorDraftHistory: { count: result => Object.values(normalizeBotEditorDraftHistory(result[BOT_EDITOR_DRAFT_HISTORY_KEY]).entries).reduce((n, list) => n + list.length, 0) },
  chatBookmarks: { count: result => Object.values(result[CHAT_BOOKMARKS_KEY] || {}).reduce((n, chat) => n + (Array.isArray(chat?.entries) ? chat.entries.length : 0), 0) },
  recentlySeenBots: { count: result => Array.isArray(result[RECENTLY_SEEN_BOTS_KEY]?.entries) ? result[RECENTLY_SEEN_BOTS_KEY].entries.length : 0 },
  soundscapes: { count: result => normalizeSoundscapeScenes(result[SOUNDSCAPES_KEY]).scenes.length },
  tabCleanupSessions: { count: result => normalizeTabCleanupSessions(result[TAB_CLEANUP_SESSIONS_KEY]).sessions.length },
  tabCleanupTopics: { count: result => normalizeTabCleanupTopics(result[TAB_CLEANUP_TOPICS_KEY]).topics.length },
  tabCleanupEnrichment: { count: result => Object.keys(result[TAB_CLEANUP_ENRICHMENT_KEY]?.meta || {}).length },
  localChangeHistory: { count: result => Array.isArray(result[LOCAL_CHANGE_HISTORY_KEY]) ? result[LOCAL_CHANGE_HISTORY_KEY].length : 0 },
  localMedia: { count: result => normalizeSoundscapeAudio(result[SOUNDSCAPE_AUDIO_KEY]).items.length + (normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).global ? 1 : 0) + Object.keys(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).chats || {}).length + Object.values(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).galleries || {}).reduce((n, g) => n + (g.items?.length || 0), 0) + Object.keys(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).portraits || {}).length + Object.keys(normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).personaPictures || {}).length + (normalizeChatBackgroundMediaStore(result[CHAT_BACKGROUNDS_KEY]).pictureLibrary || []).length, large: true }
};



let exportScopesInitialized = false;











// This is a separate, one-record IndexedDB database so it cannot collide with
// the per-bot large-storage schema. Database writes replace the last snapshot
// atomically; there is no background retention loop or unbounded copy history.






















let pendingImportSafetyDownload = null;



































































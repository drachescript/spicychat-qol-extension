"use strict";
// The canonical background message router retains protocol/response behavior.
// Feature recipes may reject messages for services not installed in Custom.
const DSQ_BACKGROUND_MESSAGE_OWNERS = Object.freeze({
  "DS_AUTO_AFK_ACTIVITY": "performance-mode",
  "DS_AUTO_AFK_RUN_NOW": "performance-mode",
  "DS_BACKGROUND_JOB_ACQUIRE": "core",
  "DS_BACKGROUND_JOB_RELEASE": "core",
  "DS_BG_FETCH_IMAGE_URL": "chat-backgrounds",
  "DS_BG_REQUEST_IMAGE_PERMISSION": "chat-backgrounds",
  "DS_BOT_EXPORT_HELPER": "my-creations-backup",
  "DS_BOT_STATUS_HELPER_CHECK": "bot-status",
  "DS_BOT_STATUS_HELPER_PREPARE": "bot-status",
  "DS_BOT_STATUS_HELPER_RELEASE": "bot-status",
  "DS_BOT_STATUS_PACE_WAIT": "bot-status",
  "DS_BOT_STATUS_PERSIST_DELTA": "bot-status",
  "DS_BOT_STATUS_RUN_EVENT": "bot-status",
  "DS_BOT_STATUS_WORKER_HEARTBEAT": "bot-status",
  "DS_CARD_TOKEN_BRIDGE_DIAG": "card-token-info",
  "DS_CARD_TOKEN_FETCH": "card-token-info",
  "DS_CHARACTER_INDEX_METADATA_FETCH": "core",
  "DS_CHAT_NUDGE_SCAN_NOW": "chat-nudges",
  "DS_CHAT_NUDGE_SYNC": "chat-nudges",
  "DS_CLEAR_PAGE_RUNTIME_LOG": "core",
  "DS_CLOSE_CURRENT_TAB": "core",
  "DS_CONTEXT_WINDOW_NOTIFICATION": "generation-metadata",
  "DS_CREATOR_BOT_SCAN_NOW": "creator-workspace",
  "DS_CREATOR_BOT_WEBHOOK_TEST": "creator-workspace",
  "DS_DEEPL_TEST": "translation",
  "DS_DEEPL_TRANSLATE": "translation",
  "DS_DEEPL_TRANSLATE_BATCH": "translation",
  "DS_DEEPL_USAGE": "translation",
  "DS_DOWNLOAD_TEXT_FILE": "core",
  "DS_DUPLICATE_TABS_RUN_NOW": "core",
  "DS_EXACT_MESSAGE_COUNTS_FETCH": "exact-message-counts",
  "DS_FETCH_PERSONA_IMAGE_DATA_URL": "personas",
  "DS_GET_DIAGNOSTIC_CONTEXT": "core",
  "DS_GET_SPICYCHAT_TAB_SUMMARY": "core",
  "DS_LARGE_STORAGE_GET": "core",
  "DS_LARGE_STORAGE_GET_PAGE": "core",
  "DS_LARGE_STORAGE_GET_RECORDS": "core",
  "DS_LARGE_STORAGE_MERGE": "core",
  "DS_LARGE_STORAGE_OPTIMIZE_PAGE": "core",
  "DS_LARGE_STORAGE_REMOVE": "core",
  "DS_LARGE_STORAGE_REMOVE_RECORDS": "core",
  "DS_LARGE_STORAGE_SET": "core",
  "DS_LARGE_STORAGE_STATS": "core",
  "DS_LISTING_REFILL_FAVORITE": "list-fill",
  "DS_LISTING_REFILL_PAGE": "list-fill",
  "DS_LISTING_REFILL_RELEASE": "list-fill",
  "DS_LOAD_ALL_CHATS_DONE": "chat-index",
  "DS_LOAD_ALL_CHATS_RESCHEDULE": "chat-index",
  "DS_LOAD_ALL_CHATS_START": "chat-index",
  "DS_LOAD_ALL_CHATS_STOP": "chat-index",
  "DS_LOREBOOK_EXPORT_HELPER": "lorebook-backup",
  "DS_LOREBOOK_PUBLIC_RECOVERY_FETCH": "lorebook-public-qol",
  "DS_LOREBOOK_STATUS_HELPER_CHECK": "lorebook-public-qol",
  "DS_LOREBOOK_STATUS_PUBLIC_CHECK_BATCH": "lorebook-public-qol",
  "DS_OPEN_OPTIONS": "core",
  "DS_OPEN_OPTIONS_CHANGELOG": "core",
  "DS_OPEN_OPTIONS_FROM_POPUP": "core",
  "DS_OPEN_OPTIONS_TARGET": "core",
  "DS_OPTIONS_CLEAR_COMMAND_PALETTE": "core",
  "DS_OPTIONS_GET_QUICK_PANEL_TAB_STATE": "core",
  "DS_OPTIONS_OPEN_COMMAND_PALETTE": "core",
  "DS_OPTIONS_SET_QUICK_PANEL_TAB_STATE": "core",
  "DS_PERSONA_RENDERED_SNAPSHOT": "personas",
  "DS_QOL_BACKGROUND_WORKER_IDENTITY_QUERY": "core",
  "DS_QOL_DIAGNOSTIC_BACKGROUND_EMIT": "core",
  "DS_QOL_DIAGNOSTIC_STATUS_QUERY": "core",
  "DS_QOL_DIAGNOSTIC_SUBSCRIBE": "core",
  "DS_PRIVATE_LOREBOOK_ARCHIVE": "private-lorebook-bridge",
  "DS_PRIVATE_ARCHIVE_SETUP_WRITE": "private-lorebook-bridge",
  "DS_PRIVATE_LOREBOOK_ENTRY_CREATE": "private-lorebook-bridge",
  "DS_NATIVE_MEMORY_PROBE": "context-keeper",
  "DS_QOL_TRANSLATE": "translation",
  "DS_QUICK_DISLIKE_BOT": "bot-blocking",
  "DS_QUICK_DISLIKE_CANCEL_BULK": "bot-blocking",
  "DS_QUICK_DISLIKE_RELEASE_BULK": "bot-blocking",
  "DS_QUICK_LESS_LIKE_BOT": "recommendation-helpers",
  "DS_QUICK_LESS_LIKE_CANCEL_BULK": "recommendation-helpers",
  "DS_QUICK_LESS_LIKE_CLIENT_TIMING": "recommendation-helpers",
  "DS_QUICK_LESS_LIKE_PREPARE_BULK": "recommendation-helpers",
  "DS_QUICK_LESS_LIKE_RELEASE_BULK": "recommendation-helpers",
  "DS_QUICK_LESS_LIKE_RUN_TIMING": "recommendation-helpers",
  "DS_RANDOM_CHAT_PICK": "chat-list",
  "DS_RECOMMENDATION_PACE_WAIT": "recommendation-helpers",
  "DS_RECOVER_OPTIONS_SOURCE_PAGE": "core",
  "DS_REQUEST_DOWNLOAD_PERMISSION": "core",
  "DS_TAB_DIAGNOSTIC_COLLECT": "core",
  "DS_TAB_DIAGNOSTIC_ENRICH_ONE": "core",
  "DS_TAB_DIAGNOSTIC_WORKER_CLOSE": "core",
  "DS_TAB_DIAGNOSTIC_WORKER_FOCUS": "core",
  "DS_TAB_SESSION_CLOSE_MATCHES": "core",
  "DS_TAB_SESSION_MATCH_OPEN": "core",
  "DS_TAB_SESSION_REOPEN": "core",
  "DS_WIKI_FETCH": "wiki-lorebook-importer",
  "DS_WIKI_REQUEST_PERMISSION": "wiki-lorebook-importer"
});
function dsqBackgroundMessageAllowed(type) {
  const owner = DSQ_BACKGROUND_MESSAGE_OWNERS[String(type || "")];
  return !owner || owner === "core" || dsqBackgroundHasFeature(owner);
}

// Optional handlers are registered by their feature modules before event startup.
// Omitted modules register nothing; the shared router does not reference their APIs.
const dsqBackgroundFeatureMessageHandlers = Object.create(null);
function dsqRegisterBackgroundMessageHandler(type, owner, handler) {
  const name = String(type || "");
  if (DSQ_BACKGROUND_MESSAGE_OWNERS[name] !== owner || typeof handler !== "function") {
    throw new Error(`Invalid background message owner: ${name}`);
  }
  if (!dsqBackgroundHasFeature(owner)) return;
  if (Object.prototype.hasOwnProperty.call(dsqBackgroundFeatureMessageHandlers, name)) {
    throw new Error(`Duplicate background handler: ${name}`);
  }
  dsqBackgroundFeatureMessageHandlers[name] = handler;
}

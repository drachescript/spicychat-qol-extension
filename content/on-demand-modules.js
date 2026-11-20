// v0.2.86 Stage 16: declarative, on-demand runtime assets.
// Previously every feature was parsed on every route. These heavy, independently
// registered modules are now imported only when the matching route+setting is
// active. No new observer, event listener, repeating task or background request.
if (!window.__DSQ_TAB_GATE__?.paused) (() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const jobs = new Map();
  const failed = new Map();
  // Internal helpers follow their owning user-facing feature in Custom Lite.
  // Full QoL remains authoritative; omitting moderation cannot leave a helper
  // importing from a bundle that was deliberately excluded.
  const OWNER = Object.freeze({
    "creator-moderation-warnings": "moderation-warnings",
    "lorebook-moderation-review": "moderation-warnings"
  });
  const has = key => DS.featureBuildProfile?.isInstalled?.(OWNER[key] || key) !== false;
  const any = (s, names) => names.some(k => s?.[k] === true);
  const CHAT = /^\/(?:[a-z]{2}\/)?chat\/[0-9a-f-]{36}(?:\/[0-9a-f-]{36})?(?:\/|$)/i;
  const CHATS = /^\/(?:[a-z]{2}\/)?chats\/?$/i;
  const PROFILES = /^\/(?:[a-z]{2}\/)?chatbot\/[0-9a-f-]{36}(?:\/|$)/i;
  const PERSONAS = /^\/(?:[a-z]{2}\/)?personas\/?$/i;
  const FAV = /^\/(?:[a-z]{2}\/)?favorite-bots\/?$/i;
  const MY_CREATIONS = /^\/(?:[a-z]{2}\/)?my-creations(?:\/|$)/i;
  const LOREBOOK_EDITOR = /^\/(?:[a-z]{2}\/)?lorebook\/(?:edit(?:\/|$)|create(?:\/|$))/i;
  const LOREBOOK_PUBLIC = /^\/(?:[a-z]{2}\/)?(?:lorebook\/(?:[0-9a-f-]{20,})|lorebooks)(?:\/|$)/i;
  const LISTING = /^\/(?:[a-z]{2}\/)?(?:favorite-bots|recommended-bots|chatbots|search|my-creations\/chatbots|creator\/[^/]+)(?:\/|$)/i;
  const BOT_EDITOR = /^\/(?:[a-z]{2}\/)?(?:chatbot\/(?:create|edit|[0-9a-f-]{36}\/edit)|create-chatbot|edit-chatbot)(?:\/|$)/i;
  const MODULES = Object.freeze({
    "bulk-chat-research": "content/bulk-chat-research.js",
    "soundscapes": "content/soundscapes.js",
    "sidebar": "content/sidebar.js",
    "quick-panel": "content/quick-panel.js",
    "animation-control": "content/animation-control.js",
    "exact-message-counts": "content/exact-message-counts.js",
    "previously-chatted-indicator": "content/previously-chatted-indicator.js",
    "native-memory-probe": "content/native-memory-probe.js",
    "memory-manager": "content/memory-manager.js",
    "memory-packs": "content/memory-packs.js",
    "context-keeper": "content/context-keeper.js",
    "creation-audit": "content/creation-audit.js",
    "favorites-recovery": "content/favorites-recovery.js",
    "lorebook-backup": "content/lorebook-backup.js",
    "my-creations-backup": "content/my-creations-backup.js",
    "chat-export": "content/chat-export.js",
    "persona-full-backup": "content/persona-full-backup.js",
    "profile-export": "content/profile-export.js",
    "creator-writing-assistant": "content/creator-writing-assistant.js",
    "character-token-optimizer": "content/character-token-optimizer.js",
    "chat-continuation": "content/chat-continuation.js",
    "chat-scene-notes": "content/chat-scene-notes.js",
    "lorebook-consistency": "content/lorebook-consistency.js",
    "smart-filter-presets": "content/smart-filter-presets.js",
    "wiki-lorebook-importer": "content/wiki-lorebook-importer.js",
    "persona-organizer": "content/persona-organizer.js",
    "private-lorebook-bridge": "content/private-lorebook-bridge.js",
    "archive-community-themes": "content/archive-community-themes.js",
    "archive-blocking-presets": "content/archive-blocking-presets.js",
    "chat-pins": "content/chat-pins.js",
    "chat-smart-folders": "content/chat-smart-folders.js",
    "chat-organizer": "content/chat-organizer.js",
    "my-creations-filters": "content/my-creations-filters.js",
    "bot-editor-snippets": "content/bot-editor-snippets.js",
    "bot-editor-history": "content/bot-editor-history.js",
    "story-day-tracker": "content/story-day-tracker.js",
    "rp-state-tracker": "content/rp-state-tracker.js",
    "lorebook-connections": "content/lorebook-connections.js",
    "lorebook-moderation-review": "content/lorebook-moderation-review.js",
    "creator-moderation-warnings": "content/moderation-warnings.js",
    "focus-mode": "content/focus-mode.js",
    "lorebook-workflow": "content/lorebook-workflow.js",
    "chat-search": "content/chat-search.js",
    "chat-nudges": "content/chat-nudges.js",
    "selection-memory": "content/selection-memory.js",
    "rulebook-diagnostics": "content/rulebook-diagnostics.js",
    "saved-snippets": "content/saved-snippets.js"
  });
  let lastWantedKey = "";
  const dependencies = Object.freeze({ "memory-packs": ["memory-manager"],
    "lorebook-moderation-review": ["creator-moderation-warnings"] });
  function ensureWithDependencies(name) {
    const deps = dependencies[name];
    return deps?.length ? Promise.all(deps.map(ensureWithDependencies)).then(results => results.every(Boolean) && ensure(name)) : ensure(name);
  }
  // Module scripts run in the content script's isolated world (not a <script>
  // tag in SpicyChat's MAIN world). Every resource is declared in the manifest.
  function ensure(name) {
    if (!has(name)) return Promise.resolve(false);
    if (jobs.has(name)) return jobs.get(name);
    if (failed.has(name)) return Promise.resolve(false);
    const path = MODULES[name];
    if (!path || !chrome?.runtime?.getURL) return Promise.resolve(false);
    const started = performance.now();
    const promise = import(chrome.runtime.getURL(path)).then(() => {
      // This also wraps late-loaded creator tools with the existing Private /
      // unknown-visibility guard; no timer or additional observer is needed.
      if (["creator-moderation-warnings", "lorebook-workflow"].includes(name)) {
        DS.installCreatorEditorPrivacyGuards?.();
      }
      DS.diagEvent?.("feature-loader", "module-loaded", { feature: name,
        durationMs: Math.round((performance.now()-started)*10)/10 });
      return true;
    }).catch(error => {
      const info=String(error?.message||error).slice(0,180);
      failed.set(name,info);
      console.warn(`[DragonScript QoL] Could not load module: ${name}: ${info}`);
      DS.diagEvent?.("feature-loader", "module-failed", { feature: name });
      return false;
    });
    jobs.set(name,promise);
    return promise;
  }
  function wanted(settings, path = location.pathname) {
    // The explicit Research Export helper is NOT an ordinary /chats tab.
    // It only needs its own exporter module and shared eager auth readers;
    // unrelated optional panels must not load while thousands of bots scan.
    const startupParams = new URLSearchParams(location.search);
    if (CHATS.test(path) && startupParams.get("ds-research-export") === "1") {
      return has("bulk-chat-research") ? ["bulk-chat-research"] : [];
    }
    // Dedicated recommendation-rating and Bot Status helper tabs only need
    // the eager authenticated bridge/runtime. Do not parse optional chat UI or
    // Lorebook features while a background job uses a hidden helper page.
    if (["dsQuickDislike", "dsQuickLessLike", "dsBotStatus"].some(k => startupParams.get(k) === "1")) return [];
    const chat = CHAT.test(path);
    const myCreations = MY_CREATIONS.test(path);
    const page = DS.getPageState?.() || {};
    const lorebookEditor = LOREBOOK_EDITOR.test(path) || !!page.isLorebookEditor;
    const botEditor = BOT_EDITOR.test(path) || !!page.isBotEditor;
    const list = [];
    const add = (name,condition) => { if(condition && has(name))list.push(name); };
    add("bulk-chat-research", CHATS.test(path) &&
      new URLSearchParams(location.search).get("ds-research-export") === "1");
    add("quick-panel",settings.showQuickPanel === true);
    add("sidebar",!!settings.showLaterFavoritesTab || !!settings.showQolSidebarButton ||
      !!settings.restorePersonasSidebarPosition || Object.keys(settings).some(k => k.startsWith("hideSidebar") && !!settings[k]));
    add("soundscapes",!!settings.enableSoundscapes);
    add("animation-control", any(settings, ["reduceAnimatedBotImages", "animatedImagesListings",
      "animatedImagesChats", "animatedImagesProfiles", "animatedImagesChatMedia"]));
    add("exact-message-counts", (LISTING.test(path) || path === "/" || myCreations || PROFILES.test(path)) &&
      any(settings, ["showExactMessageCounts", "showBotCreationDates", "showNewBotBadge"]));
    add("previously-chatted-indicator", settings.enablePreviouslyChattedIndicator === true &&
      (chat || CHATS.test(path) || LISTING.test(path) || path === "/" || myCreations));
    add("native-memory-probe", chat && settings.nativeMemoryQualityProbe === true);
    const memory = chat && any(settings,["enableBulkMemoryManager", "showCopyMemoryAction", "memoryAutoLoadAll"]);
    add("memory-manager",memory);
    add("memory-packs",memory);
    add("context-keeper",chat && settings.enableContextKeeper === true);
    add("creation-audit",(myCreations||botEditor) && settings.enableCreationAudit === true);
    add("favorites-recovery",FAV.test(path) && settings.enableFavoritesRecovery === true);
    // Include manual export helper tabs even when the regular editor tools are
    // disabled; they are a separate explicit user-initiated operation.
    const params = new URLSearchParams(location.search);
    add("lorebook-backup",(lorebookEditor && any(settings,["lorebookBackupToolsEnabled","lorebookBackupsEnabled"])) ||
      params.has("dsQolLorebookExport") || params.has("dsQolLorebookBackupWorker"));
    add("my-creations-backup",myCreations && any(settings,["enableMyCreationsBulkBackup","enableAccountMigrationAssistant"]));
    add("chat-export",chat && any(settings,["showChatExportButton","showQuickPanel","enableCommandPalette","showChatTopBarTools"]));
    add("persona-full-backup",PERSONAS.test(path) && settings.personaFullBackupEnabled === true);
    add("profile-export",PROFILES.test(path) && settings.enableProfileExport === true);
    add("creator-writing-assistant",(botEditor||lorebookEditor) && settings.enableCreatorWritingAssistant === true);
    add("character-token-optimizer",botEditor && settings.enableCharacterTokenOptimizer === true);
    add("chat-continuation",chat && settings.enableChatContinuationAssistant === true);
    add("chat-scene-notes",(chat||botEditor) && settings.enableChatSceneNotes === true);
    add("lorebook-consistency",chat && any(settings,["enableLorebookConsistency","enableCreatorTriggerPreview"]));
    add("smart-filter-presets",(LISTING.test(path)||path === "/"||page.routeType === "listing"||page.routeType === "creator-listing") && settings.enableSmartFilterPresets === true);
    add("wiki-lorebook-importer",lorebookEditor && settings.enableWikiLorebookImporter === true);
    add("persona-organizer",settings.enablePersonaOrganizer === true);
    add("private-lorebook-bridge",(chat||lorebookEditor) && settings.enablePrivateLorebookBridge === true);
    add("archive-community-themes",(LISTING.test(path)||path === "/"||page.routeType === "listing"||page.routeType === "creator-listing") && settings.archiveCommunityThemesEnabled === true);
    add("archive-blocking-presets",(LISTING.test(path)||path === "/"||page.routeType === "listing"||page.routeType === "creator-listing") && settings.archiveBlockingPresetsEnabled === true);
    // Stage 17 continuation: feature-owned tools no longer parse on every
    // navigation. The critical/slow pass already gates their actual work.
    add("chat-organizer", CHATS.test(path) && settings.enableChatOrganizer === true);
    add("chat-pins", CHATS.test(path) && settings.enableChatPins === true);
    add("chat-smart-folders", CHATS.test(path) && settings.enableChatOrganizer === true && settings.enableChatSmartFolders === true);
    add("my-creations-filters", myCreations && settings.enableMyCreationsFilters === true);
    const editorSnippets = any(settings, ["botEditorShowCharButton", "botEditorShowUserButton", "botEditorShowContinueButton",
      "botEditorShowNoControlButton", "botEditorShowCustomSnippets", "botEditorAutoOpenAdvanced"]);
    add("bot-editor-snippets", (botEditor || lorebookEditor) && editorSnippets);
    add("bot-editor-history", botEditor && settings.enableBotEditorDraftHistory === true);
    add("story-day-tracker", chat && settings.enableStoryDayTracker === true);
    add("rp-state-tracker", chat && settings.enableRpStateTracker === true);
    add("focus-mode", chat && settings.enableFocusMode === true);
    add("chat-search", chat && settings.showChatSearch === true);
    add("chat-nudges", chat && settings.enableChatNudges === true);
    add("selection-memory", chat && settings.enableSelectionRemember === true);
    add("rulebook-diagnostics", chat && settings.enableRulebookDiagnostics === true);
    add("saved-snippets", chat && settings.enableSavedTextSnippets === true);
    add("lorebook-connections", (lorebookEditor || LOREBOOK_PUBLIC.test(path)) && settings.showLorebookConnections === true);
    const creatorWarnings = (botEditor || lorebookEditor || myCreations || PROFILES.test(path)) &&
      any(settings, ["creatorModerationWarnings", "creatorModerationWarningsChatbots"]);
    add("creator-moderation-warnings", creatorWarnings);
    add("lorebook-moderation-review", lorebookEditor && settings.creatorModerationWarnings === true);
    const lorebookWorkflow = any(settings, ["lorebookDefaultEntriesTab", "lorebookRememberEntrySort",
      "lorebookProtectEntryDrafts", "lorebookEditShortcuts", "lorebookEntryManager"]);
    // Full-entry exports call a workflow helper even when editor UI is off.
    add("lorebook-workflow", (lorebookEditor && (lorebookWorkflow ||
      settings.lorebookBackupToolsEnabled || settings.lorebookBackupsEnabled)) ||
      params.has("dsQolLorebookExport") || params.has("dsQolLorebookBackupWorker"));
    return list;
  }
  DS.prepareOptionalModules = async function prepareOptionalModules(settings = DS.state?.settings||{}) {
    if(DS.isQolPausedForTab?.() || settings.enabled === false) return;
    const names = wanted(settings);
    const key=location.href+"|"+names.join(",");
    if(key === lastWantedKey) return;
    // The key includes active features, not unrelated DOM revisions.
    lastWantedKey = key;
    // Independent optional modules can load concurrently. The existing
    // de-duplicated ensure() promises and dependency map enforce safe ordering.
    // No new work starts after a tab is paused.
    if (DS.isQolPausedForTab?.()) return;
    await Promise.all(names.map(name => ensureWithDependencies(name)));
  };
  DS.optionalModuleLoader = Object.freeze({
    names: Object.freeze(Object.keys(MODULES)),
    getStatus: () => ({ loaded: [...jobs.keys()].filter(k=>!failed.has(k)),
      failed: [...failed.keys()] }),
    ensure,
    wanted
  });
})();

// Lite UI: hide only settings whose feature bundle has been explicitly omitted.
// Keep their values intact for future reconfiguration/import or Full installs.
// Full QoL needs no extra Settings work.
(() => {
  'use strict';
  const known = {
    interface: ['enableCommandPalette', 'showQuickPanel', 'showFloatingMiniPanel', 'hidePremium', 'hideAdvertBanners', 'enableSounds', 'showScrollToTopButton'],
    chat: ['showChatExportButton', 'chatExportIncludeBotInfo', 'chatExportIncludeRulebook', 'chatExportIncludeGenerationDetails', 'showOocTools', 'showChatTopBar', 'showMessageTimestamps', 'enableGenerationProfiles', 'enableGlobalMemory', 'enableReplyInstructions', 'showMessageBookmarks'],
    chatList: ['showChatListTools', 'enableChatOrganizer', 'enableChatSmartFolders', 'enableChatIndex', 'chatIndexEnabled', 'chatIndexStandaloneLauncher'],
    listings: ['blockCards', 'showCardGreetingTokenInfo', 'showExactMessageCounts', 'showLaterBotButtons', 'showCreatorFavoriteButtons', 'showRulebookFilters', 'showLorebookFilters', 'enableBotOrganizer', 'publicPersonalityOnly', 'enableFavoritesRecovery'],
    creator: ['enableCreationAudit', 'enableMyCreationsFilters', 'enableMyCreationsBulkBackup', 'enableBotEditorDraftHistory'],
    lorebook: ['showLorebookFilters', 'enableWikiLorebookImporter', 'enableLorebookEntryManager', 'lorebookEntryManager', 'lorebookTrackHistory'],
    personas: ['enablePersonaOrganizer', 'enablePersonaFullBackup']
  };
  function apply() {
    const profile = window.__DSQ_BUILD_PROFILE__;
    if (!profile?.generated || !Array.isArray(profile.bundles)) return;
    const selected = new Set(profile.bundles);
    // Feature recipes are authoritative for feature-owned settings when provided.
    // A bundle selection alone must not accidentally enable every Chat control.
    const selectedFeatures = Array.isArray(profile.features) ? new Set(profile.features) : null;
    const ownership = new Map();
    for (const [bundle, keys] of Object.entries(known)) {
      for (const key of keys) {
        if (!ownership.has(key)) ownership.set(key, new Set());
        ownership.get(key).add(bundle);
      }
    }
    // Feature registry is the authoritative owner when it provides one.
    for (const feature of window.SpicyChatQoLFeatureRegistry || []) {
      if (!feature?.bundle) continue;
      for (const key of [feature.setting, ...(feature.settings || [])]) {
        if (key) ownership.set(key, new Set([feature.bundle]));
      }
    }
    if (selectedFeatures) {
      // Full and Custom use the same Settings feature catalogue. A selected
      // feature owns its declared controls; omitted features merely hide them,
      // never clear or disable stored values. Some public Settings catalogue
      // labels predate the build-contract IDs and require a stable alias.
      const knownBuildFeatures = new Set(["accessibility","ad-banners","alternate-dialogue","android-app","animation-control","auto-voice","auto-images","auto-afk","auto-blocking","bot-archive","bot-backup","bot-blocking","bot-editor-actions","bot-editor-history","bot-editor-memory","bot-editor-snippets","bot-organizer","bot-status","bulk-blocking","card-token-info","card-workflow","cards","character-qol-profiles","chat-backgrounds","character-pictures","persona-pictures","picture-library","chat-bookmarks","chat-continuation","chat-bubbles","chat-export","chat-format-compatibility","chat-index","chat-list","chat-nudges","chat-organizer","chat-rulebook-metadata","chat-search","chat-scene-notes","chat-stability","chat-tags","chat-topbar","chat-ui","command-palette","composer-control","context-keeper","core-message-cache","creation-audit","creation-bulk-input","creator-favorites","creator-following","creator-workspace","creator-writing-assistant","delete-guard","exact-message-counts","failed-message-helper","favorite-bots","focus-mode","footer-manager","formatting-toolbar","generation-metadata","generation-profiles","interface-runtime-tools","language-filter","later-bots","list-fill","listing-panel-position","local-tag-matching","lorebook-backup","lorebook-consistency","lorebook-connections","lorebook-entries","lorebook-filter","lorebook-public-qol","lorebook-search-filter","lorebook-tags","lorebook-workflow","memory-manager","message-options","mobile-bot-organizer","mobile-listing-overflow","model-selector","model-quick-access","chat-lorebook-manager","chat-lorebook-recall","previously-chatted-indicator","moderation-warnings","my-chatbot-card-shortcuts","my-creations-backup","my-creations-filters","my-creations-view-memory","my-creations-auto-load","native-rating-helpers","native-memory-probe","ooc","opened-chats","pagination-tools","performance-mode","persona-full-backup","persona-organizer","personas","premium-notifications","profile-export","quick-panel","recommendation-helpers","reply-instructions","rp-format-repair","rp-state-tracker","rulebook-filter","rulebook-diagnostics","saved-chat-actions","saved-lists-overlay","saved-snippets","scroll-to-top","selection-memory","sidebar","smart-filter-presets","soundscapes","story-day-tracker","story-reading-layout","tags-nsfw","tag-aliases","text-replacements","top-bar","translation","ui-layout-fixes","wiki-lorebook-importer"]);
      const aliases = {
        'ooc-presets': 'ooc',
        'bot-status-center': 'bot-status',
        'rulebook-listing': 'rulebook-filter',
        'rulebook-chat-export': 'chat-export',
        'lorebook-listing': 'lorebook-filter',
        'lorebook-status-history': 'lorebook-public-qol',
        'lorebook-helpers': 'lorebook-entries',
        'favorite-creators': 'creator-favorites',
        'followed-creators': 'creator-following',
        'card-token-estimates': 'card-token-info',
        'card-filters': 'bot-blocking',
        'bulk-card-blocking': 'bulk-blocking',
        'chat-topbar': 'chat-topbar',
        'creator-new-bot-watch': 'creator-workspace'
      };
      const explicit = new Map();
      for (const feature of window.SpicyChatQoLFeatureRegistry || []) {
        if (!feature || feature.builtIn === true) continue;
        const id = aliases[feature.id] || feature.id;
        if (!knownBuildFeatures.has(id)) continue;
        const keys = [feature.setting, ...(feature.settings || [])].filter(Boolean);
        if (!keys.length) continue;
        // A recipe's selected features are authoritative; bundle grouping is
        // only a fallback for settings without a recognized feature owner.
        for (const key of keys) {
          if (!explicit.has(key)) explicit.set(key, new Set());
          explicit.get(key).add('feature:' + id);
        }
      }
      for (const [key, owners] of explicit) ownership.set(key, owners);
      for (const key of ['showOocTools', 'replaceChatImageWithOocButton', 'quickPanelShowOoc', 'androidTopBarOoc']) {
        ownership.set(key, new Set(['feature:ooc']));
      }
    }
    // UI owners also matter in Custom Lite, even for shortcut-only settings.
    // Bundle fallback supports earlier Lite profiles without per-feature lists.
    const shortcutFeatureOwners = {
      chatIndexEnhanceNativeSearch: "chat-index",
      quickPanelShowChatMessageSearch: "chat-index",
      enableCustomCharacterPictures: "character-pictures",
      enableCustomPersonaPictures: "persona-pictures",
      enableCustomPictureLibrary: "picture-library",
      quickPanelShowCustomPictures: "chat-backgrounds",
      quickPanelShowCreatorPreview: "lorebook-consistency",
      quickPanelShowImageGenerator: "auto-images",
      showAutoImageInlineButton: "auto-images",
      quickPanelShowRulebookDiagnostics: "rulebook-diagnostics",
      quickPanelShowContextKeeper: "context-keeper",
      quickPanelShowFocusMode: "focus-mode",
      quickPanelShowCharacterProfile: "character-qol-profiles",
      quickPanelShowSavedSnippets: "saved-snippets"
    };
    const parentBundles = { "chat-index":"chatList", "chat-backgrounds":"chat", "lorebook-consistency":"lorebook",
      "auto-voice":"chat", "auto-images":"chat", "chat-rulebook-metadata":"chat", "rulebook-diagnostics":"chat", "context-keeper":"chat",
      "focus-mode":"chat", "character-qol-profiles":"profiles", "saved-snippets":"chat" };
    for (const [key, featureId] of Object.entries(shortcutFeatureOwners)) {
      ownership.set(key, new Set([selectedFeatures ? `feature:${featureId}` : (parentBundles[featureId] || "chat")]));
    }

    if (selectedFeatures) ownership.set('quickPanelShowCustomPictures', new Set(
      ['chat-backgrounds','character-pictures','persona-pictures','picture-library','auto-images'].map(id => 'feature:' + id)));

    // Custom Lite must include the actual producers/consumers of automatic
    // blocking, not merely its settings switch. Full builds remain unchanged.
    const featureDependencies = {
      "auto-blocking": ["cards", "bot-blocking"],
      "chat-scene-notes": ["reply-instructions"]
    };
    const isFeatureAvailable = id => !!selectedFeatures?.has(id) &&
      (featureDependencies[id] || []).every(dependency => selectedFeatures.has(dependency));
    let omitted = 0;
    for (const [key, owners] of ownership) {
      const input = document.getElementById(key);
      if (!input) continue;
      const row = input.closest('label.row, .setting-row');
      if (!row) continue;
      const unavailable = ![...owners].some(bundle => bundle.startsWith('feature:') ? isFeatureAvailable(bundle.slice(8)) : selected.has(bundle));
      row.classList.toggle('ds-lite-omitted-setting', unavailable);
      if (unavailable) omitted++;
      // Do not disable or uncheck: normal Settings saves must preserve values.
    }
    // An entirely absent feature must not leave a dead top-level category.
    const pictureSection = document.querySelector('.tab-page[data-page="custom-pictures"]');
    const pictureTab = document.querySelector('.tab-button[data-tab="custom-pictures"]');
    const picturesAvailable = selectedFeatures ? (['chat-backgrounds','character-pictures','persona-pictures','picture-library','auto-images'].some(id => selectedFeatures.has(id))) : selected.has('chat');
    pictureSection?.classList.toggle('ds-lite-omitted-setting', !picturesAvailable);
    pictureTab?.classList.toggle('ds-lite-omitted-setting', !picturesAvailable);
    if (!document.getElementById('ds-lite-settings-notice')) {
      const note = document.createElement('p');
      note.id = 'ds-lite-settings-notice';
      note.className = 'hint';
      note.textContent = `Lite build: ${profile.bundles.join(', ')}. ${omitted} known feature controls hidden because their modules are not installed. Their saved values remain unchanged.`;
      const main = document.querySelector('main');
      main?.prepend(note);
    }
  }
  window.DSQApplyBuildProfileSettings = apply;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();

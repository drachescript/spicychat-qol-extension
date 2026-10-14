// Lite UI: hide only settings whose feature bundle has been explicitly omitted.
// Keep their values intact for future reconfiguration/import or Full installs.
// Full QoL needs no extra Settings work.
(() => {
  'use strict';
  const known = {
    interface: ['enableCommandPalette', 'showQuickPanel', 'showFloatingMiniPanel', 'hidePremium', 'hideAdvertBanners', 'enableSounds', 'showScrollToTopButton'],
    chat: ['showChatExportButton', 'chatExportIncludeBotInfo', 'chatExportIncludeRulebook', 'chatExportIncludeGenerationDetails', 'showOocTools', 'showChatTopBar', 'showMessageTimestamps', 'enableGenerationProfiles', 'enableGlobalMemory', 'enableReplyInstructions', 'showMessageBookmarks'],
    chatList: ['showChatListTools', 'enableChatOrganizer', 'enableChatIndex', 'chatIndexEnabled', 'chatIndexStandaloneLauncher'],
    listings: ['blockCards', 'showCardGreetingTokenInfo', 'showExactMessageCounts', 'showLaterBotButtons', 'showCreatorFavoriteButtons', 'showRulebookFilters', 'showLorebookFilters', 'enableBotOrganizer'],
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
      for (const key of ['showOocTools', 'replaceChatImageWithOocButton', 'quickPanelShowOoc', 'androidTopBarOoc']) {
        ownership.set(key, new Set(['feature:ooc']));
      }
    }
    let omitted = 0;
    for (const [key, owners] of ownership) {
      const input = document.getElementById(key);
      if (!input) continue;
      const row = input.closest('label.row, .setting-row');
      if (!row) continue;
      const unavailable = ![...owners].some(bundle => bundle.startsWith('feature:') ? selectedFeatures?.has(bundle.slice(8)) : selected.has(bundle));
      row.classList.toggle('ds-lite-omitted-setting', unavailable);
      if (unavailable) omitted++;
      // Do not disable or uncheck: normal Settings saves must preserve values.
    }
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

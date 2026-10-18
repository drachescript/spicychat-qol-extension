// Generated from build/features/*.json. Full QoL always includes the whole map;
// a Custom profile may narrow it, after its runtime closure has been validated.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const ids = new Set(["accessibility","ad-banners","alternate-dialogue","android-app","animation-control","auto-voice","auto-images","auto-afk","auto-blocking","bot-archive","bot-backup","bot-blocking","bot-editor-actions","bot-editor-history","bot-editor-memory","bot-editor-snippets","bot-organizer","bot-status","bulk-blocking","card-token-info","card-workflow","cards","character-qol-profiles","chat-backgrounds","character-pictures","persona-pictures","picture-library","chat-bookmarks","chat-bubbles","chat-export","chat-format-compatibility","chat-index","chat-list","chat-nudges","chat-organizer","chat-rulebook-metadata","chat-search","chat-scene-notes","chat-stability","chat-tags","chat-topbar","chat-ui","command-palette","composer-control","context-keeper","core-message-cache","creation-audit","creation-bulk-input","creator-favorites","creator-following","creator-workspace","creator-writing-assistant","delete-guard","exact-message-counts","failed-message-helper","favorite-bots","focus-mode","footer-manager","formatting-toolbar","generation-metadata","generation-profiles","interface-runtime-tools","language-filter","later-bots","list-fill","listing-panel-position","local-tag-matching","lorebook-backup","lorebook-consistency","lorebook-connections","lorebook-entries","lorebook-filter","lorebook-public-qol","lorebook-search-filter","lorebook-tags","lorebook-workflow","memory-manager","message-options","mobile-bot-organizer","mobile-listing-overflow","model-selector","moderation-warnings","my-chatbot-card-shortcuts","my-creations-backup","my-creations-filters","my-creations-view-memory","my-creations-auto-load","native-rating-helpers","ooc","opened-chats","pagination-tools","performance-mode","persona-full-backup","persona-organizer","personas","premium-notifications","profile-export","quick-panel","recommendation-helpers","reply-instructions","rp-format-repair","rp-state-tracker","rulebook-filter","rulebook-diagnostics","saved-chat-actions","saved-lists-overlay","saved-snippets","scroll-to-top","selection-memory","sidebar","smart-filter-presets","soundscapes","story-day-tracker","story-reading-layout","tags-nsfw","tag-aliases","text-replacements","top-bar","translation","ui-layout-fixes","wiki-lorebook-importer"]);
  const aliases = Object.freeze({
    "OOC": "ooc",
    "chat top bar": "chat-topbar",
    "chat UI": "chat-ui",
    "chat background button placement": "custom-pictures",
    "custom pictures": "custom-pictures",
    "chat background cleanup": "custom-pictures",
    "chat backgrounds": "custom-pictures",
    "character pictures": "character-pictures",
    "persona pictures": "persona-pictures",
    "picture library": "picture-library",
    "composer": "composer-control",
    "scroll to top": "scroll-to-top",
    "card hiding": "bot-blocking",
    "card block buttons": "bot-blocking",
    "bot organizer settled": "bot-organizer",
    "bot organizer context": "bot-organizer",
    "bot organizer cleanup": "bot-organizer",
    "bot editor save actions": "bot-editor-actions",
    "bot editor snippets": "bot-editor-snippets",
    "bot editor draft history": "bot-editor-history",
    "bot editor backup": "bot-backup",
    "lorebook listing tools": "lorebook-filter",
    "lorebook search filter": "lorebook-search-filter",
    "lorebook tag expansion": "lorebook-tags",
    "public lorebook profile/history": "lorebook-public-qol",
    "public lorebook blocking/history": "lorebook-public-qol",
    "bot name expander": "cards",
    "tag template": "tags-nsfw",
    "tag template button": "tags-nsfw",
    "generation metadata": "generation-metadata",
    "model selector": "model-selector",
    "sidebar": "sidebar",
    "top bar": "top-bar",
    "main footer": "footer-manager",
    "random chat": "chat-list",
    "saved chat actions": "saved-chat-actions",
    "listing refill dedupe": "list-fill",
    "listing name sort": "pagination-tools",
    "creator favorite buttons": "creator-favorites",
    "creator follow buttons": "creator-following",
    "card greeting token info": "card-token-info",
    "Android app controls": "android-app",
    "RP format repair": "rp-format-repair",
    "my creations filter cleanup": "my-creations-filters",
    "my creations backup cleanup": "my-creations-backup",
    "my creations auto-load": "my-creations-filters",
    "persona full backup button": "persona-full-backup",
    "personas": "personas",
    "animation controls": "animation-control",
    "advert banners": "ad-banners",
    "native rating helpers": "native-rating-helpers",
    "character QoL profile": "character-qol-profiles",
    "quick panel": "quick-panel",
    "create panel": "quick-panel",
    "update panel": "quick-panel",
    "performance mode": "performance-mode",
    "creation bulk input tools": "creation-bulk-input",
    "lorebook workflow tools": "lorebook-workflow",
    "bot editor local memory": "bot-editor-memory",
    "my creations view memory": "my-creations-view-memory",
    "my creations backup": "my-creations-backup",
    "my creations filters": "my-creations-filters",
    "lorebook backup": "lorebook-backup",
    "memory manager": "memory-manager",
    "focus mode": "focus-mode",
    "formatting toolbar": "formatting-toolbar",
    "context keeper": "context-keeper",
    "selection remember": "selection-memory",
    "reply instructions": "reply-instructions",
    "lorebook consistency": "lorebook-consistency",
    "chat text replacements": "text-replacements",
    "alternate dialogue": "alternate-dialogue",
    "translation": "translation",
    "chat nudges": "chat-nudges",
    "chat tags": "chat-tags",
    "chat search": "chat-search",
    "chat bookmarks": "chat-bookmarks",
    "chat bubbles": "chat-bubbles",
    "soundscapes": "soundscapes",
    "smart filter presets": "smart-filter-presets",
    "persona organizer": "persona-organizer",
    "bot archive profile capture": "bot-archive",
    "bot archive chat refresh": "bot-archive",
    "my creations view memory cleanup": "my-creations-view-memory",
    "creator writing assistant": "creator-writing-assistant",
    "creator moderation warnings": "moderation-warnings",
    "lorebook entry expanders": "lorebook-entries",
    "card workflow": "card-workflow",
    "recommendation helpers": "recommendation-helpers",
    "profile export": "profile-export",
    "scroll to top cleanup": "scroll-to-top",
    "top bar native restore": "top-bar",
    "sidebar native restore": "sidebar",
    "main footer native restore": "footer-manager",
    "chat top bar cleanup": "chat-topbar",
    "chat UI cleanup": "chat-ui",
    "saved lists overlay": "saved-lists-overlay",
    "failed message helper": "failed-message-helper",
    "message removal draft guard": "delete-guard",
    "message options": "message-options",
    "auto voice": "auto-voice",
    "auto images": "auto-images",
    "auto image": "auto-images",
    "card greeting token cleanup": "card-token-info",
    "rulebook listing tools": "rulebook-filter",
    "rulebook diagnostics": "rulebook-diagnostics",
    "lorebook connections": "lorebook-connections",
    "story reading layout": "story-reading-layout",
    "rulebook diagnostics cleanup": "rulebook-diagnostics"
});
  const raw = window.__DSQ_BUILD_PROFILE__ || {};
  const requested = raw.generated && Array.isArray(raw.features)
    ? new Set(raw.features.filter(id => ids.has(String(id))))
    : null;
  const dependencies = Object.freeze({
    "auto-blocking": ["cards", "bot-blocking"]
  });
  const selected = requested ? new Set([...requested].filter(id =>
    (dependencies[id] || []).every(dep => requested.has(dep)))) : null;
  function featureForTask(task) {
    const name = String(task || "");
    if (Object.prototype.hasOwnProperty.call(aliases, name)) return aliases[name];
    const slug = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return slug === "custom-pictures" ? null : (ids.has(slug) ? slug : null);
  }
  DS.featureBuildProfile = Object.freeze({
    allFeatureIds: Object.freeze([...ids]),
    features: selected ? Object.freeze([...selected]) : null,
    featureForTask,
    isInstalled: featureId => !selected || selected.has(String(featureId || "")),
    isTaskInstalled: task => {
      const id = featureForTask(task);
      return !id || !selected || selected.has(id);
    }
  });
})();
}

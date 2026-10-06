(() => {
  const F = (id, name, category, description, extra = {}) => ({ id, name, category, description, ...extra });

  window.SpicyChatQoLFeatureRegistry = [
    F("settings-search", "Settings search", "Setup & Compatibility", "Search across every Settings tab with breadcrumbs, feature-registry metadata and common preference/option wording, then jump straight to the matching control. Generic Settings words act as modifiers instead of biasing results toward unrelated help text. Press Enter to open the top result.", { builtIn: true, target: "settingsSearch", updated: "0.1.9.642", aliases: ["preference", "preferences", "option", "options", "setting", "settings"] }),
    F("command-palette", "QoL Command Palette", "Setup & Compatibility", "Press Ctrl/Cmd + K (or choose another shortcut) on SpicyChat to fuzzy-search common QoL actions plus locally known Favorite/Later bots, Lorebooks and Personas. Frequently used actions can be pinned and recent actions are ranked higher.", { setting: "enableCommandPalette", added: "0.1.9.97", target: "commandPaletteCard", aliases: ["ctrl k", "command menu", "quick actions", "keyboard shortcut", "fuzzy search", "recent actions", "pinned actions"] }),
    F("control-center", "Control Center", "Setup & Compatibility", "A single Settings dashboard for fast navigation, creator backup/Lorebook relationships, read-only data-health checks, per-dataset storage size, migration dry-runs, performance baselines and full support checks.", { builtIn: true, added: "0.1.9.97", target: "controlDataHealthCard", aliases: ["health check", "storage breakdown", "migration test", "performance baseline", "creator workspace", "support check"] }),
    F("collapsible-settings", "Compact Settings sections", "Setup & Compatibility", "Choose between familiar classic tabs or grouped navigation, single-column or adaptive card layouts, and comfortable or wide page width. Nested options are visually clearer while collapsible/pinnable sections, recent/pinned navigation, enabled-only filtering and per-section reset remain available.", { builtIn: true, added: "0.1.9.92", updated: "0.2.14", target: "settingsLayoutCard", aliases: ["collapse all settings", "settings dropdown", "settings accordion", "less scrolling", "pinned settings", "recent settings", "show enabled only", "reset section"] }),
    F("quick-setup", "Quick setup presets", "Setup & Compatibility", "Fresh installs can choose Chatting, Creator, Both or Start clean; Minimal, Recommended and Creator presets remain available later. Setup choices only change local QoL settings and do not publish anything.", { builtIn: true, target: "quickSetupCard" }),
    F("whats-new", "What's New notifications", "Setup & Compatibility", "Show a small local notice after QoL updates with a shortcut to recent changes.", { setting: "showUpdateNotifications" }),
    F("sai-compat", "S.AI Toolkit compatibility", "Setup & Compatibility", "Detect S.AI Toolkit and let QoL step back from overlapping features while keeping QoL-only tools available.", { setting: "saiToolkitCompatibility", updated: "0.1.8.76" }),
    F("diagnostics", "Safe diagnostics", "Setup & Compatibility", "Copy or download safe support/performance reports without chat text or private saved content. When Dragon\'s SpicyChat Diagnostic Extension is actively recording, Diagnostic Protocol v2 can also expose privacy-safe QoL operation, scheduler, storage, worker, network-attribution and performance timing summaries.", { builtIn: true, target: "diagnosticsCard", updated: "0.2.32" }),
    F("simple-feature-guide", "Simple feature guide", "Setup & Compatibility", "A plain-language ELI5 guide that explains what the main QoL features do and why you might want them, without requiring the internal setting names.", { builtIn: true, added: "0.1.9.105", target: "simpleFeatureGuideCard", aliases: ["eli5", "beginner guide", "what does this do", "help features", "simple help"] }),
    F("per-tab-qol", "Per-tab QoL switch", "Setup & Compatibility", "Pause all QoL page behavior only in the current SpicyChat tab from the extension popup. The pause survives reloads/navigation in that tab and clears when the tab is closed.", { builtIn: true, added: "0.1.9.64", aliases: ["this tab", "pause qol", "disable qol tab", "popup", "tab toggle"] }),
    F("bot-status-center", "Bot Status Center", "Saved Lists & Bot Discovery", "Check tracked bots by exact character ID, preserve meaningful profile changes automatically as local history, distinguish deleted/private/unknown results safely, keep recovery copies, recheck archived/unavailable copies, restore bots that become public again without resurrecting Blocked membership, forget unwanted deleted bots from local QoL data, refresh stale records, and export or submit saved public snapshots to the Archive when configured.", { builtIn: true, target: "botAvailabilityCard", added: "0.1.8.98", updated: "0.2.30", aliases: ["opened chats", "opened history", "opened chat tracking", "deleted bot detector", "profile change history", "local bot archive", "deleted bot backup", "recheck archived bots", "forget deleted bot", "profile snapshots", "deleted saved bots", "recovery copies", "archive export", "archive upload", "archive contribution", "public archive submission", "json.gz", "stale refresh", "scan speed"] }),
    F("favorite-history", "Favorite bot history", "Saved Lists & Bot Discovery", "Remember favorite bots seen on SpicyChat, then search/sort/filter them by creator, opened/blocked state, Later relationship and organizer folder.", { setting: "trackFavoriteBots", updated: "0.1.9.62" }),
    F("favorite-creators", "Favorite creators", "Saved Lists & Bot Discovery", "Save creators locally and optionally keep their bots visible when other filters would hide them.", { setting: "showCreatorFavoriteButtons" }),
    F("followed-creators", "Followed creators", "Saved Lists & Bot Discovery", "Maintain a separate local Follow / Following creator list without changing SpicyChat's account state. Any public creator can be followed locally; the follow itself is always user opt-in.", { setting: "showFollowCreatorButtons", added: "0.1.8.73", updated: "0.1.9.111" }),
    F("creator-new-bot-watch", "New bots from followed creators", "Saved Lists & Bot Discovery", "Optionally check locally followed public creators using SpicyChat's Latest listing and alert through browser notifications and/or a Discord webhook. The first successful check creates a baseline so existing bots do not alert.", { setting: "enableCreatorBotNotifications", added: "0.1.9.103", updated: "0.1.9.111", target: "followedCreatorsCard", platform: "Desktop browser", aliases: ["creator notifications", "new bots", "follow notifications", "discord webhook", "latest bots"] }),
    F("later", "Later bots", "Saved Lists & Bot Discovery", "Save bots for later from cards or chats, then search, sort and filter the local list by creator, opened/blocked state, favorite relationship and organizer folder.", { setting: "showLaterBotButtons", updated: "0.1.9.62" }),
    F("change-history", "Recently Changed / Undo", "Saved Lists & Bot Discovery", "Keep a short local history for supported QoL changes so selected actions can be reviewed or undone.", { setting: "enableLocalChangeHistory", added: "0.1.9.1" }),
    F("bot-organizer", "Bot Organizer", "Saved Lists & Bot Discovery", "Add local folders, private notes, personal tags, creator statuses, filters and safe bulk actions to known bots. Context buttons and open folder menus are kept stable across SpicyChat React remounts.", { setting: "enableBotOrganizer", updated: "0.1.9.105" }),
    F("saved-bots-hub", "Saved Bots Hub", "Saved Lists & Bot Discovery", "Search one deduplicated overview of bots QoL already knows from Favorite history, Later, Recently Seen, followed-creator detections, Bot Organizer, Bot Status Center opened history, Blocked and Not Interested. Multi-select shown or all filtered known bots for bulk folder/tag organization without adding them to Later first.", { builtIn: true, target: "savedBotsHubCard", updated: "0.1.9.109" }),

    F("card-filters", "Card filters", "Card & Listing Tools", "Hide or dim bot cards using tags, words, creators, groups and locally blocked bot data. Blocked-word matches can optionally be added to the normal Blocked bots list automatically, with explicit manual-unblock exceptions.", { setting: "blockCards", updated: "0.2.35", aliases: ["full bot description", "show description", "card description", "no hover description", "auto block words", "blocked word auto block"] }),
    F("card-token-estimates", "Card token estimates", "Card & Listing Tools", "Show Greeting, Personality, Scenario and Example Dialogue token estimates directly on loaded bot cards, with local caching for cards QoL has already checked.", { setting: "showCardGreetingTokenInfo", updated: "0.1.9.88" }),
    F("exact-message-counts", "Exact bot message counts", "Card & Listing Tools", "Replace rounded bot-card message totals such as 1.2k with the exact public count while avoiding repeated same-state writes when the displayed value is already correct.", { setting: "showExactMessageCounts", added: "0.1.9.112", updated: "0.2.14", aliases: ["exact messages", "message total", "message count", "typesense"] }),
    F("bot-creation-dates", "Bot creation dates", "Card & Listing Tools", "Show each bot\'s public creation date on listing cards without crowding the native stats row, and on bot profile pages directly after the Tokens stat. This can be enabled independently from Exact Message Counts.", { setting: "showBotCreationDates", added: "0.2.14", aliases: ["creation date", "created at", "created date", "bot age"] }),
    F("tag-defaults", "Tag defaults", "Card & Listing Tools", "Save include/exclude tag templates and optionally apply them automatically.", { setting: "autoTags" }),
    F("lorebook-listing", "Lorebook listing tools", "Card & Listing Tools", "Filter and sort bot listings by Lorebook status, expose useful Lorebook counts/shortcuts, and add a Has Lorebook toggle inside SpicyChat's native search/tag sidebar so normal bot searches can be limited to bots with attached Lorebooks.", { setting: "showLorebookFilters", added: "0.1.8.75", updated: "0.1.9.109" }),
    F("public-lorebook-blocking", "Public Lorebook blocking", "Card & Listing Tools", "Optionally apply the same normal blocked words, tags and creators to Public Lorebooks, plus exact Lorebook UUID blocks and an optional quick Block button. Hidden Lorebook grid cells collapse normally and Listing Refill can replace filtered Lorebook cards. All Lorebook blocking controls are opt-in.", { settings: ["lorebookBlockingEnabled", "applyBotBlockingToLorebooks", "showLorebookBlockButtons"], statusMode: "any", added: "0.2.31", target: "botBlockingDislikesCard", aliases: ["blocked lorebooks", "lorebook filters", "public lorebooks"] }),
    F("lorebook-status-history", "Lorebook Status & History", "Saved Lists & Bot Discovery", "Keep encountered Lorebooks in IndexedDB by exact UUID and scan only Lorebooks already tracked by QoL. Public checks use SpicyChat's current scoped Lorebook key, public recovery copies use the public Lorebook-entry collection, and one authenticated helper is kept only as a fallback for index misses or failed public recovery. Public-index hits remain Available if recovery fails, previous copies are retained, and history tracks metadata plus added/removed/changed entry IDs and versions. Archive export includes only Public-index-confirmed Lorebooks; private/restricted recovery data stays local.", { setting: "lorebookTrackHistory", added: "0.2.31", updated: "0.2.31", target: "lorebookStatusHistoryCard", aliases: ["lorebook center", "saved lorebooks", "lorebook history", "lorebook status", "check unchecked lorebooks", "scan lorebooks", "lorebook recovery"] }),
    F("smart-filters", "Smart Filter Presets", "Card & Listing Tools", "Combine discovery filters into reusable built-in or custom presets and pin favorites for quick access. Opened/Later/Favorite matching includes Android/WebView-safe card identity fallbacks.", { setting: "enableSmartFilterPresets", updated: "0.1.9.110" }),
    F("recommendations", "Recommendation helpers", "Card & Listing Tools", "Add optional discovery controls for Favorite/Later/Not Interested state, opened/Lorebook filters, preferred or avoided tags, favorite-creator boosts, temporary hides, reason badges, and a random visible bot.", { setting: "enableRecommendationHelpers", added: "0.1.8.76", updated: "0.1.9.102" }),
    F("card-workflow", "Card / discovery workflow", "Card & Listing Tools", "Optional card density, profile navigation, Copy Bot Info, Recently Seen, comparison, quick Not Interested and quick Unblock tools. QoL block controls are suppressed on My Creations by default unless explicitly enabled there.", { settings: ["showCopyBotInfoButtons", "trackRecentlySeenBots", "enableBotComparison", "showQuickNotInterestedButtons", "showQuickLessLikeButtons", "showQuickDislikeButtons", "showQuickUnblockButtons", "showBlockButtonOnMyCreations"], statusMode: "any", updated: "0.1.9.72" }),
    F("animated-images", "Animated bot images", "Card & Listing Tools", "Keep animated bot/avatar media static by default and animate only while the media is hovered, onscreen, and the tab is foregrounded, with separate page scopes.", { setting: "reduceAnimatedBotImages", added: "0.1.8.75", updated: "0.2.29" }),
    F("language-filter", "Language filter", "Card & Listing Tools", "Show only selected languages or hide selected languages. Detection can use visible descriptions, public profile text and sentence-like titles independently, so a confidently Spanish title is still caught even when the description is English.", { setting: "enableLanguageFilter", updated: "0.2.14", aliases: ["auto language", "untagged language", "non english", "detected language", "exclude language", "hide language"] }),
    F("text-normalization", "Text normalization", "Card & Listing Tools", "Normalize fancy Unicode, punctuation, invisible characters and optional decorative symbols in displayed bot-card text and the saved discovery views that reuse it, while using the same normalized text for filters/search/language matching.", { setting: "textNormalizationEnabled", updated: "0.1.9.61" }),
    F("listing-refill", "Listing refill", "Card & Listing Tools", "Refill filtered bot and Public Lorebook listings from later rendered SpicyChat pages. Unused eligible cards from page 2, page 3 and later pages are cached for about 20 minutes and reused before another helper page is opened. Every cached candidate is rechecked against current blocks, tag/word/creator rules, language, native filters, Smart Filters and duplicates before insertion; helpers are reused safely and allow native fallback requests time to finish.", { setting: "autoFillListings", updated: "0.2.14", platform: "Desktop browser", aliases: ["fill now", "refill", "fill page", "helper page", "filled card tags", "filled favorite", "stale refill", "excluded tag refill", "cached refill", "page cache"] }),
    F("listing-filter-stats", "Listing filter statistics", "Card & Listing Tools", "Optionally add a QoL blocked/filtered count beside SpicyChat\'s native result count, with a second opt-in detailed breakdown by explicit blocks, creator/tag/word rules, language, Smart Filters and other known reasons.", { setting: "showListingFilterStats", target: "listingFilterStatsSettings", added: "0.2.14", aliases: ["bots blocked", "filtered count", "results found", "filter breakdown", "blocked breakdown"] }),
    F("listing-name-sort", "Bot listing name sort", "Card & Listing Tools", "Sort the bots currently loaded on supported listings by SpicyChat order, Name A-Z or Name Z-A directly from the listing search/filter area; the chosen order re-applies when more cards load.", { builtIn: true, added: "0.1.9.83", aliases: ["alphabetical", "alphabetically", "A-Z", "Z-A", "bot order", "listing sort"] }),
    F("bulk-card-blocking", "Select bots / bulk blocking", "Card & Listing Tools", "Show a Select bots control on Home, Recommendations, and creator pages, then select several loaded bot cards and block them together. The control defaults beside the listing search area, with the older below-Group-Size placement optional.", { setting: "enableBulkCardBlocking", added: "0.1.9.86", updated: "0.1.9.109", platform: "Browser / compatible Android source", aliases: ["select bots", "bulk block", "multi select bots", "select bot cards"] }),
    F("quick-dislike", "Quick Dislike on QoL Block", "Card & Listing Tools", "Optional and off by default. When enabled, blocked bots are queued after the configured period of normal SpicyChat inactivity and sent through the same persistent signed recommendation-feedback helper used by Less Like. Dislike keeps separate history while the shared coordinator prevents duplicate negative ratings.", { setting: "quickDislikeIdleEnabled", added: "0.1.9.51", updated: "0.2.30", platform: "Desktop browser" }),
    F("blocked-bulk-dislike", "Blocked Bot Bulk Dislike", "Card & Listing Tools", "Process remaining blocked bot IDs one at a time through the persistent signed recommendation-feedback helper, with handled history, filtering, progress, stop-after-current controls, and shared duplicate-rating protection with Less Like.", { builtIn: true, target: "blockedBotsCard", added: "0.1.9.55", updated: "0.2.30", platform: "Desktop browser", aliases: ["block", "blocked bots", "bulk dislike", "rating", "unblock", "private", "deleted", "404", "creator blocked", "already disliked", "stop"] }),

    F("chat-list-tools", "Chat list tools", "Chat Tools", "Search, filter, sort and import conversation history on /chat and /chats, including Opened, message-count, saved-state and blocked-state filters. The first Load all uses SpicyChat's conversation API without mounting thousands of chat cards; later Refresh chats runs incrementally until it reaches already-known history, with Full rescan still available for repair.", { setting: "showChatListTools", updated: "0.2.20", aliases: ["blocked chat", "blocked filter", "chat filter"] }),
    F("chat-organizer", "Chat folders & bulk organizing", "Chat Tools", "Create QoL-local conversation folders on /chat and /chats, filter by folder, and select multiple conversations to add to or remove from a folder at once.", { setting: "enableChatOrganizer", added: "0.1.9.108", aliases: ["chat folders", "select chats", "bulk chats", "conversation organizer"] }),
    F("saved-chat-actions", "Saved chat quick actions", "Chat Tools", "Add Change Title, Clone and Remove shortcuts in a responsive row under each saved conversation.", { setting: "showSavedChatQuickActions", updated: "0.1.9.93" }),
    F("random-chat", "Random Chat", "Card & Listing Tools", "Show Random Chat on Home / Recommended and Favorites. Uses SpicyChat's public character search API instead of rendering temporary helper pages; Favorites uses your saved Favorite IDs as the pool.", { setting: "showRandomChatButton", added: "0.1.9.52", updated: "0.2.28", aliases: ["roulette", "random bot", "discovery roulette", "home random", "favorites random", "recommended random"] }),
    F("chat-topbar", "Chat top-bar tools", "Chat Tools", "Clean up the current chat header and optionally hide rating, model, memory and upsell controls. QoL now repairs its chat-header controls when SpicyChat remounts the native header.", { setting: "showChatTopBarTools", target: "chatTopBarCard", updated: "0.1.9.105" }),
    F("character-shortcuts", "Character shortcuts", "Chat Tools", "Add local Later, chat-history and new-chat shortcuts beside the current character. Compact screens also keep a direct Profile shortcut available when the character name is crowded.", { settings: ["chatTopBarAddLaterButton", "showPerCharacterChatHistory", "showQuickNewChatButton"], statusMode: "any", target: "characterShortcutsCard", updated: "0.1.9.105" }),
    F("ooc-presets", "OOC presets", "Chat Tools", "Keep reusable OOC instructions and insert the selected preset from chat controls.", { setting: "showOocTools" }),
    F("reply-instructions", "Reply Instructions", "Chat Tools", "Keep persistent global or bot-specific guidance for how the AI should answer, then append it automatically or insert it manually from an RI composer button. Guidance is normal visible chat/OOC text because SpicyChat does not expose a separate permanent system-instruction field to QoL.", { setting: "enableReplyInstructions", added: "0.1.9.73", aliases: ["response style", "reply style", "shorter replies", "persistent instruction", "bot instruction", "system prompt"] }),
    F("global-memory", "Global Memory / Baseline Notes", "Chat Tools", "Keep optional baseline notes shared across chats and add them to outgoing messages once per chat session, every turn, or manually. SpicyChat does not expose a hidden global system-memory slot, so the guidance is visible when sent.", { setting: "enableGlobalMemory", added: "0.1.9.101", aliases: ["baseline notes", "all chats memory", "universal memory", "global context"] }),
    F("formatting-toolbar", "Formatting toolbar", "Chat Tools", "Wrap selected text with roleplay/Markdown helpers including custom literal wrapper pairs. Dedicated asterisk/backtick shortcuts can be placed inside the typing box on the right or outside it on either side, and keep a stable slot so nearby RP/Reply controls cannot make them jump sides.", { setting: "showFormattingToolbar", added: "0.1.8.76", updated: "0.1.9.89" }),
    F("alternate-dialogue", "Alternate dialogue styling", "Chat Tools", "Locally style backtick dialogue for texting, thoughts, telepathy or comms without editing saved messages, using changed-message updates on long chats.", { setting: "styleAlternateDialogue", updated: "0.1.9.65" }),
    F("text-replacements", "Chat text replacements", "Chat Tools", "Apply local display replacements or optional reviewed saved edits using SpicyChat's normal message editor.", { setting: "enableChatTextReplacements", updated: "0.1.8.75" }),
    F("translation", "Message translation (DeepL)", "Chat Tools", "Translate individual or automatic chat messages with a user-provided DeepL API key while leaving originals visible. Message UI updates are limited to changed/new messages after the initial pass.", { setting: "enableTranslation", added: "0.1.8.73", updated: "0.1.9.65", maturity: "Experimental" }),
    F("message-actions", "Message quick actions", "Chat Tools", "Add optional Copy, Edit, Report, Remove Image and safe Resend controls to chat messages.", { settings: ["messageQuickActionCopy", "messageQuickActionEdit", "messageQuickActionReport", "messageQuickActionRemoveImage", "messageQuickActionResend"], statusMode: "any", updated: "0.1.9.31" }),
    F("chat-search", "Search Inside Current Chat", "Chat Tools", "Search loaded messages, jump between matches and optionally keep loading older history until a match is found. Active searches update changed/new messages incrementally on long chats.", { setting: "showChatSearch", updated: "0.1.9.65", aliases: ["find message", "regex", "case sensitive", "whole word", "search messages"] }),
    F("bookmarks", "Message bookmarks / multiple local pins", "Chat Tools", "Bookmark as many messages as you want locally, add notes, keep Back/Forward location history and jump to the previous/next loaded bookmark.", { setting: "enableMessageBookmarks", added: "0.1.9.2", updated: "0.1.9.62" }),
    F("focus-mode", "Focus / Immersive Mode", "Chat Tools", "Temporarily hide selected navigation and chat UI while keeping an Exit control available.", { setting: "enableFocusMode", added: "0.1.8.87" }),
    F("scroll-nav", "Scroll navigation & older-message loading", "Chat Tools", "Show floating top/bottom controls and optionally let Chat ↑ load older message batches.", { settings: ["showScrollToTopButton", "showScrollToBottomButton"], statusMode: "any", updated: "0.1.9.31" }),
    F("memory-manager", "Bulk Memory Manager", "Chat Tools", "Add multi-select, loading, JSON export/import, pin/delete, Context Keeper transfer helpers, and pinned-memory reordering to SpicyChat Memories. Pinned memories can be dragged or moved with arrows without losing your scroll position, and pin/unpin changes allow SpicyChat time to finish updating before they are treated as failed.", { setting: "enableBulkMemoryManager", added: "0.1.8.71", updated: "0.2.14", aliases: ["memory import", "memory export", "reorder pinned memory", "pinned memory order", "memory block order", "drag pinned memory"] }),
    F("context-keeper", "Context Keeper", "Chat Tools", "Automatically capture high-confidence durable continuity locally after chats settle, open the manager directly from the chat menu, review/edit saved details, control recap inclusion and build reusable OOC continuity notes for long chats.", { setting: "enableContextKeeper", updated: "0.1.9.112", aliases: ["continuity", "recap", "remember detail", "saved details", "automatic memory", "auto context", "chat menu"] }),
    F("story-day-tracker", "Internal Day Tracker / Storydate", "Chat Tools", "Keep a local numbered in-story day and compact Storydate code, detect conservative day/night transitions, review assisted suggestions, add dated timeline anchors, and pass the current relative-day map into Context Keeper recaps. Regenerated responses replace the same turn's automatic timeline event instead of advancing it twice. Suggestion credit: Chibs.", { setting: "enableStoryDayTracker", added: "0.1.9.112", updated: "0.1.9.122", target: "storyDayTrackerCard", aliases: ["day tracker", "storydate", "timeline", "yesterday", "tomorrow", "last night", "day 35"] }),
    F("rp-state-tracker", "RP State Tracker", "Chat Tools", "Keep changing roleplay state separate from long-term memory, including inventory, worn items, location, injuries, stats, currency, party members and objectives. Clear state lines can update automatically, assisted mode can suggest simple changes for review, and the current state can be sent as a compact OOC block only when it changes. State changes use Storydate when available. Suggestion credit: jumjam.", { setting: "enableRpStateTracker", added: "0.1.9.115", target: "rpStateTrackerCard", aliases: ["state tracker", "inventory tracker", "equipment", "worn clothing", "stats", "hp", "gold", "current location", "quest", "objective", "roleplay state"] }),
    F("chat-nudges", "Chat Nudges", "Chat Tools", "Set local inactivity reminders for up to two selected chats. Reminders reuse the last bot reply for context and never generate or send a fake SpicyChat message.", { settings: ["enableChatNudges", "chatNudgeDefaultHours", "chatNudgeBrowserNotifications"], statusMode: "primary", target: "chatNudgesCard", added: "0.1.9.66", aliases: ["reminder", "inactivity", "message reminder", "come back", "continue chat", "notification"] }),
    F("generation-profiles", "Generation profiles", "Chat Tools", "Save and restore the current model and supported generation slider values from SpicyChat's Generation Settings.", { setting: "enableGenerationProfiles" }),
    F("generation-details", "Timestamps & generation details", "Chat Tools", "Show timestamps, requested/actual model, generation time and captured generation settings when available.", { settings: ["showMessageTimestamps", "showGenerationModel", "showGenerationElapsed", "showGenerationSettings"], statusMode: "any", updated: "0.1.9.24" }),
    F("model-menu", "Model quick menu", "Chat Tools", "Favorite, order and optionally hide models in QoL's customized model menus. Compact mobile/WebView pickers stay native-safe so QoL cannot hide the whole model list during a re-render.", { setting: "customizeModelQuickMenu", updated: "0.2.1" }),
    F("chat-backgrounds", "Custom chat backgrounds", "Chat Tools", "Use a local global chat background with optional per-chat overrides, dimming, blur, Cover/Contain/Tile sizing and positioning without uploading the image to SpicyChat. The compact BG control sits before the native rating/Like action in the chat header.", { setting: "enableChatBackgrounds", added: "0.1.9.54", updated: "0.1.9.83" }),
    F("chat-bubbles", "Chat bubble customization", "Chat Tools", "Customize AI/user bubble colors, fonts, borders, opacity, shapes, shadows and normal/action/dialogue text styling locally. Chat text size/line spacing and custom chat backgrounds are available alongside it in Appearance.", { setting: "enableChatBubbleCustomization", updated: "0.2.22", aliases: ["chat colors", "message colors", "chat font", "font type", "chat appearance", "visual customization"] }),
    F("accessibility-text-size", "Accessibility & text size", "Appearance & Interface", "Make QoL controls and chat messages easier to read with larger interface text and optional comfortable/spacious chat line spacing.", { builtIn: true, target: "accessibilityCard", added: "0.1.9.95", aliases: ["font size", "larger text", "eye strain", "line spacing", "readability"] }),
    F("rp-repair", "RP Format Repair", "Chat Tools", "Locally repair inconsistent speech/action Markdown into your preferred RP presentation without silently editing the saved reply.", { setting: "enableRpFormatRepair", updated: "0.1.8.92" }),
    F("context-window-warning", "RP context-full warning", "Chat Tools", "Warn before older roleplay messages are likely to fall out of the active model context. Uses SpicyChat-exposed context usage when available, otherwise a conservative local estimate with an optional manual context limit.", { setting: "enableContextWindowWarning", added: "0.1.9.109", aliases: ["max tokens", "context tokens", "context full", "forgotten messages", "rp memory warning"] }),
    F("chat-export", "Chat Export", "Chat Tools", "Copy or export chats as text, Markdown, HTML or JSON. Choose fast API history export or the native Load Previous Messages compatibility path; long exports report progress and completeness.", { setting: "showChatExportButton", updated: "0.2.18" }),
    F("auto-retry-failed-sends", "Auto retry failed sends", "Writing & Input", "Optionally retry a message when SpicyChat shows its native send-error banner. Uses backoff, waits for confirmation, and cancels if you edit the draft, leave the chat or the message succeeds.", { setting: "autoRetryFailedMessageSends", added: "0.2.18" }),
    F("persona-manager", "Persona saving & Persona Manager", "Chat Tools", "Save Persona text/avatar data locally, organize copies, refresh incomplete copies from rendered edit pages, restore them when possible and expose optional quick switching. The in-chat persona picker can also filter/sort by the same QoL folders, favorites and custom order used on /personas.", { settings: ["savePersonasFromPages", "enablePersonaOrganizer", "showPersonaQuickSwitch"], statusMode: "any", updated: "0.2.1", aliases: ["persona library", "restore persona", "persona avatar", "persona backup", "refresh persona", "persona groups", "persona folders"] }),
    F("soundscapes", "Soundscapes / Ambience", "Chat Tools", "Mix local or direct-URL ambience layers into reusable scenes with direct chat or optional Mini Panel playback controls.", { setting: "enableSoundscapes", added: "0.1.9.41", updated: "0.1.9.101" }),

    F("wiki-lorebook-import", "Wiki / Web Lorebook Importer", "Creation Tools", "Import Fandom, MediaWiki-style and generic wiki/article pages into a Lorebook with cleanup, aliases, category/member selection, duplicate handling, update checks, retryable bulk import, editable preview and pasted text/Markdown/HTML fallback.", { setting: "enableWikiLorebookImporter", added: "0.1.9.94", updated: "0.1.9.96", aliases: ["fandom importer", "wiki importer", "web lorebook", "mediawiki import", "lorebook import", "category import"] }),
    F("lorebook-consistency", "Lorebook response consistency", "Chat Tools", "After a settled AI reply, compare newly introduced terms with locally backed-up Lorebook keywords, show matched entries, and optionally carry those creator-defined details into the next turn.", { setting: "enableLorebookConsistency", added: "0.1.9.101", aliases: ["post response lorebook", "self lookup", "lorebook continuity", "bot initiated lorebook"] }),
    F("lorebook-workflow", "Lorebook workflow & entry manager", "Creation Tools", "Start Lorebooks on Entries without locking the tab, remember entry sorting, protect unfinished entry drafts, add Edit Lorebook shortcuts, and use a compact entry manager whose token/keyword info, row actions and every bulk action can be enabled separately. Stable draft/expand UI state is no longer rewritten unnecessarily.", { settings: ["lorebookDefaultEntriesTab", "lorebookRememberEntrySort", "lorebookProtectEntryDrafts", "lorebookEditShortcuts", "lorebookEntryManager"], statusMode: "any", added: "0.1.9.96", updated: "0.2.14", aliases: ["lorebook draft", "edit lorebook", "entry manager", "bulk lorebook", "entry sort", "tokens", "hidden keywords"] }),
    F("editor-snippets", "Bot editor snippets", "Creation Tools", "Add reusable {{char}}, {{user}}, CONTINUE, rule and custom snippet buttons to creator text fields.", { settings: ["botEditorShowCharButton", "botEditorShowUserButton", "botEditorShowContinueButton", "botEditorShowNoControlButton", "botEditorShowCustomSnippets"], statusMode: "any" }),
    F("editor-save-actions", "Creator save workflow", "Creation Tools", "Add Save & Stay and Save & Chat helpers while keeping SpicyChat's normal save flow authoritative.", { setting: "botEditorSaveActions", added: "0.1.8.96" }),
    F("remember-image-prompt", "Remember chatbot image prompt", "Creation Tools", "Remember the image-generation prompt locally per chatbot edit page and restore it after a refresh or later edit visit when SpicyChat leaves the field blank.", { setting: "rememberBotImagePrompt", added: "0.1.9.109", aliases: ["image generator prompt", "avatar prompt", "character image prompt", "remember prompt"] }),
    F("editor-drafts", "Chatbot Editor Draft History", "Creation Tools", "Keep local snapshots before/around edits and restore fields without automatically saving or publishing.", { setting: "enableBotEditorDraftHistory", added: "0.1.9.28" }),
    F("lorebook-helpers", "Lorebook creation helpers", "Creation Tools", "Optional Start New automation, bulk keyword paste, larger entry editor, entry text expansion, and complete expansion of collapsed public Lorebook tag lists using SpicyChat's current Lorebook search index.", { settings: ["lorebookAutoStartNew", "lorebookBulkKeywordPaste", "lorebookExpandEntryEditor", "lorebookExpandTags", "showLorebookEntryExpandButtons"], statusMode: "any", updated: "0.2.36" }),
    F("own-bot-backup", "Own chatbot backups", "Creation Tools", "Enable compact Save / Export / Version history controls on chatbot edit pages. Automatic backups keep rotating safety revisions and separate manual checkpoints, while meaningful Bot Version History records creator-content changes separately. Restores make a safety checkpoint, fill fields for review, and never save automatically.", { setting: "botBackupToolsEnabled", added: "0.1.9.89", updated: "0.2.1", target: "creatorBackupCard", aliases: ["bot backup", "character backup", "export bot json", "import bot json", "backup history", "manual backup", "restore tags"] }),
    F("bot-version-history", "Bot Version History", "Creation Tools", "Keep meaningful local versions of your own bots when creator-controlled content changes. Versions ignore message/like/rating changes, keep visibility/review state separate, include learned Lorebook association metadata, show changed fields, compare versions, and safely queue selected fields back into the normal editor without saving or publishing.", { setting: "botBackupToolsEnabled", added: "0.2.1", target: "creatorBackupManagerCard", aliases: ["bot history", "bot versions", "version history", "compare bot version", "character versions", "previous bot version"] }),
    F("lorebook-backup", "Lorebook backups", "Creation Tools", "Enable compact manual Save / Export / History controls on Lorebook edit pages, then independently choose whether Lorebook changes are also saved automatically.", { setting: "lorebookBackupToolsEnabled", added: "0.1.9.90", updated: "0.1.9.104", target: "creatorBackupCard", aliases: ["lore backup", "backup lorebook", "lorebook json", "lorebook history", "manual backup"] }),
    F("creator-backup-manager", "Creator backup manager", "Creation Tools", "Manage Bot Version History, own-chatbot latest backups, separate manual checkpoints, rotating safety revisions, optional visited-profile snapshots, and separate Lorebook backups. Bot versions can be viewed, compared, renamed, restored into the editor, or deleted without mixing them with safety history.", { builtIn: true, added: "0.1.9.93", updated: "0.2.1", target: "creatorBackupManagerCard", aliases: ["backup manager", "bot revisions", "bot versions", "profile backups", "lorebook backups", "stale backup"] }),
    F("creator-workspace", "Creator Workspace", "Creation Tools", "Use the Control Center to see own-bot version/safety-revision counts, Lorebook backups, draft history and known bot ↔ Lorebook relationships. Chatbot history can be compared and selected writing fields queued back into the normal editor for review before saving.", { builtIn: true, added: "0.1.9.97", updated: "0.2.1", target: "creatorWorkspaceCard", aliases: ["restore individual fields", "compare bot backup", "bot lorebook relationship", "creator dashboard", "revision diff"] }),
    F("moderation-warnings", "Creator wording warnings", "Creation Tools", "Show advisory community-reported wording warnings in Lorebooks and optionally chatbot editor fields without blocking or rewriting text.", { setting: "creatorModerationWarnings", updated: "0.1.9.30" }),
    F("my-creations-filters", "My Creations filters", "Creation Tools", "Add creator-specific filtering, sorting and remembered views to My Creations chatbot cards.", { setting: "enableMyCreationsFilters", added: "0.1.8.95" }),
    F("my-creations-auto-load", "My Creations auto-load", "Creation Tools", "Automatically press SpicyChat's native Load More control for a configurable number of extra My Chatbots pages/batches, waiting for real card growth while SpicyChat loads.", { setting: "autoLoadMyCreations", added: "0.1.9.67", updated: "0.1.9.87", aliases: ["auto load creations", "load more my bots", "creator auto load"] }),
    F("my-creations-backup", "My Creations bulk backup", "Creation Tools", "Download the newest live version of every owned chatbot or Lorebook from My Creations as one ZIP. The exporter loads remaining native listing batches first and fetches each current item from SpicyChat instead of local history.", { setting: "enableMyCreationsBulkBackup", added: "0.2.36", aliases: ["backup all chatbots", "backup all lorebooks", "bulk creations backup", "download all creations"] }),
    F("my-lorebook-edit-links", "My Lorebook Edit links", "Creation Tools", "Add a normal Edit link to owned Lorebook cards so browser-native click, Ctrl/Cmd+click, middle-click and context-menu behavior works without opening the three-dot menu first.", { setting: "showMyLorebookEditButtons", added: "0.2.36", aliases: ["lorebook edit button", "edit lorebook card", "ctrl click lorebook"] }),
    F("creation-audit", "Creation Audit", "Creation Tools", "Review loaded creations for missing/short fields, tag/placeholder issues, unusually large definitions, Lorebook problems and visibility. Includes Needs attention, Review next, Markdown/CSV reports, owner-editor verification, and a visible verification-source trail so unverified fields stay distinct from genuinely missing fields.", { setting: "enableCreationAudit", added: "0.1.8.76", updated: "0.1.9.111" }),

    F("creator-writing-assistant", "Creator Writing Assistant", "Creation Tools", "Review selected creator text or whole fields for spelling/grammar/phrasing, run whole-card consistency checks, and optionally use a browser-provided on-device language model for rewrites/translation with a review-before-apply diff.", { setting: "enableCreatorWritingAssistant", added: "0.1.9.102", target: "creatorWritingAssistantCard", aliases: ["spellcheck", "grammar", "phrasing", "browser ai", "multilingual creator"] }),
    F("profile-export", "Bot / profile export", "Creation Tools", "Export the fields actually exposed on a public SpicyChat bot profile as JSON, Markdown, or standalone HTML without guessing hidden definition fields.", { setting: "enableProfileExport", added: "0.1.9.102", target: "profileExportCard", aliases: ["markdown bot export", "html bot export", "profile archive"] }),
    F("chat-tags", "Bot tags in chats", "Creation Tools", "Make chat-page bot tags clickable and optionally add them to saved Narrow by tag filters.", { settings: ["showChatTagLinks", "showChatTagAddButtons"], statusMode: "any" }),

    F("sidebar-cleanup", "Sidebar cleanup & QoL launcher", "Interface Cleanup", "Hide individual SpicyChat sidebar entries or optionally add a SpicyChat QoL settings button at a configurable sidebar position.", { settings: ["showQolSidebarButton", "hideSidebarLogo", "hideSidebarHome", "hideSidebarChats", "hideSidebarPersonas", "hideSidebarLeaderboard", "hideSidebarSubscribe"], statusMode: "any", updated: "0.2.18" }),
    F("topbar-cleanup", "Top bar cleanup", "Interface Cleanup", "Hide language, notification or theme controls and customize the text shown beside your avatar.", { settings: ["hideTopBarLanguage", "hideTopBarNotifications", "hideTopBarTheme"], statusMode: "any" }),
    F("composer-cleanup", "Composer cleanup", "Interface Cleanup", "Hide selected plus/image/voice controls and optionally replace the image slot with OOC.", { settings: ["hideChatPlusButton", "hideChatImageButton", "hideChatVoiceButton", "replaceChatImageWithOocButton"], statusMode: "any" }),
    F("enter-key-behavior", "Enter / Return behavior", "Chat Tools", "Choose whether Enter follows SpicyChat, sends with Shift+Enter for a new line, or always inserts a new line while the native Send button submits. Handles mobile beforeinput/IME events too.", { builtIn: true, target: "chatEnterKeyBehavior", added: "0.2.29", aliases: ["mobile enter", "return key", "new line", "newline", "shift enter", "send key"] }),
    F("premium-cleanup", "Premium & promo cleanup", "Interface Cleanup", "Hide selected premium/subscription UI, floating upsells, promo banners and locked-model upgrade prompts while leaving the actual /subscribe plans, current-subscription notice and plan badges untouched.", { settings: ["hidePremium", "hideFloatingPremiumPopups", "hideAdvertBanners", "hideModelUpgradeButtons"], statusMode: "any", updated: "0.2.31" }),
    F("notification-cleanup", "Notification cleanup", "Interface Cleanup", "Hide SpicyChat notification UI/browser-tab badges, hide AnnounceKit feature-release popups separately, or clear product-update notifications in background tabs.", { settings: ["hideNotifications", "hideFeatureReleasePopups", "hideTabNotificationBadge", "autoReadNotifications"], statusMode: "any", updated: "0.2.29" }),
    F("mini-panel", "Mini Panel", "Interface Cleanup", "Show a configurable draggable QoL control panel with page-aware shortcuts, optional status information, and an opt-in loaded-message counter in chats.", { setting: "showQuickPanel", updated: "0.2.17" }),
    F("auto-afk", "Inactive tab cleanup (Auto-AFK)", "Interface Cleanup", "Unload or close inactive SpicyChat tabs after a configurable delay while protecting the active tab.", { setting: "autoAfkEnabled" }),
    F("duplicate-tabs", "Duplicate SpicyChat Tab Guard", "Interface Cleanup", "Detect duplicate SpicyChat tabs and keep either the new or existing copy with pinned-tab protection.", { setting: "duplicateTabGuardEnabled" }),
    F("tab-session-library", "Tab Session Library", "Interface Cleanup", "Manually analyze large SpicyChat tab piles, save reviewable snapshots, group bots into topics and restore selected tabs safely.", { builtIn: true, target: "tabCleanupDiagnosticCard" }),

    F("backup", "Backup / import", "Data & Backup", "Export selected QoL settings groups and saved-data categories, use Active / Used selection, preview imports, and merge or replace only the chosen scopes. Large local media is separate and secrets/caches stay excluded.", { builtIn: true, target: "backupRestoreCard", updated: "0.2.14", aliases: ["mobile backup", "download backup", "upload backup", "restore backup", "schema", "migration", "safety copy"] }),
    F("storage", "Storage usage & recovery", "Data & Backup", "Inspect local QoL storage and keep one lightweight recovery snapshot that can be loaded through the normal import preview before destructive local-data maintenance.", { builtIn: true, target: "storageCard", updated: "0.1.9.700", aliases: ["recovery snapshot", "restore local data"] }),
    F("cleanup", "Local data cleanup", "Data & Backup", "Check for supported duplicate/orphaned records without changing anything first, then normalize saved lists, bookmarks, Smart Filter pins, Persona organization and related metadata with an automatic recovery snapshot.", { builtIn: true, target: "cleanLocalData", updated: "0.1.9.700" }),
    F("settings-health", "Settings check", "Data & Backup", "Check actionable setup problems, invalid values, interrupted bulk actions, broken local records and unusually large storage without filling the page with harmless disabled-feature notices.", { builtIn: true, target: "settingsHealthCard", added: "0.1.9.53", updated: "0.1.9.91" }),

    F("compact-mobile", "Mobile / compact controls", "Mobile / Android", "Use a compact chat top-bar QoL menu and mobile-focused controls in supported Android/WebView/browser environments.", { setting: "androidTopBarMenu", added: "0.1.8.84", platform: "Android / compact" }),
    F("performance", "Performance controls", "Advanced", "Reduce QoL work on busy chats, large listings and hidden tabs. Includes sticky pressure-based Maximum mode, incremental message decoration, lower large-chat thresholds, lighter animations, and performance diagnostics with foreground/background context.", { settings: ["chatPerformanceMode", "runtimePerformanceMode", "desktopAppPerformanceGuard", "pauseQolInHiddenTabs", "autoPerformanceLargeChats", "largeChatPerformanceThreshold", "deferQolWhileTyping", "reduceQolAnimations", "reduceOptionsAnimations", "deepSleepDisabledFeatures", "performanceDiagnostics"], statusMode: "any", updated: "0.2.30" }),
    F("character-profiles", "Per-character QoL profiles", "Advanced", "Override selected RP formatting and Auto voice behavior for individual characters while inheriting other global settings.", { setting: "enableCharacterQolProfiles", added: "0.1.8.88" }),

    F("planned-translations", "Community interface translations", "Planned", "Move UI strings into a maintainable localization workflow with reviewable community translation files.", { planned: true }),
    F("creator-qa-status", "Creator QA status shortcuts", "Creation Tools", "Optionally add local Needs work / Testing / Finished workflow statuses directly to Creation Audit cards, reusing Bot Organizer data without changing the public bot.", { settings: ["enableCreationAudit", "creationAuditQuickStatus"], statusMode: "all", added: "0.1.9.102" }),
    F("recommendation-preferences", "Recommendation preferences", "Card & Listing Tools", "Extend recommendation helpers with Later/Not Interested exclusion, preferred/avoided tags, favorite-creator boosts and optional reason badges while keeping SpicyChat as the recommendation source.", { setting: "enableRecommendationHelpers", updated: "0.1.9.102" }),
    F("native-rating-helpers", "Native rating helpers", "Chat Tools", "Add optional compact Dislike / Like / Double-like shortcuts that drive SpicyChat's visible Rate Chatbot dialog and native Done button rather than a hidden rating API.", { setting: "enableNativeRatingHelpers", added: "0.1.9.102" }),
    F("planned-recovery", "Further unsend / recovery helpers", "Planned", "Improve failed-message recovery where SpicyChat exposes a safe native workflow.", { planned: true }),
    F("planned-bot-recovery-assistant", "Bot Recovery Assistant", "Planned", "Build a reviewable remake draft for deleted bots from exact saved profile data plus surviving chat history, clearly separating recovered fields from AI-reconstructed Personality/Scenario and never publishing automatically.", { planned: true }),
    F("saved-lists-overlay", "Saved Lists organizer", "Saved Lists & Bot Discovery", "Open an on-site QoL organizer for local Favorite history and Later with search, sorting, folders/notes visibility and quick Later changes. Later remains QoL-local.", { setting: "enableSavedListsOverlay", added: "0.1.9.102" }),

    F("personal-usage", "Personal usage & context", "Data & Backup", "Optional read-only summary of existing local QoL records such as Opened, Favorites, Later, blocked/not-interested, organization and backups. It does not begin collecting chat text or new activity history.", { setting: "enablePersonalUsageSummary", added: "0.1.9.102", target: "personalUsageCard" }),
    F("account-sync", "Account & Sync", "Data & Backup", "Link QoL settings across devices through the opt-in sync service, with per-device upload/download/manual modes, category selection, device management and local-only credentials. Normal backups stay separate and unsupported device settings remain preserved instead of being overwritten.", { builtIn: true, target: "accountSyncCard", added: "0.2.25", updated: "0.2.26", aliases: ["qol sync", "cloud sync", "link device", "sync settings", "syncqol"] }),
    F("planned-android-tabs", "Multiple Android chat tabs", "Planned", "Keep several SpicyChat conversations available inside the Android wrapper without relying on normal browser tabs.", { planned: true, platform: "Android" }),

    F("tag-aliases", "Local tag aliases / emoji handling", "Saved Lists & Bot Discovery", "Define personal alias → exact SpicyChat tag mappings with optional emoji. Aliases can help local recommendation preferences and display helpers without changing SpicyChat's real tags.", { setting: "enableTagAliases", added: "0.1.9.102", target: "tagAliasesCard" }),
    F("planned-lite", "Custom SpicyChat QoL Lite builds", "Planned", "Deferred. There are no current custom Lite builds; the normal Full extension remains the maintained build. The runtime bundle split is kept only as internal structure for now.", { planned: true, platform: "Chrome / Firefox / mobile-capable browsers" })
  ];
})();

/* BEGIN SPICYCHAT QOL OPTIONS ENHANCEMENTS */
// Options enhancement layer.
// This code is merged into feature-registry.js by the local test patch.
(() => {
  "use strict";
  if (globalThis.__dsQolOptionsEnhancements) return;
  globalThis.__dsQolOptionsEnhancements = true;

  const PAGE = 10;
  const DISCOVERY_KEY = "botDiscoveryIndexV1";
  let discoveries = { meta: {} };
  let temporaryRetryActive = false;

  const later = (fn, ms = 0) => setTimeout(() => {
    try { fn(); } catch (error) { console.warn("[SpicyChat QoL options]", error); }
  }, ms);
  const clean = value => String(value || "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const genericNames = new Set([
    "unknown", "unknown bot", "unknown character", "chatbot", "character", "bot",
    "for you", "recommended for you", "chatbot under review", "character under review",
    "under review", "view chatbot", "open chatbot", "private chatbot", "deleted chatbot",
    "not available", "unavailable", "404", "404 not found", "not found", "page not found",
    "error", "error loading chatbot", "failed to load chatbot"
  ]);

  function looksLikeGenericBotName(value, id = "") {
    const text = clean(value);
    const lower = text.toLowerCase();
    if (!text || lower === String(id || "").toLowerCase() || genericNames.has(lower)) return true;
    if (/^(?:404(?:\s+not\s+found)?|not\s+found|page\s+not\s+found)(?:\b|[.!…])/i.test(text)) return true;
    if (/^(?:for\s+you|recommended\s+for\s+you|chatbot\s+under\s+review|character\s+under\s+review)(?:\b|[.!…])/i.test(text)) return true;
    return false;
  }

  function cleanBotName(value, id = "") {
    let text = clean(value);
    if (looksLikeGenericBotName(text, id)) return "";
    const keepSeparator = token => /^(?:\||\/|[-–—]|[x×])$/i.test(token);
    const ornamentOnly = token => /^(?:୨୧|[⏝⟡⁀➴ೃ࿔̊☾✦★☆♡♥ღ༄࿐])+$/u.test(token);
    text = text.split(/\s+/).filter(token => {
      if (ornamentOnly(token)) return false;
      if (/[\p{L}\p{N}]/u.test(token)) return true;
      return keepSeparator(token);
    }).join(" ")
      .replace(/^(?:\||\/|[-–—]|[x×])\s+/i, "")
      .replace(/\s+(?:\||\/|[-–—]|[x×])$/i, "")
      .replace(/(?:\s+\|){2,}/g, " |")
      .replace(/\s+/g, " ").trim();
    return looksLikeGenericBotName(text, id) ? "" : text.slice(0, 180);
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(keys, value => resolve(chrome.runtime.lastError ? {} : (value || {}))); }
      catch { resolve({}); }
    });
  }

  function addStyles() {
    if (document.getElementById("ds-options-enhancements-style")) return;
    const style = document.createElement("style");
    style.id = "ds-options-enhancements-style";
    style.textContent = `
      .account-sync-category-details { margin: 12px 0; }
      .account-sync-category-details > summary { cursor: pointer; font-weight: 600; }
      .account-sync-category-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 14px;margin:10px 0; }
      .account-sync-category-grid .row { margin:0; }
      .ds-sync-transfer,.ds-backup-pager { margin-top:10px; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Every manager that previously started at 20 now visually starts at 10.
  // The original renderers can continue creating 20/40/etc rows; this layer
  // only limits what is shown, so we do not have to fork their large code.
  function capList(host) {
    if (!host) return;
    const limit = Math.max(PAGE, Number(host.dataset.dsOptionsVisible || PAGE));
    const rows = host.children;
    for (let index = 0; index < rows.length; index++) {
      const shouldHide = index >= limit;
      if (rows[index].hidden !== shouldHide) rows[index].hidden = shouldHide;
    }
  }

  function makeCoalescedListRefresh(callback) {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      const run = () => {
        pending = false;
        try { callback(); } catch (error) { console.warn("[QoL options paging]", error); }
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      else setTimeout(run, 16);
    };
  }

  function installListPaging() {
    for (const host of document.querySelectorAll(".bot-manager-list")) {
      if (host.dataset.dsOptionsPaging === "1") continue;
      host.dataset.dsOptionsPaging = "1";
      host.dataset.dsOptionsVisible = String(PAGE);
      capList(host);
      const scheduleCap = makeCoalescedListRefresh(() => capList(host));
      new MutationObserver(scheduleCap).observe(host, { childList: true });

      const pager = host.nextElementSibling?.classList?.contains("bot-manager-pager")
        ? host.nextElementSibling
        : host.parentElement?.querySelector?.(".bot-manager-pager");
      if (!pager) continue;
      for (const button of pager.querySelectorAll("button")) {
        const original = clean(button.textContent);
        if (original === "Show 20 more") {
          button.textContent = "Show 10 more";
          button.addEventListener("click", () => {
            host.dataset.dsOptionsVisible = String(Number(host.dataset.dsOptionsVisible || PAGE) + PAGE);
            later(() => capList(host), 0);
          }, true);
        } else if (original === "Show first 20") {
          button.textContent = "Show first 10";
          button.addEventListener("click", () => {
            host.dataset.dsOptionsVisible = String(PAGE);
            later(() => capList(host), 0);
          }, true);
        }
      }
    }
  }

  function installBackupPaging() {
    const host = document.getElementById("creatorBackupManager");
    if (!host || host.dataset.dsOptionsPaging === "1") return;
    host.dataset.dsOptionsPaging = "1";
    host.dataset.dsOptionsVisible = String(PAGE);
    const pager = document.createElement("div");
    pager.className = "button-row ds-backup-pager";
    pager.innerHTML = '<button type="button" data-action="more">Show 10 more</button><button type="button" data-action="first">Show first 10</button><button type="button" data-action="all">Show all</button>';
    host.insertAdjacentElement("afterend", pager);
    const refresh = () => {
      capList(host);
      const total = host.children.length;
      const visible = Number(host.dataset.dsOptionsVisible || PAGE);
      const more = pager.querySelector('[data-action="more"]');
      const first = pager.querySelector('[data-action="first"]');
      if (more) more.hidden = visible >= total;
      if (first) first.hidden = visible <= PAGE;
      pager.hidden = total <= PAGE;
    };
    const scheduleRefresh = makeCoalescedListRefresh(refresh);
    new MutationObserver(scheduleRefresh).observe(host, { childList: true });
    pager.addEventListener("click", event => {
      const action = event.target?.closest?.("button")?.dataset?.action;
      if (!action) return;
      if (action === "more") host.dataset.dsOptionsVisible = String(Number(host.dataset.dsOptionsVisible || PAGE) + PAGE);
      else if (action === "first") host.dataset.dsOptionsVisible = String(PAGE);
      else if (action === "all") host.dataset.dsOptionsVisible = String(Math.max(PAGE, host.children.length));
      refresh();
    });
    for (const id of ["creatorBackupSearch", "creatorBackupType"]) {
      document.getElementById(id)?.addEventListener(id.endsWith("Search") ? "input" : "change", () => {
        host.dataset.dsOptionsVisible = String(PAGE);
        later(refresh);
      });
    }
    refresh();
  }

  function injectLessLikeOnBlock() {
    if (document.getElementById("quickLessLikeOnBlock")) return;
    const dislike = document.getElementById("quickDislikeOnBlock");
    const row = dislike?.closest?.("label.row");
    if (!row) return;
    const label = document.createElement("label");
    label.className = "row";
    label.innerHTML = '<input id="quickLessLikeOnBlock" type="checkbox"><span>Also use Less Like This after I block it (opt-in, desktop browser only)</span>';
    row.insertAdjacentElement("beforebegin", label);
    storageGet(["settings"]).then(data => {
      const input = document.getElementById("quickLessLikeOnBlock");
      if (input) input.checked = data.settings?.quickLessLikeOnBlock === true;
    });
    label.querySelector("input")?.addEventListener("change", event => {
      try { queueSettingsAutosaveValue("quickLessLikeOnBlock", !!event.target.checked, { delay: 0 }); } catch {}
    });
  }

  function patchSettingsReaders() {
    try { DEFAULT_SETTINGS.quickLessLikeOnBlock = false; } catch {}
    const readAll = readSettingsFromPage;
    readSettingsFromPage = function enhancedReadSettings() {
      return { ...readAll(), quickLessLikeOnBlock: !!document.getElementById("quickLessLikeOnBlock")?.checked };
    };
    const readOne = readSingleSettingFromPage;
    readSingleSettingFromPage = function enhancedReadOne(key) {
      if (String(key) === "quickLessLikeOnBlock") return !!document.getElementById("quickLessLikeOnBlock")?.checked;
      return readOne(key);
    };
  }

  function explainBlockedTags() {
    const blocked = document.getElementById("blockedTags");
    if (!blocked || document.querySelector(".ds-blocked-tags-help")) return;
    const hint = document.createElement("p");
    hint.className = "hint ds-blocked-tags-help";
    hint.innerHTML = '<strong>Blocked tags</strong> is the permanent QoL-side hide rule. <strong>Exclude tags</strong> is only the saved SpicyChat tag-filter template and applies when you use that filter.';
    blocked.closest("label")?.insertAdjacentElement("afterend", hint);
  }

  async function loadDiscoveries() {
    const data = await storageGet([DISCOVERY_KEY]);
    const raw = data[DISCOVERY_KEY];
    discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
  }

  function safeStateMeta(store, id) {
    try { return store?.meta?.[id] && typeof store.meta[id] === "object" ? store.meta[id] : null; }
    catch { return null; }
  }

  // These stores can be tens of MB on a large account. Do not call the full
  // normalizeBotArchive()/normalizeBotAvailability() helpers once per bot while
  // rendering Bot Status Center; doing that turns one render into O(n²) work.
  function currentBotNameSources() {
    const objectMap = value => value && typeof value === "object" ? value : {};
    return {
      archive: objectMap(botArchiveState?.meta),
      availability: objectMap(botAvailabilityState?.meta),
      opened: objectMap(openedChatMetaState),
      favorite: objectMap(favoriteBotState?.meta),
      later: objectMap(laterBotState?.meta),
      organizer: objectMap(botOrganizationState?.meta),
      blocked: objectMap(blockedState?.meta),
      notInterested: objectMap(notInterestedState?.meta),
      discovered: objectMap(discoveries?.meta)
    };
  }

  function bestKnownBotName(idValue, row = {}, sources = null) {
    const id = clean(idValue || row?.id).toLowerCase();
    if (!id) return "";
    const maps = sources || currentBotNameSources();
    const archive = maps.archive?.[id] || null;
    const availability = maps.availability?.[id] || null;

    const candidates = [
      row?.snapshot?.name,
      row?.baseline?.name,
      row?.name,
      availability?.snapshot?.name,
      availability?.baseline?.name,
      availability?.name,
      archive?.fields?.name,
      archive?.name,
      maps.opened?.[id]?.name,
      maps.favorite?.[id]?.name,
      maps.later?.[id]?.name,
      maps.organizer?.[id]?.name,
      maps.blocked?.[id]?.name,
      maps.notInterested?.[id]?.name,
      maps.discovered?.[id]?.name
    ];
    for (const candidate of candidates) {
      const name = cleanBotName(candidate, id);
      if (name) return name;
    }
    return "";
  }

  function isExactEmptyCharacterResult(raw) {
    if (!raw || typeof raw !== "object") return false;
    const status = String(raw.status || "").trim().toLowerCase();
    const evidence = String(raw.unavailableEvidenceType || raw.unavailableEvidence || "").trim().toLowerCase();
    const reason = clean(raw.reason || raw.message || raw.detail || raw.description || "").toLowerCase();
    const httpStatus = Number(raw.httpStatus || raw.statusCode || 0);
    if (raw.emptyObject === true || status === "api-empty" || evidence === "api-empty-200") return true;
    if (httpStatus !== 200) return false;
    return /empty(?:\s+character)?\s+object|character api[^.]{0,80}empty|empty[^.]{0,80}character/.test(reason);
  }

  function isTemporaryAvailability(raw) {
    const status = String(raw?.status || "").toLowerCase();
    const candidate = Number(raw?.unavailableEvidenceCount || 0) > 0 && status !== "unavailable";
    return status === "unknown" || status === "temporary" || status === "api-empty" || candidate;
  }

  function temporaryAvailabilityEntries() {
    const meta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
      ? botAvailabilityState.meta
      : {};
    const out = [];
    for (const [id, raw] of Object.entries(meta)) {
      if (isTemporaryAvailability(raw)) out.push([id, raw]);
    }
    return out;
  }

  function temporaryAvailabilityCount() {
    const meta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
      ? botAvailabilityState.meta
      : {};
    let count = 0;
    for (const raw of Object.values(meta)) if (isTemporaryAvailability(raw)) count++;
    return count;
  }

  function updateTemporaryRetryButton() {
    const button = document.getElementById("retryTemporaryBotAvailability");
    if (!button) return;
    const count = temporaryAvailabilityCount();
    button.disabled = !!botAvailabilityScanRunning || count === 0;
    button.textContent = count ? `Retry temporary / unknown (${count})` : "No temporary / unknown";
  }

  async function retryTemporaryAvailability() {
    if (botAvailabilityScanRunning) return;
    const ids = new Set(temporaryAvailabilityEntries().map(([id]) => String(id || "").toLowerCase()).filter(Boolean));
    if (!ids.size) { updateTemporaryRetryButton(); return; }

    const currentCollect = collectTrackedAvailabilityBots;
    collectTrackedAvailabilityBots = function temporaryOnlyAvailability(scopeValue = "all") {
      return currentCollect("all").filter(entry => ids.has(String(entry?.id || "").toLowerCase()));
    };
    temporaryRetryActive = true;
    try {
      await runBotAvailabilityScan({ mode: "all" });
      // runBotAvailabilityScan queues a deferred archive/recovery refresh after
      // its light result paint. Keep the temporary-only guard active long enough
      // for that queued finalizer to see the guard and skip the huge 80+ MB
      // Saved Bots rebuild that previously froze the Options document.
      await new Promise(resolve => setTimeout(resolve, 900));
    } finally {
      collectTrackedAvailabilityBots = currentCollect;
      temporaryRetryActive = false;
      // The scan already updated the in-memory state and status text. Paint only
      // Bot Status itself here; do not force archive/recovery/storage managers to
      // rebuild a second time.
      try { renderBotAvailability({ skipRecoveryRerender: true }); } catch {}
      try { await repairConfirmedUnavailableRecovery({ renderDeleted: true }); } catch {}
      updateTemporaryRetryButton();
    }
  }

  function injectTemporaryRetryButton() {
    if (document.getElementById("retryTemporaryBotAvailability")) { updateTemporaryRetryButton(); return; }
    const anchor = document.getElementById("scanStaleBotAvailability") || document.getElementById("scanUncheckedBotAvailability") || document.getElementById("scanBotAvailability");
    const row = anchor?.parentElement;
    if (!row) return;
    const button = document.createElement("button");
    button.id = "retryTemporaryBotAvailability";
    button.type = "button";
    button.textContent = "Retry temporary / unknown";
    button.addEventListener("click", () => retryTemporaryAvailability().catch(error => {
      console.warn("[SpicyChat QoL options] temporary Bot Status retry failed", error);
      updateTemporaryRetryButton();
    }));
    const stop = document.getElementById("stopBotAvailabilityScan");
    row.insertBefore(button, stop || null);
    updateTemporaryRetryButton();
  }


  let recoveryRepairTimer = 0;
  let recoveryRepairRunning = false;
  let recoveryRepairAgain = false;

  function archiveFieldsForBot(idValue) {
    const id = clean(idValue).toLowerCase();
    const record = botArchiveState?.meta?.[id];
    if (!record || typeof record !== "object") return {};
    return record.fields && typeof record.fields === "object" ? record.fields : record;
  }

  function bestKnownMetadataForBot(idValue, availabilityRow = {}) {
    const id = clean(idValue || availabilityRow?.id).toLowerCase();
    const archive = archiveFieldsForBot(id);
    const discovered = discoveries?.meta?.[id] && typeof discoveries.meta[id] === "object" ? discoveries.meta[id] : {};
    const opened = openedChatMetaState?.[id] && typeof openedChatMetaState[id] === "object" ? openedChatMetaState[id] : {};
    const cleanFirst = (...values) => {
      for (const value of values) {
        const text = clean(value);
        if (text) return text;
      }
      return "";
    };
    return {
      name: bestKnownBotName(id, availabilityRow, currentBotNameSources()),
      creator: cleanFirst(opened.creator, archive.creator, availabilityRow.creator, discovered.creator),
      image: cleanFirst(opened.image, archive.image, availabilityRow.image, discovered.image),
      description: cleanFirst(opened.description, archive.description, archive.title, availabilityRow.description, discovered.description),
      profileUrl: `https://spicychat.ai/chatbot/${id}`,
      chatUrl: cleanFirst(opened.chatUrl, availabilityRow.chatUrl) || `https://spicychat.ai/chat/${id}`
    };
  }

  function repairOpenedMetadataForBot(idValue, availabilityRow = {}) {
    const id = clean(idValue).toLowerCase();
    if (!id || !openedChatMetaState || typeof openedChatMetaState !== "object") return false;
    const current = openedChatMetaState[id];
    if (!current || typeof current !== "object") return false;

    const best = bestKnownMetadataForBot(id, availabilityRow);
    const next = { ...current };
    let changed = false;

    if (looksLikeGenericBotName(next.name, id) && best.name) {
      next.name = best.name;
      changed = true;
    }
    for (const field of ["creator", "image", "description"]) {
      if (!clean(next[field]) && clean(best[field])) {
        next[field] = best[field];
        changed = true;
      }
    }
    if (!clean(next.profileUrl) && best.profileUrl) {
      next.profileUrl = best.profileUrl;
      changed = true;
    }
    if (!clean(next.chatUrl) && best.chatUrl) {
      next.chatUrl = best.chatUrl;
      changed = true;
    }

    if (changed) openedChatMetaState[id] = next;
    return changed;
  }

  async function repairConfirmedUnavailableRecovery({ renderDeleted = true } = {}) {
    if (recoveryRepairRunning) {
      recoveryRepairAgain = true;
      return;
    }
    recoveryRepairRunning = true;
    try {
      const availabilityMeta = botAvailabilityState?.meta && typeof botAvailabilityState.meta === "object"
        ? botAvailabilityState.meta
        : {};
      botUnavailableRecoveryState = normalizeBotUnavailableRecovery(botUnavailableRecoveryState);

      let recoveryChanged = false;
      let openedChanged = false;
      const captureContext = typeof buildUnavailableRecoveryCaptureContext === "function"
        ? buildUnavailableRecoveryCaptureContext()
        : null;

      for (const [id, entry] of Object.entries(availabilityMeta)) {
        const status = String(entry?.status || "").toLowerCase();
        if (status !== "unavailable" && entry?.confirmedUnavailable !== true) continue;

        if (!botUnavailableRecoveryState?.meta?.[id] && typeof captureUnavailableRecoveryEntry === "function") {
          const captured = captureUnavailableRecoveryEntry(id, entry, captureContext);
          if (captured || botUnavailableRecoveryState?.meta?.[id]) recoveryChanged = true;
        }

        if (repairOpenedMetadataForBot(id, entry)) openedChanged = true;
      }

      if (recoveryChanged || openedChanged) {
        const payload = {};
        if (recoveryChanged) payload[BOT_UNAVAILABLE_RECOVERY_KEY] = botUnavailableRecoveryState;
        if (openedChanged) payload[OPENED_META_KEY] = openedChatMetaState;
        if (Object.keys(payload).length) {
          try { await storageSet(payload); }
          catch (error) { console.warn("[SpicyChat QoL options] could not persist recovery repair", error); }
        }
      }

      if (renderDeleted && !temporaryRetryActive && typeof renderDeletedSavedBots === "function") {
        try { renderDeletedSavedBots(); } catch {}
      }
    } finally {
      recoveryRepairRunning = false;
      if (recoveryRepairAgain) {
        recoveryRepairAgain = false;
        later(() => repairConfirmedUnavailableRecovery({ renderDeleted }).catch(() => {}), 120);
      }
    }
  }

  function scheduleConfirmedUnavailableRecovery({ renderDeleted = true, delay = 180 } = {}) {
    clearTimeout(recoveryRepairTimer);
    recoveryRepairTimer = setTimeout(() => {
      recoveryRepairTimer = 0;
      repairConfirmedUnavailableRecovery({ renderDeleted }).catch(error => {
        console.warn("[SpicyChat QoL options] unavailable recovery repair failed", error);
      });
    }, Math.max(0, delay));
  }

  function patchBotStatusCenter() {
    const scope = document.getElementById("botAvailabilityScope");
    if (scope && !scope.querySelector('option[value="discovered"]')) {
      const option = document.createElement("option");
      option.value = "discovered";
      option.textContent = "Browsed / discovered bots only";
      scope.appendChild(option);
    }

    const sourceLabel = availabilitySourceLabel;
    availabilitySourceLabel = source => source === "discovered" ? "Browsed / discovered" : sourceLabel(source);

    const collect = collectTrackedAvailabilityBots;
    collectTrackedAvailabilityBots = function enhancedCollectTracked(scopeValue = "all") {
      const rows = collect(scopeValue);
      const nameSources = currentBotNameSources();
      const byId = new Map((rows || []).map(row => [String(row.id || "").toLowerCase(), { ...row }]));
      if (scopeValue === "all" || scopeValue === "discovered") {
        for (const [rawId, raw] of Object.entries(discoveries.meta || {})) {
          const id = String(rawId || raw?.id || "").trim().toLowerCase();
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
          if (typeof botStatusIdIgnored === "function" && botStatusIdIgnored(id)) continue;
          const previous = byId.get(id) || { id, sources: [] };
          const merged = { ...raw, ...previous };
          const directName = cleanBotName(merged.name, id);
          byId.set(id, {
            ...merged,
            id,
            name: directName || bestKnownBotName(id, merged, nameSources) || "",
            creator: clean(previous.creator || raw?.creator || ""),
            image: previous.image || raw?.image || "",
            profileUrl: `https://spicychat.ai/chatbot/${id}`,
            sources: [...new Set([...(previous.sources || []), "discovered"])]
          });
        }
      }
      const result = [];
      for (const row of byId.values()) {
        const id = String(row.id || "").toLowerCase();
        const directName = cleanBotName(row.name, id);
        result.push({
          ...row,
          name: directName || bestKnownBotName(id, row, nameSources) || "",
          profileUrl: id ? `https://spicychat.ai/chatbot/${id}` : row.profileUrl
        });
      }
      return result;
    };

    // A transient/empty/error check may update availability evidence, but it
    // must never downgrade a name or other display metadata that was already
    // known from a good local copy. Exact HTTP-200 `{}` responses are normalized
    // into the existing candidate-evidence path here because this layer also has
    // the previous check available. One independent empty result stays temporary;
    // the next independent empty result can confirm unavailable without touching
    // the saved profile copy.
    const reconcile = reconcileBotUpdate;
    reconcileBotUpdate = function safeReconcileBotUpdate(previousValue, checkedValue) {
      let previousForReconcile = previousValue;
      let checkedForReconcile = checkedValue;

      if (isExactEmptyCharacterResult(previousValue) && Number(previousValue?.unavailableEvidenceCount || 0) < 1) {
        previousForReconcile = {
          ...(previousValue || {}),
          unavailableEvidenceType: "api-empty-200",
          unavailableEvidenceCount: 1,
          unavailableCandidateAt: Number(previousValue?.unavailableCandidateAt || previousValue?.checkedAt || 0) || Date.now()
        };
      }
      if (isExactEmptyCharacterResult(checkedValue)) {
        checkedForReconcile = {
          ...(checkedValue || {}),
          unavailableCandidate: true,
          unavailableEvidenceType: "api-empty-200",
          emptyObject: true
        };
      }

      const result = reconcile(previousForReconcile, checkedForReconcile);
      const id = String(result?.id || checkedValue?.id || previousValue?.id || "").toLowerCase();
      const status = String(checkedForReconcile?.status || result?.status || "").toLowerCase();
      if (status !== "available") {
        for (const field of ["image", "creator", "profileUrl", "chatUrl"]) {
          const previous = clean(previousValue?.[field]);
          const next = clean(result?.[field]);
          if (previous && !next) result[field] = previousValue[field];
        }
      }
      const merged = { ...(checkedValue || {}), ...(result || {}) };
      const directName = cleanBotName(result?.name, id);
      const previousName = cleanBotName(previousValue?.name, id);
      const goodName = directName || previousName || bestKnownBotName(id, merged, currentBotNameSources());
      if (goodName) result.name = goodName;
      else if (looksLikeGenericBotName(result?.name, id)) result.name = "";

      if (String(result?.status || "").toLowerCase() === "unavailable" || result?.confirmedUnavailable === true) {
        scheduleConfirmedUnavailableRecovery({ renderDeleted: !temporaryRetryActive, delay: temporaryRetryActive ? 700 : 180 });
      }
      return result;
    };

    // Temporary-only retries should not rebuild every Saved Bots/archive/recovery
    // manager at scan completion. Those stores are huge on real installs and the
    // helper/API work itself is cheap; the previous freeze happened in Options
    // finalization. Keep normal full-scan behavior unchanged.
    if (typeof renderSavedBotInfo === "function") {
      const original = renderSavedBotInfo;
      renderSavedBotInfo = function lightweightRenderSavedBotInfo(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }
    if (typeof renderDeletedSavedBots === "function") {
      const original = renderDeletedSavedBots;
      renderDeletedSavedBots = function lightweightRenderDeletedSavedBots(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }
    if (typeof refreshArchiveTransferUi === "function") {
      const original = refreshArchiveTransferUi;
      refreshArchiveTransferUi = function lightweightRefreshArchiveTransferUi(...args) {
        if (temporaryRetryActive) return Promise.resolve();
        return original(...args);
      };
    }
    if (typeof refreshStorageUsageIfVisible === "function") {
      const original = refreshStorageUsageIfVisible;
      refreshStorageUsageIfVisible = function lightweightRefreshStorageUsageIfVisible(...args) {
        if (temporaryRetryActive) return;
        return original(...args);
      };
    }

    const render = renderBotAvailability;
    renderBotAvailability = function enhancedRenderBotAvailability(...args) {
      if (temporaryRetryActive) {
        const supplied = args[0] && typeof args[0] === "object" ? args[0] : {};
        args[0] = { ...supplied, skipRecoveryRerender: true };
      }
      const result = render(...args);
      later(() => {
        injectTemporaryRetryButton();
        updateTemporaryRetryButton();
      });
      return result;
    };

    injectTemporaryRetryButton();
  }

  function syncGroups() {
    try {
      return SETTINGS_BACKUP_SCOPE_IDS.map(id => ({
        id,
        label: SETTINGS_BACKUP_GROUPS[id]?.label || id,
        keys: settingKeysForBackupScope(id)
      }));
    } catch {
      return [{ id: "all", label: "All settings", keys: Object.keys(DEFAULT_SETTINGS || {}) }];
    }
  }

  function injectSyncRules() {
    const linked = document.getElementById("accountSyncLinked");
    if (!linked || document.getElementById("accountSyncMode")) return;
    const host = document.createElement("div");
    host.className = "ds-sync-rules";
    host.innerHTML = `
      <label>Sync rules for this device
        <select id="accountSyncMode">
          <option value="two-way">Two-way sync (changes go both directions)</option>
          <option value="upload-only">This device is the source (upload only)</option>
          <option value="download-only">The cloud is the source (download only)</option>
          <option value="manual">Do not sync automatically (manual only)</option>
        </select>
      </label>
      <p class="hint">New accounts start source/upload-only. Newly linked devices start cloud/download-only so a fresh device cannot overwrite the cloud before you choose its rules.</p>
      <details class="account-sync-category-details"><summary>Choose what this device imports / uploads</summary><div class="account-sync-category-grid" id="accountSyncCategoryList"></div><div class="button-row"><button type="button" id="accountSyncSelectAll">Everything</button><button type="button" id="accountSyncSelectNone">Nothing</button></div></details>
      <div class="button-row ds-sync-transfer"><button type="button" id="accountSyncUpload">Upload Settings</button><button type="button" id="accountSyncDownload">Download Settings</button></div>`;
    const oldButtons = [...linked.querySelectorAll(".button-row")].find(row => row.querySelector("#accountSyncNow"));
    linked.insertBefore(host, oldButtons || linked.firstChild);

    const categoryHost = document.getElementById("accountSyncCategoryList");
    for (const group of syncGroups()) {
      const label = document.createElement("label");
      label.className = "row";
      label.innerHTML = `<input type="checkbox" data-sync-scope="${group.id}"><span>${group.label} (${group.keys.length})</span>`;
      categoryHost.appendChild(label);
    }

    const selectedPrefs = () => {
      const scopes = [...categoryHost.querySelectorAll("input[data-sync-scope]:checked")].map(input => input.dataset.syncScope);
      const groups = new Map(syncGroups().map(group => [group.id, group.keys]));
      return {
        mode: document.getElementById("accountSyncMode")?.value || "two-way",
        scopes,
        allowedKeys: [...new Set(scopes.flatMap(id => groups.get(id) || []))]
      };
    };
    const message = (type, extra = {}, timeout = 120000) => runtimeMessageWithTimeout({ type, ...extra }, timeout);
    const render = async () => {
      const response = await message("DS_QOL_SYNC_STATUS", {}, 15000);
      if (!response?.ok) return;
      const prefs = response.prefs || {};
      const mode = document.getElementById("accountSyncMode");
      if (mode) mode.value = prefs.mode || "two-way";
      const allowed = Array.isArray(prefs.allowedKeys) ? new Set(prefs.allowedKeys) : null;
      for (const input of categoryHost.querySelectorAll("input[data-sync-scope]")) {
        const group = syncGroups().find(item => item.id === input.dataset.syncScope);
        input.checked = allowed == null || !!group?.keys?.some(key => allowed.has(key));
      }
    };
    const save = async () => { await message("DS_QOL_SYNC_SET_DEVICE_PREFS", { prefs: selectedPrefs() }, 30000); await render(); };
    document.getElementById("accountSyncMode")?.addEventListener("change", () => save().catch(() => {}));
    categoryHost.addEventListener("change", () => save().catch(() => {}));
    document.getElementById("accountSyncSelectAll")?.addEventListener("click", () => { categoryHost.querySelectorAll("input").forEach(input => { input.checked = true; }); save().catch(() => {}); });
    document.getElementById("accountSyncSelectNone")?.addEventListener("click", () => { categoryHost.querySelectorAll("input").forEach(input => { input.checked = false; }); save().catch(() => {}); });
    document.getElementById("accountSyncUpload")?.addEventListener("click", async () => {
      const status = document.getElementById("accountSyncActionStatus");
      if (status) status.textContent = "Uploading selected settings…";
      const result = await message("DS_QOL_SYNC_UPLOAD");
      if (status) status.textContent = result?.ok ? "Upload complete." : (result?.message || "Upload failed.");
    });
    document.getElementById("accountSyncDownload")?.addEventListener("click", async () => {
      const status = document.getElementById("accountSyncActionStatus");
      if (status) status.textContent = "Downloading selected settings…";
      const result = await message("DS_QOL_SYNC_DOWNLOAD");
      if (status) status.textContent = result?.ok ? "Download complete." : (result?.message || "Download failed.");
    });
    render().catch(() => {});
  }

  // Analyze used raw runtimeMessage() and could wait forever on a dead tab.
  function installDiagnosticWatchdog() {
    const original = runtimeMessage;
    runtimeMessage = function diagnosticRuntimeMessage(message) {
      const type = String(message?.type || "");
      if (!type.startsWith("DS_TAB_DIAGNOSTIC_")) return original(message);
      const timeout = type === "DS_TAB_DIAGNOSTIC_COLLECT" ? 20000 : 45000;
      let timer = 0;
      return Promise.race([
        original(message),
        new Promise(resolve => { timer = setTimeout(() => resolve({ ok: false, status: "watchdog-timeout", error: `No response after ${Math.round(timeout / 1000)}s` }), timeout); })
      ]).finally(() => clearTimeout(timer));
    };
  }

  function boot(attempt = 0) {
    if (typeof readSettingsFromPage !== "function" || typeof collectTrackedAvailabilityBots !== "function" || typeof runtimeMessageWithTimeout !== "function") {
      if (attempt < 120) later(() => boot(attempt + 1), 50);
      return;
    }
    addStyles();
    installListPaging();
    installBackupPaging();
    injectLessLikeOnBlock();
    patchSettingsReaders();
    explainBlockedTags();
    installDiagnosticWatchdog();
    loadDiscoveries().then(() => {
      patchBotStatusCenter();
      scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 250 });
    }).catch(() => {
      patchBotStatusCenter();
      scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 250 });
    });
    injectSyncRules();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[DISCOVERY_KEY]) {
          const raw = changes[DISCOVERY_KEY].newValue;
          discoveries = raw && typeof raw === "object" ? (raw.meta ? raw : { meta: raw }) : { meta: {} };
          scheduleConfirmedUnavailableRecovery({ renderDeleted: true, delay: 300 });
        }
      });
    } catch {}
  }

  later(() => boot());
})();
/* END SPICYCHAT QOL OPTIONS ENHANCEMENTS */

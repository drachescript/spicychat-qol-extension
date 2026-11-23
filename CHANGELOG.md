## 0.2.96
- Improved lightweight diagnostic listener registration recovery when a browser bridge appears after core startup.
- Distinguished initializing, paused, and incomplete runtime states from failed lightweight/full diagnostic transport.
- Added on-demand, current-route Long Task summaries for Home, Favorites, and Recommendations using the existing observer.
- Reduced repeated card-menu DOM searches on mobile and large bot listings.
- Stopped recreating unchanged recommendation preference badges on every update.
- Reduced temporary allocations in Favorites list change detection.
- Show the optional Report Link Collector button only on Home and Recommendations.
- Made page updates lighter by reducing temporary allocations in DOM change handling.
- Reduced slowdown when many bots share a display name in Bot Status.
- Fixed Bot Status checks getting stuck when their original saved list changes.
- Added individual held-check reasons and safe manual rechecks in Bot Status Center.
- Fixed the stale / held scan button remaining disabled when retryable checks exist.
- Archive presets can now be browsed and chosen before turning on filtering.
- Made Archive Blocking Presets easier to choose, search, and customize by franchise, character, group, or theme.
- Improved persona picker responsiveness by skipping unchanged option refreshes.
- Reduced repeated card scans when adding Later buttons to large bot listings.
- Reduced duplicate Bot Status helper checks during scans without changing result handling or rate limits.
- Improved diagnostics for discarded, loading, and unresponsive browser tabs.
- Improved Archive preset loading compatibility across supported browsers and Android WebView.
- Reduced leftover Later-button references after long browsing sessions.

## 0.2.95
- Fixed Android QoL sometimes loading the website without starting its features.
- Fixed some bot cards appearing out of order after listings refreshed.
- Made bot listings faster by updating changed cards without rescanning every bot.
- Prevented old card filters from continuing after switching pages.
- Made Saved Bots Hub paging, search and selection faster on large collections.
- Reduced unnecessary work when finding bot cards and browsing saved lists.

## 0.2.94
- Made Saved Bots Hub search and sorting faster on large lists.
- Reduced delays when opening, filtering, and selecting saved bots.
- Made Blocked and Opened history cleanup faster with large collections.
- Reduced repeated archive and chat-link lookups during Bot Status scans.
- Improved startup error detection when QoL does not finish loading.

## 0.2.93
- Improved GitHub Backup reliability when uploaded files take time to appear.
- Improved error messages when Android needs a Cloud sync compatibility update.
- Made Saved Bots Hub smoother on large collections.
- Reduced page loading by starting more optional tools only when needed.
- Made nine more Settings panels load when opened.
- Fixed Save now changing settings in panels that had not been opened.
- Fixed Settings Health Check reporting unopened controls as missing.
- Improved Settings search and Saved Recovery cleanup.

## 0.2.92
- Added an optional Report Link Collector for saving bot links from card pictures.
- Added Copy all and Clear list in the extension popup.
- Made bot listings and Saved Bots Hub more responsive.
- Reduced startup work by loading optional tools only when needed.
- Made many Settings sections, backups, and Archive tools load on demand.
- Improved Settings search, pinned sections, and saved-value loading.
- Improved Orion Browser and iOS extension compatibility.
- Fixed optional tools getting stuck after a failed load or page change.

## 0.2.91
- Made full bot descriptions appear faster on cards.
- Prevented bots with unfinished or unverified scans from being sent to the Archive.
- Improved Archive upload recovery after a partially completed upload.
- Fixed Text Normalization unexpectedly changing chat replies.
- Improved RP Format Repair and text replacement responsiveness.
- Made Bot Status scans easier to resume after interruptions.
- Improved Research Export reliability and backup reuse.
- Added clearer generation model information when SpicyChat reports it.
- Improved S.AI Toolkit compatibility and chat appearance colors.
- Improved Less Like and More Like helper reliability.
- Reduced unnecessary Settings and saved-bot refresh work.

## 0.2.90
- Fixed Bot Organizer controls showing on Story Mode pages.
- Improved persona limit detection for different subscriptions.
- Fixed Lorebook backups missing some entry counts.
- Improved Research Export resume, backup reuse, and missing Rulebook data.
- Made large Research Export uploads more responsive.
- Reduced Settings startup work by loading more tools only when needed.
- Improved the Features catalogue, bot listings, and long-chat performance.

## 0.2.89
- Improved RP Format Repair for long greetings and mixed dialogue.
- Fixed Rulebook links opening incorrectly in new tabs.
- Improved GitHub Backup setup, verification, and error messages.
- Improved Research Export progress, resume, and GitHub checkpoints.
- Made unchanged chat backups reuse verified copies.
- Improved ZIP export options and recovery.
- Fixed animated chat avatars restarting unexpectedly.
- Reduced unnecessary card scans, Settings work, and idle activity.
- Improved Memory Manager and creator-tool responsiveness.

## 0.2.88
- Added GitHub Backup with account sign-in, encryption, and recovery options.
- Added safer backup snapshots and selective restore across devices.
- Added manual backup and sync actions, with automatic checks every 12 hours.
- Expanded Research Export to save verified chat histories, Memories, Rulebooks, and bot details.
- Added helpful tag explanations in searches and character creation.
- Fixed Later navigation and filters not saving correctly.
- Improved Memory import, RP Format Repair, and chat performance.
- Improved Inspector diagnostics and duplicate-event handling.

## 0.2.87
- Improved Later buttons and performance on large bot listings.
- Added Archive Blocking Presets with exceptions for characters and themes.
- Added faster Research Export scans and improved resume options.
- Expanded research backups with Rulebooks, Story Moments, and OOC information.
- Improved Lorebook backups with better handling of long lists and incomplete results.
- Fixed Android Lorebook backup and JSON import issues.
- Fixed mobile chat headers, reply controls, and Memory imports.
- Improved Inspector timing reports and native banner dismissal.

## 0.2.86
- Improved Research Export speed, progress, and recovery from incomplete downloads.
- Fixed missing character metadata in saved backups.
- Added a Character Token Optimizer with reviewable suggestions.
- Made more optional creator, chat, and Lorebook tools load only when needed.
- Made Diagnostics and Support load only when opened.
- Added Archive Community Themes and customizable block exceptions.

## 0.2.85
- Improved startup speed by loading more features when needed.
- Added clearer guides for Memory, Lorebooks, Rulebooks, and creator tools.
- Added adjustable native Memory checks and a Check now button.
- Improved backup, import, and Cloud sync safety information.
- Added Implied Blocked Themes for untagged relationship and cheating themes.
- Expanded Research Export with character and Lorebook details.
- Fixed Tab Cleanup Settings failing to open.
- Improved Bot Status, Favorites, and Dislike helper performance.

## 0.2.84
- Kept SpicyChat's native chat header visible while typing by default, with an independent option to restore native hiding.
- Added an option to hide SpicyChat's new * / quote formatting shortcut beside Send, without hiding Send or the + menu.
- Added more selective, balanced Context Keeper continuity capture
- Added matching chat background opacity for user messages while keeping their original bubble color.
- Added cloud sync storage estimates and clearer Blocked/Later sync status, including local and cloud list counts.

## 0.2.83
- Added a one-line roleplay quality OOC command as the default preset.
- Added Bulk Chat & Memory Research Export, including native Memories, multiple conversations per bot, resumable ZIP downloads, and a compact export window. Exports start at 50 bots, with no maximum.
- Added Persona highlight text to Persona Organizer search.
- Improved the Memory Manager layout report for SpicyChat's newer Memory window.
- Improved chat background loading to reduce stuttering when opening conversations.
- Added a Delete button beside message actions, with confirmation before deleting.
- Fixed Copy and Edit buttons opening the wrong menu or not responding, and restored original Markdown when copying messages.
- Fixed Select bots on Android Home, Recommendations, and Favorites, and removed the duplicate mobile filters button.

## 0.2.82
- Fixed Favorites cards being pushed off-screen on some Android devices, while keeping the filters accessible.
- Improved performance when blocking bots or browsing large lists of chatbot cards.
- Improved support reports for tabs that don't respond after an update.
- Fixed First/Last reply buttons appearing beside message editing controls.
- Fixed mobile message editing, including misplaced text and the typing cursor.
- Fixed the chat input cutting off text or covering the last word with a shortcut.
- Fixed custom chat backgrounds disappearing with certain SpicyChat themes.
- Restored access to the three-dot menu while editing a message.

## 0.2.81
- Fixed RP Format Repair buttons appearing in the wrong place.
- Fixed message bookmark stars missing from newer chat layouts.
- Fixed Copy/Edit controls disappearing after SpicyChat updates a message.
- Prevented RP Format Repair from hiding messages it couldn't safely format.

## 0.2.80
- Fixed Quick Edit failing to open and restored the normal message menu when it can't.
- Fixed RP Format Repair losing changes or hiding messages.
- Fixed Select bots on Home, Recommendations, and Favorites.
- Improved performance while browsing bots and using Favorites recovery.
- Improved Memory Manager selection and responsiveness.
- Added clearer cloud sync results showing which saved lists changed.
- Fixed duplicate Copy/Edit buttons appearing on messages.
- Fixed message formatting colors when using Dark Reader.
- Fixed a Settings startup issue that could prevent some tools from loading.
- Added visible Rulebook updates to chat exports.

## 0.2.79
- Fixed Settings search on Android not scrolling to the selected option.
- Improved Android Settings responsiveness.
- Added automatic cloud sync checks every 6, 12, or 24 hours.

## 0.2.78
- Fixed message Copy removing original Markdown formatting.
- Updated Memory Pack imports for SpicyChat's newer Memory Manager.
- Made Android support reports clearer when information can't be checked.
- Improved detection of missing files that could prevent QoL from starting.
- Updated Memory Manager tools to recognize SpicyChat's newer layout and avoid making changes when the layout isn't supported.
- Updated Copy, Edit, and Report buttons for SpicyChat's newer message menu.

## 0.2.77
- Updated Memory Manager selection, copy, pinning, imports, exports, and deletion for SpicyChat's new layout.
- Updated Memory Manager help for the new memory system.
- Fixed account sync feedback on Firefox for Android.
- Split decorative-symbol removal and emoji removal into separate choices.
- Fixed Context Keeper buttons overlapping messages.
- Fixed memory imports in the new inline editor.
- Fixed Copy/Edit shortcuts moving into the chat header instead of staying on their messages.
- Added a bookmark report to help find missing saved bookmarks.

## 0.2.76
- Improved performance while browsing cards and long chats.
- Improved promo-banner hiding on Home, Chats, Rulebooks, and Lorebooks.
- Added Open in Archive buttons to chatbot cards and profiles.
- Improved Settings and background performance.
- Fixed some Android chat typing and cursor-position problems.

## 0.2.75
- Fixed saved support history and clearing history in the Android app.
- Improved Android support downloads and saved report history.

## 0.2.74
- Improved performance while browsing bots and Rulebooks.
- Fixed bot names with possessive endings being missed by blocked-word rules.
- Fixed Select bots highlighting pieces of a card instead of selecting the bot.
- Improved Bot Status scan information.

## 0.2.73
- Improved chat performance on Android without hiding messages.
- Made Blocked and Later lists easier to sync between phone and PC.
- Added clearer checks for bots that are unavailable or haven't been checked yet.
- Added an overview and recovery review for saved message bookmarks.
- Improved model shortcuts and their sorting.
- Added a guided backup for moving your own bots and Lorebooks to another account.
- Fixed chat bubble styles changing when timestamps or generation details appear.
- Added extra protection against chats appearing blank.

## 0.2.72
- Extended the language filter to public Lorebooks and Rulebooks.
- Improved support reports for blank chats and Android performance problems.
- Improved performance when loading messages and using Settings.
- Fixed Persona description buttons repeatedly refreshing.
- Fixed message bookmarks being saved under the wrong conversation.
- Made Context Keeper confirmations clearer.
- Added two-column chat lists and quick Rename/Open Window buttons.
- Added shortcuts for bot profiles, generation settings, and jumping to the start of chats.
- Added a three-dot shortcut beside the bottom message controls.
- Added New badges for recently created bots.
- Improved compatibility with S.AI Toolkit.

## 0.2.71
- Improved performance in Rulebooks, long chats, Settings, and saved-bot lists.
- Improved support reports when SpicyChat tabs don't respond.
- Fixed long delays during Bulk Dislike runs.
- Improved Bulk Dislike progress information.
- Made Settings search easier to use, with individual feature results and clearer descriptions.

## 0.2.70
- Improved Android support downloads and reduced stalls when collecting reports.
- Fixed expanded chatbot descriptions staying inside unnecessary scroll boxes.
- Added local Rulebook blocking and Block buttons in the chat's Attach Rulebook search.
- Added image links to chat exports when available.
- Fixed missing generation details in newer chat layouts.

## 0.2.69
- Added pinned conversations to the top of Chats, including older conversations.
- Made Settings descriptions shorter and clarified the difference between bot folders and chat folders.
- Added local Rulebook blocking by words, creators, and Rulebook IDs.

## 0.2.68
- Added free, on-device greeting translation, with a Google Translate fallback.
- Improved automatic detection of the Persona limit, with a manual choice when needed.
- Added a way to review and remove pending Bot Status checks outside the current scan.

## 0.2.67
- Added a Persona counter and account-limit indicator.
- Added Open avatar links to Bot Status cards.
- Fixed unavailable bots being counted as failed Dislikes.
- Improved Memory Manager counts and exports on newer layouts.
- Added private word and name filters for recommendations.
- Added Memory Pack import/export, labels, categories, and splitting longer text.
- Improved Lorebook moderation warnings.
- Improved Dislike detection, confirmations, and Bulk Dislike error handling.

## 0.2.66
- Added More Like This to chatbot cards.
- Improved performance reports for Favorites, chats, and creator backups.
- Fixed Lorebook imports stopping too early or duplicating existing entries.
- Fixed Later appearing in the sidebar when it shouldn't.
- Added a message-limit notice and estimated reset countdown.

## 0.2.65
- Added a full Later page with search, folders, sorting, filters, and pagination.
- Improved Later cards with saved tags, pictures, and longer descriptions.
- Added Full Favorites recovery for bots missing from SpicyChat's normal Favorites page.
- Added a Recovered Favorites view with search, sorting, filtering, and cleanup tools.
- Improved recovery for missing bot names, descriptions, and tags.
- Fixed switching between Favorites, Later, and Recovered views.
- Improved Favorites saving, added safety backups, and protected saved lists against failed requests.
- Added Favorites cleanup suggestions and safer bulk removal from Favorites.
- Added sorting by when a favorite was first noticed by QoL.
- Improved Scan Favorites so it checks across pages and reports missing results.
- Added mobile sync choices for Blocked and Later bots.
- Fixed unfinished Bot Status scans and improved large Lorebook backups.

## 0.2.64
- Expanded Chat Continuation with Memory Manager exports and Lorebook drafts.
- Added a chat word censor with custom replacements, reveal controls, and chat-specific choices.
- Added a choice to export chat text with censored words.
- Added Skip, Merge, and Replace choices for Lorebook imports, with safety backups.
- Fixed duplicate entries when importing large Lorebooks.
- Fixed Memory Manager tools not appearing when first opened.
- Added Default and Compact Memory Manager views.

## 0.2.63
- Added a Public Personality filter for chatbot discovery.
- Added tools to move Favorites to Later, with bulk selection and recovery options.
- Added a Chat Continuation assistant that prepares story notes and memory exports.
- Added expiration limits for Context Keeper details.
- Fixed Scan Favorites stopping before checking all pages.
- Improved Favorites cleanup, including confirmation and recovery of unfinished changes.
- Fixed sidebar link controls after a SpicyChat update.
- Improved large Lorebook backups and imports.

## 0.2.62
- Improved experimental chat-history navigation and reading.
- Added phone sync shortcuts for Blocked bots.
- Improved Android support reports and bookmark diagnostics.
- Expanded message bookmarks with a manager, search, jumping to older messages, and saved history navigation.
- Improved performance reports for background tabs and slow features.
- Improved Bulk Dislike reliability and progress tracking.
- Made Context Keeper save confirmations clearer.

## 0.2.61
- Reduced performance-monitoring overhead and unnecessary work in chats and listings.
- Improved responsiveness while typing, scrolling, editing, and receiving replies.
- Improved Android support reports and chat-list loading.
- Fixed Dislike using the wrong feedback action.
- Improved reliability of Bulk Less Like when a rating fails or can't be confirmed.

## 0.2.60
- Expanded Lorebook imports to include full private copies with names, descriptions, tags, covers, and entries.
- Improved Lorebook backups and downloads, including cover pictures and large entries.
- Added replacement-cover choices for imported Lorebooks.
- Fixed newly imported Lorebooks stopping partway through their entries.
- Added safer backup and recovery checks for private Lorebooks and chat records.

## 0.2.59
- Improved chat performance on Android while scrolling, typing, or receiving replies.
- Reduced unnecessary background work and listing checks.
- Fixed a startup issue involving Context Keeper and Memory Manager.
- Improved support report downloads and history.

## 0.2.58
- Improved support history downloads, storage, and cleanup.
- Made Settings descriptions and the feature guide easier to understand.
- Improved experimental Memory Manager checks and error messages.
- Added a context-usage meter with clearer limit estimates.
- Fixed Listing Refill missing selected search tags.
- Improved Context Keeper speed, saved facts, and handling of conflicting information.
- Prevented Context Keeper changes in one tab from overwriting another conversation.
- Improved Lorebook keyword testing and private Archive safety checks.
- Fixed rapid bot blocking sometimes losing saved blocks.
- Fixed simultaneous Lorebook edits overwriting each other.
- Added safer review and restoration of older local Lorebook entries.
- Reduced unnecessary work while typing and editing long chats.

## 0.2.57
- Improved chat performance and reduced unnecessary updates on mobile.
- Added recent-message keyword matching and adjustable OOC context limits.
- Added desktop chat width controls for messages, bubbles, and the typing area.
- Added Smart Chat Folders with previews and refresh choices.
- Added Memory Manager checks for possible conflicts and unclear memories.
- Expanded Context Keeper with conversation history, local Lorebook drafts, and reviewable story facts.
- Added a private Archive for storing and recovering approved conversation details.
- Added tools to review Archive changes and transfer approved details into private Lorebooks.
- Improved message controls and feedback tracking in long chats.

## 0.2.56
- Improved First/Last reply buttons and jumping to a specific generated reply.
- Fixed older generated replies being missed during navigation.
- Fixed unfinished Dislike and Less Like runs being marked complete.
- Fixed blocked bots reappearing or Block buttons staying on the wrong card.
- Improved Bot Status scan recovery, saved results, and pending checks.
- Added more ways to review, filter, and clean up saved tabs.
- Improved large bot lists, My Creations, and Lorebook backup reliability.
- Fixed creator backups using outdated information or missing tags.
- Improved chat performance while sending and generating replies.
- Added clearer support information and performance diagnostics.

## 0.2.55
- Improved Lorebook backups and protected complete copies from being replaced by incomplete ones.
- Improved saved bot cards with pictures, names, and descriptions.
- Fixed chatbot backups missing selected tags.
- Reduced Custom Lite installation size and improved feature selection.
- Improved Settings loading and support reports.
- Improved recovery reports for chats that briefly disappear.

## 0.2.54
- Added a Performance Troubleshooter to help find features slowing down a page.
- Improved Context Keeper suggestions, story continuity, and conflicting-fact reviews.
- Improved support reports for blank chats and Android downloads.
- Reduced unnecessary work in chats and Settings.
- Fixed OOC chat controls and moved the compact chat button to a clearer QoL label.

## 0.2.53
- Maximum Performance now manages related performance settings together.
- Fixed Dislike and Less Like being confused with each other.
- Improved Bulk Dislike progress and reliability.
- Reduced slowdowns from multiple open SpicyChat tabs.
- Improved Custom Lite builds and feature selection.
- Added local Lorebook drafts from chat messages and Memories.
- Added Model Quick Access shortcuts and Previously Chatted labels on bot cards.

## 0.2.52
- Fixed several Firefox, Settings, and creator-tool compatibility problems.
- Improved Chats search so imported conversations can be found without loading every card.
- Improved Chat Index with message search and manual refresh.
- Added more Lorebook keyword checks and import/export protections.
- Added backup choices for Settings, saved lists, creator content, and pictures.
- Fixed backup and restore problems for custom pictures and backgrounds.
- Added device-specific sync choices and clearer upload/download controls.
- Improved Bot Status scans and saved results.
- Fixed blocked-word and blocked-tag filters affecting the wrong bots.
- Improved chat navigation and Context Keeper accuracy.
- Added per-chat Scene Notes and a reviewable Apply & Save action for your own bots.
- Improved Custom Lite builds and independent feature controls.

## 0.2.51
- Added Enter-to-search and better results in chat History search.
- Added a Custom Pictures section with separate chat character and Persona pictures.
- Added a Picture Library for saving and reusing images.
- Added more Mini Panel shortcuts for chat and creator tools.
- Expanded Context Keeper as a separate local memory system with review, import, and export tools.
- Added automatic conversation-image controls and more background choices.
- Added manual message search and indexing to Chat Index.
- Added a Lorebook keyword preview for testing which entries would match chat text.

## 0.2.50
- Improved Bot Status counters and checks for unknown or unavailable bots.
- Improved Bulk Dislike and Less Like results and recovery.
- Improved Lorebook backup and export reliability.
- Added bot import to the Create and Edit pages, including Character Cards and ZIP backups.
- Added safety checkpoints when importing into an existing bot.

## 0.2.49
- Added a Rulebook troubleshooting log and improved mobile Rulebook layouts.
- Added a creator filter and more bot links in public Lorebook discovery.
- Added a Story Mode reading layout.
- Added background picture renaming, placement choices, and image links.
- Added an Active options page to quickly find and change enabled features.
- Improved the Rulebook and creator tools on smaller screens.

## 0.2.48
- Improved Settings search so it shows features instead of repeated individual settings.
- Fixed blocked bots reappearing when SpicyChat refreshes their cards.
- Improved performance when scrolling through long bot listings.
- Improved chatbot discovery history and Bot Status checks.
- Improved custom chat backgrounds, including clearing and restoring individual backgrounds.

## 0.2.47
- Fixed mobile Home and Search results being pushed off-screen by the filter panel.
- Made Bot Organizer easier to use on mobile.
- Removed the duplicate Has Lorebook filter when SpicyChat already provides one.
- Added Rulebook information to chat exports.
- Added a Rulebook filter to My Creations.

## 0.2.46
- Improved recognition of new Rulebook and Lorebook features.
- Fixed mobile sync settings sometimes reverting after changes.
- Added Account & Sync settings to QoL backup and restore.
- Improved safety when cleaning up confirmed unavailable bots.
- Added manual cleanup for old blocked-bot records, with a preview before removal.
- Improved long Bot Status scans so they can resume after an interruption.
- Improved full chat-list imports so they can continue where they stopped.

## 0.2.45
- Fixed blocked words sometimes missing bot names or incorrectly hiding matching cards.
- Fixed Settings reopening in the wrong section or failing to navigate on mobile.
- Improved language detection for short Portuguese and stylized bot descriptions.
- Improved Bot Status progress, error handling, and saved scan results.
- Improved Bulk Dislike and Less Like error messages.
- Added Chat Index for searching and reviewing known conversations.
- Added favorite stars for individual conversations.
- Added more choices for bot blocking and device-specific cloud sync.

## 0.2.44
- Fixed automatic Chrome and Firefox builds missing some release files.
- Fixed the Mini Panel returning after it was turned off.
- Fixed Settings not opening when an update was missing files.
- Improved Persona picker performance.

## 0.2.43
- Fixed release packages missing required extension files.
- Improved saving bot folders and folder pictures.
- Improved the mobile Settings menu and small-screen page numbers.
- Added better reading settings for QoL Settings, including font size, spacing, and contrast.
- Added clickable bot folders with custom covers in Favorites and My Chatbots.
- Added Memory Vault to save, review, and restore memories removed from active chats.
- Fixed My Personas moving to the wrong place in the sidebar.

## 0.2.42
- Added more translation services and per-chat translation choices.
- Added background galleries and separate picture settings for each chat.
- Added muted words and text replacement presets for chat messages.
- Added Enable/Disable buttons for Lorebook entries.
- Improved compact chat controls and recovery when OOC disappears.
- Fixed mobile editing controls and the message box layout.
- Improved performance for inactive tabs and busy chats.

## 0.2.41
- Improved Bot Status counts and checks for bots outside regular scans.
- Made longer Bot Status scans save progress so they can resume.
- Added bot-avatar chat backgrounds, animated pictures, and bubble opacity controls.
- Added folders and sorting choices to Favorites.
- Added Has, None, and Unknown Lorebook filters for bot discovery.

## 0.2.40
- Added adjustable Bot Status scan limits, speeds, and progress estimates.
- Improved Bot Status counts and cleanup of unavailable bot records.
- Added safer backup checks before removing saved data.
- Added storage information and cleanup tools for duplicate backups.
- Added the missing Ask Piper help shortcut.

## 0.2.39
- Improved Edit Chatbot links so normal right-click and open-in-new-tab actions work.
- Fixed repeated Lorebook errors and improved saved-data storage.
- Fixed a chat-formatting problem that could cause lag.
- Restored chat Copy/Export shortcuts in the Mini Panel.
- Added smaller backups and more choices for saving My Chatbots, Lorebooks, and Personas.
- Added personal tag rules, improved Settings organization, and Edit buttons for My Chatbots.
- Fixed message controls disappearing after chat updates.

## 0.2.38
- Kept private bot and Lorebook editors out of automatic content scans.
- Added Edit and favorite-creator buttons to My Chatbot cards.

## 0.2.37
- Added early Rulebook support for accounts with access to the feature.
- Fixed Lorebook tag and keyword fields not expanding.
- Improved Lorebook bulk backups.
- Fixed chat colors changing around quoted dialogue.
- Fixed the keyword Clear button moving out of place.

## 0.2.36
- Added bulk backups for My Chatbots and Lorebooks.
- Added Edit shortcuts for your own Lorebooks.
- Added a first-time setup choice for chat, creator, or both feature groups.
- Improved bot and Lorebook backup completeness.
- Added creation dates and moved backup controls to a more convenient place.

## 0.2.35
- Added automatic blocking for bots with matching words in their names or descriptions.
- Fixed QoL controls sometimes stopping after an extension update.
- Improved OOC button recovery without automatically reloading the page.
- Improved support reports when saved-data counts aren't available.

## 0.2.34
- Fixed Context Keeper buttons disappearing from messages.
- Improved support reports and reading of decorative text.
- Added safer cleanup for unavailable blocked bots while preserving their block status.
- Added easier private Lorebook downloads and imports.

## 0.2.33
- Fixed Context Keeper controls disappearing after message updates.
- Restored separate Auto-AFK timers for each tab.
- Improved recovery after extension updates.
- Fixed some JSON and text backups not downloading.
- Fixed OOC controls getting stuck when SpicyChat temporarily disables them.

## 0.2.32
- Improved support and performance reports for long sessions.
- Fixed rare cases where the chat message box collapsed into a thin line.
- Improved long-chat performance and message loading.
- Improved the controls for showing older messages.
- Fixed the OOC button disappearing when the Image button is hidden.
- Improved Settings speed with large saved collections.

## 0.2.31
- Fixed slow or failed loading in Saved Bot Copies and Recovery.
- Fixed missing bot pictures and improved animated image handling.
- Improved Lorebook history, recovery, and backups.
- Added local Archive exports for public Lorebooks.
- Added blocking for public Lorebooks by words, tags, creators, and IDs.
- Fixed empty spaces on filtered Lorebook pages.

## 0.2.30
- Fixed a startup problem that could stop QoL loading in Chrome.
- Improved Bot Status history, duplicate checks, and recovery of unavailable bots.
- Added a way to restore eligible saved-list entries when a bot becomes available again.
- Improved Less Like and Dislike controls and reduced duplicate ratings.
- Improved chat performance and protection for very long conversations.
- Improved performance when many SpicyChat tabs are open.

## 0.2.29
- Fixed Less Like and improved bulk feedback reliability.
- Reduced slowdowns on creator profiles and editors.
- Made animated bot pictures play only when appropriate.
- Added a choice to hide SpicyChat feature popups.
- Added Enter-key behavior choices for chat messages.
- Improved Settings performance, saved data, and background tab handling.
- Improved Bot Status cards for bots sharing the same name.

## 0.2.28
- Fixed listing page numbers disappearing after updates.
- Improved animated bot pictures and Random Chat.
- Added merging for saved tab sessions, with confirmation.
- Fixed Less Like progress getting stuck.
- Improved Settings shortcuts and memory use.
- Added PC Protection for keeping too many inactive SpicyChat tabs from using memory.
- Added shorter Auto-AFK choices and better long-chat protection.
- Fixed missing message quick-action buttons.

## 0.2.27 hotfix
- Fixed Settings sometimes failing to open.
- Fixed Copy/Edit and other message actions disappearing.
- Fixed OOC and chat shortcuts overlapping.
- Improved support reports and long-chat performance.

## 0.2.27
- Stopped QoL from automatically refreshing the page during severe chat lag.
- Improved performance when opening chats and switching conversations.
- Kept important background checks working when inactive tabs are paused.
- Improved long Bot Status scan reliability.

## 0.2.26
- Improved names and history for saved bots.
- Added Less Like This after blocking a bot.
- Improved performance in very large chats and Settings lists.
- Added more Account Sync choices and safer first-time device linking.

## 0.2.25
- Improved Android support and clearer device compatibility information in Settings.
- Added QoL Account & Sync for linking devices and syncing settings.
- Improved cloud sync so only changed settings need to be transferred.
- Improved performance protection for very large chats.

## 0.2.24
- Fixed the stacked chat layout and alignment of the message box.
- Made Settings save automatically and improved save reliability.
- Made large chats easier to read with Show older, Show all, and Fold old controls.
- Added a manual chat performance refresh that protects unfinished drafts.
- Improved performance while SpicyChat loads or generates replies.

## 0.2.23
- Improved Bot Status counts, scan progress, and cleanup safety.
- Improved Bulk Less Like speed, retries, and progress information.
- Fixed the Export button being too wide on profiles.
- Fixed stacked messages not lining up.
- Hid the Mini Panel when it has no controls to show.

## 0.2.22
- Fixed recurring freezes when the Persona picker is open.
- Improved Persona Organizer responsiveness.
- Fixed chat layout alignment and cut-off bot descriptions.
- Improved Bot Status scan reliability and speed choices.
- Fixed the changelog not loading in the Android app.
- Fixed small Android message-edit boxes.

## 0.2.21
- Added a way to contribute saved public bot information to the SpicyChat Archive.
- Added Archive uploads for Bot Status records, including compressed exports.
- Added a Refresh stale bots action with adjustable age and speed choices.
- Improved safety checks before treating bots as unavailable.
- Improved long Bot Status scans.

## 0.2.20
- Fixed Bot Status scans starting slowly or getting stuck.
- Improved scan recovery and checking bots missed by earlier runs.
- Improved handling of saved bot copies and unavailable bots.
- Improved Load all chats progress and refresh speed.
- Reduced conflicts between long-running chat imports, rating jobs, and Bot Status scans.

## 0.2.19
- Added a stacked chat layout.
- Improved Less Like speed, progress, and cleanup of unavailable bots.
- Improved Bot Status checks and saved bot details.
- Added a recovery view for deleted and unavailable bots.
- Improved My Creations descriptions and saved-data cleanup.

## 0.2.18
- Fixed Chat Export failing to include older messages in long chats.
- Improved Chat Export errors when older chat history isn't available.

## 0.2.17
- Fixed Chat Export buttons disappearing and exports missing older messages.
- Improved long-chat export progress and cancellation.
- Added a message counter to the Mini Panel.
- Added separate fonts for chat dialogue, actions, and regular text.
- Added controls for showing full bot names and jumping to listing pages.
- Improved Android message editing and Quick Dislike reliability.

## 0.2.16
- Fixed Bot Organizer controls overlapping bot names and descriptions.
- Improved saved folder backups and sorting.
- Fixed Listing Refill loading too many pages or skipping filtered results.
- Added a page-number box for chatbot listings.
- Improved listing performance and bot creation dates.

## 0.2.15
- Fixed bot names disappearing on Android when Bot Organizer is enabled.
- Improved Android detection in support reports.

## 0.2.14
- Improved Quick Dislike reliability and protection against duplicate ratings.
- Improved Listing Refill speed, filters, and statistics.
- Added drag-and-drop sorting for pinned Memories.
- Added bot creation dates to cards and profiles.
- Improved Language Filter and expanded descriptions.
- Made Settings, backups, and Help easier to use.
- Improved performance on listings and chat pages.

## 0.2.13
- Improved Listing Refill filtering and paging.
- Improved Language Filter and blocked-word matching.
- Updated Creator Moderation Warnings.
- Fixed Lorebook exports missing entries and improved download reliability.
- Added detection of SpicyChat beta features.
- Added new Context Keeper cleanup and category choices.
- Improved Settings and performance.

## 0.2.11
- Added support for SpicyChat beta features.
- Added tools for preparing Chrome and Firefox builds.
- Improved Context Keeper and Lorebook exports.
- Improved Listing Refill and favorites-based bot discovery.
- Added a Hard no-control + formatting OOC preset.
- Improved typing controls, package sizes, and Bulk Dislike reliability.

## 0.2.1
- Added sorting and filtering inside the chat Persona picker.
- Fixed missing model choices on mobile.
- Improved animated bot pictures and blocking from bot profiles.
- Improved Listing Refill.
- Added Bot Version History, with comparison, renaming, deletion, and restore.
- Improved page performance.

## 0.2.0
First major v0.2 release after the earlier v0.1 development versions.

- Added Context Keeper, story tracking, RP formatting, chat search, message bookmarks, and chat export tools.
- Added Memory Manager, Persona management, and Lorebook tools.
- Added creator backups, Draft History, Creation Audit, and other creator shortcuts.
- Added bot folders, Favorites tools, blocking, filters, and saved-bot management.
- Added performance improvements, data backups, and better browser and Android support.

## Older 0.1.x development history
The early development updates have been grouped together.

- Started with the QoL switch, bot blocking, premium cleanup, and basic chat tools.
- Added Favorites, Later, folders, filters, Language Filter, and Listing Refill.
- Added Persona tools, Memory Manager, Context Keeper, and story tracking.
- Added Bot Status, creator backups, Lorebook tools, and recovery features.
- Added chat search, bookmarks, export, quick actions, custom chat appearance, and Soundscapes.
- Added performance improvements, Android and Firefox support, backup tools, and support reports.

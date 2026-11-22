## 0.2.92
- Made Report Link Collector an optional OFF-by-default Advanced setting; saved links remain available in the popup when disabled.
- Deferred independent Settings feature panels until their tab, Search, or Features catalogue requests them; initial Settings no longer constructs hidden panel DOM.
- Hydrated deferred controls from saved settings, preserved autosave and section collapse state, and restored deferred deep links and pinned-section navigation.
- Shared in-flight panel loads and allowed retries after failed imports; no new polling, observers, migrations, or storage cleanup.
- Added a local bot-report link collector with a + icon on listing pictures and Copy all / Clear list in the QoL popup; no automatic reporting or Archive uploads.
- Serialized collector writes across tabs, deduplicated canonical bot links, and kept saved links until explicitly cleared.
- Reused the existing card-mutation pipeline and one delegated click listener; stopped repeated full card-cache connectivity walks on unchanged listings.
- Reused one membership index per Saved Bots manager render instead of repeatedly searching large Blocked, Opened, Later and Favorites arrays.
- Preserved existing Settings hydration and backup/storage data formats; no unverified bulk panel rewrites or new polling.
- Deferred Creator Backup manager rendering until Bot Tools or an explicit export opens; kept its existing Settings entry points and retry behavior.
- Deferred Chat Bookmarks, chat backgrounds and chat Lorebook manager behind route/feature demand, preserving bookmark navigator initialization order.
- Deferred 15 more chat, listing and creator helpers behind route and enabled-setting demand, reducing startup parsing without changing their settings.
- Kept one existing module loader, shared import promises and failure/retry behavior; no new polling, observers or background workers.
- Cut repeated Settings pinned/recent shortcut card walks to one indexed pass and cached pin-sort keys; skipped DOM reordering when cards are already in the correct order.
- Avoided redundant Settings shortcut and pin-label DOM writes during ordinary refreshes; preserved search, reset, section order and saved values.
- Kept Full and Custom Lite ownership, Orion compatibility, and all existing local/Archive data and safety checks unchanged.
- Improved Orion/iOS WebExtension startup by accepting callback- or Promise-based storage replies in early chat bridges, including Promise-only APIs.
- Recognized working extension contexts without runtime.id; kept invalid-context recovery conservative on iOS without new polling.
- Scoped iOS WebKit to current-page capabilities while preserving desktop-only settings for later use; macOS Orion remains desktop.
- Labeled unsupported helper-tab and background-worker controls in iOS Settings instead of attempting them silently.
- Preserved saved data, encrypted backups, Android shim integration and existing Chrome/Firefox paths; no new polling or automatic reloads.
- Deferred Bot Organizer, scroll/swipe navigation, Translation, Lorebook tag expansion and History Navigator until their settings need them.
- Reused the existing feature loader, with route-change retries for failed optional imports; no polling or new observer.
- Deferred blocked-bot Archive cleanup tools until requested, with retry-safe Settings loading.
- Reduced repeated Settings feature-catalogue ownership, platform and status calculations per render.
- Removed per-setting DOM lookups from Settings' Show enabled only filter while keeping dynamically added controls visible.
- Kept Custom Lite Bookmarks history support and Lorebook tag-setting ownership; preserved Chrome, Firefox, Android, Orion and saved data.

## 0.2.91
- Made full card descriptions appear through CSS as soon as Settings loads, without waiting for the slow listing pass or repeatedly scanning normal card text.
- Retained JS description expansion in browsers without native :has() selector support; disabling the option restores native clamping without new observers.
- Required fresh Bot Status verification for Archive transfers and rejected snapshots newer than their verified check or inconsistent with observed fields.
- Rechecked each Archive bundle against saved snapshots immediately before sending; pending scans and stale copies remain blocked for both private and public routes.
- Saved acknowledged Archive chunks individually so a later bundle failure does not automatically resend previously accepted copies; existing fingerprints and data remain intact.
- Restricted Text Normalization to bot, creator, listing and Lorebook/Rulebook metadata; removed chat-message rewriting entirely so long dashes and other generated text stay exactly as SpicyChat renders them, even when normalization is enabled.
- Limited RP Format Repair and chat text-replacement observers to the native message list instead of monitoring the entire SpicyChat page; disabled features remain disconnected.
- Prevented a chat replacement preset from applying when chat replacements are disabled, without changing saved rules or message content.
- Coalesced concurrent large Settings-store reads per store and read independent stores concurrently, reducing avoidable IPC serialization without caching stale records.
- Supported callback- and Promise-based runtime and storage replies in Settings and card-token helpers for Android WebView compatibility, without adding retry loops or changing stored data.
- Bounded parallel Settings large-store reads to two stores to avoid excess Android WebView decoding and memory pressure.
- Reduced repeated content-script granular-settings IPC reads by prefetching known setting keys and fetching only new keys; also handled callback/Promise storage results without changing the saved format.
- Preserved independent chat mute and word-censor activation without relying on generic chat-replacement enablement.
- Blocked private Archive uploads and public submissions while a Bot Status scan is running or has queued rechecks; old Settings buttons cannot bypass this check.
- Rechecked saved scan queues immediately before each Archive network upload, and excluded held/out-of-scope and unverified Bot Status copies until safely checked.
- Showed the specific pending-scan reason on disabled Archive buttons without scanning or fingerprinting thousands of saved copies unnecessarily.
- Kept existing Archive fingerprints for temporarily held bots; no stored snapshots, scan queues, or upload history are deleted.
- Reduced Saved Bots Hub refresh work for large lists by building known entries once and counting list memberships in one pass.
- Reused the existing Settings storage-change listener for Archive safety updates; no new polling, observers or background workers.
- Separated the requested model, server engine and explicitly resolved actual model in Generation Metadata; missing actual-model fields are labeled Not reported rather than guessed.
- Displayed a generic server response model only as unverified metadata, never as proof of an underlying model or automatic fallback.
- Kept the actual-model status available when S.AI Toolkit draws the overlapping generation statistics, without duplicating its model and timestamp blocks.
- Preserved model details across message-history reloads and cleared stale resolved-model data when a new server response reuses a message ID; no changes to saved chat content or requests.
- Fixed Bot Status scans getting stuck when a background pacing request or helper check never answered.
- Saved Bot Status scan checkpoints every 10 checks or about 10 seconds instead of every 50 checks or 30 seconds, reducing repeated checks after an interruption.
- Kept incomplete Bot Status scans recoverable with clearer last-checkpoint details and interrupted-run feedback; existing results and pending IDs are preserved.
- Added time limits to Bot Status diagnostics, delta persistence and helper cleanup so background delays cannot indefinitely block scan completion.
- Reduced Research Export Start / Resume work to new and changed conversations plus a small rotation of older verification checks, instead of processing every saved chat each run.
- Kept the full saved conversation catalog, previously verified ZIP parts, native Memory checkpoints and GitHub Research records intact when older chats are deferred.
- Added a compact, resumable local index of verified research backups; existing completed archives are indexed automatically on the first incremental run.
- Rechecked active older chats when they move into the newest conversation list, while avoiding repeated per-bot scans for unchanged recent results.
- Added Verify all to recheck every saved chat history, including older message edits, without clearing existing downloads; Fresh still rebuilds a standalone archive.
- Made export progress and startup diagnostics show the smaller active queue separately from the total saved conversation catalog.
- Kept bounded older-history audits, failed-history retries, and safe fallback for missing or incomplete local/GitHub backups; no continuous polling or new background workers.
- No changes to Android, SpicyChat Archive, encrypted GitHub backup formats, or saved chat content.

- Improved S.AI Toolkit v1.3.1 compatibility by detecting feature ownership individually rather than suppressing QoL features whenever Toolkit is present.
- Removed retired Toolkit WYSIWYG detection and recognized its current settings dialog without introducing permanent observers or polling.
- Kept generation metadata capture independent of Toolkit's visual statistics, including QoL Context Window and Memory diagnostics.
- Deferred overlapping metadata, Generation Profiles, Hide For You and failed-message recovery only when Toolkit's corresponding feature is confirmed active.
- Let SpicyChat native Chat Appearance retain its chosen dialogue colors when QoL chat bubbles are disabled.
- Reused an authenticated Less Like/More Like helper briefly across separate confirmed rating actions, then closed it after an idle period.
- Protected user-navigated tabs from rating-worker cleanup, serialized individual Less Like/More Like actions, and kept existing deduplication and ambiguous-request safeguards.
- Clarified that a running Bot Status resume queue may reflect an extension reload; checkpoints and saved results remain intact.
- Left creator-profile and Rulebook attachment issues for reproduction rather than risking speculative listing or picker changes.

## 0.2.90

- Kept Bot Organizer's search and Select bots toolbar off Story Mode pages, and removed leftover listing controls when navigating into a story.
- Improved automatic persona-limit detection using verified SpicyChat subscription roles paid_minimal, paid_basic and paid_premium, while preferring an explicit account quota and retaining the manual fallback.
- Measured Research Export's start-to-run lock wait and pre-history startup phases separately from message downloads, including selection discovery and GitHub summary lookup.
- Reused one IndexedDB connection while a Research Export runs instead of reopening it for every conversation checkpoint; transaction commit checks and saved data are unchanged.
- Improved native Lorebook entry-count detection when SpicyChat moves the counter outside its original header or displays thousands separators; incomplete 100-of-629 responses are still rejected rather than saved.
- Preserved existing Research Export checkpoint/ZIP formats, GitHub encryption, Android separation and all stored settings; no tests folder is included in the changed-files package.

- Start / Resume now looks for recently added bots and conversations automatically instead of relying only on the last saved selection.
- Checks verified GitHub Research summaries against fresh conversation counts and existing local checkpoints to skip unnecessary history downloads for unchanged chats.
- Reuses complete GitHub-only research backups after checking a fresh latest-message page, without pretending a local ZIP was recreated.
- Falls back to the usual safe history checks when GitHub is disabled, locked, unavailable or has no matching verified record.
- Gradually updates older GitHub Research backup summaries without uploading the same full chat records again.
- Periodically rechecks older chats, keeps previously downloaded ZIPs and checkpoints intact, and preserves Fresh as a full standalone re-download.
- Shows GitHub-backed reuse in Research Export progress and ZIP metadata, while keeping private message text out of the summary index.

- Reduced Settings startup work by checking each section's reset controls in one pass instead of repeatedly searching for every possible setting.
- Deferred the Features catalogue until its tab opens, and stopped rebuilding its cards when settings change on unrelated tabs.
- Kept section Reset buttons, Features search, saved category states, auto-save and existing settings behavior unchanged.
- Streamed large verified GitHub Research records into bounded 110k-character chunks, yielding between serialization batches instead of blocking the Research Export tab with one huge `JSON.stringify` call. Preserved the existing background staging contract and 79-million-character safety limit.
- Awaited Rulebook, Story Moments and OOC extraction before submitting conversation records to GitHub staging, so those fields are no longer accidentally omitted from staged backups.
- Reduced repeated scans of staged ZIP entries during part verification by counting each conversation's files once per part. Existing incremental ZIP files, download verification, saved checkpoints and GitHub encryption flow are unchanged.
- No changes to Android, the Archive, the ZIP worker, or any Settings storage format.
- Bot Status scanning (63 KB) and Blocked Bulk Dislike/Less Like (65 KB) now load from Settings only when their tabs or controls need them. Normal Settings startup no longer evaluates these engines.
- Retained original scan queues, checkpoint persistence, rate limits, pending-state UI and feedback validation. First-use loader shares one in-flight request and retries failed module loads.
- Added a regression test for deferred registration, module isolation and retry behavior. No new polling or observers.
- Reuse compiled name, tag, word and creator blockers when Favorites/Later or other membership lists change; live block verification still rereads the card.
- Reuse already prepared card fields for read-only blocking diagnostics.
- Skip unrelated granular background Settings writes, and only reconfigure alarms when their own saved fields actually change.
- Classify each native card-mutation batch once when both changed-card and added-card decisions are needed.
- Process dirty chat-message roots through a persistent newest-first queue instead of recollecting and ordering the full chat history for every chunk.
- Reuse normalized chat-text results while the same native text and normalization settings are unchanged; restore original visible text when the feature is disabled.
- Listing Refill and My Creations Load More now ignore unrelated DOM mutations while watching for newly added card IDs, with a full count check at timeout.
- My Creations fingerprinting uses a Set rather than quadratic duplicate-ID searches on large lists.
- Optional-module diagnostics now include the failing module path and error, without changing the Android-native compatibility contract.
- Clear the pending message queue on normal-profile passes, route changes, and history-export resets to avoid retaining detached chat nodes; wait for native edit completion instead of scheduling empty passes.
- No changes to exported chats, saved settings, the Research Export worker, GitHub backup encryption, or Android APK files.

## 0.2.89
- Fixed RP Format Repair missing most narration in long greetings and mixed dialogue, with safer full-message edit previews.
- Kept the RP edit shortcut separate from the display toggle and removed RP controls when the feature is disabled.
- Improved RP Format Repair for unformatted greetings and mixed narration/dialogue; kept bold inner thoughts intact.
- Fixed GitHub Research progress resetting each batch and added bounded retries after temporary upload failures.
- Extended text normalization to displayed chat messages, using the existing changed-message updates without editing saved replies.
- Fixed GitHub repository verification hiding successful results behind old errors and resetting encryption unlocks on repeated verification.
- Replaced raw repository-list output with a clear selection message.
- Fixed Rulebook cards not opening in new tabs with Ctrl+click, middle-click or the right-click menu.
- Added a way to send completed Research Export checkpoints to GitHub without re-exporting chats.
- Made GitHub Research upload status and setup requirements clearer; syncing still follows the saved backup categories.
- Reduced Research Export panel startup checkpoint reads and narrowed Later-button updates to changed listing cards.
- Fixed chat-message avatars sometimes animating after SpicyChat re-renders them or replaces their frozen frame.
- Reused verified unchanged Research Export histories instead of rebuilding every message file or writing the full checkpoint again.
- Exported changed chats as incremental ZIP parts; Fresh still makes a complete archive. Earlier ZIP parts remain necessary for reused chats.
- Avoided retransferring already-staged GitHub research records and protected research scans from duplicate helper-tab runs where supported.
- Added Research Export tests for unchanged and updated chats, archive verification and GitHub staging.
- Reduced repeated listing-card collection by reusing the changed-card queue and shared card cache.
- Moved animation controls, exact message counts and previously chatted indicators into the existing on-demand loader.
- Improved route-change handling and reduced idle fallback checks without adding observers or timers.
- Avoided unnecessary Memory Manager row updates and inactive-manager cleanup work.
- Reduced unrelated background alarm updates when changing individual settings.
- Made automatic GitHub backups less disruptive during active chats and reduced research staging overhead.
- Split Research Export fallback work into smaller chunks to keep the page more responsive.
- Added source regression checks for changed-card batching, background setting wakeups and build assets.
- Cleaned up repetitive source comments and shortened Settings and feature descriptions.
- Kept QoL Cloud, GitHub backups, Inspector tracing, saved data and existing feature settings intact.

## 0.2.88
- Restored a clear Add device control for QoL Cloud and added GitHub backup device-connection guidance.
- Added unofficial hover explanations for chatbot tags in search filters and character creation without changing native tags.
- Added experimental GitHub backups alongside QoL Cloud, with built-in Device Flow login, repository selection and refreshed tokens.
- Added encrypted backups with password unlock, remembered-device keys, and explicit category-level plaintext exceptions.
- Added incremental, integrity-checked backup snapshots with five recent recovery points and safe cross-device conflict detection.
- Added selective restore for settings, saved lists, other QoL data and selected media without clearing unselected data.
- Added Research Export backup and recovery of verified histories, Memories, Rulebook data and character metadata, reusing unchanged records.
- Added manual Backup Now / Sync Now actions, backup progress, and 12-hour active-tab synchronization.
- Improved Inspector v0.1.7 tracing and background-event replay handling, avoiding duplicate events and private route details.
- Fixed Mini Panel refreshes scanning listing cards on chat pages and reduced repeated listing status work.
- Fixed the separate Later sidebar/Favorites shortcut and Later-page filters reverting to off instead of saving their settings.
- Fixed New V2 Memory JSON imports choosing the actual save control and recognizing updated memory cards, with clearer private diagnostics.
- Improved RP Format Repair with a reviewed native-message edit preview for missing action markers; messages save only through SpicyChat.
- Changed Research Export Scan bots to check recent bots and reuse older verified chat lists; Full scan remains available.
- Preserved existing QoL Cloud accounts, manual research ZIP exports, checkpoints and existing user data.

## 0.2.87
- Improved Later buttons on Home and listings by updating only changed cards and processing large updates in small batches.
- Reduced startup and large-listing slowdowns by loading more tools on demand and reusing card information.
- Added Archive Blocking Presets for franchises, characters, and themes, with customizable exceptions.
- Added Research Export Quick scan for recent and uncached bots; the original Scan bots still performs a full scan.
- Made Research Export restore its previous bot selection and download only newer chat history when possible, with safe recovery if history changes.
- Improved Research Export checkpoints, resume reliability, download verification, and warnings for incomplete data.
- Expanded research ZIPs with Rulebook state, Story Moments, and OOC/Director Mode directive records.
- Improved character and Lorebook metadata caching, retry options, and reporting of failed or incomplete records.
- Updated Lorebook backups for SpicyChat's new infinite scrolling and added checks against incomplete backups or merges.
- Fixed Android Lorebook backup and JSON import issues, with easier-to-use merge controls on smaller screens.
- Restored native mobile chat headers and reply actions while typing, and avoided hiding chats before native content loads.
- Fixed Memory Manager V2 JSON imports with SpicyChat's updated inline memory editor.
- Improved Inspector v2 timing details for slow features and Research Export while reducing repetitive diagnostics.
- Improved Home and Chats promotional-banner dismissal using SpicyChat's native close button when available.

## 0.2.86
- Improved Research Export responsiveness with fewer progress redraws and a dedicated lightweight export tab.
- Fixed Example Dialogue metadata availability and repaired previously saved character records without extra profile requests.
- Added retries for partially retrieved linked Lorebooks and clearer export phase timings and API diagnostics.
- Added clearer initial synchronous-call timing for runtime steps without changing chat scheduling or recovery.
- Added a Character Token Optimizer to chatbot creation, with per-field estimates, reviewable suggestions and manual Apply actions.
- Added step-by-step Bulk Research Export progress with a live, stage-specific ETA for bot discovery, conversation scanning, and export.
- Improved startup performance by deferring more creator, Persona, chat, Lorebook, and Smart Filter tools until needed.
- Reduced delays from loading independent modules while preserving their required dependencies.
- Delayed the heavy Diagnostics/Support Settings code until those tools are used.
- Kept saved export checkpoints, enabled-feature behavior, and native rating/recovery safeguards unchanged.
- Added Archive Community Themes with reviewed/candidate trust choices, historical-only warnings, per-bot exceptions and batched, version-cached public bot-ID lookups.
- Kept local Implied Themes independent and added explicit human-review suggestions without uploading private data.

## 0.2.85
- Improved startup performance by loading more features only when needed.
- Added guides and clearer explanations for Memory, Context Keeper, Lorebooks, Rulebooks, and creator tools.
- Added adjustable native Memory checks and a manual Check now action.
- Made backup, import, Replace, and cloud sync safety information clearer.
- Improved Creation Audit explanations and browser/platform support guidance.
- Added Implied Blocked Themes for bots with untagged cheating, emotional affairs, NTR, cuckolding, or suspicious relationship dynamics.
- Improved implied-theme detection using audited examples, including wedding-weekend and hidden relationship-history scenarios, while reducing false positives.
- Expanded bulk research exports with separate character metadata files, accessible linked content, and better retry and completeness reporting.
- Fixed Tab Cleanup Settings failing to load after startup optimizations.
- Reduced unnecessary Bot Status storage reads and improved storage performance diagnostics without changing saved checkpoints.
- Reduced repeat Dislike helper checks and unnecessary chatbot card updates while preserving native rating verification.
- Improved Favorites scanning and browsing by avoiding repeated filtering, imports and unchanged history writes.
- Clarified Favorites listing, account and locally saved counts, with authenticated verification when available.

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

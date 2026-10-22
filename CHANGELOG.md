## 0.2.56
- Improved generated-reply navigation when only part of a larger swipe history is loaded, with optional cancellable loading for a chosen reply number.
- Fixed First reply becoming unavailable while older generated replies could still be loaded.
- Reduced repeated swipe scans in long chats and fixed some native message updates being mistaken for QoL-only changes.
- Fixed Dislike and Less Like runs showing as completed while blocked bots were still waiting. Remaining bots can now be resumed.
- Improved bulk negative-rating checks for removed or unavailable bots without treating private or unlisted bots as deleted.
- Fixed blocked bots reappearing on listings after SpicyChat loads or refreshes cards.
- Fixed greyed-out Block buttons staying attached to the wrong bot when cards are reused.
- Improved support reports with safer default privacy, feature-category summaries and an optional list of enabled feature names.
- Reduced optional QoL work around Send and Regenerate clicks and added more local timing details to help investigate slow responses.
- Fixed new Bot Status scans replacing unfinished queues so pending checks can be resumed without losing previous results.
- Added Pending recheck counts, filters and indicators to Bot Status, including bots outside the current scan scope.
- Added Open tab, Open & remove, and Bot profile actions to saved Tab Session cards, with saved bot pictures when available.
- Kept failed or unreadable Bot Status checks available for retry instead of dropping them or marking bots as deleted.
- Improved recognition of bot editor links in saved tab snapshots, including pages titled 404.
- Improved large Tab Session reviews with category filters, clearer counts and progressive loading instead of displaying every entry at once.
- Added a review filter for saved bots marked unavailable in Bot Status, without assuming private or restricted bots are deleted.
- Added selective removal from saved tab snapshots with a backup download and Undo, without closing tabs or deleting chats.
- Added an optional Go to reply number field for generated responses, including cancellable navigation through large swipe histories.
- Fixed First/Last reply buttons appearing in the wrong order and stopping after only one swipe.
- Fixed First/Last reply buttons not appearing with SpicyChat's updated swipe-counter layout.
- Improved automatic return-to-first navigation after loading older messages and reduced unnecessary swipe-control updates.
- Added optional First/Last generated-reply buttons and an option to return to the first reply on chat load, refresh or loading older messages.
- Fixed Bot Status retry controls failing when the Settings page opened before their data was ready.
- Improved My Creations sorting and filtering by avoiding unnecessary card rearrangement and repeated updates.
- Reduced Lorebook entry-list refreshes while typing in an editor.
- Reduced unnecessary Lorebook keyword checks and overlapping updates during editing.
- Fixed a Settings startup error introduced while separating feature controls.
- Improved My Creations backups by checking current bot editor fields and selected tags, and reporting exports that could not be verified.
- Separated more Bot Status, Bot Archive and chatbot/Lorebook backup Settings for smaller Custom builds without resetting saved preferences.
- Fixed My Creations bulk backups accepting outdated chatbot details without warning when current owned-bot information disagreed.
- Fixed Lorebook bulk exports mixing older saved entries into new backups and improved reporting of where exported data came from.

## 0.2.55
- Improved Lorebook recovery integrity checks, preserved existing complete copies when a public entry fetch is incomplete, and added on-demand inspection of saved Lorebook entries.
- Improved Opened History cards using locally saved bot copies, including unlisted creations, with available title, greeting, creator and refreshed image data; broken image URLs now fall back safely.
- Fixed chatbot JSON backup tag detection for SpicyChat’s current tag picker. Export now reads selected tag chips from the creator form and warns instead of silently omitting tags when the picker count disagrees.
- Improved experimental Custom Lite packaging so omitted features also omit their dedicated Settings panels, panel placeholders and more feature-specific stylesheets.
- Reduced experimental Custom Lite installation size by excluding development tools, test scripts and build metadata from generated extension packages.
- Moved more optional Settings controls, including Scene Notes, Reply Instructions, RP State Tracker and Translation, into their own feature panels while preserving existing saved preferences.
- Separated Translation and Wiki Fetch message handling from the shared background dispatcher so omitted Custom/Lite features do not register those request handlers.
- Moved Context Keeper and Soundscapes Settings read/load controls into their feature-owned panels so omitted Lite features do not register those handlers or overwrite saved preferences.
- Separated Soundscapes Mini Panel styles from the shared stylesheet for smaller feature-specific builds.
- Improved support exports so Diagnostics, Performance Report and Self-Check use the same live chat snapshot instead of reporting conflicting availability.
- Expanded disappearing-chat diagnostics to record unexpected message unmounts, whether messages reappear without a reload and whether the chat stays empty after a short check, without reading or changing message text. The last summary survives a refresh in the same tab.
- Added blank-chat recovery counts and a manual visible-versus-hidden message check to the Performance Troubleshooter and support report for easier bug investigation.
- Avoided unnecessary Mini Panel refresh requests from saved-list updates when the panel is disabled.

## 0.2.54
- Added an on-demand Performance Troubleshooter that shows measured QoL feature-step activity without uploading chat content or automatically disabling features.
- Reduced unnecessary Context Keeper toolbar checks when its message shortcuts are disabled, without changing saved memories.
- Reduced chat-observer work during ordinary message streaming by checking edit guards only for relevant message/editor mutations.
- Added content-free diagnostics for sudden chat-message unmounts, without forcing reloads or altering conversations.
- Improved diagnostic trace negotiation with compatible Inspector versions, including legacy operation markers when connected.
- Avoided reading unused saved memory and organizer data during the initial Settings load, especially helpful on storage-heavy devices.
- Improved optional Context Keeper recall with local topic-aware matching and more varied continuity details; no external AI service or subscription is required.
- Added reviewable Context Keeper updates and consolidation for character development and long-running stories. Older versions stay saved but are excluded from active recaps.
- Expanded Context Keeper categories for character growth, recurring NPCs and major story events, with optional review-only suggestions for obvious conflicting facts.
- Improved Android WebView support-report exporting by offering a copyable report instead of reporting an unverified file download as successful.
- Kept the optional OOC chat-input shortcut immediately left of Suggest and available while typing, without replacing the Image button.
- Changed the optional compact chat controls button from a gear icon to a QoL label.
- Separated more optional feature Settings and styles into individual modules and reduced unnecessary background alarm handling for omitted features, without resetting saved preferences.

## 0.2.53
- Maximum Performance now enables related performance options automatically while remembering any options you turn off individually.
- Fixed Dislike and Less Like being treated as interchangeable: Dislike now submits its separate native character-rating event and keeps independent completion history.
- Corrected bulk feedback filters and counters so Less Like does not mark Dislike as complete, or vice versa. Previous recommendation-only records no longer prevent a real Dislike.
- Added lightweight timing information for chat navigation and expensive page-observer callbacks to help diagnose intermittent freezes.
- Improved experimental Custom Lite packaging so unselected features and their owned Settings, styles, background services and unused picture helpers can be left out together. Invalid feature combinations now fail validation.
- Fixed Custom Lite feature checks for Custom Pictures, Rulebook Diagnostics and My Creations auto-load, so installed features do not disappear and omitted features do not leave unusable shortcuts.
- Aligned Scene Notes and automatic-blocking dependency checks across chat runtime and Settings, without changing saved options.
- Reduced redundant tab-switch refreshes, hidden-tab checks and performance snapshots when several SpicyChat tabs are open.
- Added optional Chat Lorebook Manager actions to turn visible chat messages and Memories into editable local Lorebook entry drafts. Drafts can be copied, exported or prepared in an existing Lorebook editor for review; QoL does not automatically save or attach them.
- Added guidance for attaching a Lorebook to your own chatbot using SpicyChat’s native chatbot editor.
- Added optional Model Quick Access shortcuts with user-defined model order, using SpicyChat’s normal model selection.
- Added optional Previously Chatted indicators on bot cards, distinguishing confirmed conversations from less certain imported chat history and bots that were only opened.
- Expanded feature-owned Settings panels and experimental Custom Lite packaging so omitted panels can be left out without resetting their saved preferences.

## 0.2.52
- Firefox compatibility fix of warning "Unsafe call to target.insertAdjacentHTML for argument 1" in Custom Pictures settings.
- Improved search on the Chats page so conversations imported through QoL can be found by name even when their cards are not loaded.
- Restored separate manual controls for importing chats through the API and clicking SpicyChat's Load More button, with adjustable page limits.
- Removed the misleading Unopened filter from existing chats and added better conversation sorting and filters.
- Added a Messages view to Chat Index for searching and viewing locally saved message excerpts. Message indexing stays manual and optional.
- Added manual refresh for older saved message samples and clearer warnings when only part of a conversation has been indexed.
- Creator Trigger Preview now highlights duplicate Lorebook keywords, missing keywords and unusually long entries.
- Improved non-English Lorebook keyword matching and cleared outdated match badges after edits, regeneration and conversation changes.
- Reduced extra Lorebook backup work while entries are being saved. Automatic Lorebook continuity messages now start OFF.
- Added backup presets for Settings, saved lists, creator content and pictures.
- Fixed Backup/Restore for Character Pictures, Persona Pictures, Picture Library, background positioning and saved Scene Notes.
- Added per-device cloud-sync presets and clearer upload/download choices. Restoring sync settings pauses existing sync until explicitly resumed.
- Fixed Bot Status scans losing pending bots after reaching a scan limit, and improved the speed of large status lists.
- Bot Status now remembers the last scan summary and distinguishes saved, pending, inconclusive and deferred checks, including storage problems.
- Fixed blocked-tag rules mistakenly matching words in bot names or descriptions. Word and tag rules remain independent.
- Made automatic blocking safer when cards change or actions are cancelled, while preserving manual-unblock exceptions.
- Improved chat navigation by reducing unnecessary OOC and Mini Panel work, and restoring the Mini Panel after supported page changes.
- Fixed Context Keeper carrying automatic findings into the wrong chat and added a review filter so uncertain memories stay out of recall until approved.
- Added slow-feature timing summaries to local diagnostics for investigating lag.
- The extra IMG button and new automatic capture options now start OFF. Existing saved user choices are preserved.
- Mini Panel shortcuts remain optional and hide when their feature is disabled or absent from a Lite build.
- Added independent per-chat Scene Notes with manual draft insertion and optional visible OOC inclusion, both off by default.
- Added an optional Apply & Save action for owned Private or Unlisted bots. It backs up the old Scenario, uses SpicyChat's native Save button, and does not report success until the saved value can be verified.
- Separated Auto Voice and automatic conversation images into independent features, keeping their existing settings.
- Split Character Pictures, Persona Pictures, Backgrounds and Picture Library into separate feature modules; Picture Library now has its own OFF-by-default option.
- Improved Custom Lite build checks and split more feature-specific Settings, styles and background components so unused code can be left out. Existing saved data is preserved.
- Added independent Lite ownership for Auto-AFK, tag aliases, My Creations auto-load and automatic word/tag blocking.

## 0.2.51
- Added Enter-to-search for the native chat History search field.
- Added an optional native History search enhancement that shows additional matching conversations from the existing local Chat Index without loading more chat cards or making search API requests.
- Added a dedicated Custom Pictures Settings category with Backgrounds as a subsection, preserving existing images and scene presets.
- Added independent per-chat Character and Persona picture overrides for the visible chat UI, without changing the published avatars or native image-generation references.
- Added a reusable local Picture Library for saved images, with rename, removal and quick assignment to a chat background or character/persona override.
- Linked native conversation-image settings into Custom Pictures, retaining per-chat automatic image intervals and composer-safe triggering.
- Added optional Mini Panel shortcuts for Custom Pictures, Context Keeper, creator keyword preview, native image controls, Rulebook troubleshooting, and additional chat tools.
- Mini Panel shortcuts default off except Options, and hide when their underlying feature is disabled, omitted from a Custom Lite build, or unavailable on the current page.
- Made Context Keeper a standalone local memory alternative that works without native Memory Manager, with optional visible OOC recall added to outgoing messages at a selected interval.
- Added independent per-chat Auto Images controls that use SpicyChat's native conversation image button after a chosen number of new AI replies. No composer editing or automatic message sending; disabled by default.
- Added bulk selection, pinning, category changes, recap inclusion, and JSON import/export to the Context Keeper manager.
- Context Keeper now flags automatic continuity captured from changed or regenerated messages for review, instead of silently leaving outdated facts active.
- Added a manual, cancellable chat-history scan in Context Keeper that finds reviewable suggestions through SpicyChat's authenticated history reader without loading older chat cards.
- Expanded the opt-in Chat Index with manually indexed local message-text search, bounded samples, stop controls, and a clear-index action. Normal chat loading does not start message indexing.
- Added an optional Creator trigger preview that checks locally backed-up Lorebook keywords against visible chat or pasted text and reports possible matches, unmatched entries, and approximate entry sizes.
- Reused recent authenticated history pages between supported manual QoL readers to avoid duplicate requests, with short in-memory cache limits.

## 0.2.50
- Clarified Bot Status scan counts to distinguish checked-but-Unknown results from unchecked blocked/excluded bots, with an optional targeted Unknown recheck.
- Treat confirmed unavailable/deleted bots as handled in Dislike and Less Like without sending feedback or removing blocked IDs and recovery copies.
- Count existing Less Like negative ratings directly in Bulk Dislike even after its separate history is cleared, with clearer warnings and counters.
- Reduced redundant automatic Lorebook backup writes when editor content has not changed, and coordinated backup writes during entry saves and exports.
- Improved Lorebook backup timing details for Inspector recordings without including Lorebook text.
- Clarified Bulk Dislike history when Less Like already sent the same negative rating, with separate counts for confirmed Dislike requests and cross-handled results.
- Preserved original rating-source information in saved Dislike history and clarified older entries where the source can only be inferred.
- Fixed Lorebook JSON exports failing when the reusable background helper was still opening another Lorebook. Exports now wait for the correct editor and recheck the target before finishing.
- Added bot import to both Create Bot and Edit Bot pages. Review imported fields before filling the SpicyChat editor; imports never save or publish the bot automatically.
- Supports QoL and Character Card JSON, labeled bot replacement TXT files, and ZIP archives containing bot files. Select which bot to import when an archive contains more than one.
- Imports can include name, title, description, greeting, personality, scenario, example dialogue and tags. Existing tags are kept; avatar and attached Lorebook data are left untouched.
- Creates a local safety checkpoint before filling an existing bot. Read-only editors cannot be overwritten.

## 0.2.49
- Expanded the optional Rulebook troubleshooting log with manual Regenerate, Delete and Next Turn markers, plus a short recent-events view. These help with testing and do not claim to detect native Rulebook triggers or reconstruct hidden data.
- Added an optional public Lorebook discovery panel linking to the creator profile when SpicyChat shows it, and listing exact bot/Lorebook links already saved locally by QoL creator tools. These are known local links only, not a complete list of every bot using the Lorebook.
- Added a creator-name filter for currently loaded public Lorebook cards; it does not scan profiles or call more APIs.
- Added an optional visual-only Story Mode reading layout with subtle message boundaries and small-screen text wrapping. It does not change generation or merge native chat/Story modes.
- Added Rename to saved background scene images so uploaded scenes can serve as reusable named presets without reuploading files.
- Kept the v0.2.49 Rulebook mobile wrapping and chat background fit/position updates from the prior QoL 22 batch.
- Added an opt-in, read-only Rulebook troubleshooting log for chat pages. It records changes to visible meter values/status text in the current tab (up to 150 observations), keeps the last visible values when the native HUD is minimized, and exports a JSON bug report. No hidden instructions, engine changes, chat text, or inferred trigger history. The log clears when disabled or when switching chats.
- Improved narrow-screen Rulebook status text wrapping, and made the optional troubleshooting drawer fit smaller screens without covering the main chat with a permanent toolbar.
- Added per-chat image Fit and Position choices to the background popup, including corners, with an independent "Use global setting" choice for each. Existing global options, original source URLs, images and scene galleries remain intact.
- Began Core + OOC minimal-installation testing: extracted the OOC composer controls, added a small dedicated OOC Settings editor and a fixed minimal Chrome/Brave build recipe. Full QoL continues using the same OOC modules; other Custom combinations are not yet supported.

- Added optional HTTPS image URL backgrounds for global/chat views. Download a local copy by default or keep the URL only; both keep the original URL for refreshing the image later. Per-host permission and the 8 MB limit still apply.
- Added an Active options panel showing enabled named features in their original Settings context, with per-feature navigation and a confirmed bulk switch-off that preserves saved data.

## 0.2.48
- **Modularization — Stage 4:** Added shared feature start/stop handling and cleanup, expanded feature-level Settings and background service isolation, and kept Full QoL and future Custom builds on the same module system. OOC now restores its native chat controls when disabled. Custom packages remain experimental until their remaining dependencies and browser startup are verified.
- Made Settings search show named QoL features instead of internal sync keys, repeated controls and individual mini-options.
- Fixed blocked bot cards reappearing after SpicyChat remounts/recycles them, while avoiding a full card scan after each block. Block buttons now use the current card link.
- Reduced unnecessary listing-card rescans, deferred nonessential work while scrolling and added optional card collection/filter timing diagnostics.
- Smoothed large listing startup by splitting card hiding into shorter passes, and fixed new visible bot cards not being saved by the enabled public discovery archive. Discovery saves locally in small batches without fetching every bot profile; Bot Status can then include the saved IDs in its next scan.
- Improved experimental chat backgrounds: added Clear/Restore per chat, adjustable larger avatar images, optional side-to-side avatar repeats, higher-quality original character images, and moved the BG shortcut into the extension popup below Block this bot.

## 0.2.47
- Fixed sideways mobile listing overflow on Home and Search: a compact Show filters toggle keeps native filters available when their fixed-width sidebar would push results off-screen; desktop and already-responsive layouts remain unchanged.
- Made the mobile Bot Organizer start as a compact Organize bots launcher instead of covering listing controls. Its full toolbar remains available on demand.
- Avoided duplicating SpicyChat's native Narrow by Features → Lorebook filter: QoL's local Has Lorebook checkbox is hidden when the native equivalent is present, without modifying saved preferences.
- Added optional Rulebook-aware chat exports for TXT, Markdown, JSON and HTML. Exports can include a passive snapshot of visible Rulebook meters and any available Rulebook name; no hidden rules are fetched and historic meter states are not inferred. Off by default.
- Added an optional Rulebook filter in My Creations with All / Has Rulebook / Confirmed No Rulebook / Unknown. Missing badges and unlisted Rulebooks are not assumed absent. No per-bot scan requests; off by default.
- **Modularization — Stage 3:** Reorganized OOC Settings, other Settings tools, chat helpers, and background features into smaller modules, and improved the Custom Lite build planning. Full QoL keeps its existing functionality; customizable Lite builds are still in development.

## 0.2.46
- Reduced unnecessary beta-capability rechecks during Rulebook editor rerenders: only relevant native Rulebook, Lorebook and Story controls wake the short-lived observer.
- Improved passive Rulebook detection for the chat attachment menu and Rulebook picker. No new Rulebook features are enabled or changed by default.
- Fixed mobile Account & Sync category checkboxes reverting after changes by serializing selection saves and preserving intentional empty selections. Added clear save/failure feedback.
- Added an optional Account & Sync choices category to QoL backup/export and import preview. It backs up device sync directions, selected settings/categories, and saved-list modes without credentials, account/device IDs or cloud revision history.
- Fixed confirmed-unavailable cleanup repeatedly offering already-cleaned bots. Existing unavailable statuses remain recorded, but repeat cleanup skips saved cleanup checkpoints unless bots become newly unavailable or re-enter active lists.
- Prevented overlapping unavailable-cleanup actions while a save is running.
- Added manual blocked-bot data compacting with an age filter. Blocked IDs always remain; users can retain saved copies, purge only verified Archive-preserved copies, or explicitly discard unarchived local copies after an additional warning.

- Fixed a rare scheduler timing error when a saved/opened-chat step finished as the slow scheduler yielded, avoiding a null `sliceStarted` write.
- Made unavailable-bot cleanup wait for recovery/availability data before evaluating the cleanup set, and show the underlying error if it fails.

- Separated Account & Sync and device-compatibility Settings controllers and chat message-cache helpers into independently loaded modules without changing Full runtime behavior.

- Made Bot Status scans recoverable after browser/extension restarts: save the remaining queue before the first check, checkpoint verified results and remaining IDs every 50 checks or 30 seconds, and offer Resume interrupted scan on the next Settings visit.
- Made API-based Load all chats imports resume from a saved page cursor. Completed metadata and optional Chat Index pages are saved before the cursor advances, with checkpoints every 100 conversations or 30 seconds.
- Normal Stop/Pause and scan completion still save results; successful full scans clear only their own resume checkpoint.

- Started preparing QoL Lite Custom with separately loaded Auto-AFK/low-memory and Wiki-fetch background services.
- Moved Persona Manager, chat-bubble styling and Bot Organizer CSS into individually owned stylesheets while preserving Full stylesheet order.
- Added explicit background-service and stylesheet ownership to the build registry for future smaller custom packages.
- Full remains the supported runtime; Custom/Lite packaging will stay disabled until the remaining Settings, Core and background event dependencies are separated and tested.

## 0.2.45
- Fixed blocked-word auto-blocking for cards whose actual bot name is in SpicyChat's chat-link label, preventing matches such as Leon Kennedy and Simon Riley from being hidden without getting saved to Blocked bots.
- Fixed Settings reopening on General instead of the last section after refresh; the current section now stays in the URL and is remembered locally for new Settings tabs.
- Fixed blocked-word/tag auto-block rules being skipped when language or other discovery filters hid a card first. Actual tag badges are checked separately from names/descriptions.
- Improved Portuguese detection for short descriptions, including sentences using “mãe”, “agora”, “quer”, and “você”.
- Normalized mixed Greek/Cyrillic lookalike text in stylized Latin titles while leaving ordinary single-script Greek/Cyrillic descriptions unchanged.
- Fixed Bot Status controls squeezing the known-bot summary into the scan filters. Counts now have a full-width row.
- Moved the optional Chat Index into Chat List tools with a larger, scrollable index window. It remains disabled by default.
- Improved per-device sync Settings layout by keeping the individual setting list collapsed until needed.
- Bot Status scans now pause and preserve unfinished work after repeated authorization or connectivity failures instead of replacing confirmed results with Unknown.
- Improved bulk Less Like and Dislike pause messages for repeated authentication or network failures.
- Fixed mobile Settings getting stuck on General when the Sections menu did not initialize. Section navigation now starts independently and stays accessible if later Settings setup fails.
- Reduced repeated OOC button class updates and unnecessary Copy/Edit toolbar checks while preserving early controls and repairs after chat rerenders.
- Added an opt-in Chat Index for chat-list pages, with manual API refresh, full rescans, search and confirmed unavailable/restricted/unknown filters. It starts off and is opened from Chat List tools.
- Added local favorites for individual conversations, alongside existing QoL bot favorites. Exact chat links and message counts are saved without loading extra chat cards.
- Chat index imports use the existing API importer only when the feature is enabled, save progress in batches, and do not treat missing chats or temporary errors as deletions. Previously indexed data stays saved when disabled.
- Added a separate option to automatically add bots with blocked tags to Blocked bots; matched tags must be recognized on the card.
- Fixed overlapping blocked-tag and blocked-word rules so either enabled option can auto-block a bot without creating duplicate blocks.
- Added persistent Words, Tags, and Both counts for successful automatic blocks in the current Blocked bots list. Manual unblocks remain exempt until matching rules change.
- Added device-specific sync choices for settings and saved lists, with separate upload/download directions and optional individual settings selection.
- New device links can now leave local settings untouched, sync only Blocked bots, or download account settings before choosing ongoing sync directions.
- Added compact, ID-only sync for Blocked, Favorite, Later, Not Interested and Opened bot lists. Merges per bot across devices without uploading chat content, backup details or images.
- Avoided repeat uploads of unchanged saved-list parts, with checkpointed updates and explicit device opt-in. Cloud history cleanup still requires backend support.

## 0.2.44
- Fixed automated GitHub builds checking outdated release ZIPs instead of the newly built version.
- Fixed automatic Chrome and Firefox development and release builds after the root folder cleanup.
- Fixed the Mini Panel reappearing after typing or using chat controls when it is disabled in the current tab.
- Fixed the Mini Panel appearing or returning after being disabled in a tab, including after settings changes or imports.
- Fixed Settings failing to load when files from earlier modular updates were missing. The page now identifies missing files instead of leaving the version stuck on loading.
- Reduced repeated work when opening and filtering the persona picker, especially with larger persona lists.
- Continued separating Settings, translation tools, and shared code to prepare for smaller Custom builds.

## 0.2.43
- Fixed release preparation failing to include some required extension files.
- Improved reliability when saving bot folders and covers, and stopped the mobile selection shortcut when Bot Organizer is disabled.
- Memory Vault now clearly marks memories whose removal could not be confirmed, so users can check before restoring them.
- Added reading presets, font and text-spacing options, clearer contrast, and larger controls for QoL Settings. Chat messages are unchanged.
- Fixed the mobile Settings section menu staying expanded or covering the settings. It now opens only when needed.
- Fixed disabled features continuing to run unnecessary background checks. Turning off QoL also stops its regular page checks.
- Fixed page numbers going off-screen on smaller windows and mobile devices. Pagination now fits the available space.
- Added an option to hide the “New” badges in the sidebar without hiding the actual links.
- Added clickable folders to Favorites and My Chatbots. You can open a folder, return to all bots, or view bots that aren't in a folder. The existing bottom organizer menu is still available.
- Folders can belong to Favorites, My Chatbots, or both. Folders won't appear on Home or Recommendations.
- Added custom folder pictures: use the normal folder icon, one or two bot pictures, or an uploaded image.
- Fixed folders containing only one bot leaving large empty spaces in the bot list.
- Added an optional Memory Vault. Save a copy of a chat memory before removing it from SpicyChat's active memories, then restore it later. Stored memories can be included in QoL backups.
- Fixed My Personas sometimes moving back to the wrong place in the sidebar when the option to keep it under Chats is enabled.
- New options are disabled by default.

## 0.2.42
- Added more translation choices: on-device browser translation where supported, DeepL, LibreTranslate, and a manual Google Translate option. Automatic translation only uses a remote service when the user allows it.
- Added per-chat translation languages and an optional English-first OOC instruction.
- Added optional scene galleries for chat backgrounds. Save and switch between multiple images in a conversation, with gallery images included in local-media backups.
- Added muted words, named text-replacement presets, and separate replacement choices for each chat. These options only change what is displayed, not the saved messages.
- Added individual Enable/Disable shortcuts for Lorebook entries. These change the shared Lorebook entry, not just one chat.
- Improved the optional compact chat menu placement and fixed its enable setting on desktop browsers.
- Fixed the Save/Cancel controls getting pushed too far down when editing long messages on small screens.
- Fixed the OOC button disappearing while typing and kept its recovery behavior from forcing an automatic reload.
- Improved per-tab pause so paused tabs stop more QoL background work, while dedicated Bot Status and recommendation helpers can continue.
- Reduced unnecessary bot discovery and other chat work during pause. Improved how Copy, Edit, and OOC controls reappear after SpicyChat rebuilds them.
- Fixed a background startup error caused by a missing file in an earlier package.
- New options are disabled by default.

## 0.2.41
- Made Bot Status counts easier to understand by separating routinely monitored bots from bots outside the normal scan.
- Added an optional one-time check for bots outside the usual scan, while respecting the scan's time and bot limits.
- Long Bot Status scans now save progress regularly and can resume after a page reload.
- Added optional bot-avatar chat backgrounds, animated image support, and message-bubble opacity settings.
- Added folder organization and oldest/newest sorting to Favorites.
- Added three Lorebook filter choices: Has, confirmed None, and Unknown, so missing information is not treated as a definite No.

## 0.2.40
- Added the missing Ask Piper shortcut to Settings → Help.
- Added adjustable Bot Status scan limits, progress information, and time estimates.
- Fixed Bot Status counts so blocked, archived, and other out-of-scope bots don't make routine scans look unfinished.
- Bot Status routine scans now focus on tracked, unblocked bots. Other bots can still be checked manually.
- Added safer cleanup for stored Bot Status data, with a preview and confirmation before anything is removed.
- Made safety backups smaller and verified that they were saved correctly before allowing protected cleanup or imports. If that check fails, the action is cancelled.
- Added storage measurements that remain available after reopening Settings, including a breakdown of larger saved data and comparisons before and after cleanup.
- Improved storage cleanup so identical backup copies can be removed without losing different versions or recovery history. Manual backups, own creations, blocked lists, archive information, and recovery copies remain protected.

## 0.2.39
- Edit Chatbot links in chat menus now support normal Ctrl/Cmd-click, middle-click, and right-click options.
- Fixed repeating Lorebook editor errors when automatic keyword expansion is blocked.
- Reduced the space used by large saved-bot and Bot Status data, with an optional way to optimize older data.
- Fixed a chat-formatting loop that could cause repeated page changes and lag.
- Restored Copy / Export chat in the Mini Panel independently of chat header buttons.
- Added compressed backups for large files and selected-item or status-based backups for My Chatbots and Lorebooks, including bots Under Review.
- Added optional full Persona backups with text and avatar data.
- Added automatic personal-tag rules based on bot titles, greetings, and other available details.
- Reorganized Settings so related options are easier to find.
- Added optional Edit buttons and separate favorite-star controls for My Chatbots.
- Added an option to move My Personas back under Chats in the sidebar.
- Fixed Keep, Copy, and other message controls disappearing after SpicyChat updates a message toolbar.

## 0.2.38
- Kept Private chatbot and Lorebook editors out of automatic QoL content scans; Public/Unlisted editors and manual creator actions still work normally.
- Added optional Edit buttons to My Chatbot cards and made favorite-creator stars there a separate opt-in.

## 0.2.37
- Added early Rulebook support for eligible beta accounts, including Rulebook pages and editors. Other accounts are unaffected.
- Fixed collapsed Lorebook tags and keywords not expanding correctly.
- Fixed Lorebook backup problems and stopped bulk backups from opening many separate editor tabs.
- Fixed chat formatting occasionally changing the color of quoted or backtick dialogue.
- Kept the Lorebook keyword clear-all button aligned correctly when keywords wrap onto multiple lines.

## 0.2.36
- Added optional bulk backups for My Chatbots and Lorebooks, using current live information rather than old revision history.
- Added Edit shortcuts to owned Lorebooks, including normal Ctrl/Cmd-click and middle-click behavior.
- Added a first-time setup choice for Chatting, Creator, Both, or Start clean, without resetting existing users.
- Fixed incomplete bot and Lorebook backups, and preserved chatbot creation and update dates when available.
- Fixed collapsed tags on public Lorebooks.
- Moved My Creations backup controls above the bot and Lorebook cards.
- Reduced unnecessary background scanning on My Creations. Creation Audit only runs when requested.

## 0.2.35
- Added an optional feature to automatically block bots when their name or description matches a blocked word. Bots you manually unblock won't be immediately reblocked by the same rules.
- Fixed QoL controls sometimes stopping after the extension updates. Affected tabs can recover after a reload.
- Changed OOC recovery to attempt repairs first and suggest a manual reload if needed, instead of forcing one.
- Fixed support reports showing unavailable large-data counts as zero.

## 0.2.34
- Fixed Context Keeper's Keep buttons sometimes failing to return after message controls change.
- Improved support reports so unavailable measurements and missing comparison data are shown more clearly.
- Improved reading of decorative Unicode text and short Portuguese descriptions.
- Added safer cleanup of confirmed unavailable blocked bots. Their saved copies are removed only after Archive preservation is verified; the bots remain blocked.
- Added easier Download/Import JSON controls for private Lorebooks. Imports use SpicyChat's normal editor and skip entries with the same name by default.

## 0.2.33
- Fixed Context Keeper's Keep buttons disappearing when SpicyChat rebuilds message controls.
- Restored Auto-AFK as a separate inactivity timer for each tab, independent of PC Protection.
- Improved Auto-AFK defaults and support for older saved settings.
- Improved recovery after extension updates: active affected tabs can reload once, while inactive tabs wait until they're opened.
- Fixed some JSON/TXT backups not downloading correctly in certain browsers.
- Fixed OOC becoming stuck when SpicyChat temporarily disables its controls. It now repairs the button and only reloads if recovery is genuinely necessary.

## 0.2.32

- Improved compatibility with Dragon's SpicyChat Inspector, including more detailed performance and error reporting without including private chat text or account credentials.
- Reduced Inspector's impact during long recordings and kept compatibility with older Inspector versions.
- Fixed a rare issue where the chat message box collapsed into a thin line.
- Reduced unnecessary chat work during large conversations, message rendering, and model selection.
- Improved automatic large-chat protection so it reacts earlier when a conversation becomes heavy, but doesn't fold ordinary 40–50 message chats.
- Improved the folded-message controls so they don't cover the bot's name.
- Fixed the OOC button disappearing when the Image button is hidden.
- Improved the behavior of discarded tabs so recently visited tabs aren't immediately discarded again.
- Made Settings open faster by loading large saved-bot and recovery lists only when needed, in smaller pages.

## 0.2.31

- Fixed Saved Bot Copies, Recovery, and Deleted / Unavailable Saved Bots loading slowly or failing with large collections.
- Fixed missing bot pictures in Settings and made animated avatars play only on hover.
- Improved Lorebook Status & History with safer checks, recovery copies, and entry change history.
- Added local Archive exports for confirmed Public Lorebooks. Private and unconfirmed recovery information stays local.
- Added optional blocking of Public Lorebooks by words, tags, creators, or specific Lorebook IDs.
- Fixed empty spaces appearing when Public Lorebook cards are filtered.
- Improved backups and support information for Lorebooks and large recovery collections.
- Fixed Group creation sometimes being hidden by mistake.

## 0.2.30

- Fixed a background startup problem that could prevent QoL from loading in Chrome.
- Improved Bot Status Center history, duplicate handling, and recovery for previously deleted bots.
- Added checks for archived bots and automatic restoration of eligible saved lists when a bot becomes available again. Blocked bots stay blocked.
- Chat list imports now add discovered conversation bots to Bot Status history, without bringing back bots the user deliberately forgot.
- Reduced unnecessary warnings for bots that happen to share the same name.
- Made Less Like and Dislike-after-block independent options, with protection against duplicate ratings.
- Reduced chat lag by skipping unchanged messages and letting SpicyChat finish rendering before QoL processes them.
- Improved automatic protection for large chats, with a recommended starting point of 300 messages. QoL does not automatically reload a chat.
- Lowered the recommended number of awake SpicyChat tabs for PC Protection and avoided waking many tabs at once.
- Improved performance diagnostics for long chats and background tabs.

## 0.2.29

- Fixed Less Like / Stop recommending and improved the reliability of bulk feedback.
- Kept Quick Dislike separate from Less Like, while preventing duplicate ratings when both are running.
- Reduced slowdowns on creator pages, profiles, and editors by waiting for the page to finish loading before heavier QoL work begins.
- Animated bot pictures now play only when hovered, visible on screen, and the tab is active.
- Added an option to hide SpicyChat's feature-release popups without hiding the notification bell.
- Added chat Enter/Return behavior choices, including Enter to send or Enter for a new line.
- Improved storage performance for large saved-bot collections without uploading them to the cloud.
- Made Settings and saved-bot managers load faster by delaying large data until needed.
- Fixed a chat startup issue that could prevent Bot Archive updates.
- Improved how newer messages are handled so older messages and the Mini Panel don't slow down replies.
- Improved Bot Status and recovery cards for bots with the same name by showing creator details and bot IDs.
- Older performance baselines now request a new baseline before comparisons resume.

## 0.2.28

- Fixed page numbers disappearing from listing pagination after QoL updates the page.
- Animated bot pictures now play only on hover when reduced animation is enabled. Older animation preferences are carried over.
- Improved Random Chat on Home, Recommendations, and Favorites.
- Merging saved tab sessions now combines them into one copy and removes the originals after confirmation.
- Fixed Stop recommending sometimes staying stuck at 0/N while starting its helper.
- Improved Settings navigation so popup shortcuts reliably open the requested section.
- Added optional PC Protection to limit how many regular SpicyChat tabs remain loaded. Current, pinned, audible, and protected tabs stay awake.
- Added shorter Auto-AFK intervals of 15 and 30 minutes.
- Improved large-chat protection while keeping reloads under user control.
- Fixed missing message quick-action buttons and reduced Settings memory usage. Added a button to release temporary Settings data without deleting saved QoL information.
- Improved support reports for background tabs and performance problems.

## 0.2.27 hotfix
- Fixed Settings sometimes failing to open from the popup or SpicyChat sidebar.
- Fixed message Copy/Edit and other quick actions disappearing when SpicyChat changes the toolbar.
- Fixed OOC/composer shortcuts overlapping each other.
- Improved support reports so they finish or clearly stop instead of hanging indefinitely.
- Improved large-chat performance handling so QoL doesn't repeatedly switch performance modes.
- Reduced unnecessary message processing while replies are appearing.
- Kept page reloads under user control.

## 0.2.27
- Removed automatic page reloads during severe chat lag. QoL can switch to a stronger performance mode, but refreshing the page is your choice.
- Reduced extra QoL work while a chat first loads.
- Fixed lag from one conversation affecting the performance mode of the next.
- Kept Bot Status and other dedicated background helpers running when ordinary hidden tabs are paused.
- Improved long Bot Status scans so browser background throttling is less likely to interrupt them.

## 0.2.26
- Improved bot-name cleanup so saved bots are less likely to get generic or incorrect names.
- Added a limited history of bots discovered while browsing, which can also help Bot Status Center.
- Added an optional Less Like This action after blocking a bot, separate from Dislike-on-block.
- Improved automatic performance protection for very large chats.
- Made large lists in Settings and backups easier to browse with smaller pages.
- Added Account Sync choices for two-way, upload-only, download-only, or manual syncing, including which settings to sync.
- Improved Account Sync safeguards so a new device is less likely to overwrite existing settings.

## 0.2.25
- Improved Android compatibility: desktop-only features stay unavailable on Android without changing the settings saved for desktop.
- Added device-compatibility explanations in Settings and filters in the Features list, so users can see what works on their device.
- Added Account & Sync: create a QoL account, link devices with a temporary code, sync settings, pause syncing, and remove linked devices.
- Account and device credentials stay out of normal QoL backups.
- Settings sync now transfers changed options instead of resending everything, and can receive updates made on other linked devices.
- Enabled automatic stronger performance protection for very large chats by default for new users.
- Made the large-chat folded-message toolbar smaller.

## 0.2.24
- Fixed the optional stacked chat layout so messages and the input box line up correctly. Mobile keeps its compact layout.
- Settings now save automatically after changes. **Save now** is still available if you want to save immediately.
- Made saving Settings faster and safer, especially when many options are enabled.
- Feature-list categories now remember whether you left them open or collapsed, including after a backup restore.
- Improved large-chat performance by folding older messages out of view without deleting them, while keeping recent messages active.
- Added Show older / Show all / Fold old controls for viewing older messages.
- Added a manual Refresh chat performance action that safely preserves an unfinished draft when possible and won't reload during generation.
- Reduced unnecessary QoL work while SpicyChat is loading or generating replies.

## 0.2.23
- Improved Bot Status scans and reduced long pauses when saving scan results.
- Unavailable-bot cleanup now checks that recovery information was saved successfully before removing bots from active lists. If the check fails, nothing is removed.
- Cleanup preserves completed Less Like / Dislike feedback and creator history. Saved list memberships can be restored if a bot becomes available again.
- Fixed Bot Status Safe/Normal/Fast speed labels.
- Made bulk Less Like faster and more reliable on large jobs, including retrying temporary problems and resuming interrupted runs.
- Added clearer Less Like progress, time estimates, and final statistics.
- Fixed the Export button becoming too wide on public bot profiles.
- Fixed stacked chat messages not lining up in a centered column.
- Hid the Quick Panel on pages where none of its controls are available.

## 0.2.22
- Fixed recurring freezes when SpicyChat's Persona picker is open.
- Reduced unnecessary updates in the Persona Organizer.
- Fixed the optional stacked chat column being shifted to one side.
- Full bot descriptions can now be shown on cards without the text getting cut off.
- Clarified where chat background, bubble color, font, text-size, and spacing settings are located.
- Fixed Bot Status helpers sometimes repeatedly reloading and improved their reliability during long scans.
- Improved the Safe/Normal/Fast scan-speed settings.
- Fixed the changelog getting stuck on “Loading changelog...” in the Android app.
- Fixed very small message-edit boxes on Android without changing the separate mobile Send-button fix.

## 0.2.21
- Added optional anonymous contributions of saved public bot information to the SpicyChat Archive review queue. Chat history, personas, account information, personal lists, and settings are not submitted.
- Added direct Bot Status uploads to the SpicyChat Archive for users who have an import token.
- Archive uploads send only new or changed saved copies after the first upload, with an option to resend everything. Local copies aren't deleted after uploading.
- Archive import tokens are stored locally and are excluded from normal QoL backups.
- Added a Refresh stale bots option with age choices of 1, 7, 14, or 30 days and adjustable scan speeds.
- Made unavailable-bot detection more cautious: an empty result needs to be confirmed again before cleanup is allowed.
- Improved long Bot Status scan stability and reduced unnecessary progress updates.
- Added compressed `.json.gz` exports of saved Bot Status copies for the Archive, including safe public history while excluding private notes, folders, personal lists, and creator backups.
- Exported unavailable statuses are historical records; the Archive still has to verify current availability.

## 0.2.20
- Fixed Bot Status Center starting slowly or getting stuck on one bot.
- Improved bulk scans so they can continue through temporary connection problems without repeating large saves.
- Added Check unchecked bots for interrupted scans or newly discovered bots.
- Separated current bot statuses, saved copies, and confirmed unavailable-bot recovery.
- Fixed missing pictures and false update warnings in Saved Bots & Lists.
- Improved Load all chats with progress and a faster Refresh chats after the first full import; a full rescan remains available.
- Reduced clashes between Chat List imports, Less Like, and Bot Status running at once.
- Fixed duplicate matches changing previously checked bot statuses to Unknown.

## 0.2.19
- Added an optional stacked chat layout and fixed its missing Settings switch.
- Improved Stop recommending / Less Like with faster startup, clearer progress, and more reliable bulk processing.
- Skipped invalid and unavailable bots in Less Like and added cleanup for confirmed deleted bots in active lists.
- Improved Bot Status checks, saved bot details, and detection of unavailable or private bots.
- Added a Deleted / Unavailable Saved Bots recovery view with saved details and old chat links when available.
- Added Bot Recovery Assistant to the planned feature list; it wasn't available yet.
- Fixed expanded descriptions in My Creations and improved saved-bot record cleanup without deleting recovery copies.
- Added checks for missing Settings switches.

## 0.2.18
- Fixed Chat Export failing to load older messages in long chats because it couldn't access SpicyChat's authenticated history.
- Improved the error message when Chat Export can't access chat history, instead of repeatedly retrying the same failed request.

## 0.2.17
- Fixed Chat Export controls not appearing and exports stopping before older messages were included.
- Improved long-chat export progress, cancellation, and bot details. Confirmed working on a chat with over 600 messages.
- Added an optional Mini Panel counter for messages shown in the current chat.
- Added separate fonts for normal text, actions, and dialogue in AI and user messages.
- Added an optional way to expand cut-off bot names.
- Added a page-number box above chatbot listings.
- Improved mobile message editing and fixed an oversized Send-button area.
- Improved Quick Dislike helper reuse.

## 0.2.16
- Fixed Bot Organizer folders, notes, and buttons crowding bot titles and creator names.
- Fixed some bot names incorrectly showing the card description.
- Bot Organizer backups now include folders, including empty ones, and organizer settings.
- Fixed Listing Refill requesting more pages when there aren't any left.
- Fixed clipped bot creation dates and reduced repeated card updates.
- Added a page-number box so you can jump directly to a listing page, including high page numbers when available.
- Reduced unnecessary listing, card, and notification updates.
- Improved Listing Refill handling of blocked, duplicate, and mostly empty pages.

## 0.2.15
- Fixed bot names disappearing on Android/WebView when Bot Organizer was enabled.
- Cleaned up Support Information so it only shows the normal QoL version and correctly detects Android/WebView when the page runtime does not answer.

## 0.2.14
- Improved Quick Dislike so it waits until the user is inactive, continues reliably after restarts, and avoids duplicate ratings.
- Improved Listing Refill by reusing later pages when possible and handling filtered or duplicate-heavy pages more reliably.
- Added optional statistics showing what Listing Refill filtered out.
- Added drag-and-drop sorting for pinned Memories, with better scroll position handling.
- Added optional bot creation dates on cards and profiles.
- Improved Language Filter for cards with mixed languages.
- Fixed full descriptions still getting cut off on bot cards.
- Cleaned up Settings, backups, Help, and the feature guide.
- Reduced unnecessary listing, chat, Lorebook, and sidebar work.

## 0.2.13
- Improved Listing Refill so it checks filters and blocked bots before showing new cards, and continues to later pages when needed.
- Improved Language Filter for short or non-English titles and made blocked-word matching case-insensitive.
- Added `kitten` to the optional Creator Moderation Warnings list.
- Fixed Lorebook exports missing short entries and improved download reliability in Firefox and Opera.
- Added automatic detection of eligible SpicyChat beta features, including Public Lorebooks and Story Mode.
- Added Remove all and category choices to Context Keeper.
- Reduced unnecessary sidebar, Lorebook, and message-edit work.
- Cleaned up the main feature list.

## 0.2.11
- Added a setting for accounts with access to SpicyChat beta features.
- Added Windows build helpers for creating QoL extension packages.
- Added Remove all and category choices to Context Keeper.
- Improved Lorebook JSON exports to include complete details, entries, and keywords.
- Improved Listing Refill on changing pagination and heavily filtered pages.
- Added special discovery rules for favorite creators, while keeping explicit blocks in place.
- Added the **Hard no-control + formatting** OOC preset.
- Improved the option that keeps the message box usable while the AI replies.
- Made Chrome/Firefox packages smaller by excluding files users don't need.
- Improved bulk Dislike reliability and reduced unnecessary page work.

## 0.2.1
- Added Persona group sorting and filtering inside the in-chat Persona picker.
- Fixed the mobile model picker missing normal model options.
- Full-size bot pictures can still animate when regular animations are reduced.
- Added the ability to block a bot directly from the extension popup on its profile page.
- Improved Listing Refill when filters or tags change.
- Added Bot Version History with compare, rename, delete, and safe restore. Visibility and statistics changes no longer create unnecessary versions.
- Updated Help links and prepared the internal structure for future Lite/custom builds.
- Reduced unnecessary listing and message updates.

## 0.2.0
First v0.2 release after the long 0.1.x development/testing cycle.

### Chat & roleplay
- Added Context Keeper, Storydate/Internal Day Tracker, RP State Tracker, RP Format Repair, chat search/bookmarks, message tools, formatting helpers and better chat exports.
- Improved long-chat behavior and reduced repeated full-history work.

### Memory, Personas & Lorebooks
- Added bulk Memory tools, Memory export/import, Persona organization/backups and the Local Persona Library.
- Added Lorebook entry management, backups/history, multi-entry editing and Wiki/Web importing.

### Creator tools
- Added chatbot backups/history, Draft History, Save & Stay / Save & Chat, Creation Audit, My Creations tools and creator helpers.
- Backup restores fill the normal SpicyChat editor for review instead of silently saving/publishing.

### Discovery, saved bots & blocking
- Added Saved Bots Hub, Bot Organizer, Recently Seen, Favorite/Later/Opened tools, Smart Filters, language filtering, exact message counts and more listing controls.
- Blocking and dislike tools were expanded, with dislike-on-block kept opt-in.

### Performance, compatibility & backup
- Reduced repeated DOM/listing/chat work, especially on large pages and long chats.
- Added Firefox/Opera/Android/WebView compatibility fixes and optional Dragon's SpicyChat Diagnostic Extension support.
- Expanded backup/import, local data-health checks and support/performance reports.

## Older 0.1.x development history
The 0.1.x builds were rapid development/test builds before v0.2, so the old per-build wall of notes has been condensed here.

- Started with the basic QoL toggle, premium cleanup, opened-chat tracking, card hiding/blocking and early OOC/chat-list tools.
- Added Later/Favorites/creator favorites, saved-list managers, bot/card filters, language filtering and Listing Refill.
- Added Persona quick switching, Persona Manager/Local Persona Library and more mobile/Android support.
- Added Memory Manager, Context Keeper, Storydate, RP State Tracker and more chat tools.
- Added Bot Organizer, Saved Bots Hub, Bot Status Center, bot/profile backups and creator workflow tools.
- Added Lorebook tools, backups, entry management, exports and Wiki/Web import.
- Added chat search/bookmarks/export, message quick actions, formatting helpers, custom chat appearance and Soundscapes.
- Added Smart Filters, My Creations filters/audits, recommendation helpers and creator-follow tools.
- Added performance modes, route-aware scheduling, hidden-tab pausing and a large number of no-op/repeated-work reductions.
- Added Firefox/Opera compatibility work, safer package/download handling and AMO-safe DOM rendering.
- Added selective backup/import, recovery snapshots, data-health checks and support diagnostics.
- Added modular Full/Lite build preparation and the release/dev build tooling used by the current v0.2 branch.

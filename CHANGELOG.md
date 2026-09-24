## 0.2.15
- Fixed bot names disappearing on Android/WebView when Bot Organizer was enabled.
- Cleaned up Support Information so it only shows the normal QoL version and correctly detects Android/WebView when the page runtime does not answer.

## 0.2.14
- Quick Dislike now waits for normal SpicyChat inactivity. Using SpicyChat resets the timer, and an already-running dislike finishes before the queue waits again.
- Quick Dislike jobs now survive restarts better, avoid repeating completed ratings, retry temporary failures, and clean up leftover helper tabs.
- Listing Refill now keeps later pages cached for about 20 minutes and reuses unused cards from page 2, 3, 4, etc. before opening another helper page.
- Listing Refill also handles filtered/duplicate-only pages better, waits for SpicyChat/Typesense retries, and cleans up helpers when they are no longer needed.
- Added optional listing filter stats with a more detailed breakdown of what QoL filtered.
- Pinned Memory reorder now supports drag & drop, keeps the scroll position while moving entries, and is more patient with SpicyChat's pin/unpin updates.
- Added optional bot creation dates on cards and bot profiles.
- Improved Language Filter for mixed-language cards where the title and description do not match.
- Fixed expanded bot-card descriptions still being visually clipped.
- Cleaned up Settings, Data & Backup, Help and the feature guide.
- Reduced more repeated listing, chat-list, Lorebook, sidebar and Exact Message Count work found with Dragon's SpicyChat Diagnostic Extension.

## 0.2.13
- Reworked Listing Refill so cards are checked against blocks, tags, words, creators, language rules, native filters, Smart Filters and duplicates before they are inserted.
- Listing Refill now keeps walking later pages when a page has nothing usable instead of stopping early.
- Improved Language Filter for short/non-English titles and improved case-insensitive blocked-word matching.
- Added `kitten` to the optional Creator Moderation Warnings list.
- Fixed full Lorebook export missing short entries and made the hidden export helper more reliable.
- Improved Firefox/Opera file downloads for Lorebook exports, bot backups, chat exports, Memory exports and other QoL downloads.
- Added automatic SpicyChat beta/experimental capability detection for Public Lorebooks and Story Mode.
- Added safer route handling for beta Story Mode and public Lorebook pages.
- Context Keeper keeps the new Remove all control and lets manually added details choose a category.
- Reduced more repeated sidebar, Lorebook and message-edit work found with Dragon's SpicyChat Diagnostic Extension.
- `features.md` is now the normal feature list instead of another version history.

## 0.2.11
- Added a SpicyChat beta-access setting for accounts that already have access to beta features.
- Added one-click Windows build helpers and restored the Full modular build metadata used by release/dev builds.
- Context Keeper got Remove all and a category selector for manually added details.
- Lorebook JSON export now collects full Details + Entries data, including full keyword lists.
- Improved Listing Refill on moving pagination windows and duplicate/filtered pages.
- Added per-favorite-creator discovery overrides for Opened, Later, language and normal filter rules. Explicit blocks still win.
- Added the built-in **Hard no-control + formatting** OOC preset.
- Improved the option that keeps the message box usable while the AI is responding.
- Cleaned Chrome/Firefox packages so repo/build-only files are not shipped.
- Bulk Dislike now reuses one helper tab, retries temporary failures, and pauses while offline.
- Reduced repeated chat/list/editor work and other no-op updates found with Dragon's SpicyChat Diagnostic Extension.

## 0.2.1
- Added Persona group filtering/sorting inside the in-chat Persona picker.
- Fixed the compact mobile/WebView model picker losing normal model rows.
- Full-size bot images can animate even when normal animation reduction is enabled.
- The popup can block a bot directly from its `/chatbot/<id>` profile page.
- Improved Listing Refill protection against stale filters and native tag-filter changes.
- Added proper Bot Version History for creator-controlled chatbot changes, with compare, rename, delete and safe restore.
- Kept visibility/review/stats changes out of Bot Version History so they do not create junk versions.
- Updated Help/GitHub links and started the internal Lite/custom build structure.
- Reduced a few more repeated listing/message updates found with Dragon's SpicyChat Diagnostic Extension.

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

## 0.2.24
- Renamed the old version-scoped `content/qol23-ui-fixes.js` runtime file to the permanent `content/ui-layout-fixes.js` name and updated build metadata so future releases do not carry a stale 0.2.23 filename.
- Fixed stacked chat centering so the native composer bubble measures the current message lane and follows the same horizontal center/width instead of being pushed right by left-side composer controls; mobile keeps the native compact layout.
- Settings now autosave by default: toggles/selects save almost immediately, text and number fields debounce briefly, pending edits flush on blur/page close, and **Save now** remains as an explicit force-and-verify safety action.
- Live settings storage is now granular (`dsSettingV1:*`) instead of rewriting one large `settings` object for every option change. Normal autosave only serializes the setting(s) that changed; the full logical settings object is assembled only when existing backup/export/import/runtime code actually asks for it.
- Added a tiny last-batch safety record for autosave and kept the old monolithic settings object as a migration fallback rather than destructively deleting it during the v0.2.24 transition.
- Feature-catalogue collapsed categories are now a normal backed-up QoL preference using stable category IDs, so backup/export/import restores the layout and category label wording can change without losing the remembered state.
- Feature catalogue categories remember whether you left each group expanded or collapsed, save through the same granular autosave path, survive immediate Settings closes, and are preserved across search/filter/sort rerenders; new categories still default to expanded.
- Strengthened long-chat Performance Mode with safe DOM windowing: older message cards stay in SpicyChat's DOM but are folded out of layout/paint once a chat becomes large, while the newest 40-70 messages remain active depending on performance mode.
- Added a small large-chat performance bar with Show older / Show all / Fold old controls so hidden history can be revealed in chunks without deleting or rewriting any messages.
- Added a manual Refresh chat performance action that snapshots the current composer text to QoL-only session storage, reloads the chat, restores the draft only when the native composer is empty, and returns to the bottom. It refuses to refresh while a generation is still running.
- Long chats now give SpicyChat's native message render/streaming a 0.95-1.4 second quiet period before nonessential QoL message decorators resume, with the resume scheduled through requestIdleCallback when available.
- Windowed old messages are skipped by shared QoL message-enhancer scans, and visible older messages use stronger animation/transition/shadow/filter suppression while Performance Mode is active.
- QoL deliberately does not intercept, debounce, or rewrite SpicyChat's own chatDraft sessionStorage writes; the separate refresh snapshot is only a safety net for the explicit performance reload button.

## 0.2.23
- Reduced Bot Status stale-refresh finish stalls by persisting only touched availability/archive IDs through a service-worker merge, avoiding full-state re-normalization, skipping unchanged multi-megabyte archive rewrites, yielding between commits, and deferring heavy Saved-manager/storage-usage refreshes.
- Suppressed duplicate Options-page storage-change reprocessing for Bot Status commits so the same large state is not normalized and rerendered again immediately after it was saved.
- Unavailable-bot cleanup now writes and verifies a compact recovery ledger before removing active memberships; if recovery cannot be verified, cleanup is cancelled and no IDs are removed.
- Confirmed-unavailable cleanup no longer erases completed Less Like / Dislike history or creator seen-history. Unfinished bulk queues are cleaned, while historical evidence is preserved.
- Cleaned unavailable bots remain tracked through the recovery ledger even when no rich saved copy exists, and memberships are automatically restored if a later Bot Status check confirms the bot is available again.
- Fixed Bot Status scan-speed labels to match the actual 600/450/350 ms Safe/Normal/Fast pacing values.
- Kept bulk Stop recommending / Less Like on the validated dedicated API-only recommendation helper and made large jobs substantially faster without adding concurrency.
- Replaced fixed Less Like pacing with centralized adaptive serial pacing: 750 ms default start, gradual success-based step-down to 350 ms, and immediate slowdown/backoff on 429, 5xx, network, or timeout signals.
- Removed the apparent every-25-item stall by moving expensive full Less Like history compaction from every 25 successes to a 500-item / 5-minute checkpoint while retaining a crash-safe per-success journal.
- Added bounded retry/backoff for explicitly retryable Less Like failures while never retrying successful 2xx responses or ambiguous POST failures that may already have reached Recombee.
- Added durable bulk Less Like job checkpoints with job ID, queue position, totals, failures, pacing state, and resumable pending work; input IDs are deduplicated before execution.
- Throttled Less Like progress UI and availability/job-state persistence so multi-thousand-bot jobs do not rebuild or rewrite large state after every success.
- Added Less Like run statistics for attempted/succeeded/failed/retried/skipped/duplicates, elapsed time, ETA, current interval/state, recent median POST latency, 429/5xx counts, and queue position.
- Reused the already-ready recommendation worker during a bulk run instead of repeatedly revalidating the same helper before every bot.
- Fixed the public bot-profile Export button stretching across the whole profile column; it now stays a compact content-width control.
- Fixed stacked chat layout to use one centered shared message lane with matching user/AI card widths, matching the older Stylist-style behavior instead of only aligning one edge.
- Hid the Quick Panel entirely when the current route has no enabled/usable panel controls, so pages such as `/chats` no longer show an empty “SpicyChat QoL” shell.

## 0.2.22
- Fixed periodic freezes while SpicyChat's persona picker is open by putting QoL into a low-impact modal pass instead of repeatedly running the full chat runtime.
- Persona Organizer no longer re-appends already correctly ordered picker rows or rebuilds unchanged local folder/note metadata on every pass.
- Centered the optional stacked chat column inside SpicyChat's native message lane instead of leaving the stacked bubbles visually offset to the left.
- “Show full bot descriptions on cards” now removes the native line clamp completely instead of stopping at five lines, so the full description is readable without hover.
- Clarified the existing chat appearance controls: custom backgrounds, bubble/text colors, font families, global chat text size, and line spacing are already available under Appearance & Interface.
- Fixed the Bot Status helper reload loop caused by treating `?dsQolBotStatusWorker=1` as permanent worker identity after SpicyChat's Home router removed the query marker.
- Bot Status workers now keep durable background tab/session identity, send a 3-second heartbeat, tolerate the router URL rewrite, and only get replaced after an actual request/liveness timeout with restart backoff.
- Added a dedicated `worker:bot-status` runtime plan so Bot Status helpers skip normal listing/UI processing; exact-message-count and generation-metadata bridges are also skipped on worker bootstrap.
- Tuned serial Bot Status pacing to 600 ms Safe / 450 ms Normal / 350 ms Fast while retaining adaptive 429/5xx backoff.
- Expanded diagnostic module fingerprints to include Options, Bot Status worker management, runtime-plan and background-worker coordinator code so future Inspector captures can identify which worker code actually changed.
- Fixed the Changelog staying on “Loading changelog...” indefinitely in the Android app by using the native bundled-text bridge directly with bounded fallbacks.
- Reverted QoL's mobile message-edit textarea resizing so SpicyChat controls the editor height again, fixing edited messages collapsing into a tiny scrollable text box on Android.
- Kept the separate mobile send-button wrapper fix without changing message-editor sizing.

## 0.2.21
- Added opt-in anonymous Bot Status Center contributions to the public SpicyChat Archive review queue. Public submissions go to `/api/submissions/bot-status` and never use or expose the private archive-import token.
- Public Archive contributions send only saved bot snapshots plus a locally generated, one-way hashed random extension-install identifier for basic anti-spam/rate limiting; chats, personas, Favorites/Later membership, settings, account data, cookies, and SpicyChat login/session data are not included.
- Public contributions remember per-bot fingerprints locally, send all saved copies on the first submission, default to new/changed copies afterwards, and retain the latest pending submission ID/status for the Bot Status Center UI.
- Added direct Bot Status Center → SpicyChat Archive upload to `https://spicychat-archive-import.dragongraf.workers.dev/api/imports/bot-status`, with gzip, Bearer-token authentication, a Worker health test, a 60 MB safety limit, and automatic chunking for unusually large exports.
- Archive import tokens are stored only in extension local storage and are never included in QoL backup/export/import payloads.
- Archive upload remembers per-bot fingerprints, shows how many saved copies changed since the last upload, sends all copies on the first run, and defaults to new/changed copies afterwards; a full resend remains available and local Bot Status copies are never deleted after upload.
- Added Refresh stale bots with configurable 1/7/14/30-day age, plus Safe/Normal/Fast serial Bot Status scan pacing and automatic backoff on HTTP 429/5xx responses.
- HTTP-200 empty character objects are now unavailable candidates first and require a second independent empty-object result before becoming confirmed unavailable / cleanup-eligible.
- Bot Status helper identity is hardened across router URL changes/reloads, and worker/run lifecycle telemetry now records opens, ready/lost/restart state, item outcomes, and completion.
- Large Bot Status scans throttle Options-page progress repainting and avoid changing saved-copy timestamps when the bot snapshot itself did not change.
- Added a Bot Status Center → SpicyChat Archive export for saved bot copies as compressed `.json.gz`.
- The archive export uses a versioned schema, preserves snapshot timestamps and historical availability observations, and is designed for repeat/import-and-dedupe workflows by bot ID.
- Exported unavailable/private/404-style results are explicitly historical observations only; the archive importer must still verify current status and keep its own repeated-404 deletion rule authoritative.
- The export is conservative: it includes public/Bot Status snapshot fields and safe public revision history, but excludes manual creator/editor backups, local private notes, folder/tag organization, and other personal list metadata.
- Large exports stream records directly into gzip so thousands of rich saved copies do not require a second giant uncompressed JSON string in memory.

## 0.2.20
- Fixed Bot Status Center slow starts and scans getting stuck on a single bot.
- Bulk status scans now use one background SpicyChat Home helper, continue past temporary API/auth problems, and avoid repeated large saves during a scan.
- Added a Check unchecked bots option for finishing interrupted scans or checking newly discovered chats.
- Made tracked status results, saved bot copies, and confirmed deleted-bot recovery clearly separate.
- Improved Saved Bots & Lists performance and fixed missing bot pictures and false update notices caused by avatar/creator formatting differences.
- Chat List Load all now stays API-only, keeps visible progress while it runs, and no longer silently falls back to native Load More.
- After one complete chat import, Load all becomes an incremental Refresh chats that stops at already-known history; Full rescan remains available for repair.
- Added lightweight background-job coordination so chat imports, Less Like, and Bot Status do not send their API requests at the same instant.
- Reduced Stop recommending / Less Like per-bot storage churn, added detailed timing telemetry, and use a lighter /chats helper when a known-good Recombee token is already cached.
- Fixed Refresh duplicate matches changing already-checked bot statuses to Unknown.

## 0.2.19
- Added an optional stacked chat layout and fixed its missing Settings switch.
- Improved Stop recommending / Less Like with one background helper, faster startup, reliable bulk processing, clearer progress, and fewer retries.
- Less Like now skips invalid or unavailable bots and can clean confirmed deleted bots out of active saved lists.
- Improved Bot Status Center with faster bot availability checks, better saved names/descriptions, and safer deleted/private detection.
- Added a Deleted / Unavailable Saved Bots recovery view with saved bot details and old chat links when available.
- Added Bot Recovery Assistant to planned features for rebuilding deleted bots from saved data and old chats.
- Saved bot copies now refresh only when live bot data is still available.
- Added cleanup for broken saved bot records without deleting archived/recovery copies.
- Fixed expanded long descriptions in My Creations.
- Added an automatic check for missing Settings switches.

## 0.2.18
- Fixed API-only Chat Export authentication on long chats by keeping the MAIN-world auth bridge available for Chat Export and starting it early enough to capture SpicyChat's authenticated message-history request.
- Stopped Chat Export from blindly repeating the same unauthenticated 401 request and added a clearer auth-capture error.

## 0.2.17
- Fixed Chat Export:
  - Fixed Copy / Export controls not appearing where enabled.
  - Fixed older messages not automatically loading before export.
  - Fixed exports stopping early when SpicyChat took longer to load a history batch.
  - Improved long-chat capture, progress/cancelling and available bot info.
  - Exporting now pauses interfering QoL message tools while the chat history is loading.
  - Confirmed working on a 600+ message chat.
- Added an opt-in Mini Panel counter for messages currently shown in a chat.
- Added separate font choices for normal text, actions and dialogue in AI/user chat bubbles.
- Added an optional horizontal expander for cut-off bot names.
- Added an optional page-number box above chatbot listings.
- Improved mobile message editing and fixed the oversized mobile send-button wrapper.
- Improved Quick Dislike helper reuse.

## 0.2.16
- Fixed Bot Organizer folders/status/notes and its organize button crowding native card titles and creator names.
- Fixed Bot Organizer sometimes using the card description instead of the bot name.
- Bot Organizer backups now include folder definitions and its organizer settings, including empty folders.
- Fixed Listing Refill repeatedly opening later pages when the current listing has no next page.
- Fixed bot creation dates getting cut off on some cards and stopped the date layout fix from being reapplied to the same cards over and over.
- The `...` pagination control is now a page-number box. Type any page from 1 to 20,000 and press Enter.
- Added an estimated last-page shortcut when SpicyChat reports more results than its normal pagination shows.
- Reduced repeated card/listing work, notification state changes and profile-name rewrites found with the Diagnostic Extension.
- Listing Refill now rejects obvious blocked/duplicate cards before building them, spaces out page loads more, and pauses after repeated very low-yield pages until you scroll farther.
- Reduced more same-value button, grid and performance-class writes.

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

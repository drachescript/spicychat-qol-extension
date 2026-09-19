## 0.2.0

This is the first v0.2 release after the long 0.1.9.x testing cycle. The detailed test-build notes are still kept below.

### Chat & roleplay
- Added Context Keeper, Internal Day Tracker / Storydate, RP State Tracker, RP Format Repair, chat search/bookmarks, message tools, formatting helpers, and richer chat export options.
- Storydate and RP State are kept per conversation, and regenerated timeline messages no longer keep adding the same day transition again.
- Improved long-chat behavior by reducing repeated full-chat scans and doing less work while older messages are loading.

### Memory, Personas & Lorebooks
- Added Memory Manager tools for loading, selecting, copying, exporting, and importing memories through SpicyChat's normal Memory UI.
- Expanded Persona organization/backups and fixed several folder, startup, and narrow-layout issues.
- Added Lorebook entry management, backup/history tools, multi-entry editing, consistency helpers, and Wiki/Web import with pasted-text fallback.

### Creator tools
- Added chatbot backup/history tools, Draft History, Save & Stay / Save & Chat helpers, Creation Audit, My Creations filters, remembered image prompts, and the optional Creator Writing Assistant.
- Backup restores fill the normal editor for review instead of silently saving or publishing changes.
- Fixed creator-editor navigation/history issues, including Save & Stay returning to a bad route after a no-change save.

### Discovery, saved bots & blocking
- Added Saved Bots Hub, Bot Organizer, Recently Seen, Favorite/Later/Opened tools, Smart Filter presets, language include/exclude filtering, exact message counts, and more listing filters.
- Blocking/dislike controls are grouped together, and dislike-on-block is opt-in instead of happening automatically.
- Fixed Home Opened/Favorites/Later filters being hidden again by conflicting QoL hide rules.

### Performance & compatibility
- Fixed **Find a setting** collapsing again immediately after the first click while its search index was being prepared.
- Reduced repeated DOM rewrites and listing/chat rescans, including large My Creations pages and history loading in long chats.
- Added Opera-specific compatibility work and continued Firefox/Chromium compatibility fixes.
- Added optional compatibility markers for **Dragon's SpicyChat Diagnostic Extension** so performance captures can separate confirmed QoL work from native SpicyChat activity more reliably.

### Data & backup
- Expanded selective backup/import coverage and added safer restore/migration handling for newer backup schemas.
- Added data-health checks, storage summaries, support-report downloads, and performance baselines without copying chat text or private saved content into diagnostics.

## 0.1.9.129

- Reduced extra QoL work while older chat messages are loading, especially on long chats, and cut a few more unchanged chat-control rewrites.
- RP Format Repair now waits for large history batches to settle and catches up in smaller chunks instead of processing everything at once.
- Generation details and chat trackers now reuse/scoped loaded-message data to avoid repeated full-chat scans where possible.
- Improved compatibility with **Dragon's SpicyChat Diagnostic Extension** so QoL version/build markers can recover instead of sometimes staying `unknown`.

## 0.1.9.128

- Fixed **Save & Stay** being able to send you back to a bad/404 editor route after SpicyChat reported **No changes detected** and you used Back.
- Save & Stay now clears finished in-place save actions instead of treating a later Back navigation as part of the save.
- Updated the creator save helpers to use SpicyChat's current chatbot editor route and replace temporary post-save redirects instead of adding another history entry.
- Applied the same stale-save cleanup to **Save & Chat** when SpicyChat finishes the save without leaving the editor.

## 0.1.9.127

- Fixed Internal Day Tracker and RP State Tracker data carrying over into another chat with the same bot. Tracker state is now kept with the actual conversation, with a one-time handoff for older saved tracker data.
- Fixed the Wiki / Web Lorebook Importer failing with `unique is not defined` after fetching a page. Fetch errors now also make it clearer whether the site blocked access or QoL could not parse the page.
- Reduced a few more repeated editor/UI writes found by **Dragon's SpicyChat Diagnostic Extension**, including History labels and reduced-motion state.
- Stopped automatic bot-backup revisions from being created by read-only editor rerenders. Manual backups still work normally.

## 0.1.9.126

- Reduced more repeated chat UI rewrites found by **Dragon's SpicyChat Diagnostic Extension**, especially message quick actions, title-bar helpers, composer state, and hide/show cleanup.
- Improved compatibility with **Dragon's SpicyChat Diagnostic Extension** so QoL presence/version/build information can be picked up more reliably during long captures or after the Inspector is cleared.
- Memory import now gives brand-new chats a clearer setup path instead of failing with an unclear Add Memory error when SpicyChat has not finished creating the conversation yet.
- Cleaned up a few Settings/help descriptions so they explain what a tool does before getting into the technical details.

## 0.1.9.125

- Made Creation Audit counts clearer so cards say how many things need checking instead of showing a bare number.
- Reduced repeated no-op QoL DOM writes found by **Dragon's SpicyChat Diagnostic Extension**, especially ownership markers, creator-favorite controls, chat-tag buttons, listing paint markers, and card-description state.
- Improved diagnostic attribution counters so repeated already-correct QoL ownership state can be distinguished from real DOM changes.

## 0.1.9.124

- Fixed Persona notes/folder controls being able to shift or break the Persona card layout when SpicyChat's native menu was opened before QoL finished loading.
- Persona notes now stay inside the card details area and are kept compact so the native three-dot menu remains easy to use.
- Made the native Favorite heart easier to see and tap on narrow Saved Bots layouts.
- Improved Saved Bots Hub/organizer layout on narrow screens so local folders, tags, notes, and controls wrap more cleanly instead of crowding bot info.

## 0.1.9.123

- Added compatibility with **Dragon's SpicyChat Diagnostic Extension** so diagnostic captures can identify confirmed QoL operations instead of guessing from nearby page activity.
- QoL can now provide the diagnostic extension with its version/build state, page-session marker, aggregate scheduler/observer counters, and sanitized operation/network markers when the diagnostic extension asks for them.
- Added QoL ownership markers to diagnostic-relevant controls and request correlation for card-token/profile checks without changing SpicyChat's own requests.
- QoL support reports now show whether Dragon's SpicyChat Diagnostic Extension is paired with the current page.

## 0.1.9.122

- Fixed Persona folder dropdowns closing themselves as soon as they were opened.
- Fixed Internal Day Tracker counting the same next-day transition again when a bot response is regenerated. Regenerated turns now replace/re-evaluate their existing timeline event instead.
- Improved Storydate time-of-day detection for explicit morning, afternoon, evening and night scene details without automatically adding another day.
- Improved compatibility with **Dragon's SpicyChat Diagnostic Extension** by reducing repeated no-op QoL DOM rewrites and ignoring mutations made directly to QoL-owned controls.

## 0.1.9.121

- Fixed Memory JSON imports failing on the current SpicyChat Memory Manager in Chrome.
- Memory import now recognizes SpicyChat's current Add field and Add New Memory menu instead of relying on one old button layout.
- Improved Memory Manager compatibility with SpicyChat UI changes and made imports wait for each new memory before continuing.
- Improved Load all/export/import when SpicyChat refreshes the Memories manager while it is working.

## 0.1.9.120

- Added download buttons for diagnostic info, performance reports, performance self-checks, and the full support report.
- Full support reports now include the performance self-check together with diagnostics, performance, data health, and the saved baseline comparison.
- Added timestamps to support reports and made card-token failures clearer in performance reports.

## 0.1.9.119

- Moved bot blocking, bulk blocking, Quick Dislike, and the Blocked Bots manager together in Settings.
- **Dislike after blocking** is now opt-in. Existing installs have it turned off once after updating so it only runs again if you enable it yourself.
- Bulk Dislike now pauses after several helper failures in a row instead of continuing through the remaining bots.
- Reduced unnecessary QoL work in chats by ignoring composer-only updates and QoL-owned UI changes that were mixed into normal page updates.
- Stopped card token checks from repeatedly retrying character API requests when no usable SpicyChat authentication is available; they fall back to the profile instead.

## 0.1.9.118

- Reduced repeated work on large **My Creations** pages, especially while Load More is adding cards.
- Fixed the large-list paint guard not actually running on listing pages.
- Reduced repeated Opened-history work when the current chat was already recorded.
- Throttled repeated My Creations filter/audit refreshes during heavy page updates.

## 0.1.9.117

- Added **Memory JSON export/import**. Export all or selected memories, preview an import, choose what to bring into another chat, and skip exact duplicates by default.
- Added an optional **multi-entry Lorebook workspace** so several selected entries can stay open and editable at the same time.
- Fixed **My Creations Load More** compatibility. Manual Load More is left alone, and optional auto-load waits instead of competing with a manual click.
- **Creator wording warnings now stay off until you enable them yourself**, including when using the Creator setup preset. Balanced and All reported terms modes, ignored terms, and custom local terms remain available.
- Improved large bot-list performance by letting supported browsers skip painting off-screen cards in heavier performance modes.
- Fixed Home **Opened / Favorites / Later** Smart Filters showing no cards when another QoL setting was also hiding those same saved bots.

## 0.1.9.116

- Added an **Opera compatibility pass** and Opera detection to diagnostics.
- Fixed creator/editor buttons sometimes appearing in the sidebar or staying behind after moving to another SpicyChat page.
- Fixed the Lorebook listing toolbar staying visible after leaving a bot listing.
- Fixed the Home page being pushed out of place by the Lorebook toolbar. Home now keeps the Lorebook filter inside SpicyChat's normal filter sidebar instead.
- Improved card token checks on Opera so failed background requests are skipped when they cannot authenticate.
- Card token info now shows **Greeting only** when a bot does not expose its full definition, instead of leaving Personality, Scenario, or Examples stuck loading/unavailable.
- Fixed card token counts briefly appearing correctly and then changing back to **Token info: loading…**.
- Improved **Creator Writing Assistant** browser AI handling with availability checks, clearer status messages, cancel/retry support, and a timeout instead of waiting forever.

## 0.1.9.115

- Added optional **RP State Tracker**, based on jumjam's suggestion.
- Tracks changing RP details such as inventory, worn items, location, injuries, stats, currency, party members, and objectives separately from long-term memory.
- Clear state lines can update automatically, while Assisted mode can suggest simple changes for you to approve.
- State changes use the current Storydate when Internal Day Tracker is enabled.
- The current state can be sent to the bot manually, only when it changes, or with every message.
- Added RP State Tracker to the QoL quick panel and normal backup/import.
- Fixed **Open Edit Lorebook on the Entries tab by default** repeatedly forcing the Entries tab. It now opens Entries once when you enter the Lorebook editor, then lets you switch tabs normally.
- Improved chatbot editor performance by avoiding repeated backup-restore storage checks and loading Draft History in the background.
- Improved **Context Keeper** automatic capture and added Light / Recommended / Detailed setup buttons. Settings now explain that locally saved details do not use chat tokens until a recap is inserted, and the manager shows an approximate recap token count.
- Fixed **Saved Bots Hub** showing local folder/organizer records as if they were bots. Searching for a folder or personal tag now shows the actual bots that match it, and bulk actions only apply to selected bot cards.
- Improved performance diagnostics: repeated failed card-token bridge requests now cool down instead of waiting again and again, baseline comparisons use matching page types/time windows, long-task reports show whether a QoL step overlapped the stall, and slow Settings storage reads show which data was requested.
- Known issue: Home Smart Filter can still show no matches for **Opened / Favorites / Later** on some listings. The extra identity diagnostics remain available while this is being fixed.

## 0.1.9.114

- Finished the **chatbot Backup Manager**.
- Automatic backups now turn on by default when Backup Manager is enabled.
- Keeps **10 automatic backups per bot by default**, with a configurable limit from **1–50**.
- Manual backups are kept separately and are not removed by automatic cleanup.
- Fixed manual backups sometimes disappearing after later saves.
- Fixed custom automatic backup limits above 10 not being kept correctly.
- Restoring a backup now makes a safety backup first, then fills the supported chatbot fields for review without saving automatically.
- Restore supports normal chatbot fields, tags, and visibility where available.
- Added optional **bot profile backups** to Backup Manager when profile backup is enabled.
- Added a **Bot profiles only** filter in Backup Manager.
- Chatbot backups do **not** include Lorebook associations.
- General cleanup and stability fixes while preparing for v0.2.

## 0.1.9.113

- Fixed **Exact bot message counts** staying blank or showing rounded values on some pages.
- Added a direct fallback to SpicyChat's public bot data when the normal count cannot be picked up from the page.
- Exact counts now use normal comma formatting, for example `142,402`.

## 0.1.9.112

- Added optional **Exact bot message counts** on bot listings and My Creations.
- Added optional **Internal Day Tracker / Storydate**, based on Chibs' suggestion for keeping track of long-RP timelines.
- Storydate can track numbered days, time-of-day phases, manual changes, and clear timeline markers such as `Day 35:`.
- Added Storydate support to **Context Keeper** so saved continuity can include the current story day/time.
- Added **Show only / Hide selected** modes to Language Filter, based on SeregaKR's suggestion.
- Improved QoL backup restore so newer backups can still import the parts the current version understands.
- Added clearer Smart Filter diagnostics when saved lists show no matches.

## 0.1.9.111

- Fixed chatbot JSON tag export. The exporter previously passed the tag-cleaning helper directly to `Array.map`, causing the array index to be mistaken for a max-length argument and producing shortened tags such as `S`, `Fe`, `Mal`, and `Romanti`. Full SpicyChat tag names are now preserved.
- Added **Import bot JSON** to the QoL chatbot backup strip on `/chatbot/create`. It restores supported bot fields, visibility and saved tags through SpicyChat's native form/tag picker, while intentionally ignoring Lorebook data so bot restores do not trigger the native Lorebook-import failure.
- Removed the creator-consent/allowlist gate added in 110. Follow creator remains a local user opt-in, and new-bot checks use only public creator listings/public bots.
- Creation Audit now shows where a check was verified from and includes that verification source in Markdown/CSV reports. The editable Crimson Licker POV form confirms the current owner-editor field/tag structure used by the verifier.
- Kept the 110 Under Review backup exclusion and Android/WebView Opened/Later identity hardening unchanged while awaiting another APK test.

## 0.1.9.110

- Hardened Smart Filter **Opened**, **Later**, and Favorite matching for Android/WebView listings by reading chatbot identity from alternate links/data attributes and, when necessary, using conservative exact local metadata matching. This targets APK reports where both Opened and Later showed `0/x loaded match` despite known saved bots.
- Added comma-separated **multi-term search** to Saved Bots Hub and the Favorite/Later/Blocked/followed-creator managers. Every entered term must match somewhere in the same saved item.
- Added clear bulk-sorter notes that selections intentionally stay active after Apply until **Clear selection** is used.
- Chatbot backups now treat SpicyChat moderation banners such as **Under Review** as transient state: review status is excluded from backup/export payloads and cannot create a revision by itself, while real read-only editor fields can still be backed up.
- Creator Following now respects a project-managed **creator consent allowlist** shared by the page UI, Settings, and background watcher. Only opted-in creators can be newly followed or scanned for new-bot alerts; old local follows remain removable but their alerts stay paused until consent is approved.
- Added an extension-side safeguard so QoL cleanup cannot leave SpicyChat's native navigation menu toggle hidden by a QoL-owned hide marker. Android-wrapper navigation behavior remains separate.

## 0.1.9.109

- Moved **Select bots** to the listing-header area by default (between Search and SpicyChat's NSFW/sort controls); an optional placement setting keeps it below Narrow by Group Size instead.
- Added opt-in **RP context-full warnings**: QoL can warn before older roleplay messages start falling out of the model context, using SpicyChat-exposed prompt/context usage when available and a conservative local token estimate otherwise. The warning threshold is configurable, the context limit can be overridden manually when auto-detection is unavailable, and optional browser notifications reuse the existing optional Notifications permission.
- Expanded **Language Filter** with local auto-detection for untagged bots. QoL now recognizes several common Latin-script languages in addition to script-based detection, can gradually check public Greeting + Description text for ambiguous untagged cards, caches only the detected language (not the source text), and can optionally show a local detected-language badge. It never edits the creator's real SpicyChat tags.
- Added **bulk organizing for all locally known bots** in Saved Bots Hub: multi-select the shown or entire filtered result set, then add/remove folders, add/remove personal tags, or copy profile links without first putting every bot into Later.
- Fixed Smart Filter **Opened** returning counts such as `0/48 loaded match` while showing no cards: `/chatbot/<id>` listing links are now resolved as bot IDs instead of being treated as missing chat IDs.
- Fixed narrow/mobile **My Creations** QoL controls pushing the page horizontally off-screen; Smart Filters, Creation Audit controls, chips and menus now wrap/stay inside the viewport.
- Improved **Creation Audit for your own bots** by reusing positively captured editor fields and existing local bot-backup/archive fields when SpicyChat's public profile/API data is sparse. Unverified fields still remain distinct from genuinely missing fields.
- Added opt-in **Remember chatbot image prompt**: image-generation prompts are stored locally per chatbot and restored after refresh/revisit when SpicyChat leaves the prompt field empty.
- Clarified the existing **Has Lorebook** listing/search filter so users can explicitly limit normal bot searches to cards with attached Lorebooks.

## 0.1.9.108

- Added **Chat folders & bulk organizing** on `/chat` and `/chats`: create/rename/delete QoL-local conversation folders, filter the chat list by folder/Unfoldered, enter **Select chats** mode, select visible conversations, and add/remove several chats from a folder at once.
- Chat-folder assignments are stored per exact conversation path, so multiple saved conversations for the same bot remain separate instead of collapsing onto the bot ID.
- Added Chat organization to normal QoL backup/import, cleanup/storage accounting, diagnostics, Settings, and the feature catalogue.
- Kept the Android-wrapper-only floating settings button out of this browser-extension patch; 108 only changes extension-side UI/data.

## 0.1.9.107

- Extended **Select bots / bulk blocking** to creator pages (`/creator/<handle>`) in addition to Home and Recommendations.
- Hardened **Creation Audit** so fields SpicyChat did not expose are reported as **Could not verify** instead of false **Missing core** results; on My Creations it can also verify fields from the signed-in owner editor before calling a field genuinely missing. Core now explicitly means Greeting + Description + Personality.
- Fixed the Lorebook **Back** navigation loop caused by the optional auto-open Entries helper re-triggering during browser Back/Forward history.
- Made the Bot Organizer popup mobile-safe: its contents scroll internally and the Save/Clear footer stays reachable above mobile/browser wrapper controls.
- Hardened Smart Filter **Opened** so stale opened-card hide state is cleared before matching.
- Soundscape chat popup can now be dismissed with the music button, a visible ×, outside tap/click, or Escape.
- Saved-list / favorite-history profile and chat links now use the current SpicyChat tab instead of forcing a new external browser tab.
- Added chat width measurements and opened-history persistence counters to diagnostics for Firefox/Android layout reports.
- Performance: blocked-name checks now use a pre-normalized Set, opened-history storage changes no longer trigger a full blocked/opened sweep, and marking the current chat opened no longer waits synchronously for a large history write. This specifically targets large local histories with thousands of opened/blocked bots.
- Added a **🐛 Bug Hunter** tester credit for Lilith Rose.

## 0.1.9.106

- Fixed a mobile chat-width regression where the QoL title-action host could be forced to `58vw`; only the title/profile link is now constrained, so the actual chat column can keep the full SpicyChat width.
- Added refill-card duplicate cleanup that always prefers SpicyChat's native React card when the same bot later appears natively; duplicate temporary refill cards (including cases like Eva Mills) are removed automatically.
- Reduced large-listing main-thread churn: non-card listing mutations no longer wake the critical card-filter lane, higher performance modes coalesce listing mutation bursts more strongly, and repeated full-page banner/sidebar/card-decoration scans are throttled.
- Hidden tabs now pause queued card-token profile requests and background listing auto-fill work when Hidden-tab pause is enabled, reducing cross-tab CPU/network pressure when many SpicyChat tabs are open.
- Reduced duplicate per-card matching work inside card hiding and added **Listing workload guard** counters to the performance report for future diagnosis.

## 0.1.9.105

- Fixed Android/WebView **What's new** and creator-backup **History** navigation so QoL opens its own Settings destination instead of resolving `options.html` as a SpicyChat URL and landing on a 404/restricted editor page. The same safe Settings handoff is now shared by the Quick Panel, Command Palette, Lorebook history, and reply-instruction Settings shortcut.
- Fixed **Creation Audit** false negatives after SpicyChat profile/API shape changes: audit checks now merge sparse character-API data with profile HTML when needed, use a defensive nested-field fallback, and stop treating unavailable tag/profile data as proof that fields are empty.
- Fixed Creation Audit visibility detection so hidden Public/Unlisted/Private menu choices cannot override the card's currently visible visibility badge.
- Clarified Creation Audit's local workflow dropdown as **QA: ...** because Needs work / Testing / Finished is a separate local status and does not override the field audit; the audit now says **core fields missing** when Greeting, Description, or Personality is genuinely not detected.
- Fixed **Lorebook entry draft protection** so drafts are keyed per actual entry instead of only by entry name, while separate unsaved new-entry drafts no longer overwrite or impersonate each other.
- New-entry recovery now labels an older unfinished draft as a **previous unsaved new-entry draft** and lets you restore it, discard it, or start a separate entry; already-saved entries are ignored as stale recovery candidates.
- Fixed Help/project links to use the actual `spicychat-qol-extention` GitHub repository and replaced the old Discord feedback-thread destination with the QoL Discord server.
- Added a Help-tab **Simple feature guide (ELI5)** that explains common QoL features in plain language.
- Stabilized Bot Organizer folder/context buttons and open menus across chat/profile/listing React remounts; fixed a scheduler cleanup path that could remove the context button immediately after it was injected.
- Added immediate chat-header self-repair when SpicyChat removes/recreates the native header, with a new diagnostic counter for repair requests.
- Improved compact chat headers so the character/profile remains reachable even when the title is truncated and action buttons are crowded.
- Fixed Smart Filter **Opened** being cancelled out by the general hide-opened-bots preference and clarified that Smart Filter counts refer to currently loaded cards.
- Prepared 0.1.9.105 as the Chrome/Firefox store-candidate hardening build.

## 0.1.9.104

- Fixed **chatbot backup controls** not appearing on `/chatbot/edit/<id>` when automatic backups were off. The editor tools now have their own enable switch, separate from automatic revision saving.
- Split both chatbot and Lorebook backups into **manual controls** vs **automatic saves**: enable the compact Save / Export / History controls, then independently choose whether edits are backed up automatically.
- Made the chatbot/Lorebook backup strip much smaller and stopped Lorebook backup controls from falling back outside SpicyChat's React root while the editor is still mounting.
- Reworked the **Lorebook Entry Manager** bulk toolbar into one compact collapsed **Bulk actions** menu.
- Added individual settings for the entry selection checkbox, token count, hidden-keyword count, no-keyword warning, character-count warning, Rename, Copy, Duplicate, and every bulk action.

## 0.1.9.103

- Added opt-in **new bot notifications for followed creators**, using SpicyChat's Latest creator listing with a first-scan baseline so existing bots do not alert.
- Added configurable check intervals, browser notifications, optional Discord webhook alerts, manual Check now, recent detections, Bot Status Center status, and Saved Bots Hub integration.
- Added Follow / Following controls directly on creator-profile headings.

## 0.1.9.102

- Added an optional **Creator Writing Assistant** for spelling/grammar/phrasing review, whole-card consistency checks, protected `{{user}}`/`{{char}}` handling, and browser-provided on-device AI rewriting/translation when available.
- Expanded creator workflow with local **Needs work / Testing / Finished** QA statuses on Creation Audit cards.
- Added **bot/profile export** for the fields SpicyChat actually exposes, with JSON, Markdown, and standalone HTML formats.
- Added a QoL-local **Saved Lists organizer** for Favorite history + Later, plus local tag aliases/emoji mappings that can also feed recommendation preferences.
- Expanded **Recommendation helpers** with Later/Not Interested exclusion, preferred/avoided tags, favorite-creator boosts, and optional reason badges.
- Added optional **native rating shortcuts** for Dislike / Like / Double-like that use SpicyChat's visible Rate Chatbot dialog and Done button.
- Added an opt-in **personal usage summary** that reads existing local QoL list/backup counts without starting new activity or chat-text tracking.

## 0.1.9.101

- Improved **Soundscapes** so scene/layer names, audio choices, volume, loop and other edits are verified when saved, and added a direct chat Soundscape control so playback does not depend on the Mini Panel.
- Added optional **Global Memory / Baseline Notes** that can add the same user-written guidance to chats once per session, every turn, or manually.
- Added optional **Lorebook response consistency** that can notice new Lorebook keywords introduced by an AI reply, show matching locally backed-up entries, and carry those creator-defined details into the next turn.
- Made **Find a setting** compact/collapsible by default and deferred its full search index until it is opened, reducing Settings clutter and startup work especially on mobile.
- Improved support reports so they try other open SpicyChat tabs for live diagnostics and clearly mark runtime data unavailable instead of presenting unreachable runtime counters as zero activity.
- Removed QoL's duplicate **character/card importer** now that SpicyChat provides native character import.

## 0.1.9.100

- Added **Merge all snapshots** and duplicate cleanup to the Tab Session Library. Merging keeps the original snapshots and combines unique exact conversation URLs into one new recovery snapshot.
- Fixed Lorebook Entry Manager rows and text expanders repeatedly re-inserting around each other, which caused token/keyword information to visibly twitch every few seconds.
- Improved **Lorebook backups** so manual backup controls are available on Lorebook editors even when automatic backups are off, and complete entry data is captured before SpicyChat closes an entry after Update.
- Changed newer standalone Lorebook helpers and update toasts to **opt-in defaults**; recommended child settings can still keep their own defaults and Creator presets can enable the related tools explicitly.
- Marked **Expand collapsed Lorebook tag lists** as currently unavailable instead of presenting a setting that cannot reliably recover SpicyChat's hidden tag/keyword data.

## 0.1.9.99

- Reworked the QoL runtime into separable **Core, Interface, Chat, Chat List, Listings, Creator, Lorebook, Profiles, and Personas** bundles so future website-generated Lite builds can omit whole feature groups instead of only disabling them.
- Added build-profile/runtime-kernel support and diagnostics for the new bundle architecture, while keeping the normal full build behavior unchanged.
- Fixed **Remember selection → Prepare SpicyChat Memory** failing on newer Memory/chat-menu layouts by handling menu-based Memory access, icon-only Add Memory buttons, and newer textbox/editor variants while keeping the copy fallback.

## 0.1.9.98

- Reduced background work by making QoL scheduling **route-aware**, so chat, listing, creator, Lorebook, and persona-only work is skipped before unrelated page checks run.
- Added a shared **page-state cache** so QoL features reuse the same route and stable page information instead of repeatedly rediscovering it.
- Batched nearby local-storage saves into fewer browser writes while preserving safe read-after-write behavior.
- Reduced **Mini Panel** work further by skipping unchanged panel-state refreshes and avoiding repeated identical text/attribute updates.

## 0.1.9.97

- Added a **QoL Command Palette** with fuzzy search, pinned/recent actions, and quick access to common QoL tools plus locally known Favorite/Later bots, Lorebooks, and Personas.
- Added a **Control Center** for creator status, bot ↔ Lorebook relationships, read-only data-health checks, per-dataset storage size, a safe migration dry-run, performance baselines, and fuller one-click support checks.
- Expanded **Creation Audit** with advisory checks for user actions written into Greetings, named context mainly explained in Scenario, repeated profile text, rule/worldbuilding blocks in Example Dialogue, and vague intelligence traits.
- Chatbot backup revisions can now be **compared with the latest copy**, and selected writing fields can be queued back into SpicyChat's normal editor for review before saving.
- The extension popup now shows **page-aware shortcuts** for chats, chatbot editors, Lorebooks, chat lists, and discovery pages.
- Reduced repeated **Mini Panel** work by coalescing rapid refresh requests while keeping forced layout changes immediate.
- **Copy all support info** can now include a read-only local data-health summary and performance-baseline comparison without including chat text or private saved content.

## 0.1.9.96

- Overhauled **Lorebook editing**: Edit Lorebook can open straight on Entries, entry sorting defaults to Name and remembers your choice, and attached Lorebooks get quicker edit shortcuts from chatbot editors/chats when QoL can resolve the attachment.
- Added **Lorebook entry draft protection** with local autosave status, accidental outside-click/Escape protection, and a restore/discard choice when a newer local draft exists.
- Added a **Lorebook Entry Manager** with selection, full-entry analysis, approximate token/size warnings, no-keyword/duplicate-keyword hints, rename, copy/export, duplicate, keyword add/remove, delete, find-by-keyword, and enable/disable when SpicyChat exposes that control.
- Expanded the **Wiki / Web Lorebook Importer** with MediaWiki/Fandom aliases and redirects, category-member selection, pasted Markdown support, stronger junk cleanup with a removed-content preview, safer ~2,000-character entry splitting, duplicate Skip/Replace/Merge/Duplicate policies, retryable failed entries, and source-update checks for previously imported pages.

## 0.1.9.95

- Added **Accessibility & text size** controls for larger QoL/Settings UI, larger chat message text, and more comfortable chat line spacing.
- Reduced chat-page overhead by keeping non-text and unchanged-text message mutations out of the text cache, coalescing duplicate message-lane scheduling, and skipping unchanged Mini Panel layout work.
- Fixed repeated **Formatting Toolbar** placement errors that could spam the runtime log.
- Reduced expensive background checks from draft protection and the tag-template button when they are not relevant to the current page.

## 0.1.9.94

- Added the **Wiki / Web Lorebook Importer** for Lorebook Entries pages. It can turn Fandom, MediaWiki-style, and generic wiki/article pages into editable Lorebook-entry previews, suggest keywords, split by page/section, and remove common wiki clutter before anything is added.
- Added selective linked-page importing for building a Lorebook from several pages on the same wiki, plus a pasted text/HTML fallback for sites that block direct fetching. Wiki access is optional and requested only for the site being imported.
- Wiki imports use SpicyChat's normal **Add Entry** form one entry at a time and keep the source URL/page/section/import date in local QoL metadata so imported entries retain their origin.

## 0.1.9.93

- Expanded compact Settings with **pinned sections**, **recent sections**, **Show enabled only**, and **Reset this section** so frequently used controls are easier to get back to.
- Added a **Backup manager** for your own chatbot and Lorebook backups with search, latest-export, chatbot revision history, delete controls, last-backup times, and stale-backup notices when automatic backup is enabled.
- Chatbot and Lorebook edit pages now show backup status even when automatic backups are off, including the last local backup and quick **Save / Export / History** actions. Manual backup remains available on read-only/Under Review edit pages.
- Improved import failures so a failed safety-copy step clearly stops before changing anything and offers **Retry** or **Download current selected data** instead of only showing a storage error.
- Fixed blocking large bot lists feeling delayed: the card now hides immediately while the Blocked list finishes saving in the background, and is restored if that save fails.
- Fixed Favorite controls on Listing Refill cards opening a temporary browser tab and taking seconds to respond. Filled-card Favorite/Unfavorite now updates immediately and syncs through a hidden helper page instead; removing a favorite works too.
- Tightened saved-conversation quick-action layout so the action row wraps cleanly at narrow widths without crowding SpicyChat's age/message metadata.

## 0.1.9.92

- Added collapsible Settings sections. Each section title now opens/closes its options, and **Collapse Settings sections by default** can make Settings start compact instead of showing every option at once. Search and feature shortcuts still open the section they jump to.
- Fixed backup imports sometimes stopping with **Browser storage could not verify the recovery snapshot**. Import recovery now saves only the data the selected import can actually change instead of copying every local QoL data set first.
- Restored **Blocked Bot Bulk Dislike** to its short millisecond delay between ratings (750 ms by default). The 5-minute value is only the idle wait before automatic Quick Dislike starts.

## 0.1.9.91

- Added **Copy all support info** so diagnostics and the performance report can be copied together and pasted once.
- Bot and Lorebook backups now work across every edit-page route, including read-only chatbots that are still Under Review.

- Added **Reorder pinned** to the Memory Manager.
- Bot-card token counts now only cover **Greeting, Personality, Scenario, and Example Dialogue**.
- Quick Dislike on Block now waits for an **idle cooldown** before automatic ratings start, with **5 minutes** as the default. Normal activity restarts that wait.
- Fixed Quick Dislike being skipped when a bot was blocked from a path outside the listing Select mode.
- Fixed **Creation Audit** profile checks calling a missing helper, which could leave loaded bots stuck on incomplete/failed checks.
- Improved **Chat Export**: repeated identical messages are no longer dropped just because their text matches, basic formatting is preserved better, older-message loading waits for the page instead of using a fixed delay, and the export window warns when older messages are still available.
- Added **Copy chat** beside Export chat for a one-click plain-text copy.
- Fixed saved-conversation quick actions on `/chats/...` so they sit in their own row instead of covering the age and message-count line.

## 0.1.9.90

- Expanded the **Local Bot Archive** so QoL can keep the newest public bot details it has already seen, making last-known public data available if a bot later disappears. Public archive capture is opt-in and off by default.
- Added opt-in **own-bot editor backups** with revision history, **Save backup now**, and **Export bot JSON** on chatbot edit pages.
- Improved chatbot backup/import so SpicyChat title, Greeting, Personality, Scenario, Example Dialogue, tags and visibility are preserved more reliably. Tag export/import now works with SpicyChat's current tag picker and verifies that selected tags actually appeared.
- Updated public-profile reading for SpicyChat's current layout so the visible title, tags and exposed public sections can be archived correctly.
- Added separate opt-in **Lorebook backups**. QoL can save Lorebook details and entries, remember the keywords visible on the entries list, and learn the full keyword list when an entry is opened. Lorebooks stay separate from chatbot Character Card JSON.
- Moved own-bot and Lorebook backup controls to **Creator Tools**, kept public bot archiving under **Saved Bots & Lists**, and made the saved copies available from **Data & Backup**.
- Own-bot backups, Lorebook backups and public-profile/archive capture now start **off by default**.
## 0.1.9.89

- Reduced background work when optional QoL features are disabled, especially on busy chats and large listings.
- Added a dedicated position setting for the `*` / backtick composer shortcuts: inside the typing box, outside-left, or outside-right.
- Made the Settings page lighter by loading larger Soundscapes data only when its section is actually needed.
## 0.1.9.88

- Fixed bot-card token estimates getting stuck on **Loading** or becoming unavailable. Greeting/profile estimates now use the signed-in SpicyChat character data path with safer fallbacks and short timeouts.
- Added an optional setting that keeps your native SpicyChat **My messages** colors from being reset by site rerenders after QoL has seen the native appearance setting once.
- Stabilized the dedicated asterisk/backtick composer shortcuts so nearby Reply/OOC controls no longer make them jump around.
## 0.1.9.87

- Fixed **My Creations auto-load** for SpicyChat's current Load More button and added retries for the button appearing late.
- Fixed Bulk Card Blocking startup and simplified it into **Select bots** mode: click cards to select them, then block the selection together.
- Moved the Select bots launcher under SpicyChat's **Narrow by Group Size** controls and kept the Mini Panel shortcut available.
- Reduced the Mini Panel's visible jump on Home/Recommendations by giving it a stable top-right offset from the start.
## 0.1.9.86

- Added optional multi-select blocking on Home and Recommendations while keeping the normal Blocked history, Undo and filtering behavior.
- Changed **Quick Dislike on QoL Block** into an idle queue. Blocking still happens immediately; native dislikes wait until SpicyChat has been idle and pause again if you become active.
## 0.1.9.85

- Improved performance on large chats and listings by reducing repeated message scans, avoiding repeated work on already-sorted listings, and batching heavier Settings/list refreshes.
- Blocking several bots in a row now keeps the immediate card hide but delays the heavier full listing refresh until the page has been quiet.
## 0.1.9.83

- Added **Bot order** to supported listings with **SpicyChat order**, **Name A → Z**, and **Name Z → A**. It re-applies when more cards load and can return to the original loaded order.
- Improved optional notification cleanup so background product-update clearing only reacts to a real unread SpicyChat notification badge.
## 0.1.9.82

- Fixed Opened/saved chat state sometimes stopping after the recent performance changes.
- Fixed Saved Bots / Bot Status views staying stale while Settings was already open; relevant lists now refresh from live local changes.
- Reduced lag from repeated blocking by batching the heavier listing refresh while still hiding each blocked card immediately.
- When QoL's own Scroll to top control is enabled, SpicyChat's duplicate native floating up button is hidden.
## 0.1.9.81

- Fixed the slow/high-ping message-edit race where QoL could touch the original rendered message while SpicyChat's editor was opening or saving.
- QoL now detects edit mode as soon as the native editor appears, leaves that message alone until editing is finished, and avoids unrelated heavy work while an edit is active.

## 0.1.9.80

- Expanded **Context Keeper** so durable continuity is captured automatically in small local batches after chat activity settles instead of requiring a Keep click for normal use.
- Added configurable automatic-capture strictness, capture cadence, and a per-chat cap for automatically kept details; automatic candidates still use the existing durable-fact scoring and near-duplicate protection.
- Added **Context Keeper** directly to SpicyChat's chat three-dot menu, with reinsertion guards for React/SPA menu rebuilds and the existing QoL-panel button retained as a fallback.
- Manual Keep buttons are now optional/off by default on fresh settings; selected-text Remember, manual scans, editing, exclusions, Memory preparation, and OOC recap controls remain available.
- Automatic capture never auto-sends an OOC recap and never writes SpicyChat Memories by itself; stored Context Keeper data remains local and continues through normal QoL backup/import.

## 0.1.9.79

- Added a dedicated **Copy performance report** button, local performance self-check, and resettable performance counters so testers can send a smaller support-focused report without chat text.
- Expanded performance diagnostics with configured/effective mode, scheduler and typing deferrals, Settings-page load/DOM/storage timings, browser long-task context, and automatic warnings for suspicious wall-time spikes/cache churn.
- Clarified that QoL step timings are wall-clock measurements and may include asynchronous waiting; browser long-task counters are reported separately to better identify actual main-thread stalls.
- Added **Maximum performance**, optional automatic stronger handling above a configurable large-chat message threshold, optional typing deferral, reduced QoL animations, and reduced Settings-page animations.
- Reduced message-text cache churn by deduplicating repeated invalidations while a message is already dirty and collapsing duplicate MutationObserver invalidation nodes before processing them. Diagnostics now show invalidation requests, actual invalidations, and duplicate invalidations avoided.
- Debounced Settings search and Features catalogue search during rapid typing, and added local Settings-page performance instrumentation for support reports.

## 0.1.9.78

- Extended **Lorebook listing tools** with a native-sidebar **Has Lorebook** filter beside SpicyChat's existing tag/search controls, matching the community request to find bots that actually have Lore attached.
- The new sidebar filter uses SpicyChat's existing Lorebook badge/icon on rendered bot cards, so it does not need an extra profile request just to decide whether a loaded card has a Lorebook.
- Lorebook-only filtering combines with SpicyChat's normal search/tag filters and QoL listing tools, automatically re-applies as more cards are loaded, and only hides cards in the current rendered listing.
- The toggle is session-local to the current browser/app tab and is removed cleanly when Lorebook listing tools are disabled or the user leaves a supported bot listing.

## 0.1.9.77

- Hardened critical local-storage operations used by backup/import, recovery snapshots, cleanup and per-dataset deletion. QoL now checks browser storage errors and verifies important writes by reading the affected keys back before reporting success.
- Backup/recovery source reads now fail closed for critical operations instead of silently treating a browser-storage read error like an empty data set.
- Destructive local-data deletion now requires its recovery snapshot to be successfully saved and verified first for recoverable lightweight QoL data; if the snapshot cannot be verified, deletion is cancelled.
- Import and Clean local data now keep the recovery snapshot and show a specific failure message if the browser accepts a call but the resulting stored data cannot be verified.
- Recovery-snapshot clearing and destructive dataset removal now verify that the target keys are actually gone before showing success.

## 0.1.9.76

- Hardened **Listing Refill card transport** so serialized helper-page cards are parsed through QoL's sanitized DOMParser path instead of assigning dynamic HTML into a live template.
- Added payload validation before a helper card can be appended: oversized/invalid serialized elements are ignored unless they still contain a valid SpicyChat bot identity link.
- Broadened Refill's listing/card detection to accept both `/chat/...` and `/chatbot/...` anchors, reducing breakage if SpicyChat changes which link type a card exposes.
- Helper pages now serialize a cleaned clone of each card so QoL-only classes/attributes/actions are not unnecessarily carried back into the visible listing.

## 0.1.9.75

- Fixed the extension popup showing the technical browser-store version instead of the normal user-facing QoL version.

## 0.1.9.74

- Fixed **Listing Refill favorite controls** for bots that are already favorited. SpicyChat now labels the active heart as `unfavorite`; QoL preserves that control instead of stripping it from filled cards.
- Filled-card favorite detection now accepts SpicyChat's Favorite/Unfavorite and Like/Unlike states so already-favorited bots remain visibly marked after helper-page cloning.
- Fixed filled favorite hearts turning white after a successful favorite action. Active filled hearts now use SpicyChat's native red `text-red-9` / `fill-red-9` styling, while inactive hearts remain white outlines.

## 0.1.9.73

- Added optional **Reply Instructions** for persistent guidance about how a bot should answer. A global instruction can be sent once per chat session, appended to every user message for stronger persistence, or kept manual-only.
- Added a compact **RI** chat-composer control for inserting the active instruction on demand and saving/clearing a bot-specific local override without changing the chatbot itself.
- Reply Instructions can be wrapped as an OOC directive and are deliberately implemented as normal visible outgoing chat text because SpicyChat does not currently expose a separate permanent hidden system-instruction field to QoL.
- Kept Reply Instructions distinct from **RP Format Repair**: Reply Instructions influence future generations through chat context, while RP Format Repair remains a local display-only cleanup for replies that were already generated.
- Bot-specific reply instructions are stored inside normal local QoL settings, so the existing Settings backup/import path carries them without adding a new permission or separate cloud data store.

## 0.1.9.72

- Hid the QoL card **block X on `/my-creations/chatbots` by default** so creator-owned bots are not presented with a nonsensical block shortcut. A separate opt-in setting can deliberately re-enable it there.
- Applied the My Creations exception at the shared card-block action entry point so normal reruns, SPA navigation and helper/listing passes use the same page rule instead of relying on a one-time DOM cleanup.
- Kept the rest of card blocking unchanged on recommendations, creator pages and other supported bot listings.

## 0.1.9.71

- Consolidated the old **Opened chats** Settings/manager area into **Bot Status Center**, keeping the existing opened-history storage/settings keys intact while making Bot Status Center the single feature name for tracking, history, availability/update checks and local bot copies.
- Moved **Bot Status Center before Saved Bots Hub** in Saved Bots & Lists so the primary bot-status/history tools appear before the combined overview.
- Changed the Features catalogue to put **earlier/older features higher by default**, with Oldest first, Newest first and Name A-Z ordering. The selected order is preserved when using Open settings and returning to Features.

## 0.1.9.70

- Bumped the normal QoL backup schema to **v9** and hardened import validation: supported legacy array-style saved lists/creator lists and `savedPersonas` are migrated into the current structure before preview, while backups from a newer unsupported schema are now blocked instead of being partially imported.
- Added a single **local recovery snapshot** for lightweight QoL data. You can create it manually, load it into the normal import preview, or clear it; QoL also saves one automatically before backup imports and supported local-data cleanup/deletion actions. Local media bytes and API keys remain excluded.
- Added a non-destructive **Check for orphaned data** pass that reports supported cleanup candidates before anything changes.
- Expanded **Clean local data** to normalize Message Bookmarks, pinned Smart Filter presets, Recently Seen data, Persona organization, and existing saved-list metadata while saving a recovery snapshot first.

## 0.1.9.69

- Hardened **Android/WebView SPA navigation** against stale chat-only QoL presentation state surviving after leaving a chat. Non-chat routes now immediately scrub QoL-owned chat background, focus-mode, performance, voice-cleanup and Android composer classes instead of waiting for the normal delayed rerun.
- Added a short **route recovery watchdog** after SPA/back navigation so late React/WebView DOM swaps cannot reintroduce a stale chat presentation state and leave Home/listing pages visually blank or black.
- Added Android-friendly recovery on **visibility resume**, `pageshow`, and browser/WebView history `popstate` without forcing a page reload, preserving normal SPA history and scroll restoration.
- The recovery path also invokes the existing accidental page-hide watchdog and only repairs QoL-owned page-scale hides, leaving SpicyChat's own visibility/loading state alone.

## 0.1.9.68

- Expanded **Creation Audit** with a combined **Needs attention** filter and **Review next** shortcut so creator QA can move through loaded bots that actually need work.
- Added **CSV export** to Creation Audit alongside the existing Markdown copy/download report, including audit state, visibility, Lorebook presence, token estimate, tags, issues, and profile link for each loaded bot.
- Improved Creation Audit progress/summary counts so the total number needing attention is visible separately from missing-core and check-recommended results.
- Hardened **My Creations auto-load** so SpicyChat temporarily hiding or disabling its native Load More button during a request is no longer mistaken for the end of the bot list.

## 0.1.9.67

- Added optional **My Creations auto-load** for `/my-creations/chatbots`, using SpicyChat's native Load More button to automatically load a configurable number of extra bot pages/batches.
- The auto-load page count defaults to **1**, stops early when no more bots are available, and reruns when the My Chatbots listing meaningfully changes (such as after changing the native sort/view).
- Creator setup now enables My Creations auto-load at the 1-page default alongside the existing creator helpers; fresh installs still keep optional features off until enabled or a preset is applied.

## 0.1.9.66

- Added optional **Chat Nudges** for up to two selected chatbots. Each chat can use a 5-hour, 8-hour, 1-day, 2-day or 1-week inactivity delay; reminders reuse the last real bot reply for context and never generate or send a fake SpicyChat message.
- Added optional browser notifications for Chat Nudges. The permission is requested only from Chat Nudges settings; if unavailable, due reminders fall back to an in-page notice the next time QoL is active on SpicyChat.
- Chat Nudge state is included in backup/import schema v8 and keeps one reminder per inactivity cycle until new chat activity resets it.
- Persona local-copy refresh can now use a temporary rendered Persona edit page when SpicyChat's raw HTML only contains the app shell, improving full-text/avatar recovery for older or incomplete copies.
- Improved local Persona avatar preservation with resize/compression for large images and background-fetch fallback for SpicyChat CDN media.
- Local Persona Library entries can use **Refresh from SpicyChat** even when the Persona is not currently visible on the Persona list.
- Improved Persona switch failure text so locally saved copies that are no longer in SpicyChat's live picker point to the Local Persona Library restore path.
- Context Keeper saved details now support search, category/source filters, Use all in recap, Remove excluded, and Copy OOC recap controls.

## 0.1.9.65

- Protected `/subscribe` from premium/promo cleanup so the active-subscription notice, plan cards and badges such as Most Popular stay visible.
- Removed backup/import shortcuts from the extension popup; backup file download/upload stays in Settings → Data & Backup, including the mobile extension-browser download-manager fallback.
- Added a shared dirty-message lane for long chats so changed/new message roots can be reused across chat tools instead of repeatedly rebuilding work for the full loaded conversation.
- Current-chat search now updates changed/new messages incrementally when possible, with a full pass only for search-setting changes or when no safe dirty-root set is available.
- Message quick actions, alternate-dialogue styling, DeepL message UI, Auto voice and text replacements now reuse changed-message roots where possible.
- Hardened native message Edit/Save handling: display-only RP/alternate-dialogue/text-replacement layers stay out of the save path until SpicyChat's edited message has settled.
- Added quiet-gap deferral for noncritical slow-lane work during active chat streaming and expanded local performance diagnostics for dirty roots/history batches/incremental search.

## 0.1.9.64

- Added a popup **QoL in this tab** switch that pauses/restores QoL only in the active SpicyChat tab. The pause survives reloads and same-tab navigation, does not affect other tabs, and disappears when that tab is closed.
- Made per-tab pause use the same disabled cleanup path as the global master switch so hidden UI, Mini Panel controls, backgrounds, filters and other supported QoL DOM changes are restored instead of leaving a half-disabled page.
- Added popup **Download backup** and **Import backup** shortcuts. Popup downloads create the normal full lightweight QoL backup, while file imports are handed to Data & Backup's existing validation/preview screen before any local data changes.
- Hardened backup downloads for mobile extension browsers with an optional browser download-manager permission and kept the normal permission-free Blob/link path as fallback. The existing Android native/WebView bridge remains separate from this browser-extension path.
- Added popup-import handoff into the Data & Backup tab so a file selected from the popup opens with the normal category counts, Persona completeness and Merge/Replace preview ready.

## 0.1.9.642

- Fixed Settings search treating generic words such as `preference`, `setting`, `option` and `config` as content keywords. Generic words now act as modifiers (`filter preference` searches for `filter`), while a generic-only query such as `preference` shows Settings sections instead of incorrectly favoring Context Keeper.

## 0.1.9.641


## 0.1.9.63

- Expanded Settings search so feature-registry names/descriptions/aliases participate in matching, generic terms such as preference/preferences/options/config map to settings, and Enter opens the top result.
- Added a blocked-state filter to Chat List tools and the Mini Panel, plus a visible Blocked marker on blocked conversation rows.

## 0.1.9.62

- Fixed Listing Refill cards losing their visible tag pills. Rendered helper pages now return structured card metadata alongside the serialized card, tag pills survive the transfer, and QoL can rebuild a missing tag row from the captured metadata before filters/actions run.
- Expanded Listing Refill diagnostics with metadata/tag restoration counts, last helper page and last helper error while keeping the existing stop-after-current and duplicate/hidden-card counters.
- Expanded Favorite and Later managers with dedicated creator filters, Opened/Unopened/Blocked state filters, and visible state chips without changing the existing Blocked > Opened priority or deleting independent saved-list/organizer records.
- Fixed/expanded Creation Audit profile inspection by exposing the shared profile-field reader to the audit. Audit checks now include duplicate/missing tags, malformed {char}/{user} brace forms, very large Personality/definition estimates, and Lorebook keyword-count/short/duplicate warnings when SpicyChat exposes that data.
- Expanded Message Bookmarks navigation with Previous/Next loaded-bookmark controls alongside the existing Back/Forward jump history.
- Expanded Backup/Import preview with backup schema/export-version details, selected-category/item counts, Persona text/avatar completeness, explicit Merge/Replace impact wording, and a reminder that local chat-background image bytes remain device-local.
- Added common Settings-search aliases/synonyms while retaining tab/card breadcrumbs and exact-control jumps.
- Expanded Custom Chat Backgrounds with Cover, Contain or Tile sizing plus Center/Top/Bottom/Left/Right positioning; the Settings preview follows the chosen layout.
- Expanded Settings Health Check with detection and safe cleanup of malformed local chat-background media records.

## 0.1.9.61

- Hardened Listing Refill with an actual Stop refill / Stopping state that finishes the current rendered helper page and then pauses automatic refill until the user explicitly starts it again or changes listings.
- Added Listing Refill run diagnostics for rendered helper pages, received/added cards, duplicates, hidden cards and helper failures; the Mini Panel now exposes useful live progress instead of only an attempt counter.
- Improved filled-card parity: copied cards keep normal chat/profile links and a working native-Favorite bridge while QoL re-attaches Block, Later, Not Interested, creator-favorite, organizer and other supported local card actions; dead serialized React-only menu controls are removed instead of being left deceptively clickable.
- Strengthened black-page protection with a card-hide watchdog that immediately reverses accidental QoL card hides on page-scale roots, chat shells, listing roots or navigation containers and records the responsible hide reason in Diagnostics.
- Expanded visible text normalization to saved/listing views that reuse bot names/descriptions so fancy-Unicode cleanup is more consistent outside the original Home card pass.
- Reworked Random Chat to use the same fully rendered helper-tab path as Listing Refill instead of raw Home HTML, with retryable helper-page failures and an optional default-on setting to reuse the last Home tag/search filters for the roulette pool.
- Added an automatic low-impact history-loading lane: while older chat messages are being prepended manually or through Chat ↑, noncritical QoL message/cosmetic work waits for the batch to settle before reprocessing.
- Expanded copied Diagnostics with Listing Refill state/stats and whether the long-chat history low-impact lane is currently active.

## 0.1.9.60

- Fixed Listing Refill cards losing Favorite behavior: filled cards now keep a QoL-rebound heart that uses a temporary rendered SpicyChat helper page to click the native Favorite control, then updates local Favorite history.
- Fixed Text normalization being matching-only for bot listings: enabled Fancy Unicode/punctuation/invisible normalization now also applies to visible bot-card names/descriptions, including mathematical-script text such as `𝒯𝒽𝑒` -> `The`; decorative-title cleanup also recognizes common historic-glyph/combining-mark suffixes when that option is enabled.
- Fixed a concrete full-black-page bug where Hide Opened Chats could misclassify the currently open chat container as a bot card and add `ds-hidden` with reason `card:opened chat`.
- Added hard card-hide safety guards for chat/page shells, prevented single-chat pages from being hidden as opened cards, and added automatic recovery for stale accidental `card:*` hides.
- The black-page protection lives in the shared QoL source, so Android receives the same protection when the extension assets are synced into the app.

## 0.1.9.59

- Fixed Listing Refill / Fill now on current client-rendered SpicyChat listings: later pages are now opened in a temporary inactive helper tab, allowed to render normally, copied back into the current listing, and then closed instead of relying on raw fetched app-shell HTML.
- Restricted Listing Refill controls to real bot-listing pages so Fill now no longer appears on unrelated Persona/editor screens.
- Fixed Quick/Bulk Dislike detection for bots that were already disliked: SpicyChat leaves the selected thumbs-down button enabled while Done is disabled, so QoL now recognizes the selected dislike as a terminal handled result instead of clicking it again and timing out.
- Treat bots whose creator is blocked as terminal cannot-rate results and remember them in the handled ledger instead of retrying them forever.
- Hardened private/deleted detection with SpicyChat's 404 prerender marker and kept those bots terminal in the handled ledger.
- Expanded Blocked Bots progress/history labels so already-disliked, creator-blocked, private/deleted/404, other-rated, and genuine failed attempts are distinguished.

## 0.1.9.58

- Fixed Blocked Bot Bulk Dislike stop handling so Stop after current bot cancels the active bulk run in both Options and the background worker, preventing queued/racing items from continuing after the current bot finishes.
- Added a unique bulk-run ID and persistent stop flag so interrupted runs remain safely resumable instead of silently continuing in the background.
- Detect private/deleted chat pages during Quick/Bulk Dislike and remember them as terminal unavailable results, preventing those blocked bots from being retried forever.
- Added clearer private/deleted status text to Blocked Bots handled history and bulk progress.

## 0.1.9.57

- Expanded Blocked Bots into a proper bulk manager with selection, Copy profile links, Unblock selected, and Dislike selected actions.
- Hardened Blocked Bot Bulk Dislike with a configurable delay, persistent unfinished-run state, Resume unfinished, Retry last failed, and per-run failure tracking while continuing to share the handled ledger with normal Quick Dislike.
- Added the Bulk Dislike run state to Blocked Bots backup/import and Settings Health Check so interrupted or failed queues are visible instead of silently disappearing.
- Hardened true Random Chat so a single failed/stale Home pagination request no longer aborts discovery, page-count metadata can refresh, pages are not needlessly repeated, and duplicate candidates are avoided during retries. Opened, Later, and Favorite-history bots remain allowed by default for true randomness, with optional exclusions.
- Added feature-search aliases so terms such as block, regex, persona backup, roulette, and rating find the relevant feature-level catalogue entries.
- Physically reorganized Options source cards into their actual visible tabs and removed obsolete hidden source pages left behind by earlier Settings moves.
- Added clearer Persona Library completeness labels such as Complete, Text only, avatar URL only, and incomplete older copy.
- Reduced long-chat rescans further: Generation Metadata now processes new/changed message records incrementally, and Chat Text Replacements tracks dirty/new messages instead of walking the entire loaded conversation on every QoL pass.
- Expanded Settings Health Check with unfinished/failed Bulk Dislike detection and duplicate/malformed saved-list notices.

## 0.1.9.56

- Made Blocked Bots authoritative over Opened Chats: blocking a bot now removes the matching opened-chat record and metadata immediately.
- Prevented chat-page visits, chat-list imports, clicks, storage changes, and backup imports from re-adding a bot to Opened Chats while that bot remains blocked.
- Added startup/settings cleanup for existing Blocked + Opened overlaps, including exact blocked-name matches when opened metadata has the same name.
- Updated Saved Bots Hub source badges so a blocked bot is never simultaneously presented as Opened.

## 0.1.9.55

- Added a desktop Blocked Bot Bulk Dislike queue that processes remaining blocked bot IDs one at a time through SpicyChat's normal rating dialog, with live progress and stop-after-current behavior.
- Added persistent Quick/Bulk Dislike handled history so bots successfully disliked or already rated/unavailable are skipped on future automatic and bulk runs; real failures remain retryable.
- Added Blocked Bots rating-status filtering plus per-bot handled status and a deliberate Clear handled history action.
- Serialized all Quick Dislike helper work through one background queue so bulk processing and normal block-triggered dislikes do not open competing helper tabs.
- Included the handled dislike ledger with Blocked Bots in backup/import data and bumped the QoL backup format to v7.
- Restored the missing Custom Chat Backgrounds Settings card so the 0.1.9.54 background feature can actually be enabled/configured from Appearance & Interface.

## 0.1.9.54

- Reworked Random Chat into true discovery roulette: choose a random SpicyChat Home pagination page, then a random eligible bot from that page, with retries when a page has no usable result.
- Polished the feature-level Features catalogue with grouped sections, status/category filtering, expandable groups, direct Settings links, and return-to-Features navigation state.
- Added stronger Settings dependency controls and expanded Settings Health Check safe-fix actions.
- Expanded Saved Bots Hub with Blocked and Not Interested state/actions.
- Added local custom chat backgrounds with a global image, optional per-chat overrides, dimming, blur, local media storage, and Storage Usage cleanup.
- Added Persona Library refresh for incomplete local copies and another long-chat older-history mutation-batching performance guard.
- Cleaned the Options source layout so moved cards live in their actual tabs instead of being relocated from obsolete hidden source pages.

## 0.1.9.53

- Rebuilt the Features tab as a grouped feature catalogue based on `features.md`, with live On/Off/Built in/Planned status, feature descriptions, status/category filters, and direct settings links instead of one entry per child checkbox.
- Simplified Settings navigation by folding Mini Panel, Soundscapes, navigation cleanup, and premium/promo controls into Appearance & Interface; moved Tag defaults/Favorite protection into Discovery & Filters and chat-facing Character shortcuts into Chat.
- Split the old Premium and notifications card into clearer Premium & promo cleanup and Notifications areas, and moved model-specific controls back beside the model settings.
- Added parent/child dependency hints so saved child preferences clearly show when they are inactive because the parent feature is off.
- Added a non-destructive Settings Health Check for dependency state, missing DeepL setup, unusual values, unknown/legacy setting keys, storage size, and incomplete Persona local copies.
- Expanded Help/About with DragonScript / DragonGRaf developer details, Discord/GitHub feedback routes, public SpicyChat bots, project website, optional PayPal support, and clearer S.AI Toolkit credit/compatibility wording.
- Added real extension icons to the manifest plus DragonScript / DragonGRaf author and project-homepage metadata.

## 0.1.9.52

- Reorganized Settings into clearer feature areas and added a searchable Features index with direct links to individual optional settings.
- Added an optional Random Chat button on `/chat` and `/chats` that opens one known existing conversation at random.
- Added more built-in Smart Filter presets for Lorebooks, followed creators, and unopened favorites.
- Moved Memory, Context Keeper, Personas, Soundscapes, performance, appearance, browser, and generation controls into more consistent tabs instead of leaving mixed/empty categories.
- Cleaned several Settings labels and descriptions so feature names describe what they do instead of how they are implemented.
- Added a message-edit settling guard that removes temporary QoL display layers before SpicyChat saves an edited message, targeting the duplicate-text-until-refresh bug.
- Debounced large batches of manually loaded older chat messages so QoL waits for the prepend to settle before running chat-wide work.
- Reduced repeated RP Format Repair and generation-metadata work on long chats.

## 0.1.9.51
- Added optional desktop Quick Dislike on Block: the QoL card block can use a temporary background chat tab to submit SpicyChat's native dislike rating, then close the helper tab; it stays off by default and is disabled on phone/mobile.
- Reworked Listing Refill for SpicyChat's current paginated bot listings, keeping 50 visible cards as the default target, allowing up to 200, skipping duplicates, and retaining older Load More support.
- Smoothed initial QoL injection by applying critical filtering/chat controls first and deferring heavier cosmetic work to the idle lane instead of blocking startup on a full pass.
- Reduced long-chat overhead during older-message loading by suppressing repeated QoL rescans while a batch is loading, caching message counts, and avoiding disabled chat-tool scans; Chat ↑ now shows a Stop control that finishes the current batch before stopping.
- Improved Local Persona Library recovery so saved/restored copies can refresh the full persona text from the edit page and keep/reapply actual avatar image data instead of relying only on an old image URL.
- Expanded promotional-banner cleanup for the current pricing/update carousel, in-chat image promotion, Lorebooks, and 16K memory banners.

## 0.1.9.50
- Replaced the remaining direct content-script `innerHTML` assignments with a shared sanitized DOM-parser helper (or native `replaceChildren`) to reduce avoidable Firefox/AMO review warnings while keeping existing UI output unchanged.

## 0.1.9.49
- Added a small per-tab QoL runtime diagnostic ring log that survives normal page reloads and records module/state failures without storing chat text, memories, persona text, notes or prompts.
- Quick diagnostics now includes recent runtime-log entries, making intermittent blank/broken-page reports useful even when the page works again after a reload.
- Added Advanced diagnostic actions to reload/recover the source SpicyChat page and clear its runtime log without adding telemetry or sending diagnostics anywhere automatically.

## 0.1.9.48
- Expanded Context Keeper's selected-text bridge without adding AI summaries: reviewed selections can now be saved to Context Keeper and prepared in SpicyChat Memory in one action.
- Context Keeper now preserves source message IDs and speaker roles when details come from selections, message Keep buttons, or loaded-chat scan suggestions.
- Saved Context Keeper details show their source and can jump back to the loaded source message or prepare that exact detail in SpicyChat's normal Memory editor for manual review; QoL still never auto-saves a SpicyChat Memory.

## 0.1.9.47
- Added an optional on-page Refill button for bot listings, using the same target-visible-card and max-Load-More limits as Listing Refill and the Mini Panel action.
- Added configurable management for SpicyChat's large main-page footer, separate from the existing sidebar-footer cleanup controls.
- Main footer management can hide the whole footer or only company/address, Resources, Community, Join Us/social, app-download, or 2257 sections.

## 0.1.9.46
- Fixed animation control missing SpicyChat avatar WebP sources, including animated WebP bot cards that do not expose a `.gif` URL.
- Animation freeze state now notices when React reuses an image element with a different source and rebuilds the frozen frame instead of keeping a stale canvas.
- Strengthened master-disable cleanup and reloads the current SpicyChat route once after the QoL master switch is turned off so heavily modified pages return to native layout cleanly.

## 0.1.9.45
- Removed remaining direct innerHTML assignments from extension JavaScript, including message, filter, memory, quick-panel and saved-history UI construction, to reduce Firefox AMO unsafe-HTML validation warnings.
- Replaced the remaining SVG/empty-container innerHTML usage with explicit DOM operations and kept generated UI behavior unchanged.

## 0.1.9.44
- Reorganized Settings with dedicated Personas / Memory, Soundscapes, Browser / Tabs and Advanced areas while preserving all existing setting keys and Settings Search behavior.
- Polished Quick Setup with a non-destructive Customize manually choice and clearer Creator preset wording.
- Fixed the Browser / Tabs placement for Tab Cleanup and cleaned up a malformed duplicate-tab strategy select in Settings.
- Added Invert shown to Tab Cleanup review and clearer Smart Group tab/bot counts for groups containing multiple conversations.
- Improved Soundscape failure handling so missing local audio or broken URLs are reported instead of failing silently.

## 0.1.9.43
- Expanded Tab Session Library with Smart Groups for exclusive last-used age ranges, saved-state groups, discarded tabs, and multiple-conversation bots, plus configurable age thresholds.
- Added browseable Topic/Smart Group review so saved topics show their actual tabs instead of only a bot count.
- Added reviewed Save session + close selected cleanup with pinned-tab protection, exact-URL matching, a recovery snapshot saved before closing, and closed-session history.
- Added optional removal of reopened entries from closed cleanup sessions while preserving separate conversations for the same bot.

## 0.1.9.42
- Reworked Tab Cleanup profile analysis to use one temporary rendered SpicyChat profile tab instead of background profile fetches that were being intercepted by Cloudflare.
- Added automatic pause/resume handling when SpicyChat verification appears in the analysis worker, while keeping discarded chat tabs asleep.
- Reused existing Local Bot Archive/profile metadata before network analysis, improved metadata-quality reporting, and renamed Retry missing / failed to Retry unresolved.
- Improved Tab Cleanup identity coverage by using locally saved descriptions, visibility and images when available.

## 0.1.9.41
- Improved Firefox Android/mobile bulk selection so touch selection cannot accidentally trigger nearby native Favorite controls, and moved chat scroll arrows dynamically above the visible composer.
- Added optional local Soundscapes / Ambience with saved scenes, up to five layered audio sources, per-layer volume/loop/interval controls, master volume, page scopes, and Mini Panel playback/switching.
- Fixed Tab Cleanup enrichment reporting so only useful profile metadata counts as a successful fetch, with clearer no-data/unavailable/failed diagnostics and a Retry missing / failed action.
- Added the first Tab Session Library with reusable multi-topic organization, generated-suggestion → topic saving, snapshot review, exact-conversation selection, and safe reopening in the current window, a new window, or grouped by saved windows. No cleanup action automatically closes tabs.

## 0.1.9.40
- Expanded the tab-cleanup diagnostic with manual profile metadata enrichment, pause/cancel controls, and stronger bot-name resolution using browser tab titles plus cached/local profile data.
- Added a non-destructive analysis preview with suggested topic signals and practical cleanup groups such as age, Favorite/Later, local archive copies, discarded tabs, and multiple conversations.

## 0.1.9.39
- Expanded Duplicate Tab Guard with a configurable keep-new / keep-existing strategy; new duplicates now keep the newly opened tab by default while pinned tabs remain protected.
- Added a manual Open-tab cleanup diagnostic that inventories open SpicyChat tabs, duplicate groups, bot IDs, available names/creators/tags, and existing QoL organization signals without collecting chat text or private-note contents.

## 0.1.9.38
- Fixed chatbot draft pages so automatic Advanced opening, creator snippets/guideline helpers, and local Draft History recognize `/chatbot/create/<draft-id>` editors.
- Added a saved-state filter to Chat List tools for Favorite history, Later, both, any locally saved bot, or neither.
- Added optional Mini Panel shortcuts for up to three pinned Smart Filter presets on bot listings.

## 0.1.9.37
- Improved Local Persona Library recovery with clearer saved-text/avatar status, full persona-text copying/preview, refresh controls, and more reliable Restore as new/avatar handoff.
- Added a Settings blocker tester and improved creator-handle matching/debug reasons so blocked word/tag/creator rules are easier to verify when card layouts change.
- Polished Remember selection with optional whole-message review and a more reliable, still non-saving handoff into SpicyChat's normal Memory editor.

## 0.1.9.36
- Expanded blocked-word/name matching for changing SpicyChat card layouts, quoted nicknames, punctuation/spacing differences, compact abbreviations such as TF141 / TF 141, and multi-word names whose nickname/order differs on the card.

## 0.1.9.35
- Added optional My Creations view memory so SpicyChat's own sort choice and QoL My Creations filters/order can persist across reloads and returning to the page.

## 0.1.9.34
- Added selected-text Remember tools in chats with an editable preview, Context Keeper saving, and a safe SpicyChat Memory preparation/copy fallback. Nothing is auto-saved and no AI summary is generated.
- Added an optional discovery/listing card-click mode that opens the bot profile when clicking the card body while leaving explicit Chat, Profile/Info, creator, Chats-list, and My Creations controls alone.

## 0.1.9.33
- Fixed blocked name/description words missing some bot cards by matching detected title/description fields directly and supporting newer cards that expose profile links instead of chat links.
- Expanded listing/card detection so blocking, Smart Filters, Lorebook tools, Bot Organizer, and My Creations helpers continue working on both `/chat/` and `/chatbot/` card layouts.
- Expanded My Creations filters with a Creator workflow filter and a one-click Needs attention view using local Needs work status and Creation Audit issues.

## 0.1.9.32
- Simplified OOC controls on mobile/compact layouts: a single saved OOC preset now inserts directly, while multiple presets still show a chooser.
- Improved the Android/compact top-bar OOC menu so multiple presets can be selected directly instead of relying on the mini panel's previously selected preset.

## 0.1.9.31
- Added a Duplicate SpicyChat Tab Guard with configurable page scopes, pinned-tab protection, and an optional switch back to the already-open tab.
- Fixed the Report quick-action toggle so Copy, Edit, and Report can be controlled independently.
- Reorganized Settings into clearer sections and added a Creator Quick Setup preset for chatbot/Lorebook-focused users.
- Expanded the floating scroll-to-top / scroll-to-bottom helpers with configurable page scopes across desktop, Firefox, and Android.
- Improved Firefox/Waterfox compatibility by restoring Android compatibility metadata and lowering the Firefox desktop compatibility target to 140.

## 0.1.9.30
- Expanded Backup & Restore with JSON/TXT downloads, file-based import, drag-and-drop on desktop, and Android-friendly file picking/saving.
- Added a moderation-warning term manager with search, filters, local Ignore/Enable controls, and custom warning terms.
- Refined the community-reported warning list to reduce false positives and made it clearer that the warnings are advisory rather than an official SpicyChat blocklist.

## 0.1.9.29
- Added a Recent option and more sorting/filtering to My Creations → Chatbots using QoL's existing local activity history.
- Improved moderation wording warnings with a Balanced mode, better matching, categories, and local ignored terms.
- Reduced noisy false positives from overly broad warning matches.

## 0.1.9.28
- Added local Chatbot Editor Draft History with manual/automatic snapshots and safe restore controls.
- Added configurable snapshot retention and backup/import support for draft history.
- Expanded Smart Filter Presets with up to three pinned presets for quick access.

## 0.1.9.27
- Added a unified Saved Bots Hub combining Favorite history, Later, Recently Seen, Bot Organizer, and Opened-chat data in one searchable view.
- Added source filters, sorting, Organizer metadata, quick Later actions, and profile links to the Saved Bots Hub.
- Expanded Creation Audit with copy/download report actions for loaded My Creations bots.

## 0.1.9.26
- Added bulk actions to the Favorite and Later managers, including Later changes, Bot Organizer folders/tags, profile-link copying, and safe list removal.
- Added Undo support for destructive saved-list changes and immediate saving for bulk actions.
- Added portable Character Card v2-style JSON export to Local Bot Archive while keeping the exact QoL Archive JSON format.
- Cleaned up Chat Export rendering to avoid Firefox AMO validation warnings.

## 0.1.9.25
- Fixed duplicate Insert copied controls in chatbot tag editors.
- Added optional expansion of collapsed Lorebook tag lists when full tag data is available.
- Expanded Favorite/Later organization with creator sorting, relationship/folder filters, Organizer metadata, notes, and quick Later actions.
- Rebuilt Chat Export with TXT, Markdown, HTML, JSON, optional metadata, and Print / Save as PDF support.

## 0.1.9.24
- Fixed Message Quick Action sub-options so Copy, Edit, Report, Remove Image, and Resend can work independently.
- Fixed timestamp and generation-detail sub-options so they no longer secretly depend on the combined metadata toggle.
- Expanded Smart Filter Presets with more built-in filters plus custom rename/delete support.
- Improved Smart Filter performance and kept older presets/backups compatible.

## 0.1.9.23
- Expanded Creation Audit with checks for missing/short core fields, tags, Lorebooks, visibility, and unusual profile-size estimates.
- Added audit status filters, per-card badges, and a manual Refresh loaded action while reusing the existing profile cache.

## 0.1.9.22
- Fixed Settings dropdowns being able to immediately close/fight the user after jumping to a setting from Settings Search. Native select targets now avoid delayed focus stealing and in-progress smooth scrolling, while normal search-result highlighting and navigation remain intact.

## 0.1.9.21
- Expanded Chat List tools with Opened/Unopened, message-count filters, live counts, and Most messages first sorting.
- Expanded the formatting toolbar with brackets, braces, asterisk handling, and custom wrappers.
- Added an optional Resend action for old user messages without auto-sending.
- Added bot-card density presets, Copy Bot Info, Recently Seen history, side-by-side bot comparison, and quick Not Interested/Unblock actions.
- Improved listing refill reliability and performance.

## 0.1.9.2
- Improved Firefox/Android compatibility and removed another Firefox AMO validation warning.
- Added Message Bookmarks, Back/Forward jump history, and a much more capable Search Inside Current Chat.
- Expanded search with exact/case/whole-word/Regex modes, bookmarked-message scope, and optional loading of older messages until a match is found.
- Added shared message-text caching and a dedicated chat-mutation performance lane to reduce repeated work in long chats.
- Expanded performance Diagnostics and Recently Changed / Undo coverage.
- Added bookmark backup/import support and an optional What's New update toast.

## 0.1.9.1
- Reworked Message Quick Actions so common actions can use SpicyChat's native behavior without showing the intermediate three-dot menu.
- Added Adaptive / Aggressive runtime performance scheduling and expanded performance Diagnostics.
- Expanded Bot Organizer access to chatbot profiles and individual chats.
- Added the first Recently Changed / Undo system and safer backup validation/restore controls.

## 0.1.8.99
- Improved Message Quick Actions, including optional Remove Image and confirmation support.
- Improved Settings search so it can jump to individual controls more reliably.
- Expanded chat-bubble styling, alternate-dialogue/backtick handling, and formatting-toolbar options.
- Reworked long-chat performance and scroll-aware scheduling to reduce lag.
- Fixed Favorite-history placement and translation/backtick styling regressions.
- Added a Local Persona Library with local copies, restore tools, and better profile-picture handling.
- Added clearer DeepL privacy wording and several compatibility/UI fixes.

## 0.1.8.98
- Expanded Bot Status Center with a persistent Local Bot Archive / Saved bot copies store.
- Saved more accessible profile data and added View, Copy, JSON download, filtering, and deletion controls.
- Added optional profile/chat refreshes plus backup/import/storage/diagnostic support.
- Local Bot Archive only stores data SpicyChat already exposes to the signed-in user.

## 0.1.8.97
- Expanded bot-card token info so users can choose estimated counts for Greeting, Description, Personality / definition, Scenario, Example dialogue, and a Combined profile estimate instead of being limited to Greeting only.
- Kept card token checks lazy/cached and added compatibility for the older greeting-only cache so enabling extra fields triggers a refresh only when the cached profile data is incomplete or stale.
- Added an optional background mode for the chat ↑ older-message helper: ↑ can jump immediately, then continue using SpicyChat's native Load Previous Messages control in the background while preserving the current reading position as older batches are prepended.
- Refined Context Keeper using additional Yui Kimura, Chloe Vance, and Reiko long-chat/memory samples. Scanning now recognizes Skills/abilities and Needs/triggers, gives more weight to explicit corrections/boundaries, stable preferences/routines, backstory, commitments, and recurring accommodations, and more aggressively rejects transient physical/action narration.

## 0.1.8.96
- Added Save & Stay and Save & Chat actions to chatbot create/edit pages, including an optional new-tab mode.
- Expanded Bot Organizer with direct folder management on My Creations.
- Improved Context Keeper suggestions, duplicate detection, recap controls, and Bulk Memory Manager integration.
- Added Load all memories / optional auto-load behavior to Bulk Memory Manager.
- Expanded the chat ↑ helper with optional older-message loading before jumping.

## 0.1.8.95
- Fixed Lorebook Insert copied only appearing after at least one keyword existed; it now detects the empty keyword field too.
- Added a separate QoL Filter to My Creations chatbot listings. It defaults to All and supports combined Public / Unlisted / Private visibility filtering, message-count ranges, Lorebook presence, definition visibility, and card-token ranges.
- My Creations filter counts are based on currently loaded cards and stack safely with SpicyChat's own search/sort controls without changing bot visibility or saved data.

## 0.1.8.94
- Made the Options page load large saved lists only when needed and cache them while switching tabs.
- Added paging and debounced search to large managers instead of rendering everything at once.
- Reduced Bot Status Center duplicate-check and redraw work.
- Reduced unnecessary Settings layout, image, storage, and changelog work.

## 0.1.8.93
- Expanded backup/export into a multi-select checklist covering the major QoL data categories.
- Added per-data-set Delete controls to Local Storage.
- Added Lorebook keyword bulk paste, a taller Lorebook editor, and chatbot tag bulk paste.
- Added estimated bot-card token information and fixed saved social-cleanup settings.

## 0.1.8.92
- Fixed blocked-bot names sometimes being saved incorrectly and added a repair action for older entries.
- Expanded chat-bubble text and alternate-dialogue styling.
- Improved RP Format Repair detection and preserved separate speech/action/backtick styling.
- Kept alternate-dialogue styling away from command/OOC UI.

## 0.1.8.91
- Fixed formatting-toolbar flicker and Hide Help accidentally hiding the Support link.
- Split footer, social, and app-download cleanup into individual controls.
- Kept backward compatibility with the older combined cleanup settings.

## 0.1.8.90
- Expanded Bot Status Center with Character Update Watch and local duplicate/reupload detection.
- Added reviewable profile-change tracking and Accept update controls.
- Kept network checks manual-only with safer status handling.
- Added Indonesian translation support and improved DeepL setup behavior on Android/WebView.

## 0.1.8.89
- Added local Saved Text / Snippets with search, editing, deletion, draft capture, and one-click insertion.
- Added the first Context Keeper for long/multi-character chats with reviewable continuity details and message Keep actions.
- Added editable OOC recap generation from saved continuity details.
- Included Snippets and Context Keeper data in backup/import and storage tools.

## 0.1.8.88
- Added per-character QoL profiles with chat-specific RP Format Repair, formatting, detection, and Auto voice overrides.
- Added a manual Deleted / Unavailable Bot Detector for locally tracked bots.
- Added source/status filters, individual rechecks, safer Unknown handling, and backup/storage/diagnostic support.

## 0.1.8.87
- added placement options for Search Inside Current Chat so it can use the QoL panel, a compact Find button, or both
- added Focus / Immersive Mode with optional sidebar, top-bar, chat-header and QoL-panel hiding plus a quick exit

## 0.1.8.86
- added Search Inside Current Chat with Bot/You filters, previous/next navigation, result counts, message highlighting and optional loading of older messages

## 0.1.8.85
- added RP Format Repair to automatically clean up bot responses into your preferred roleplay formatting

## 0.1.8.84
- improved chat bubble customization, resets and performance
- added separate Appearance settings
- added Android/WebView detection + Android App settings and a mobile top-bar QoL menu
- reduced unnecessary background work and added optional local performance diagnostics

## 0.1.8.83
- Added a local Bot Organizer with multi-collection folders, private notes, personal tags, creator-only status labels, listing filters, and bulk actions for collections, tags, Later, copy links, and creator status.

## 0.1.8.82
- Fixed Favorite Creator saving/protection on creator pages and added a favorite star beside the creator page title.

## 0.1.8.81
- Added customizable AI/user chat bubbles with colors, borders, opacity, shapes, shadows, presets, and contrast warnings.
- Added PNG/JSON bot and character import with a preview before filling SpicyChat's normal chatbot creator.

## 0.1.8.80
- Replaced Firefox/AMO-flagged dynamic HTML injection with DOM-safe rendering across popup, Settings, saved lists, creator warnings, chat export, filters, personas, and OOC tools.

## 0.1.8.79
- Expanded the Persona Manager with duplicate-persona prefill, private local notes, custom drag/menu ordering, note/folder search, and matching order/metadata in the in-chat persona picker.

## 0.1.8.78
- Added optional alternate-dialogue styling for AI backtick text, with dialogue, texting/comms, thoughts/telepathy, and subtle display styles plus an optional backtick formatting-toolbar button.

## 0.1.8.77
- Improved model favorites with heart buttons across the quick menu, Available models, and Explore all models, with synced favorite ordering and visibility.

## 0.1.8.76
- Improved S.AI Toolkit compatibility for generation metadata, message recovery, editing, and sidebar integration.
- Added Smart Filter Presets and a basic My Creations audit.
- Added an optional formatting toolbar and recommendation helpers for bot discovery.

## 0.1.8.75
- Expanded chat text replacements with scope, preview, saved-message mode, and Undo support.
- Added animated bot/avatar controls with configurable playback behavior and page scopes.
- Added local persona organization, a customizable model quick menu, and Lorebook filters.

## 0.1.8.73
- Added optional advisory moderation-wording warnings for Lorebooks, with optional chatbot-editor warnings and visible Lorebook-entry checks.
- Added a local Follow Creator list with Follow / Following buttons and Saved Lists management.
- Added optional DeepL chat translation with per-message/auto translation, Mini Panel controls, local caching, protected terms, setup/testing, and usage checks.

## 0.1.8.72
- Fixed advert-banner cleanup hiding creator form content when personality or other editable text happened to contain banner-like phrases such as “remembers more.”

## 0.1.8.71
- Added optional local-only chat text replacement rules with normal text or Regex matching.
- Added an optional Copy Memory action to each memory three-dot menu.

## 0.1.8.70
- Fresh installs now open Settings automatically and start with every optional checkbox off; only the main QoL switch is on by default.
- Moved the new/updated settings count out of Settings search and into Changelog.

## 0.1.8.69
- Added Settings search, clearer tab descriptions, and quick setup presets.
- Added diagnostic copying, install/update notices, and NEW/UPDATED markers.
- Added backup import preview, expanded storage details, cleanup tools, and more Undo coverage.
- Added an optional current-page feature summary to the Mini Panel.

## 0.1.8.68
- Improved the dedicated asterisk button and added optional automatic `*` pairing plus a Mini Panel toggle.
- Kept Later buttons aligned with SpicyChat's native favorite control.
- Made scroll arrows smaller on listing/profile pages and removed an unused Mini Panel setting.

## 0.1.8.67
- Added an optional scroll-to-bottom button and restored the scroll-to-top Settings toggle.

## 0.1.8.66
- Moved the dedicated `*` button out of SpicyChat's hidden Plus wrapper and into the composer controls row.

## 0.1.8.65
- Added the first composer-rerender recovery attempt for the dedicated `*` button.

## 0.1.8.64
- Added optional Show full text / Show less buttons to Lorebook entries so long entry text can be expanded without opening the editor.
- Changed the My Personas description helper to add per-persona Show more / Show less buttons instead of expanding every description automatically.

## 0.1.8.63
- Added an optional dedicated asterisk button in the chat composer that wraps selected text in `*asterisks*` or inserts `**` with the cursor between them.

## 0.1.8.62
- Added passive S.AI Toolkit detection with an option to let Toolkit handle overlapping features when it is detected.
- Added a searchable Favorite history for finding bots that were previously seen on the Favorites page, including accidentally unfavorited bots.
- Added an optional floating scroll-to-top button for long SpicyChat pages, including mobile-friendly positioning.

## 0.1.8.61
- Added Pin selected to the bulk Memory Manager so multiple selected memories can be pinned in one batch using SpicyChat's own Pin Memory action.

## 0.1.8.60
- Fixed the chat OOC shortcut duplicating itself whenever SpicyChat rerendered the composer while typing, sending, or clearing a message.

## 0.1.8.59
- Added a new-chatbot visibility default that can automatically select Public or Unlisted while still allowing manual changes before saving.

## 0.1.8.58
- Improved Settings/storage performance by only rewriting and reloading data that actually changed.
- Reduced repeated listing scans and delayed large Saved Lists/Blocking managers until their tabs are opened.

## 0.1.8.57
- Changed the OOC shortcut so it only replaces Image when image generation is hidden.
- Added Mini Panel Auto voice plus Change Title, Clone, and Remove actions for saved conversations.
- Added Select unpinned to Bulk Memory Manager and improved long-card description timing.

## 0.1.8.56
- Added an option to expand full persona descriptions on the My Personas page.

## 0.1.8.55
- Fixed My Creations → Chatbots character names being squeezed or covered by QoL card-action buttons.

## 0.1.8.54
- Fixed bulk Memory Manager deletion failing to open SpicyChat's three-dot memory menu and find Delete Memory.

## 0.1.8.53
- Added optional bulk Memory Manager controls with per-memory checkboxes, Select all, Invert, Clear, and Delete selected.
- Fixed automatic notification reading when SpicyChat had more than one unread product update.

## 0.1.8.52
- Fixed sidebar and top-bar cleanup sometimes stopping on pages that constantly update in the background.

## 0.1.8.51
- Fixed another persona auto-detection false positive where payment text such as Cryptocurrencies / One time payment could still be saved as a persona.

## 0.1.8.50
- Fixed persona auto-detection accidentally saving unrelated radio-button choices such as Credit Card, VENMO, and Alipay as personas.

## 0.1.8.49
- Updated advert-banner cleanup for SpicyChat's newer Custom Voices, Lorebooks, and Annual Premium carousel banners, including black/empty hidden slides.
- Fixed Auto-AFK inactivity tracking being reset by background page loads or extension/browser restarts.
- Added a once-per-minute Auto-AFK check and a manual cleanup diagnostic in Settings.

## 0.1.8.48
- Reworked QoL scheduling so important chat/list filters run before cosmetic cleanup.
- Reduced repeated card/listing scans and disabled unnecessary work for inactive features.
- Improved long-chat rendering and language/compact-layout performance.

## 0.1.8.47
- Added optional Multiple Chats / Chat History controls beside the bot name, including Chats and + New Chat shortcuts.

## 0.1.8.46
- Added optional Auto-AFK cleanup for inactive SpicyChat tabs with page scopes, unload/close actions, active-tab protection, and a configurable timeout.
- Added a Mini panel in this SpicyChat tab switch directly in Settings for Android and browsers where the popup is inconvenient.
- Fixed the saved default for enabling the mini panel in new tabs not being restored correctly.

## 0.1.8.45
- Moved the chat Later button beside the bot name and made it work independently from chat-header cleanup.
- Added an option to close the current chat tab after saving a bot for Later.

## 0.1.8.44
- Added a Bot Tools settings tab for chatbot creation/editing helpers, custom snippets, and chat-page bot tags.
- Added an option to automatically tick the Community Guidelines agreement on chatbot and Lorebook creation pages.

## 0.1.8.43
- Expanded fancy Unicode normalization for more italic, script, fraktur, mixed mathematical letters, and older Android WebViews.
- Added optional cleanup for decorative wrappers such as ꧁ ꧂ ◦ ° and ⋆.
- Added an option to automatically open the Advanced section while creating or editing a chatbot.

## 0.1.8.42
- Fixed advert-banner cleanup hiding the real Create Lorebook page.
- Kept bots visible on My Creations → Chatbots even when opened-chat hiding is enabled.

## 0.1.8.41
- Expanded fancy Unicode normalization for mathematical/script-style bot titles.
- Made message timestamp and generation-detail sub-options start disabled by default.
- Fixed stale mini-panel tab overrides preventing the panel from appearing when enabled globally.

## 0.1.8.40
- Fixed repeated mobile injection creating duplicate mini-panel/open buttons.
- Fixed OOC and persona sections sometimes disappearing after chat navigation.
- Added an option to replace the image-generation button with an OOC button.

## 0.1.8.39
- Fixed the Mini Panel layout preview so Chat list and Bot listing use their own simulated layouts.
- Added optional message timestamps and generation details, including model, engine, generation time, and available generation settings.
- Saved captured generation metadata locally so it can be shown again when the same messages reload.

## 0.1.8.38
- Added generation setting profiles for saving and restoring the selected model and available sliders.
- Added generation-profile backup/import support.
- Added S.AI Toolkit credit for reused GPL-3.0 code.

## 0.1.8.37
- Added optional {{char}}, {{user}}, CONTINUE, and no-control helper buttons in the chatbot editor.
- Added reusable custom bot-editor snippets that insert at the current cursor position and are included in backups.

## 0.1.8.36
- Removed QoL's duplicate Most messages first sort now that SpicyChat has its own Most Active sort.
- Fixed the mini-panel chat-sort dropdown closing while selecting an option.
- Added separate mini-panel settings for opened and blocked counts.
- Added a per-tab mini-panel enable/disable switch with a configurable default for new tabs.

## 0.1.8.35
- Fixed language-filter cards flashing between hidden and visible while SpicyChat recycles them.
- Added optional clickable bot tags on chat pages and + buttons that append tags to the saved include filter.
- Added an option to keep the current chat position while typing after scrolling up.

## 0.1.8.34
- Removed QoL's automatic scrolling after send, continue, or regenerate actions.
- Fixed QoL trying to hold the chat at the bottom when SpicyChat wanted to control scrolling itself.

## 0.1.8.33
- Added an option to hide SpicyChat's unread notification badge from the browser-tab favicon.
- Reworked automatic notification clearing so it reacts to real unread product updates instead of opening the panel on every page load.

## 0.1.8.32
- Kept the newest chat messages fully rendered in performance mode so long chats still scroll correctly at the bottom.
- Fixed bottom mini-panel placement moving unnecessarily when the message box grows taller.

## 0.1.8.31
- Fixed card description expansion selecting the wrong part of some bot cards and collapsing again while scrolling.

## 0.1.8.30
- Kept bottom mini-panel placements above the composer and send controls.
- Saved dragged custom panel positions separately for each browser tab.
- Added a draggable Mini Panel layout preview in Settings.

## 0.1.8.29
- Fixed the saved-persona count being shown more than once.
- Added Mini Panel controls for width, control size, and maximum screen height.
- Added an option to collapse the panel when it would cover chat messages on narrow windows.
- Fixed panel height so it shrinks to the controls currently enabled.

## 0.1.8.28
- Added a dedicated Mini Panel settings tab with per-item controls and improved panel sizing.
- Reorganized saved-list managers and added Show more / Expand all controls.
- Added optional Favorite-history tracking and adjusted creator-favorite placement.

## 0.1.8.27
- Fixed extra empty space in the mini panel and reordered its controls.
- Added an option to open the mini panel collapsed on new SpicyChat pages.
- Stopped normal background QoL clicks from scrolling chat pages.
- Removed the extra mini-panel placement hint from Settings.

## 0.1.8.26
- Removed the chat-header Mini Panel dock and improved safer corner/sidebar placement.
- Made the Mini Panel shorter with internal scrolling and more reliable custom-position saving.
- Reordered chat Mini Panel controls.

## 0.1.8.25
- Added more Mini Panel docking/dragging options and improved mobile behavior.
- Fixed long card-description expansion while scrolling.

## 0.1.8.24
- Changed backup imports to merge and dedupe saved data instead of replacing it.
- Improved mobile Settings text, Mini Panel placement, and card-description persistence.

## 0.1.8.23
- Added long-chat performance options with lighter off-screen rendering and slower cleanup scans.
- Added an option to pause most QoL checks while a tab is not focused.
- Added fixed-corner mini-panel placement and optional dragging with saved custom positions.

## 0.1.8.22
- Changed opened-chat tracking so right-click alone no longer marks a bot as opened, while real opens still do.
- Added an Opened Chats manager with search, sorting, images, links, and remove buttons.
- Added an option to hide bots after saving them for Later.
- Refreshed card description expansion while scrolling so newly loaded cards stay expanded.

## 0.1.8.21
- Reworked chat export to read actual message blocks, group messages by speaker, and keep optional bot info separate from the transcript.

## 0.1.8.20
- Improved the Later bots manager with larger cards, better links, search, and sorting.
- Added a failed-message helper with Restore, Copy, and Resubmit controls for SpicyChat's red Resubmit error.
- Cleaned up card action placement across different card sizes.

## 0.1.8.19
- Made fresh installs start with the main extension switch enabled while optional features stay disabled.
- Added separate draft protection for Remove Messages.

## 0.1.8.18
- Added the installed extension version to the popup.

## 0.1.8.17

## 0.1.8.16
- Fixed Remove Messages clearing the user's current draft by saving and restoring only the text typed before removal mode.

## 0.1.8.15
- Added the first draft-recovery pass for Remove Messages.

## 0.1.8.14
- Made cleanup safer so one failed helper no longer stops the rest of QoL.
- Fixed a DOMException in card/Later-button checks.
- Improved opened-chat tracking for right-click and middle-click opens.
- Added an option to expand longer card descriptions.

## 0.1.8.13
- Fixed the Later button not appearing on bot cards.
- Improved opened-chat tracking for right-click and middle-click opens.
- Changed the custom-name placeholder to use User as the example.

## 0.1.8.12
- Fixed chat three-dot menus being interrupted by QoL cleanup and added a short pause after important chat-menu actions.

## 0.1.8.11
- Added chat top-bar tools, more cleanup options, and chat-header Later/favorite controls.

## 0.1.8.10
- Fixed a storage error after extension reloads or updates.
- Added Later bots with saved name, image, description, chat/profile links, Settings management, and backup/import/export support.
- Added a Changelog tab to Settings.
- Restored the card Info/Profile button beside the block X.

## 0.1.8.9
- Added blocked-bot sorting and changed fresh-install defaults so optional features start disabled.
- Improved OOC behavior.

## 0.1.8.8
- Added local favorite creators with star buttons, Settings management, and optional filtering protection.
- Added a Home-only filter for purple For You cards.
- Added a Copy button beside Narrow by tag Reset to restore the saved include/exclude tag template.

## 0.1.8.7
- Reworked OOC insertion so it appends to the active text box without overwriting existing text.

## 0.1.8.6
- Fixed blocked words matching inside unrelated words and made short entries match as words/phrases instead of random substrings.
- Rechecked previously hidden chat rows so old false positives can become visible again.
- Improved cleanup when the main extension switch is turned off.

## 0.1.8.5
- Added an option to hide large advert/promo banners such as Memory, Custom Voice, and Lorebook promos.

## 0.1.8.4
- Adjusted persona quick-button sizing.
- Added an option to keep the chat box usable while the bot is responding.
- Added an option to reduce forced scrolling while typing.
- Improved message quick-action button usability.

## 0.1.8.3
- Added model-selector cleanup with expanded descriptions and optional locked-model upgrade cleanup.
- Added quick message actions for Copy, Edit, and Report.

## 0.1.8.2
- Fixed persona names accidentally including Default and improved persona detection.
- Moved persona modal controls so the Chat with button is easier to reach.

## 0.1.8.1
- Added top-bar cleanup for language, notifications, theme, and avatar-name display.
- Fixed model-selector protection around SpicyChat's own controls.

## 0.1.8
- Added configurable text normalization for filters, search, and language checks, including fancy Unicode, punctuation, invisible characters, and decorative symbols.

## 0.1.7
- Added paging/search/sorting controls for blocked and Not interested bots.
- Added visible controls for beta listing refill and Fill now.

## 0.1.6
- Added a conservative language filter with allowed-language settings.
- Added beta listing auto-fill after cards are hidden.

## 0.1.5.1
- Fixed persona switching sometimes choosing the wrong persona or failing to confirm the change.

## 0.1.5
- Added better saved-persona detection and quick switching from the mini panel.

## 0.1.4
- Reworked Settings into clearer tabs.
- Added managers for blocked and Not interested bots plus category-based import/export.
- Added more sidebar cleanup options, favorite-page protection, soft hiding/dimming, and debug badges.

## 0.1.3
- Added background chat-list loading so longer operations can continue without tab focus.
- Added stop/cancel handling for longer chat-list loading.

## 0.1.2
- Added OOC placeholders and safer insertion behavior.
- Added stop controls for chat loading.
- Improved persona detection and opened-chat hiding behavior.

## 0.1.1
- Added chat-list search/sorting, early persona helpers, first chat export tools, and the first OOC insert button.

## 0.1.0
- Added the first Help tab.

## 0.0.6
- Fixed send/mic cleanup, added the card block X, and improved premium/chat-control hiding.

## 0.0.4
- Split the extension into separate files for easier patching.

## 0.0.1
- Started SpicyChat QoL with the first NSFW helper, premium cleanup, opened-chat tracking, card hiding, and bot blocking.

## v0.2.0

- Public release of the 0.1.9.x testing line under the shorter **SpicyChat QoL** name.
- Focused on local-first customization, creator tools, saved-list organization, chat helpers, Memory/Lorebook workflows, backups, and long-chat performance.
- Chrome and Firefox use the same feature code; Android wrapper-specific behavior remains in the separate Android project.
- Detailed test-build history is kept below so older bug reports and feature additions are still traceable.

## 0.1.9.118 v0.2 release candidate

- Stability/performance pass only; no new feature batch.
- Large My Creations/listing work is reduced and the listing paint guard now runs on listing routes.
- Opened-chat persistence avoids repeated current-chat work once the entry is complete.

## 0.1.9.117 Memory / Lorebook / compatibility

- Memory Manager can export all or selected SpicyChat memories to readable JSON and import selected memories into the current chat with a preview and exact-duplicate check.
- Optional Lorebook multi-entry workspace keeps several selected entries editable together and saves them back through SpicyChat's normal entry editor.
- My Creations Load More compatibility was tightened so manual clicks stay native and optional auto-load waits for them to finish.
- Creator wording warnings remain opt-in and advisory. Balanced mode suppresses broad standalone false positives; All reported terms is available for users who want the full community list.
- Large bot listings can use browser `content-visibility` in Adaptive/Aggressive/Maximum performance modes to reduce off-screen paint work.

## 0.1.9.116 Opera compatibility

- Detects Opera separately in diagnostics.
- Cleans up route-specific QoL controls when SpicyChat keeps the same page document during navigation.
- Keeps chatbot editor controls inside the actual chatbot form instead of matching sidebar Create buttons.
- Avoids known unauthenticated background card-token retries on Opera when the MAIN-world request cannot be used.
- Browser AI in Creator Writing Assistant now reports whether it is available, initializing/downloading, unavailable, timed out, or cancelled.

## 0.1.9.115 RP State Tracker

- **RP State Tracker** (opt-in, suggestion credit: jumjam): keeps current roleplay state separate from long-term memory, including inventory, worn/equipped items, location, injuries/status, stats, currency, party members and objectives.
- Clear state lines such as `Inventory: flashlight, 2 medkits`, `Location: motel room 204`, or `State: HP=42/50; Gold=80` can update automatically. Assisted mode can suggest simple natural-language changes for review instead of applying them silently.
- State changes carry the current Storydate when Internal Day Tracker is available.
- Current state can be sent to the bot as a compact visible OOC block manually, whenever it changes, or with every message. Individual state items can be excluded from that context block.
- RP State Tracker data is included as its own backup/import category. Backup schema is now v11.
- **Context Keeper** automatic capture now checks small batches of new settled messages as intended. Added Light / Recommended / Detailed setup buttons, clearer token-use wording, and an approximate token count for the current recap.
- Performance diagnostics now avoid repeated waits after card-token bridge failures, compare like-for-like baselines, separate long tasks with/without QoL overlap, and identify slow Settings storage reads.
- Known issue: Opened / Favorites / Later Smart Filters can still return zero Home matches on some listing layouts.

## 0.1.9.114 Backup Manager & stability sweep

- **Chatbot Backup Manager completion**: compact editor controls, manual checkpoints, automatic changed-revision backups, restore-to-editor review flow, and separate profile snapshots.
- First-time users who enable chatbot backup tools get automatic backups **On** by default; manual-only remains supported. Automatic retention defaults to **10 per bot** and accepts a configurable **1–50** value.
- Manual checkpoints are preserved independently from the rotating automatic limit and support rename, copy/export, duplicate, restore, and delete.
- Restore creates a manual **Before restore** safety checkpoint, fills supported native fields/tags/visibility, and never auto-saves the chatbot.
- Visited bot profiles are included in Backup Manager when the existing profile-visit backup option is enabled. Chatbot backups do **not** store Lorebook associations.

## 0.1.9.113 exact-message-count bug fix

- **Exact bot message counts** no longer depend on SpicyChat's own `multi_search` request being observable. Missing visible-card totals are batch-resolved through the same public Typesense search service, while passive capture remains available when the site exposes a matching response.
- Exact values are rendered with comma thousands separators (`142402` → `142,402`) and only the minimal `character_id` + `num_messages` fields are requested by the fallback lookup.

## 0.1.9.112 Storydate, language exclusion & resilient restore

- **Internal Day Tracker / Storydate** (opt-in, idea credit: Chibs): local per-chat Day N tracking, compact `day.phase` Storydate (`35.3` = Day 35 evening), Manual / Conservative Auto / Assisted modes, explicit `Day 35:` and `Storydate 35.3` recognition, automatic anchors from `Day 35: event` notation, strong relative jumps such as “three days later”, reviewable weaker transitions, manual correction, and Context Keeper chronology including yesterday/last-night/tomorrow mappings.
- **Language Filter include/exclude mode** (suggestion credit: SeregaKR): show only selected languages or hide selected languages. Exclude mode leaves unknown/untagged bots visible unless an excluded language is confidently detected.
- **Version-tolerant backup restore**: recognized categories from newer backup schemas can be restored while unknown/newer categories are skipped and reported instead of blocking the whole import. Storydate data is independently selectable in backups.
- **Smart Filter zero-match diagnostics**: Opened/Later/Favorites report usable card-ID coverage when zero loaded cards match, with deeper counts in the tooltip/performance state for Android/WebView debugging.

## 0.1.9.111 creator/backup/persona polish

- Fixed exact chatbot tag export: tag names are no longer accidentally shortened by array-index truncation.
- Added a QoL **Import bot JSON** path on the chatbot creator that restores supported bot text fields, visibility and saved SpicyChat tags while intentionally ignoring Lorebooks.
- Removed the accidental creator-consent allowlist gate from Follow creator/new-bot notifications; the user still opts in locally, and the watcher only reads public creator/bot listings.
- Creation Audit now records and surfaces the verification source (Character API, public profile, owner editor, or local owner cache) in card details and exported reports.
- Persona local-copy/restore continues using the current Persona editor fields and local avatar capture so full text + avatar data are preserved where SpicyChat exposes them.

## 0.1.9.110 stabilization & consent-safe creator following

- Smart Filter Opened/Later/Favorite matching now tolerates alternate Android/WebView card identity layouts and can conservatively bridge exact local metadata when card IDs differ or move.
- Saved-bot managers support comma-separated multi-term search and explain that bulk selections remain active after Apply until cleared.
- Own-bot backups exclude transient moderation state such as Under Review from signatures, revisions and portable exports.
- 110 temporarily added a creator-consent allowlist gate; this was removed again in 111. Current behavior is local user opt-in against public creator/bot listings.
- QoL sidebar cleanup now protects SpicyChat's native navigation-menu toggle from accidental QoL-owned hiding.

## 0.1.9.109 discovery, audit & organizer fixes

- Saved Bots Hub can multi-select and bulk-organize the full locally known bot set, not only Later bots or currently visible listing cards.
- Smart Filter **Opened** correctly recognizes `/chatbot/<id>` cards and no longer reports matching loaded cards while leaving all of them hidden.
- My Creations Smart Filter / Creation Audit controls are mobile-safe and stay inside the viewport.
- Creation Audit can reuse positive owner-editor/local backup fields when public profile data cannot verify them, while still keeping **unverified** separate from **missing**.
- Optional per-chatbot image-generation prompt memory restores an otherwise lost edit-page image prompt after refresh/revisit.
- Select bots now defaults beside the listing search area, with the older below-Group-Size placement optional; its setting/search wording is explicit. Has Lorebook search/filter wording was clarified too.

## 0.1.9.108 chat folders & bulk organizing

- Added local Chat folders and a multi-select **Select chats** mode on `/chat` and `/chats`, including folder create/rename/delete, folder filtering, and bulk add/remove without changing SpicyChat's real conversations.
- Chat organization is stored per exact conversation path and is included in normal QoL backup/import and storage health checks.

## 0.1.9.105 store-candidate hardening

- Corrected the project GitHub links to `drachescript/spicychat-qol-extention`, replaced the old feedback-thread link with the QoL Discord server, and added a plain-language **Simple feature guide (ELI5)** in Help.
- Stabilized Bot Organizer context/folder controls across chat, character-profile, creator-listing, and temporary React remounts so buttons and open menus do not repeatedly disappear/reappear.
- Added chat-header self-repair when SpicyChat remounts its native header, plus a compact-screen **Profile** shortcut and a less crowded mobile title/action layout.
- Fixed Smart Filter **Opened** conflicting with the general hide-opened preference; explicitly choosing Opened now wins for the currently loaded listing cards.
- Added chat-header repair activity to safe performance diagnostics for easier reproduction of intermittent UI failures.
- Release focus is stability and Chrome/Firefox store readiness; no large new feature is being introduced after this point unless required for a blocker.

## 0.1.9.104 backup + Lorebook controls

- Chatbot and Lorebook editor backup controls have separate master toggles from automatic saving, so manual-only backup mode is supported.
- Backup strips are compact and stay inside the actual editor UI instead of becoming full-width page banners during React mount.
- Lorebook Entry Manager bulk actions are collapsed behind one compact button, and every row metric/action plus every bulk action can be enabled independently.

## 0.1.9.103 followed-creator notifications

- Optional new-bot checks for locally followed creators using SpicyChat's Latest sort.
- Configurable interval, browser notifications, Discord webhook notifications, manual checks, recent detections, and Saved Bots Hub/Bot Status Center integration.

## 0.1.9.102 creator/discovery additions

- Creator Writing Assistant with local checks and optional browser-provided on-device AI.
- Creation Audit workflow statuses (Needs work / Testing / Finished).
- Public bot/profile export to JSON, Markdown, or HTML.
- Saved Lists organizer for QoL Favorite history + Later.
- Local tag aliases / emoji mappings.
- Expanded recommendation controls and native rating-dialog shortcuts.
- Optional read-only personal usage summary from existing QoL data.

# SpicyChat QoL features

Current features, upcoming milestones, and longer-term plans for SpicyChat QoL. Version history lives in `CHANGELOG.md`.

Everything is optional. Fresh installs keep the main extension switch on, while optional QoL features stay off until enabled directly or through a setup preset.

## Setup and compatibility
- Chrome and Firefox share the same feature code. Firefox packages keep the Gecko metadata needed for signing and supported Android installs.
- Release builds avoid direct `document.write`, dynamic `innerHTML =`, `eval`, and `new Function` usage in extension JavaScript where possible to keep browser-store validation clean.
- Settings are grouped by feature area, with a feature catalogue that shows current On/Off/Built-in/Planned status and jumps to the relevant controls without changing stored setting keys.
- Compact/collapsible **Find a setting** search across every Settings tab, including fuzzy/typo-tolerant matching for harder-to-find controls. The heavy search index is deferred until search is opened.
- Built-in **Control Center** for fast navigation, creator backup/Lorebook relationships, read-only local data-health checks, per-dataset storage sizes, a no-write migration dry-run, performance baselines, and support checks.
- Optional **QoL Command Palette** on SpicyChat pages with a configurable Ctrl/Cmd+K-style shortcut, fuzzy action search, pinned/recent actions, and quick access to locally known Favorite/Later bots, Lorebooks, and Personas.
- Settings sections can be opened and closed like drop-downs, with an option to start them all collapsed to reduce scrolling. Sections can also be pinned, reopened from a recent-sections list, filtered to enabled/customized sections, or reset individually. Search and feature shortcuts open the matching section automatically.
- Optional one-time What's New toast after an extension update with a direct link to the Changelog tab.
- Minimal and recommended setup presets, plus a one-click way to turn optional features back off.
- Passive S.AI Toolkit detection with optional compatibility handling for overlapping generation metadata, recovery, exports, sidebar cleanup, and Toolkit WYSIWYG editing.
- Install/update notice in the extension popup and NEW/UPDATED markers for recent settings.
- Safe diagnostic copy for bug reports without chat text or saved private content.

## Saved lists and bot discovery
- Bot Status Center combines opened-history tracking/hiding/management with on-demand availability checks, Character Update Watch, saved local bot copies, duplicate/reupload hints, last-seen public profile preservation, importable JSON export, and revisioned local backups for your own bots while editing.
- Favorite bot history, including bots that were later unfavorited on SpicyChat.
- Favorite creators with optional filter protection.
- Local Follow Creator list with Follow / Following buttons and Saved Lists management.
- Later list with card and chat-page buttons, plus optional filtering/hiding behavior.
- Blocked and Not Interested lists with search, sorting, links, and local management; blocked-bot metadata avoids recommendation badges such as `For You`, and legacy bad names can be repaired from saved/profile metadata.
- Recently Changed / Undo support for selected local QoL actions including Bot Organizer changes, message bookmarks, Saved Text / Snippets, Context Keeper edits, Later changes, and supported bot-block actions.
- Local Bot Organizer with multi-folder organization, private notes, personal tags, creator-only status labels, direct My Creations folder management, and Everything-backup support.
- Unified Saved Bots Hub deduplicates Favorite history, Later, Recently Seen, Bot Organizer and Bot Status Center opened-history entries into one searchable local overview without merging the underlying stores. It can also multi-select the shown or entire filtered locally known bot set for bulk folder/tag organization without requiring bots to be added to Later first.

## Card and listing tools
- Block/filter by tags, words, creators, bot IDs/names, groups, language, opened chats, and other saved states.
- Optional Home For You cleanup.
- Optional longer card descriptions.
- Lorebook-aware listing filters/sorting with counts, a Needs Lorebook shortcut on My Creations, and a lightweight **Has Lorebook** toggle inside SpicyChat's native search/tag sidebar that filters currently loaded cards using the site's own Lorebook badge.
- Card text blocking matches detected bot names/descriptions across both chat-link and profile-link layouts, with tolerant punctuation/spacing/compact-abbreviation handling, multi-word nickname/name matching, creator display-name/@handle checks, and a Settings tester for verifying current word/tag/creator rules. The QoL block X is suppressed on **My Creations** by default, with an explicit opt-in if someone really wants it there.
- Smart Filter Presets with built-in and custom presets plus include/exclude filtering for Lorebook status, Opened/Unopened state, Followed/Not followed creators, Favorites/Not favorites, and Later/Not Later; saved presets can be renamed/deleted, up to three built-in/custom presets can be pinned for one-click access, and older preset data remains compatible.
- Favorite/Later managers with search, saved-time/name/creator sorting, cross-list filters, Bot Organizer folder filters, local folder/tag/status/note context, and quick Favorite-history to Later actions.
- Recommendation helpers for hiding favorites/own bots, unopened or Lorebook-only discovery, temporary session hiding, and a random visible pick.
- Card / discovery workflow with Normal/Compact/Dense card density, optional card-body → profile navigation, Copy Bot Info quick actions, local Recently Seen history, side-by-side local comparison, quick Not Interested, and quick Unblock for dimmed ID-blocked cards.
- Optional animated bot/avatar controls with Freeze, timed play-then-freeze, or Animate on hover and separate page scopes.
- Optional listing refill after cards are hidden, with card-growth-aware loading that avoids unnecessary fixed waits and automatic scroll jumps.
- Bot Organizer listing filters plus direct local folder create/rename/delete controls and bulk selection for folders, tags, Later, copying links, and creator statuses on My Creations.
- Optional Home/Recommendations bulk block **Select mode** with a small page launcher and Mini Panel shortcut; while active, clicking bot cards selects/unselects them directly before the selection is sent through the normal QoL block path.
- Optional Quick Dislike after blocking is off by default. If you enable it, blocking/favoriting and normal user activity restart the idle cooldown (5 minutes by default); once the queue starts, ratings use a short safety gap instead of another full idle cooldown.
- Optional My Creations auto-load that waits for and presses SpicyChat's exact native My Chatbots Load More control for a configurable number of extra pages/batches (default 1), including React-mount/re-enable retries and real card-growth confirmation.
- Text normalization for displayed bot-card text plus filters/search/language matching.

## Chat tools
- Local Chat folders on `/chat` and `/chats` with All/Unfoldered/folder filtering, folder create/rename/delete, and a bulk **Select chats** mode for adding or removing several exact conversations at once.
- Chat top-bar cleanup and bot shortcuts for Later, chat history, and new chats.
- Optional Chat Nudges for up to two selected chats, with 5-hour, 8-hour, 1-day, 2-day, or 1-week inactivity delays. Reminders reuse the last real bot reply for context, can use an optional browser notification, and fall back to an in-page reminder; they never generate or send a new SpicyChat message.
- Chat-list Saved-state filtering can narrow conversations by QoL Favorite history, Later, both, any locally saved bot, or neither.
- Local Message Bookmarks / multiple pins with optional notes, a per-chat manager, direct jump actions, backup/restore support, and browser-style Back / Forward history for QoL search/bookmark jumps.
- Saved-conversation quick actions for Change Title, Clone, and Remove, shown in their own small row so they do not cover SpicyChat's date/message-count line.
- OOC presets and optional OOC composer button.
- Optional Reply Instructions with a global default, bot-specific local overrides, once-per-session/every-message/manual modes, optional OOC wrapping, and an RI composer control. Instructions influence future replies by being sent as normal visible chat text; they are not a hidden system prompt.
- Optional **Global Memory / Baseline Notes** can add the same user-written guidance across chats once per session, every message, or manually, with optional OOC wrapping and a small GM composer control. It uses normal visible outgoing text because SpicyChat does not expose a hidden global system-memory slot to QoL.
- Optional local Soundscapes / Ambience with reusable named scenes, up to five simultaneous local-file or direct-URL layers, per-layer volume/loop/repeat intervals, master volume, simple scene fades, configurable page scopes, a direct chat composer control, and optional Mini Panel controls. Scene/layer edits use verified local saves so names, toggles and volumes survive Settings reopen more reliably. Audio generation is not built in; local audio bytes stay in dedicated extension storage.
- Dedicated `*` composer button and optional automatic closing-asterisk pairing; the dedicated button automatically hides when the formatting toolbar already provides the same `*` action wrapper. Dedicated asterisk/backtick shortcuts can be placed inside the typing box on the right or outside the typing box on either side.
- Optional compact formatting toolbar for wrapping selected text in actions, bold, bold+italic (`***`), strikethrough, parentheses, quotes, backticks, square brackets, braces, or up to five user-defined literal wrapper pairs. Dedicated asterisk/backtick composer shortcuts use a stable inline slot inside the typing bubble so adjacent RP/Reply controls do not make them jump sides.
- Optional alternate-dialogue styling for AI/user backtick text used as texting, thoughts, telepathy, or comms without changing the saved message; supports both rendered inline-code and literal-backtick message variants.
- Chat text replacements with normal text or Regex rules, AI/user scope, local display mode, or optional saved-message edits through SpicyChat's normal Edit flow; saved edits can expose an Undo button when possible.
- Optional DeepL message translation with manual/automatic translation, local caching, protected terms, and Mini Panel controls; originals stay visible.
- Message quick actions for Copy/Edit/Report plus optional Remove Image and safe Resend/reuse on user messages. Each action can be enabled independently; the combined Copy/Edit/Report toggle is only a shortcut. QoL replaces the native three-dot launcher only when that message has at least one applicable quick action. Copy runs directly when possible, Edit/Report/Remove Image silently invoke SpicyChat's native action, and Resend restores old user text into the composer without auto-sending or silently overwriting a current draft. Includes draft protection, failed-message helpers, and typing/scroll-position helpers.
- Search Inside Current Chat supports Bot / You / Bookmarked scopes, exact-phrase, case-sensitive, whole-word and Regex matching, plus optional repeated older-message loading until a match is found.
- Optional scroll-to-top and scroll-to-bottom bubbles with configurable page scopes for Home, Chats, individual chats, creator/editor pages, profiles/Lorebooks and other listings. The same controls work in desktop browsers, Firefox and the synced Android app; on individual chats the ↑ action can load one or all older message batches through SpicyChat's native Load Previous Messages control either before the jump or in the background while you keep reading.
- Bulk Memory Manager with multi-select, Select unpinned, Pin selected, Delete selected, Keep selected for Context Keeper, manual Load all memories, JSON export/import with selective preview, optional automatic Load More Memories, an optional Copy Memory menu action, and a Reorder pinned workflow that re-pins through SpicyChat's own controls and verifies the visible result.
- Context Keeper with automatic high-confidence durable-detail capture from small batches of settled new messages, configurable strictness/cadence/cap, Light / Recommended / Detailed presets, a direct chat three-dot-menu entry, optional manual Keep/Remember actions, saved-detail search/category/source filters, per-detail recap inclusion, use-all/remove-excluded cleanup actions, approximate recap token use, and copyable OOC recaps. Saved details stay local and do not use chat tokens until a recap is inserted/sent. Automatic capture never auto-sends the recap or writes SpicyChat Memories by itself.
- Generation profiles plus independently configurable timestamps, model/engine details, elapsed time, and captured generation settings where available; the combined metadata switch is only a one-click default and is no longer required for the individual detail options.
- Optional RP context-full warning with a configurable threshold. QoL prefers prompt/context usage exposed by SpicyChat, can use a manual context-window size when auto-detection is unavailable, and otherwise uses a conservative local token estimate from captured message metadata. The warning can stay in-chat or also use the existing optional browser-notification permission.
- Optional customizable model menus with synced favorite hearts/order across the quick picker, Available models, and Explore all models, plus hidden models and favorites-only quick views.
- Optional CSS-driven AI/user chat bubble appearance with independent colors, borders, opacity, shapes, shadows, contrast presets, and granular reset controls. An optional My messages appearance lock can capture SpicyChat’s native background/normal-text colors and locally reapply them if a site update resets the rendered user bubble.
- Optional RP Format Repair for AI messages that locally detects messy speech/action/narration formatting, converts bold/parenthetical action blocks, repairs stray Markdown, preserves inline emphasis/meaningful quotes/backtick dialogue, and can show clean unquoted or quoted-dialogue RP styles without silently editing the saved response.
- Chat Export with one-click plain-text copy plus TXT, Markdown, HTML and JSON exports. It can load older messages first, keeps basic message formatting, and supports optional bot info, OOC notes, generation details, message numbers and avatars.
- Persona saving and quick switching, plus an optional local Persona Manager with favorites, folders, private notes, duplicate-persona prefill, profile-picture copying, search, custom ordering, matching order/metadata in the in-chat picker, and a Local Persona Library with saved-text/avatar status, preview/copy, rendered-page refresh for incomplete/older copies, compressed local avatar preservation, and restore tools without bypassing SpicyChat persona limits.
- Lorebook entry Show full text / Show less controls.
- Auto voice for new AI replies using SpicyChat's native Listen control when available.
- Long-chat performance controls that reduce repeated work, can pause most QoL work in background tabs, and offer Adaptive/Aggressive/Maximum modes for slower or very large chats.
- Lazy/paged Settings managers for very large saved lists so Options startup, tab switching, searching, and Bot Status Center work stay responsive. Large Soundscapes audio-library storage is also lazy-loaded only when its Settings card is approached or enabled.
- Optional local performance timings and counters that can be included in a copied Diagnostics report. Nothing is sent anywhere automatically.

- Long-chat processing uses shared dirty-message batching so chat search, message quick actions, alternate dialogue, translation, text replacements, and Auto voice can update changed/new messages without repeatedly rebuilding the full loaded conversation. Older-history insertion enters a temporary low-impact batch, and display-only message transforms stay out of the native Edit/Save path until the saved message has settled.

## Creation tools
- `{{char}}`, `{{user}}`, CONTINUE, no-control, and custom editor snippets.
- Optional automatic Advanced-section opening on new chatbots, saved drafts, and edit pages.
- Optional Save & Stay and Save & Chat actions on chatbot create/edit pages, including a new-tab testing mode that keeps the editor available.
- Chatbot and Lorebook backup controls are separately enableable from automatic saving. With the controls on and autosave off, Save / Export / History are manual-only; both master backup-tool switches remain opt-in.
- Optional local Chatbot Editor Draft History with manual/before-save snapshots, configurable per-bot retention, a history viewer, and safe field restore that never saves or publishes automatically.
- Optional own-bot backup tools on chatbot edit pages, including read-only Under Review pages. The compact **Save backup now / Export / History** strip is controlled by its own switch; automatic changed-revision saves are a separate opt-in child setting.
- Optional Wiki / Web Lorebook Importer on Lorebook Entries pages. It supports Fandom and MediaWiki-style layouts plus a generic article fallback, aliases/redirects, category-member selection, duplicate Skip/Replace/Merge/Duplicate handling, retryable bulk imports, source-update checks, removed-content inspection, and pasted text/Markdown/HTML when a site blocks fetching. Imports are split to stay inside SpicyChat entry-size limits and source URL/page metadata is kept locally by QoL.
- Optional **Lorebook response consistency** checks AI replies for newly introduced keywords from a locally backed-up attached Lorebook, shows the matched entry text for reference, and can carry those details into the next turn. It does not pretend to rewrite an already-generated SpicyChat response.
- Lorebook workflow tools can start Edit Lorebook on Entries once without locking you there, default/remember entry sorting, protect unfinished entry edits with local autosaved drafts, add Edit Lorebook shortcuts where an attachment can be resolved, and add an entry manager whose selection checkbox, token/hidden-keyword/character/no-keyword info, Rename/Copy/Duplicate row actions, and each individual bulk action are separately configurable. Bulk actions stay collapsed behind one compact button until opened.
- Optional Lorebook backup tools store Lorebook details and entries separately from bot JSON. Entry-list keyword subsets are retained, and opening an entry lets QoL upgrade that entry to its complete keyword list before export. The compact manual Save/Export/History strip has its own master switch; automatic capture is separate and opt-in.
- Creator Tools includes a searchable chatbot/Lorebook Backup Manager for latest exports, chatbot revisions, last-backup age, stale automatic-backup warnings, and local backup deletion.
- The **Creator Workspace** in Control Center summarizes own-bot/Lorebook backup coverage, editor draft history and known bot ↔ Lorebook relationships. Chatbot revision rows can compare changed writing fields and queue selected fields back into the normal SpicyChat editor for review before saving.
- Optional **Remember chatbot image prompt** stores the image-generation prompt locally per chatbot edit page and restores it after refresh/revisit when the native prompt field is empty.
- Optional automatic Start New on Create Lorebook.
- Optional default Public or Unlisted visibility for newly created chatbots.
- Optional automatic Community Guidelines agreement.
- Advisory Lorebook moderation-wording warnings based on community-reported trigger terms, with optional chatbot-editor coverage; the list is explicitly treated as inconsistent/community evidence rather than an official blocklist. Thread follow-ups that contradicted plain number words, second/trio and class as standalone triggers are respected, while confirmed/repeated reports such as minor, intimidation variants, lineage/bloodline and child/family-related wording remain represented. Balanced mode suppresses other broad standalone matches unless stronger context is present, All reported terms preserves maximum sensitivity, and a Settings term manager can search/filter the list, locally Ignore/Enable individual terms, and add exact-match custom local warnings with categories. Warnings never block/rewrite text and never include bypass/loophole instructions.
- Clickable chat-page bot tags with shortcuts for saved tag filters.
- Optional exact bot-card message totals: QoL can replace rounded values such as `1.2k` with the exact public message count. It reuses observed Typesense listing data when available and batches direct public Typesense lookups for visible cards that are still missing an exact total.
- Optional combined My Creations chatbot filter for visibility, message count, Lorebook presence, definition visibility, card-token ranges, local recent-use windows and creator workflow status. Includes one-click Recently used ordering, a Needs attention view based on local Needs work status / Creation Audit issues, and additional message/token/name sorts for loaded cards.
- Untagged language auto-detection extends Language Filter beyond creator-supplied tags: obvious languages can be inferred from card descriptions, ambiguous cards can be checked gradually from public Greeting + Description data, and only the detected language/result is cached locally. Optional QoL language badges are local display helpers and never edit the creator's SpicyChat tags.
- Optional bot-card token estimates for Greeting and other exposed fields prefer a packaged MAIN-world character-data bridge so requests use SpicyChat's own page origin/auth context, with the extension background worker as a fallback; bounded concurrency, short timeouts, cache reuse and copyable failure diagnostics remain in place. Successful public metadata can also feed the Local Bot Archive without another network request.
- Optional My Creations audit with cached profile-field checks for missing/very short Greeting, Description, Personality, Scenario and Example Dialogue, missing tags, unusually small/large profile estimates, Lorebook presence and visibility. For own bots it can reuse positively captured editor/local backup fields when SpicyChat does not expose enough public profile data; unavailable fields stay unverified instead of being called missing. Creation Audit can also flag user actions pre-written into Greetings, named Greeting context mainly explained in Scenario, repeated long profile text, rules/worldbuilding inside Example Dialogue, and overly vague intelligence traits; all results remain advisory. Includes per-card status badges, filters, manual refresh, a combined Needs attention workflow with Review next, Markdown reports, and spreadsheet-friendly CSV export for the currently loaded bots.

## Interface cleanup
- The Settings navigation folds Mini Panel, Soundscapes, sidebar/top-bar cleanup, and premium/promo cleanup into **Appearance & Interface** so the top-level tab list stays manageable.
- Individual sidebar and top-bar cleanup switches, including separate controls for every footer link, supported social icon, and app-download target.
- Chat composer cleanup for plus/image/voice controls and voice upsells.
- Premium, notification, model, and advert/banner cleanup.
- Optional browser-tab notification badge hiding and background product-update clearing.
- Mini Panel with configurable placement, drag position, sizing, visible controls, Auto voice/Auto */translation controls, and an optional current-page feature summary.
- Optional Mini Panel one-click shortcuts for up to three pinned Smart Filter presets on bot listings.
- Mobile/compact-aware controls with a separate opt-in settings area, Mobile Recommended preset, and compact chat top-bar QoL menu for OOC, actions/formatting, navigation, persona, model, and optional translation. Manual enable works on Firefox/Chrome desktop, Firefox Android, installed web apps, and the Android APK. Mobile Bot Organizer bulk mode uses card-tap selection/protected touch targets so nearby native Favorite controls cannot be triggered accidentally.
- Optional Auto-AFK cleanup for inactive SpicyChat tabs.
- Optional independent Duplicate SpicyChat Tab Guard with chat/home/profile scopes, configurable keep-new/keep-existing behavior, pinned-tab protection, kept-tab focus, and a manual duplicate scan/status readout.
- Tab Session Library can merge saved snapshots into one deduplicated exact-URL recovery set and clean repeated exact URL records inside saved snapshots without touching open browser tabs.
- Manual tab cleanup/session analysis with open-tab inventory, local-profile reuse, and a single temporary rendered SpicyChat worker tab for unresolved profile metadata so discarded chat tabs stay asleep. Analysis reports rendered/local-only/no-data/verification/unavailable/failed states separately, pauses for SpicyChat verification when needed, supports Retry unresolved, stronger identity resolution, topic/cleanup previews, and local session snapshots preserving exact URLs plus original window/index positions. The Tab Session Library adds reusable multi-topic organization, snapshot review, exact-conversation selection, and safe reopening in the current window/new window/saved-window groups. Scan/analyze never closes tabs.

## Data and backup
- Settings check focuses on actionable problems: enabled features missing required setup, invalid values, interrupted bulk actions, malformed local records, incomplete Persona copies when Persona backup is actually enabled, and unusually large storage. Harmless disabled child settings and missing recovery snapshots are not treated as problems.
- Export selected categories or everything from **Data & Backup**, with `.json` and `.txt` downloads.
- Load backup files from **Data & Backup** into the normal validation/preview flow before anything changes. Backup schema v9 migrates supported legacy layouts; newer-schema backups now enter a version-tolerant partial-restore flow that previews/imports recognized categories while clearly skipping unknown/newer categories. Extension-capable mobile browsers can use the browser download manager when normal extension-page downloads are unreliable.
- Merge or replace only the categories included in an imported backup.
- Storage usage details in Settings and optionally in the popup. A single lightweight local recovery snapshot can be created manually and is also saved automatically before supported imports/cleanup actions.
- Control Center can run a read-only full local-data health pass, show the largest stored datasets, test the current backup/migration path without writing anything, save a performance baseline for later comparison, and include those summaries in the one-click support report.
- Checks for orphaned/duplicate local data, with cleanup only after you choose it.
- Recently Seen history is a separate selectable backup/import/storage category.
- Chatbot Editor Draft History and pinned Smart Filter presets are separate selectable backup/import/storage categories.

## Roadmap

### v0.2 — complete
- Public source/release package prepared.
- Display name updated to **SpicyChat QoL**.
- Chrome and Firefox release packages share the same tested feature code.
- Documentation, migration notes, and release notes updated for v0.2.


## Planned
- Community translation workflow for the QoL interface using a hosted localization platform (POEditor or a free/open alternative), with reviewable translation files kept in the project.
- Further My Chatbots / creation-list organization and creator QA shortcuts beyond the current Audit statuses, filters and organizer tools.
- Further recommendation controls and discovery helpers beyond the current Later/Not Interested/tag/favorite-creator preferences.
- Further rating/dislike helpers if SpicyChat exposes additional safe native actions beyond the current Rate Chatbot dialog shortcuts.
- Further unsend/recovery helpers where SpicyChat exposes a safe native path.
- Further saved-list and chat-list organization beyond the current Favorite/Later Saved Lists overlay and managers, including a possible injected Later page.
- Continue the SpicyChat tab/session cleanup organizer with a reviewed Save & close selected flow and stronger automatic topic suggestions once profile metadata coverage is reliable; no automatic tab closing without explicit confirmation.
- Further bot/profile export expansion when SpicyChat exposes more reliable fields or a safe way to embed/restore additional assets beyond JSON/Markdown/HTML.
- Deeper optional personal usage statistics if there is a clear useful set of metrics worth collecting; the current summary only reads data QoL already stores. RP context-full warnings are now handled separately in Chat Tools.
- More export formats, including print-friendly/PDF options.
- QoL Sync: optional local-first selective sync between PC, Android, and other devices while keeping manual backups separate and secrets such as API keys device-local by default.
- More Mini Panel/mobile layout options, building on the Android top-bar controls.
- Multiple chat tabs and further Android improvements.
- Further multilingual creator tooling beyond the current optional Creator Writing Assistant translation/rewrite path.
- Further handling for unstable/untranslated SpicyChat tags beyond the current user-defined local aliases/emojis.
- **Custom SpicyChat QoL Lite builds** after v0.2 (or shortly after): a website builder where people choose the feature groups they want and receive a smaller custom package. The runtime now has separable Core, Chat, Chat List, Listings, Creator, Lorebook, Profiles, Personas, and Interface build bundles, so the later website builder can physically omit whole groups instead of only disabling them.

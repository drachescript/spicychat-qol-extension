## 0.2.39
- Edit Chatbot in chat menus now supports normal Ctrl/Cmd-click, middle-click, and browser right-click link options.
- Fixed repetitive Lorebook editor errors when automatic keyword expansion is blocked.
- Compressed large bot-status and saved-bot records inside QoL storage, with a safe option to optimize older saved data. Full backups still include everything.
- Fixed a chat-formatting loop that could cause constant DOM changes and lag.
- Restored Copy / Export chat in Mini Panel independently of chat top-bar buttons.
- Added compressed .json.gz backups and large-backup auto-compression.
- Added selected-item and status-based backups for My Chatbots and Lorebooks, including bots Under Review.
- Added optional full Persona backups with current text and avatar data.
- Added personal tag rules based on bot title, greeting and other available fields.
- Reorganized Settings so related options are easier to find.
- Added optional Chatbot Edit buttons and a separate My Chatbots favorite-star setting.
- Added an option to move My Personas back under Chats in the sidebar.
- Fixed disappearing Keep and message quick-action buttons after chat toolbar updates.

## 0.2.38
- Kept Private chatbot and Lorebook editors out of automatic QoL content scans; Public/Unlisted editors and manual creator actions still work normally.
- Added optional Edit buttons to My Chatbot cards and made favorite-creator stars there a separate opt-in.

## 0.2.37
- Added beta Rulebook support for Rulebook Explore, editor, public Rulebook, and My Rulebooks pages; normal accounts stay unaffected and My Rulebooks stays quiet until more Rulebook tools are ready.
- Fixed collapsed Lorebook tag/keyword expansion on public Lorebook cards and Lorebook entry editors.
- Fixed the Lorebook auth/fallback loop and changed bulk Lorebook backup to reuse one helper tab instead of opening many editor tabs.
- Fixed chat formatting cases where action styling could turn surrounding quoted or backtick dialogue pink.
- Kept the Lorebook keyword clear-all X aligned to the right when keyword rows wrap.

## 0.2.36
- Added opt-in My Creations bulk backups for Chatbots and Lorebooks, exporting current live JSON in one ZIP instead of using old QoL revision history.
- Added Edit shortcuts to owned Lorebook cards, including normal Ctrl/Command-click and middle-click behavior.
- Added first-install setup for Chatting, Creator, Both, or Start clean without resetting existing users.
- Fixed chatbot and Lorebook bulk backups to use current live data, reject incomplete/empty exports, and keep chatbot creation/update dates when available.
- Re-enabled collapsed public Lorebook tag expansion.
- Moved My Creations backup controls below Chatbots / Lorebooks / Groups / Voices and above the card grid.
- Kept My Creations pages quiet: general scanners stay off and Creation Audit only scans when asked.

## 0.2.35
- Added opt-in blocked-word auto-blocking: when a bot name or description matches a blocked word, QoL can add that bot to the normal Blocked bots list just like pressing the card Block button. Explicit manual unblocks are remembered for the current blocked-word rules so the bot is not immediately re-added.
- Fixed stale browser-extension content runtimes after extension updates/reloads: a tab that started with a valid QoL runtime now reloads once if that extension context is later invalidated, so maintained controls such as Context Keeper and blocking can recover.
- Removed the OOC health check's automatic chat reload fallback; OOC repairs/rebinds locally and only reports a manual reload suggestion if it still cannot recover.
- Fixed support reports showing timed-out IndexedDB counts as zero; unavailable large-data counts now stay explicitly unavailable.

## 0.2.34
- Fixed Context Keeper Keep-button repair so message-toolbar rebuilds restore it even outside the current Message Lane.
- Improved support diagnostics with partial timeout handling, live SpicyChat tab discovery, and no empty baseline-comparison section when no baseline exists.
- Expanded fancy-text normalization for Unicode small caps/decorative marks and improved Portuguese detection for short listing descriptions.
- Added safe blocked-bot storage cleanup: confirmed unavailable bots can drop heavy local copies only after exact remote Archive preservation is verified, while their block/tombstone stays local.
- Made private Lorebook transfer simpler with clear Download/Import JSON controls directly on Lorebook editors; importing uses SpicyChat's normal entry form and skips same-name entries by default.

## 0.2.33
- Fixed Context Keeper message Keep buttons disappearing after SpicyChat rerenders/rebuilds a message toolbar; Keep now lives outside the replaceable quick-action bar and self-repairs on visible/new messages.

- Restored Auto-AFK as a true per-tab inactivity timer based on when each matching SpicyChat tab was last focused, independent of PC Protection.
- Made Auto-AFK fall back to chat pages if an older install has the feature enabled with no saved scope, and improved its default chat/active-tab safety settings.
- Added stale-runtime checks after extension updates and browser startup; the active stale SpicyChat tab reloads once automatically, inactive stale tabs reload when first activated, and the popup keeps a manual reload fallback.
- Fixed JSON/TXT backup downloads on browsers that can lose the extension-page download gesture after the backup is built by using the extension download manager when permission is available.
- Fixed the chat OOC shortcut inheriting SpicyChat's temporary generation-time disabled state; QoL now repairs it after composer rerenders and performs one guarded page reload only if the control remains genuinely stuck.

## 0.2.32

- Added Diagnostic Protocol v2 for Dragon's SpicyChat Diagnostic Extension with privacy-safe QoL operation, scheduler, storage, worker, performance and user-action tracing.
- Added batched trace delivery, sequence/drop tracking, nested operation IDs and Normal/Deep trace levels so long captures stay lightweight.
- Added background-service-worker forwarding and a short replay buffer so Bot Status, Less Like and other helper activity can be correlated with page captures.
- Added safer diagnostic redaction for private text, Lorebook content/keywords, prompts, tokens, headers, cookies and request bodies.
- Added central tracing for runtime feature work, scheduling, storage, route changes and QoL-owned DOM activity, with detailed tracing only while Inspector is recording.
- Kept Diagnostic Protocol v1 compatibility so older Inspector builds can still detect and record QoL.
- Fixed a rare chat composer autosize race that could collapse the message box to a thin line; clearly collapsed visible composers now repair themselves.
- Reduced chat slow-pass microstutters by making Model Selector and advert cleanup targeted/dirty-driven, preventing settled messages from waking unrelated global work, and yielding longer slow passes in small slices.
- Pressure-triggered Maximum now starts lightweight old-message treatment earlier while keeping the newest messages fully rendered; Inspector v2 tracing also avoids duplicate v1/v2 detailed events and reports clearer parent/outcome metadata.
- Improved chat startup protection so larger chats wait for both history and recent Long Tasks to settle, and pressure-triggered Maximum can survive a reload of the same conversation for up to an hour.
- Moved chat-open Bot Archive refresh out of the critical startup path, switched its freshness check to one IndexedDB record, and reduced Deep-trace ownership marking on nested QoL controls.
- Kept pressure-triggered Maximum lightweight rendering early, but stopped it from auto-folding ordinary 40-50 message chats; folding is reserved for genuinely larger chats and its control now sits below the chat header instead of over the bot name.
- Fixed the chat-input OOC replacement button disappearing when the Image button is hidden.
- Added a low-work wake path for discarded chat tabs and a short PC Protection grace period so recently visited tabs are not immediately discarded again.
- Reduced Settings startup work by lazy-loading the large Bot Status/recovery datasets and showing saved-bot managers in smaller 10-item pages.


## 0.2.31

- Fixed Saved Bot Copies / Recovery and Deleted / Unavailable Saved Bots loading from IndexedDB without needing to rescan thousands of bots.
- Fixed missing Settings bot pictures and made animated avatars play only while hovered.
- Improved Lorebook Status & History with tracked-only scans, automatic loading, safer availability handling, recovery copies, and entry change history.
- Added local Lorebook Archive export for confirmed Public Lorebooks; private/restricted/unconfirmed recovery data stays local.
- Added optional Public Lorebook blocking using normal blocked words, tags, creators, exact Lorebook UUIDs, and a quick Block button.
- Fixed Public Lorebook filtering/refill leaving empty grid spaces and improved Lorebook tag lookup when needed.
- Improved backups and support info for Lorebook Status and large recovery datasets.
- Fixed Group creation being hidden when normal member/Lorebook UI was mistaken for a promo banner.

## 0.2.30

- Fixed a v0.2.30 service-worker startup regression where the Chat Nudge / followed-creator background helper block was accidentally omitted, causing Chrome status-code-15 registration failure and `configureChatNudgeAlarm is not defined`.
- Simplified Bot Status Center: live profile changes are preserved automatically in history, duplicate matching refreshes automatically, and deleted/recovery bots can be fully forgotten from local QoL data without deleting the real SpicyChat chat.
- Added archived-bot rechecks with bulk and per-bot checks, exact-ID recovery, safe restoration when bots return, and no restoration of Blocked membership.
- Load all / Refresh chats now clearly feeds conversation bots into Bot Status Center opened history, while deliberately forgotten IDs stay ignored.
- Made same-name warnings quieter: ordinary shared names no longer get a warning unless the duplicate helps explain a real availability/recovery conflict.
- Made Less Like and Dislike-after-block independent options that can run separately or together; both now use the persistent signed feedback helper with shared duplicate-rating protection.
- Tightened chat performance handling: already-decorated messages are skipped until their node, text/state, or relevant settings actually change; startup/history work stays chunked and reply rendering gets a longer native-first quiet window.
- Lowered automatic large-chat protection to a 300-message recommendation and added earlier DOM, heap, and recent Long Task pressure triggers; Maximum remains sticky for the current chat and never silently reloads it.
- Lowered the recommended PC Protection limit from 5 to 3 normal awake SpicyChat tabs and staggered multi-tab restores so QoL does not intentionally wake a pile of discarded tabs at once.
- Performance diagnostics now record visibility/focus, mounted messages, DOM size, heap, recent Long Task pressure, and effective mode so background/gaming captures are easier to interpret.
- Kept route-specific runtime plans/deep sleep, but deferred physical per-route content-script loading until it can be implemented safely for SpicyChat SPA route changes.

## 0.2.29

- Fixed Less Like / Stop recommending on the current SpicyChat build. The persistent helper now recognizes module/preload bundles, validates the recommendation token against SpicyChat's own signed request, and sends direct feedback without per-bot page navigation.
- Kept Quick Dislike separate from Less Like on its proven native hidden `/chat/<bot>` worker path, with its own history and queue behavior instead of sharing the recommendation helper.
- Added a creator/profile/editor startup quiet window and throttled heavy moderation/archive work so SpicyChat can finish mounting those pages before QoL analysis and backup tasks run. Creator moderation also caches its relevant DOM/settings revision so unrelated React mutations no longer rescan unchanged fields.
- Animated bot/avatar media now animates only while actually hovered, onscreen, and in a visible/focused tab; leaving the viewport, losing focus, or hiding the tab immediately returns it to the static state.
- Added a separate **Hide feature release popups** option for SpicyChat's AnnounceKit feature-release booster without requiring the notification bell/badge itself to be hidden.
- Added configurable chat **Enter / Return behavior**: SpicyChat default, Enter sends with Shift+Enter for a new line, or Enter/Return always inserts a new line while the native Send button remains the submit action. The new-line path handles mobile `beforeinput`/IME events as well as desktop key events.
- Moved the large Saved Bot Copy/archive and bot-availability datasets from monolithic `chrome.storage.local` objects into extension IndexedDB with one record per bot. Migration is verified before the legacy object is removed, Bot Status writes only touched IDs, and normal archive/profile saves can update individual records instead of rewriting the whole archive.
- Updated the privacy policy to document local IndexedDB storage for large per-bot datasets. The migration stays local and does not turn those records into cloud data.
- Settings startup/support work is lighter: backup-scope counting, browser tab-session data and Account & Sync UI load only when their tabs are opened; recovery-snapshot status no longer deserializes the full safety backup; diagnostics use IndexedDB counts instead of loading every saved bot record.
- Cleaned the Features catalogue so Account & Sync is listed as implemented, while custom Lite builds are explicitly deferred and the normal Full extension remains the maintained build.
- Kept the current Bot Status worker scheduling architecture and broad chat-performance system intact; this pass targets the measured worker, creator/profile, image, and storage hotspots instead of adding more global performance aggression.
- Fixed the chat-side large-data runtime bridge error that could break bot-archive refreshes after startup.
- Made chat startup/reply decoration genuinely incremental: newest messages are prioritized, older visible messages drain in small idle chunks, and Mini Panel work is deferred during native render quiet windows.
- Added one shared recommendation-feedback coordinator so Less Like and Quick Dislike cannot send duplicate negative ratings for the same bot while overlapping queues are active.
- Clarified performance-baseline migration: older baseline formats now explicitly ask for one fresh baseline before rate-normalized comparisons resume.
- Made same-name bots unambiguous in Bot Status / saved recovery UI: cards emphasize creator + shortened UUID, keep the full character ID visible, and flag other bots that share the same displayed name; availability, cleanup and recovery remain keyed strictly by character ID.

## 0.2.28

- Fixed Recommendations/listing pagination collapsing to only the previous/next arrows after a repeated QoL runtime pass; QoL-generated page numbers are no longer mistaken for native buttons, and pagination now falls back to SpicyChat's native numbers if reconstruction fails.
- Animated bot/avatar images now use hover-only playback when animation reduction is enabled; older Freeze/Play-once preferences migrate to the hover behavior.
- Rebuilt Random Chat for Home / Recommended and Favorites using SpicyChat's public character search API instead of temporary rendered Home helper tabs.
- Saved tab-session Merge now consolidates into one snapshot and deletes the source snapshots after confirmation instead of keeping duplicate copies.
- Fixed Blocked Bot “Stop recommending” getting stuck at 0/N while its direct recommendation helper warmed up; bulk Less Like now falls back to SpicyChat's native Less Like menu in the same hidden helper workflow when direct auth is not ready.
- Updated the privacy policy for Account & Sync, anonymous opt-in public Archive contribution, current diagnostics/support behavior, and the newer browser/tab helper features.
- Fixed Settings navigation so popup shortcuts and in-page QoL Settings buttons cannot hang behind a stuck source-tab/storage handoff; direct browser fallbacks now open the requested Settings section.
- Added Low memory / PC protection with an LRU limit for normal loaded SpicyChat tabs. Active QoL worker tabs do not count toward the limit, while current, pinned, audible and browser-protected tabs stay awake.
- Auto-AFK now supports 15- and 30-minute cleanup intervals plus the existing hour/day ranges.
- Kept Maximum chat performance mode sticky per chat, retained user-controlled reloads, and preserved the startup/reply-render quiet windows plus chunked message-window maintenance.
- Added lightweight self-repair for missing message Copy/Edit/Report/Remove Image quick actions without rescanning the whole chat.
- Settings heavy managers remain lazy, bot images are not assigned until near view, hidden manager images can be released, and a new Release temporary Settings memory button drops temporary manager/index data without deleting saved QoL data.
- Support reports now begin with a lightweight snapshot, use shorter content-runtime waits, build heavy sections in parallel, and include SpicyChat loaded/discarded/worker tab telemetry.
- Kept the v0.2.27 background-owned Bot Status pacing/liveness path unchanged.

## 0.2.27 hotfix
- Fixed the in-page/sidebar and popup Settings launch path so Settings can still open when a SpicyChat tab's normal QoL runtime is unhealthy.
- Message quick-action icons now self-repair if SpicyChat rerenders/removes the QoL bar while leaving the original message menu button mounted.
- Fixed dedicated asterisk/backtick composer shortcuts overlapping by forcing their wrappers into one measured flex row and reserving the textarea's real rendered width.
- Added composer shortcut geometry/overlap details to support reports.
- Full support-report generation now caps each section at 10 seconds instead of being able to wait indefinitely on a stuck runtime/storage read.
- Automatic performance escalation to Maximum is sticky for the current chat route, preventing aggressive/maximum flapping and repeated old-message class churn.
- Performance message classification/windowing is applied in small idle/frame chunks and is deferred through the short native reply-render quiet window.
- Expected severe-lag detection is logged as diagnostics/info rather than polluting Chromium's extension Errors page with console warnings.
- Automatic page reload remains removed; refresh stays user-controlled.

## 0.2.27
- Removed automatic performance-emergency page reloads. Severe lag can escalate QoL to Maximum rendering, but reload/navigation remains user initiated.
- Added a short chat-startup quiet window so initial history rendering can settle before nonessential QoL message decoration and reconciliation resumes.
- Reset recent Long Task pressure when changing chats so startup lag from one route cannot immediately trigger performance escalation on the next.
- Dedicated QoL background workers are no longer paused by the normal hidden-tab pause preference.
- Bot Status pacing now waits through the extension background process instead of relying on a hidden Options-page timer, reducing Chromium background timer throttling during long scans.
- Bot Status worker liveness now uses request/result activity as well as heartbeat state, with a longer hidden/throttled grace period before a helper is considered dead.

## 0.2.26
- Improved bot-name cleanup so generic labels and decorative wrapper text are less likely to replace a real character name in saved/discovered metadata.
- Added a bounded browsed/discovered-bot index that can feed Bot Status Center from normal browsing without storing chat history.
- Added an opt-in desktop-only **Less Like This after block** action, kept separate from the existing Dislike-on-block option.
- Added adaptive large-chat performance escalation using mounted-message count, DOM size, heap usage when available, and recent Long Tasks so very heavy chats can move into the strongest performance tier sooner.
- Changed large Settings/backup manager paging to start at 10 items at a time, with clearer Show more / first / all controls where applicable.
- Added per-device Account Sync rules: two-way, upload/source-only, download/cloud-only, or manual, plus category/key selection and explicit Upload Settings / Download Settings actions.
- New QoL accounts default to source/upload-only while newly linked devices default to cloud/download-only, reducing the chance that a fresh device overwrites existing cloud settings before its sync rules are chosen.
- Strengthened Account Sync conflict handling, including revision observation before retrying and merge-aware handling for set-like block/filter lists.

## 0.2.25
- Added a shared device-capability registry for desktop browsers and the Android/WebView app so QoL can distinguish normal current-page tools from features that require real browser tabs, helper tabs, bulk operations or desktop background automation.
- Android now treats second/helper-tab workflows and bulk tools as unavailable at runtime while preserving the user's actual saved preference. A desktop-only option can remain ON for desktop without Android syncing or saving a fake OFF value over it.
- Kept styles, chat appearance, editing/creator tools, presets and normal current-page controls Android-capable by default; only features with a real platform requirement are made dormant.
- Added Android Settings compatibility hints: unsupported controls stay visible but are dimmed/disabled with a Desktop only explanation, making it clear that the saved value is being preserved rather than deleted.
- Added device filters and compatibility badges to the Features catalogue, including Works on this device, Desktop only, Android supported and Unavailable here views plus Partial on Android states for mixed features.
- Connected the Account & Sync page to the live Cloudflare/D1 service at `syncqol.drache.uk`: create a QoL account, link another device with a one-use 10-minute code, sync automatically after linking, sync on demand, pause/resume, list devices and revoke other linked devices.
- Device credentials stay local in a separate non-backup storage record; Cloudflare stores only the server-side token hash. Normal QoL backups continue to exclude account/device credentials.
- Automatic sync sends only logical setting keys that changed instead of rebuilding/uploading the full settings document after every edit. Periodic/startup pulls use revisions so other devices' changes arrive without Android switching unsupported desktop preferences off.
- Backup metadata now records the compatibility schema and source platform without including the local device/account identity, and diagnostics report the current platform plus how many saved preferences are dormant on this device.
- Registered the new shared platform capability runtime in both the manifest and full-build module metadata so release verification includes it.
- Made **Automatically use stronger performance mode on very large chats** default ON for new/unsaved settings.
- Shrunk the floating large-chat folded-message control into a much lighter utility strip with smaller text, buttons, padding and shadow.

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

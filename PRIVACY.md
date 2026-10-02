# SpicyChat QoL Privacy Policy

**Effective Date:** July 7, 2026  
**Last Updated:** October 1, 2026

## 1. Overview

SpicyChat QoL is an independent community project that adds optional quality-of-life features to the SpicyChat website. This policy applies to the supported Chrome/Chromium and Firefox browser extensions and the companion Android APK where the described feature is available.

SpicyChat QoL is not affiliated with, endorsed by, or operated by SpicyChat or NextDay AI.

Most QoL data is local-first and remains on the user's device. The project does **not** use QoL data for advertising, behavioral advertising, sale to data brokers, credit/lending decisions, or unrelated profiling.

Some optional features deliberately contact SpicyChat/NextDay AI, a service selected by the user, or a DragonScript-operated service. Those cases are described below.

## 2. Information QoL May Access or Process

Depending on the features the user enables or uses, QoL may locally access or process:

- QoL settings, device-specific preferences, and feature state;
- bot/chat IDs, names, links, images, creator names/handles, tags, ratings, message counts, availability, visibility and other profile/listing metadata;
- opened, blocked, Not Interested, Later, Favorite, followed-creator and local organization lists;
- chat messages and chat UI state when a feature such as search, bookmarks, formatting, translation, export, message actions, Context Keeper, trackers, Memory tools, or diagnostics needs them;
- Persona, Lorebook, chatbot-editor and creator-backup content the user chooses to manage locally;
- OOC presets, Reply Instructions, snippets, notes, generation profiles and similar user-authored local content;
- SpicyChat tab URLs, page types, activity timestamps, loaded/discarded state and helper-worker state used by duplicate-tab, Auto-AFK, PC-protection, session, performance and background-worker features;
- local imports, exports, recovery snapshots, Saved Bot Copies and Bot Status data;
- user-supplied local image/audio files and direct media URLs;
- a DeepL API key, Discord webhook URL, or other service value supplied for an optional feature; and
- a user-entered wiki/article URL and the returned text/article content for the Wiki / Web Lorebook Importer.

QoL does not intentionally inspect unrelated browsing activity. Optional non-SpicyChat host access is used only for the user-facing feature that requested it.

## 3. Local Storage

Browser builds use extension local storage for normal settings/state, extension IndexedDB for large per-bot datasets, plus small per-tab/session records where appropriate. Starting with v0.2.29, large Saved Bot Copy/archive and bot-availability records are migrated from monolithic extension-local objects into local IndexedDB records so individual bot updates do not require rewriting the full archive. This migration remains local to the user's device.

`unlimitedStorage` is requested because local-first datasets such as Saved Bot Copies, availability history, archives, images and recovery data can exceed the browser's small default extension-storage quota.

Local data can include settings, filters, saved lists, Bot Status/Saved Bot Copies, creator/Lorebook backups, Personas, snippets/OOC text, bookmarks, tracker state, tab-session snapshots, caches, performance counters, diagnostics and recovery snapshots. Moving a dataset between extension local storage and extension IndexedDB does not make it cloud data and does not send it to DragonScript.

Files created by backup/export/diagnostic tools are saved to a location controlled by the user, browser or operating system and remain there until deleted by the user/platform.

## 4. SpicyChat / NextDay AI Requests

QoL runs on SpicyChat and may read/process information already shown or otherwise made available to the signed-in user. Enabled features can also make direct requests to SpicyChat/NextDay AI pages, APIs, public search services and media hosts, including SpicyChat's character API and Typesense search.

Examples include Bot Status checks, Saved Bot Copy refreshes, public message counts, Random Chat discovery, creator/new-bot checks, profile metadata, ratings/feedback actions and SpicyChat-hosted images.

These requests go to SpicyChat/NextDay AI infrastructure and are subject to SpicyChat/NextDay AI's own privacy practices. Authenticated requests may use the user's normal SpicyChat session when the site requires it.

## 5. Chat Messages and Personal Communications

Some optional tools inspect conversation content locally to provide chat search, bookmarks, export, message actions, formatting/display helpers, Memory tools, Reply Instructions, Context Keeper, Storydate/RP State tools, generation context information or translation.

Except for normal actions/requests to SpicyChat itself and optional third-party services explicitly described below, QoL does not send private chat messages, Memory text, Persona text, private notes, OOC text or tracker content to DragonScript.

Support/diagnostic reports are designed to exclude chat text, Memory contents, Persona text, private notes, API keys, webhook URLs and blocked-word lists unless the user separately includes that information in a support message.

## 6. Saved Bot Copies, Creator Backups and Local Archives

Saved Bot Copies, creator backups and Lorebook/Persona backup tools can preserve information that SpicyChat currently exposes to the user so the local copy may remain available after later edits, deletion, privacy changes or site availability changes.

QoL does not intentionally bypass hidden/private definition fields. It stores only information available to the signed-in user/editor through the feature path being used.

These local copies are not automatically uploaded to DragonScript. The separate **Public Archive contribution** option is described in section 9.

## 7. Optional Account & Sync (`syncqol.drache.uk`)

Account & Sync is optional. When a user creates a QoL sync account or links a device, the extension communicates directly with the DragonScript-operated service at `https://syncqol.drache.uk`.

The service may receive/store the information needed to provide sync, including:

- a QoL account identifier;
- device identifier and user-visible device name;
- device platform/client version;
- sync revision/status metadata;
- selected logical QoL setting keys and values that the user allows that device to sync;
- setting-deletion markers needed to keep linked devices consistent; and
- server-side authentication material/token hashes needed to authorize linked devices.

The device token itself is stored locally by the extension and is sent as an authorization credential when calling the sync service. One-use link codes are transmitted when a user links another device. The service also supports listing and revoking linked devices.

Sync modes can be two-way, upload-only, download-only or manual, and users can limit which setting keys/categories participate. Account & Sync is intended for logical preferences/settings, not for uploading the user's full chat history, Saved Bot Copy archive, recovery snapshots, local media, DeepL API key, Discord webhook URL or private chat text.

Disabling/pausing sync stops automatic sync work; disconnecting a device removes its local sync credentials. Server-side account/device records may remain until removed through the available account/device controls or project support where applicable.

## 8. Optional DeepL Translation

If the user enables DeepL translation and supplies a DeepL API key, the key and selected message text are sent directly to the official DeepL API endpoint. Limited surrounding context may also be included when the translation feature uses context. Results may be cached locally.

The DeepL key is stored locally and excluded from normal QoL backups, recovery snapshots and support diagnostics. DeepL handles the request under its own privacy terms.

## 9. Optional Public SpicyChat Archive Contribution

Bot Status Center includes an **opt-in** Public Archive contribution feature. It is off unless the user enables it and submits data.

When enabled, the user can submit locally saved Bot Status/Saved Bot Copy records to the DragonScript-operated SpicyChat Archive import service for review/public archive preservation. A submission can include the bot/profile metadata contained in the selected Saved Bot Copies and contribution metadata needed for deduplication/progress tracking. The client also sends a pseudonymous/anonymous installation hash so repeated submissions from the same installation can be recognized without sending the user's SpicyChat login identity as the contribution identity.

Contribution state and fingerprints are stored locally so unchanged copies do not need to be resent. The feature is separate from Account & Sync and from normal local Saved Bot Copies.

Users should not enable Archive contribution for local copies they do not want submitted to the public archive workflow.

## 10. Optional Discord Webhooks and Followed-Creator Alerts

If the user supplies and enables a Discord webhook, QoL can send followed-creator/new-bot alert information directly to that webhook. The webhook URL contains a secret token and is stored locally; it is excluded from normal backups and diagnostics.

Webhook messages are sent directly to Discord, not proxied through the QoL sync service. Discord handles those requests under its own privacy terms.

## 11. Optional Wiki / Web Lorebook Importer

The Wiki / Web Lorebook Importer fetches a user-entered `http://` or `https://` article URL only after the user grants/permits that origin where required. The fetch omits site credentials/cookies, follows normal redirects and applies size/time limits.

The selected website receives normal network information such as the user's IP address and request metadata. Fetched article content is processed for the import workflow and is not sent to the QoL sync service.

## 12. Browser AI / Creator Writing Assistant

Local writing checks do not require a remote AI service. On supported browsers, an optional rewrite/translation step can use the browser-provided built-in `LanguageModel` API. Text sent to that API is handled by the browser/vendor implementation, not a DragonScript server.

## 13. Notifications and User-Supplied Media URLs

Optional browser notifications can be generated for Chat Nudges, followed-creator alerts and context warnings. Notification content is generated from locally available data and is not used for advertising.

For a direct Soundscape/media URL supplied by the user, the browser loads media directly from that URL. The remote host receives normal network request information. Locally imported audio/media remains local unless the user exports or shares it.

## 14. Diagnostics and Support Reports

QoL records local performance/diagnostic counters and can expose limited sanitized compatibility markers to Dragon's SpicyChat Diagnostic Extension when that separate tool is installed.

Support reports can include version/build information, browser/platform details, aggregate storage sizes/counts, performance counters, loaded/discarded SpicyChat tab counts, helper-worker state, sanitized request outcomes and local data-health results. They are not automatically sent to DragonScript; the user must deliberately copy/download/share them.

Account & Sync device tokens, one-use link codes, DeepL keys and Discord webhook secrets are not intended to be included in support reports.

## 15. Browser Tab and Performance Features

Features such as Auto-AFK, duplicate-tab protection, Low memory / PC protection, tab-session snapshots and helper workers use browser tab metadata and local activity timestamps to unload/close/reuse SpicyChat tabs according to the user's settings.

Discarding/unloading a tab uses the browser's normal discard behavior; the tab remains in the tab bar and reloads when selected. Saved tab-session snapshots are local QoL data until the user exports/shares them.

## 16. Android APK / WebView

The Android companion app loads SpicyChat in an embedded browser environment and may retain site cookies/storage/session information required for normal SpicyChat operation. SpicyChat login credentials are handled by SpicyChat and the browser/WebView or external login flow; QoL does not receive the user's SpicyChat password.

QoL settings/imports/exports handled by the Android app remain on the device except when the user deliberately uses an external service/feature described in this policy.

## 17. Browser Permissions and Site Access

Depending on browser/platform/release, QoL can request/use permissions for local storage, alarms/background scheduling, larger local storage, SpicyChat/NextDay AI hosts, user-requested downloads, notifications, real browser tabs, and optional per-origin access for a user-selected wiki/article or webhook destination.

Permissions are used for the feature that requires them. QoL does not use optional host access to build an unrelated browsing-history profile.

See `PERMISSIONS.md` for a permission-by-permission summary.

## 18. Remote Code

Browser-extension executable logic is packaged with the extension. QoL does not download and execute remotely hosted JavaScript as extension code. Calling SpicyChat APIs, the QoL sync API, DeepL, Discord, a wiki/article host or a user-supplied media URL does not make third-party JavaScript part of the extension runtime.

## 19. Analytics, Advertising and Data Sale

SpicyChat QoL does not operate behavioral advertising or sell user data. The project does not use local QoL data for retargeting, credit/lending decisions, or unrelated profiling.

The developer does not have routine access to local browser-extension data. DragonScript receives data only when the user deliberately uses a DragonScript-operated network feature such as Account & Sync or Public Archive contribution, or voluntarily sends information in a support request.

## 20. Data Retention and Deletion

Local QoL data stays on the user's device until changed/deleted by the user, removed by a QoL cleanup/reset control, cleared by the browser/app, or removed by uninstall/platform behavior.

Exports and diagnostics remain wherever the user saved them until deleted there.

Account & Sync server data and Public Archive submissions are separate from local storage. Linked sync devices can be listed/revoked through the sync controls. Public Archive contribution should be treated as a submission to the archive workflow rather than a local-only backup.

SpicyChat account/chat/bot/Lorebook data is controlled by SpicyChat and subject to SpicyChat's own retention/deletion practices.

## 21. Security

QoL is designed to minimize unnecessary transmission and keep local-first data on the user's device whenever practical. Sensitive credentials such as the DeepL key, Discord webhook URL and QoL sync device token are stored locally and transmitted only to their intended service.

No browser extension, WebView, cloud service, local-storage system or software environment can be guaranteed completely secure. Users should protect their device/browser profile and avoid publicly sharing credentials, private chats, sensitive exports, diagnostics or screenshots.

## 22. Changes to This Policy

This policy may be updated when features, permissions, supported platforms, third-party integrations or data-handling practices change. Material updates will change the **Last Updated** date.

## 23. Contact and Support

Questions, bug reports, feature suggestions and privacy questions can be submitted through the project channels.

GitHub:  
https://github.com/drachescript/spicychat-qol-extension

Project website:  
https://spicychatqol.drache.uk

Discord:  
https://discord.gg/XTMdWvuVSU

Do not post passwords, authentication tokens, API keys, Discord webhook URLs, payment details, private chat content or other sensitive personal information in public support channels.

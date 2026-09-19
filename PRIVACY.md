# SpicyChat QoL Privacy Policy

**Effective Date:** July 7, 2026  
**Last Updated:** September 19, 2026

## 1. Overview

SpicyChat QoL is an independent community project that adds optional quality-of-life features to the SpicyChat website.

This Privacy Policy applies to the supported SpicyChat QoL browser extensions for Chrome/Chromium and Firefox, and to the companion SpicyChat QoL Android APK distributed through the project's website or GitHub.

SpicyChat QoL is not affiliated with, endorsed by, or operated by SpicyChat or NextDay AI.

SpicyChat QoL does not operate a developer-controlled advertising, behavioral analytics, cloud-sync, or user-data collection service. QoL-specific settings and saved data are kept on the user's device whenever practical.

Some optional features communicate directly with SpicyChat/NextDay AI or with a service the user explicitly enables, such as DeepL, a user-selected wiki/article site, or a user-supplied Discord webhook. Those cases are described below.

## 2. Information SpicyChat QoL May Access or Handle

Depending on the features the user enables or directly uses, SpicyChat QoL may access or process:

- QoL settings and feature preferences.
- User-created filter rules, including tags, words, creator names/handles, bot names, bot IDs, languages, and related choices.
- Bot and chat identifiers, names, links, images, and metadata for items the user has opened, blocked, marked Not Interested, saved for Later, favorited, archived, followed, or otherwise organized.
- Accessible chatbot/profile information such as names, descriptions, greetings, personality/definition text, scenarios, example dialogue, tags, creator information, visibility information, message counts, ratings, token estimates/counts, and avatar URLs when an enabled feature needs that information.
- Persona information the user chooses to save/manage locally, including persona names, descriptions, identifiers, folders, notes, ordering, and locally copied Persona profile pictures where supported.
- Chat-list/chat organization data, message bookmarks, local notes, OOC presets, Reply Instructions, Global Memory/Baseline Notes, Saved Text/Snippets, Context Keeper details, Storydate/Day Tracker data, RP State Tracker data, generation profiles, Smart Filter presets, editor snippets, and similar user-saved local content.
- Information displayed on SpicyChat pages, including chat messages, memories, bot metadata, creator names, tags, chat titles, form fields, generation details, buttons, menus, and other interface elements when required by an enabled feature.
- SpicyChat tab/page state and local activity timestamps used by features such as opened-chat tracking, duplicate-tab handling, Auto-AFK, Tab Session tools, Chat Nudges, or performance features.
- Bot/Lorebook editor content and locally saved creator backups/draft history when the user enables those tools.
- Information contained in backups, imports, exports, Saved Bot Copies, recovery snapshots, or other local datasets the user explicitly creates or enables.
- Local image/audio data the user imports for features such as Persona copies, chat backgrounds, or Soundscapes.
- A DeepL API key supplied by the user when optional DeepL translation is configured.
- A Discord webhook URL supplied by the user when optional followed-creator webhook alerts are configured.
- A user-entered wiki/article URL and the returned article/page content when the Wiki / Web Lorebook Importer is used.

SpicyChat QoL does not intentionally inspect unrelated browsing activity. Optional access to a non-SpicyChat origin is requested only when a feature such as Wiki/Web import or a user-supplied Discord webhook needs that specific origin.

## 3. How Information Is Used

Information handled by SpicyChat QoL is used only to provide disclosed user-facing functionality. This can include:

- remembering QoL settings and preferences;
- applying user-selected filters and saved-list rules;
- remembering opened chats/bots and local organization metadata;
- maintaining Blocked, Later, Not Interested, Favorite, creator-follow/favorite, folder, Persona, bookmark, and other local lists;
- providing message, Memory, Persona, Lorebook, OOC, search, formatting, appearance, export, and chat-management tools;
- providing Context Keeper, Storydate, RP State, and other local continuity helpers;
- producing local token estimates or displaying public/exposed token/message-count information;
- maintaining Saved Bot Copies, creator backups, Lorebook backups, editor draft history, and local Persona copies;
- creating user-requested backups, exports, reports, and recovery snapshots;
- checking locally stored QoL data for orphaned, duplicate, outdated, or unusually large entries;
- providing optional local reminders/notifications such as Chat Nudges and context warnings;
- checking followed public creators for newly visible bots and optionally notifying the user;
- triggering SpicyChat's existing controls for actions requested by the user;
- reducing background work or changing local interface rendering for performance; and
- using explicitly enabled third-party services such as DeepL, a selected wiki/article site, or Discord webhook as described below.

Information handled by SpicyChat QoL is not used for personalized advertising, retargeting, behavioral advertising, credit/lending decisions, sale to data brokers, or unrelated profiling.

## 4. Local Storage

QoL settings and locally maintained feature data are stored on the user's device.

In browser-extension builds this primarily uses browser extension local storage. Some temporary feature state may also use normal per-tab/session storage. The extension requests `unlimitedStorage` so optional local-first datasets can exceed the browser's small default extension-storage quota.

In the Android APK, QoL-specific settings/imported data are stored locally by the app or its embedded browser environment where applicable.

Locally stored data may include:

- settings, filters, blocked words/tags/creators, and saved preferences;
- opened, blocked, Later, Not Interested, Favorite, followed/favorite creator, and organized bot/chat metadata;
- Bot Status Center information and Saved Bot Copies;
- creator backups, Lorebook backups, editor draft history, and related revision metadata;
- Personas, Persona Organizer information, local Persona text, and copied Persona pictures;
- Saved Text/Snippets, OOC presets, Reply Instructions, bookmarks, Context Keeper, Storydate, RP State, and generation-profile data;
- Smart Filter presets, Recently Seen history, Chat Nudges, tab-session data, translation caches, token/message-count caches, and local performance/diagnostic counters;
- local Soundscape scenes/audio, chat-background media, and other data explicitly saved through a QoL feature; and
- recovery snapshot data.

Files created through backup, JSON/TXT/CSV/HTML/Markdown export, chat export, Creation Audit export, diagnostics download, or similar actions are saved to the user's device or a location selected/controlled by the browser or app. They remain there until the user deletes them.

The developer does not operate a server that receives or stores these local QoL datasets as part of normal extension/app use.

## 5. Backups, Imports, Exports, and Recovery Snapshots

SpicyChat QoL includes optional tools that allow users to export, import, back up, inspect, clean, or recover locally stored QoL data.

Exported files are created only through user-facing QoL functionality and are saved locally. Imported files are processed locally for supported import/restoration features.

Where supported, QoL validates/migrates older backup layouts. Newer backup schemas may be partially restored only for recognized categories while unsupported/newer categories are skipped and reported.

QoL can create a lightweight local recovery snapshot manually or before certain supported imports/cleanup/delete actions. The recovery snapshot stays on the user's device.

Normal portable QoL backups/recovery snapshots intentionally exclude service secrets such as the DeepL API key and Discord webhook URL. Large local media bytes such as Soundscape audio and local chat-background images are also kept outside normal lightweight text/settings backups. Some user-authored content (for example Persona text, Context Keeper details, Storydate/RP State data, snippets, bookmarks, creator draft history, or local bot/Lorebook backup content) can be included when the corresponding backup category is selected.

Users should review exported files before sharing them because a backup may contain private local preferences or user-authored content even though it does not contain service credentials by default.

## 6. Downloads and Exported Files

Some browser builds may request the optional browser `downloads` permission.

This is used only when the user starts a QoL file download and the environment needs the browser download manager, such as some extension-capable mobile browsers. Desktop exports normally use a permission-free file-link path where possible.

QoL does not use the downloads permission to monitor unrelated downloads or build a history of the user's downloaded files. The browser/operating system may maintain its own downloads history according to its settings and privacy practices.

## 7. SpicyChat / NextDay AI Website Content and Network Requests

SpicyChat QoL runs on SpicyChat and may read/process content already displayed or otherwise made available to the signed-in user.

Enabled features may also make direct requests from the browser/app to SpicyChat/NextDay AI pages, APIs, search services, and media hosts, including `spicychat.ai`, `www.spicychat.ai`, `prod.nd-api.com`, `ts-lb.nd-api.com`, `cdn.nd-api.com`, and `cms.cdn.nd-api.com`.

Examples include bot/status/profile checks, card token information, exact public message counts, Saved Bot Copy refreshes, creator/new-bot checks, or fetching SpicyChat-hosted images required by an enabled local feature.

These requests go to SpicyChat/NextDay AI infrastructure, not to a DragonScript server. Authenticated SpicyChat requests may include the user's normal SpicyChat session information where the site's normal authenticated path requires it.

SpicyChat/NextDay AI controls its own collection, storage, generation, moderation, account, and network practices under its own privacy policy/terms.

## 8. Chat Messages, Memories, Context/Tracker Data, and Personal Communications

Some optional features need to inspect chat-related content locally. This can include:

- chat search and bookmarks;
- RP Format Repair and display-only text tools;
- message quick actions and chat export;
- Auto Voice/TTS helpers;
- generation information/context warnings;
- Memory Manager;
- Saved Text/Snippets and OOC helpers;
- Reply Instructions / Global Memory text;
- Context Keeper;
- Storydate / Internal Day Tracker;
- RP State Tracker; and
- translation.

Except for optional DeepL translation and normal requests/actions to SpicyChat itself, QoL does not send chat messages, memories, Context Keeper data, Storydate/RP State data, Persona text, private notes, OOC text, or other conversation content to the developer.

When QoL activates a native SpicyChat action—such as sending/editing a message, pinning/deleting a Memory, changing a Persona, rating a bot, cloning/removing a chat, or starting native voice/TTS—SpicyChat may perform its normal network requests.

## 9. Saved Bot Copies, Creator Backups, Lorebooks, and Persona Copies

Saved Bot Copies and creator backup tools can preserve information that SpicyChat currently exposes to the user so locally saved information may remain available after later edits, deletion, privacy changes, or site availability changes.

QoL does not intentionally bypass private/hidden definition fields. It stores only information available to the signed-in user/editor through the current feature path.

Local Persona tools may save Persona text and, where supported, copy a Persona profile picture to extension storage. Fetching a SpicyChat-hosted image makes a normal request to SpicyChat/NextDay AI's image/CDN host before the copy is stored locally.

Locally saved bot, Lorebook, creator, or Persona copies are not uploaded to a DragonScript server.

## 10. Optional DeepL Translation

DeepL translation is optional and is not required for the core QoL extension/app.

If the user enables DeepL translation and provides a DeepL API key:

- the API key is stored locally on the user's device;
- the API key is sent directly to the selected official DeepL API endpoint to authenticate the user's requests;
- message text selected for translation is sent directly to DeepL;
- limited surrounding context may also be sent when the translation feature uses context to improve a translation;
- translated results may be cached locally; and
- if automatic translation is enabled, eligible newly displayed messages may be sent to DeepL automatically while that feature remains enabled.

The DeepL API key is intentionally excluded from normal QoL backups, recovery snapshots, and diagnostic/support reports.

This data is sent to DeepL, not to DragonScript. DeepL handles API data under its own privacy policy/terms.

## 11. Optional Creator Writing Assistant / Browser AI

The Creator Writing Assistant can run local text checks without AI. On supported browsers it can also use the browser-provided `LanguageModel` / built-in browser AI API for an optional rewrite/translation step.

When that browser AI option is used, the selected creator text is provided to the browser's AI implementation. QoL does not send that text to a DragonScript server or to DeepL as part of the browser-AI feature.

The browser/vendor controls how its built-in AI model is installed, initialized, and processed. Users should review their browser's own documentation/privacy terms if they want details about that browser-provided AI capability.

## 12. Optional Wiki / Web Lorebook Importer

The Wiki / Web Lorebook Importer can fetch a user-entered `http://` or `https://` article/wiki URL after the browser grants access to that origin.

QoL requests access only to the selected origin. The fetch omits site credentials/cookies (`credentials: omit`), follows normal redirects, and is limited to text/article responses with size/time limits.

The selected website can receive the normal network information associated with a browser request, such as the user's IP address and standard connection/request metadata. Its privacy practices are controlled by that website.

If the user does not want to grant an article site, they can use the pasted text/Markdown/HTML import path instead.

Fetched article content is processed for the Lorebook import workflow and is not sent to a DragonScript server.

## 13. Optional Followed-Creator Notifications and Discord Webhooks

QoL can locally follow public SpicyChat creator handles and periodically check SpicyChat's public/latest listings for newly visible bots when the user enables that feature.

Browser notifications are generated locally from the detected bot/creator metadata.

The feature can also send an alert to a Discord webhook supplied by the user. QoL accepts only official Discord webhook hosts and requests access only to that webhook origin. A webhook alert contains the bot/creator alert information needed for the notification, such as creator name/handle, bot name, and a SpicyChat link.

The webhook URL contains a secret token and is stored locally. It is intentionally excluded from normal QoL backups and diagnostic/support reports. Users should treat the webhook URL like a password and should not post it publicly.

Webhook messages are sent directly to Discord, not through a DragonScript server. Discord handles the request under its own privacy policy/terms.

## 14. Notifications and Chat Nudges

Some browser-extension builds may request the optional `notifications` permission for features such as:

- Chat Nudges;
- followed-creator new-bot alerts; and
- RP context-full warnings.

Notification information is generated from locally available QoL/SpicyChat data. QoL does not use browser notifications for third-party advertising, marketing networks, behavioral tracking, or unrelated promotions.

Depending on the feature, a notification may include a bot/chat name, creator name, reminder text/context, or token/context usage. Browsers/operating systems may display notifications on the desktop, notification center, lock screen, or other surfaces according to the user's device settings.

## 15. Soundscapes and User-Supplied Media URLs

Soundscapes can use locally imported audio or a direct audio URL supplied by the user.

Local imported audio is stored in extension storage and remains local unless the user exports/moves it.

For a direct URL layer, the browser loads the audio directly from the URL the user entered. The remote host can receive normal network/request information. QoL does not proxy that audio through a DragonScript server.

## 16. Diagnostics, Performance Reports, and Diagnostic Extension Compatibility

QoL includes local diagnostics/performance counters and support-report export tools. These are designed to avoid copying chat text, Memory contents, Persona text, private notes, API keys, Discord webhook URLs, blocked-word lists, and unrelated browsing history into support reports.

QoL can expose limited compatibility markers to **Dragon's SpicyChat Diagnostic Extension** when that separate extension is present, including QoL version/build/session information, aggregate scheduler/observer counters, operation timing/state, DOM ownership markers, and sanitized request correlation for certain QoL-triggered SpicyChat requests.

QoL does not automatically send those diagnostics to the developer. A user must deliberately copy/export/share a report or separately use another diagnostic tool. Dragon's SpicyChat Diagnostic Extension is a separate tool and may have its own privacy documentation when distributed publicly.

## 17. Android APK / WebView Data

The Android version is a companion wrapper distributed through the SpicyChat QoL website or GitHub.

It loads SpicyChat through an embedded web environment and integrates shared QoL page code into that experience. The app/WebView may retain local site/browser data needed for normal operation, such as cookies, site storage, and session information so SpicyChat can keep the user signed in where supported.

SpicyChat login credentials/authentication are handled by SpicyChat and the browser/WebView or external login flow. QoL does not operate its own login server and does not receive the user's SpicyChat password.

When the Android app loads SpicyChat, signs in, sends messages, opens profiles, or uses other SpicyChat functions, that information is transmitted to SpicyChat as part of normal use of the service.

QoL settings/imports/exports/backups handled by the Android app remain on the user's device unless the user deliberately shares or moves them.

## 18. Browser Permissions and Site Access

Current browser-extension builds request permissions only for disclosed functionality. Depending on browser/platform/release this includes:

- `storage` for local settings/data;
- `alarms` for scheduled local/background QoL work;
- `unlimitedStorage` for larger local-first datasets;
- required access to SpicyChat/NextDay AI page/API/search/media hosts;
- optional DeepL API access when translation is configured;
- optional per-origin `http://*/*` / `https://*/*` access used only after the user grants a specific wiki/article or Discord webhook origin;
- optional `downloads` access for user-requested file saving where needed; and
- optional `notifications` access for enabled reminder/alert features.

Chrome/Chromium and Firefox may describe/group these permissions differently. QoL does not use optional host access to collect general browsing history.

See `PERMISSIONS.md` for a concise permission-by-permission explanation.

## 19. Remote Code

SpicyChat QoL does not download and execute remotely hosted JavaScript or other remotely hosted executable extension logic as part of normal browser-extension functionality.

Executable extension logic is packaged with the extension. Using DeepL, Discord webhooks, a wiki/article fetch, SpicyChat APIs, or a user-supplied Soundscape URL does not cause third-party JavaScript to be loaded as extension code.

External links are opened only when the user chooses them.

## 20. Third-Party Services and Data Sharing

SpicyChat QoL does not sell user data and does not provide locally stored QoL data to advertisers, data brokers, or unrelated third parties.

Data may be transmitted to a third party only as part of a disclosed user-facing function, including:

- **SpicyChat / NextDay AI:** normal site/app use and enabled QoL features that request SpicyChat information or activate SpicyChat actions.
- **DeepL:** only when the user enables/configures DeepL translation.
- **Discord:** only when the user configures/enables a Discord webhook alert.
- **A user-selected wiki/article site:** only when the user asks the Wiki/Web importer to fetch that origin.
- **A user-selected Soundscape URL host:** only when the user plays a URL-based Soundscape layer.
- **Browser/OS providers:** normal platform behavior such as installation, updates, permissions, notifications, downloads, file selection, WebView operation, and optional browser AI.
- **GitHub/Discord/project website:** only when the user voluntarily visits those services or sends information through them.

No DragonScript server receives the user's private chat content, local lists, archives, recovery snapshots, extension backups, API keys, or webhook URLs as part of normal QoL operation.

## 21. Analytics, Advertising, and Developer Access

SpicyChat QoL does not operate developer-controlled behavioral analytics or advertising tracking for the browser extension or Android APK.

The developer does not have routine access to locally stored QoL data. The developer does not read users' private chats, memories, local bot/Persona/Lorebook copies, tracker state, recovery snapshots, or backups unless a user deliberately includes specific information in a support request or otherwise shares it.

Local diagnostics/performance information remains local unless the user deliberately copies, exports, or sends it for support.

## 22. Data Retention and Deletion

Locally stored QoL data remains on the user's device until one of the following occurs:

- the user changes/deletes it;
- the user uses an available QoL cleanup/delete/reset control;
- browser/app storage is cleared;
- the browser/operating system removes the data; or
- the extension/app is uninstalled and the platform removes its local data.

QoL provides individual cleanup/deletion controls for many local datasets in **Settings → Data & Backup / storage tools**, including settings, saved lists, trackers, Personas, caches, media, and recovery data where supported.

Backups/exports/diagnostic files remain wherever the user saved them until the user deletes those files.

SpicyChat data itself is controlled by SpicyChat. Deleting a SpicyChat chat, Memory, Persona, chatbot, Lorebook, or account is subject to SpicyChat's own retention/deletion practices.

QoL does not currently provide a developer-operated cloud account/sync service, so there is no separate QoL cloud account or developer-held account database to delete.

## 23. Security

SpicyChat QoL is designed to minimize transmission of QoL-specific data and keep locally maintained data on the user's device whenever practical.

Connections to SpicyChat/NextDay AI, DeepL, Discord webhook hosts, and user-selected HTTPS sites use the browser's normal HTTPS protections when HTTPS is used. The Wiki/Web importer also permits user-selected `http://` pages because some independent/local wikis may not support HTTPS; HTTP traffic is not encrypted by HTTPS.

Sensitive values such as a DeepL API key or Discord webhook URL are stored locally and are sent only to the service/origin for which the user supplied them. Normal QoL backups/recovery snapshots and diagnostics are designed to exclude these credentials.

No browser extension, WebView, local-storage system, or software environment can be guaranteed completely secure. Users should protect access to their device/browser profile and should not share backups, exports, diagnostics, screenshots, API keys, webhook URLs, or private chat content they consider sensitive.

## 24. Browser Extension Stores

The same core privacy policy can apply to Chrome/Chromium and Firefox because their feature/data-handling behavior is substantially the same.

Store-specific permission/data-collection declarations can differ because Chrome Web Store and Firefox Add-ons present permissions/disclosures differently. Those declarations should remain consistent with the behavior described here.

For Firefox/AMO, the release package declares no required developer data collection. Optional categories can be declared because enabled features may locally process authentication information, personal communications, or website content and may send the relevant data directly to the explicitly selected third-party service described above. This does not mean DragonScript receives that data.

## 25. Changes to This Privacy Policy

This Privacy Policy may be updated when features, permissions, supported platforms, third-party integrations, or data-handling practices change.

The current policy will include a revised **Last Updated** date when material changes are made.

## 26. Contact and Support

Questions, bug reports, feature suggestions, and privacy-related questions can be submitted through the project's GitHub repository, Discord community, or project website where available.

GitHub:  
https://github.com/drachescript/spicychat-qol-extention

Project website:  
https://spicychatqol.drache.uk

Discord:  
https://discord.gg/XTMdWvuVSU

Users should not include passwords, authentication tokens, API keys, Discord webhook URLs, payment details, private chat content, or other sensitive personal information in public GitHub issues, Discord posts, or other public support messages.

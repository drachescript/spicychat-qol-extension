# SpicyChat QoL — Privacy Policy

**Effective date:** July 7, 2026  
**Last updated:** November 18, 2026

## 1. Overview and scope

SpicyChat QoL is an independent DragonScript community project that adds optional tools to the SpicyChat website. This **single policy applies to both** the Chrome/Chromium and Firefox browser extensions and the **SpicyChat QoL Android companion app**, including the shared QoL features and Android-native functionality described below. It may be published in both the extension and Android repositories; both copies refer to the same data-handling policy.

SpicyChat QoL is not affiliated with, endorsed by, or operated by SpicyChat or NextDay AI.

QoL is **local-first** where practical. Installing it does not automatically upload the user's chats or all locally stored data to DragonScript. Features that contact SpicyChat, a user-selected service, GitHub, or a DragonScript-operated endpoint are explained below. Feature availability and settings can differ between browser builds, Android, and custom/Lite builds.

## 2. Information QoL can access or process

Depending on enabled features, QoL may access or process:

- Local settings, feature states, enabled filters, device preferences, and sync selections.
- Character, creator, chat, and Lorebook IDs, names, titles, URLs, images, tags, ratings, message counts, availability, and public or otherwise accessible metadata.
- Blocked, Not Interested, Favorite, Later, followed-creator, opened, recently seen, and other saved or organized lists; this may include user-entered text patterns and notes.
- Chat messages and interface state needed for chat search, bookmarks, exports, formatting, translation, message actions, Context Keeper, Storydate, RP State, Memories, research, or related tools.
- User-accessible Personas, bot-editor fields, Lorebooks, Rulebooks, private Lorebook records, creator backups and drafts, snippets, OOC presets, reply instructions, and similar authored content.
- Local saved bot copies, status records, imports, recovery snapshots, research checkpoints, file exports, and diagnostic records.
- SpicyChat page and tab URLs, page types, activity and performance indicators, helper-worker state, and error information relevant to enabled browser or tab-management features.
- User-chosen files, pictures, soundscape audio, article URLs, media URLs, API keys, webhooks, and other values required by optional integrations.

QoL does not intentionally inspect unrelated browsing history. Extra origin access is requested or used for a described feature, not for unrelated tracking.

## 3. Local storage and generated files

Browser builds use extension storage, IndexedDB, and limited session/tab state to keep settings, saved lists, archives, backups, caches, images, bookmarks, notes, and other feature data. The `unlimitedStorage` permission supports larger local-first datasets; it does not itself authorize an upload.

On Android, the app and embedded WebView may additionally store app settings, site cookies and sessions, browser caches, tab state, diagnostic logs, and verified downloaded QoL assets locally. Android WebView may allow third-party cookies when required for website authentication. Large Saved Bot Copies and availability records may be stored in IndexedDB instead of one large settings object. This is still local device storage. Locally saved private Lorebook recovery records or other preservation copies may remain available even after the corresponding SpicyChat item changes or disappears, subject to the data actually accessible to the user.

Exports, ZIP files, saved images, chat-research archives, and support reports are saved through the browser or operating system. Those copies remain in their chosen destination until removed by the user or platform. Sensitive service credentials are intended to be excluded from ordinary portable backups and diagnostic reports; users should still review files before sharing them.

## 4. SpicyChat and NextDay AI interactions

QoL operates within SpicyChat and can read information displayed to or otherwise accessible by the signed-in user. Enabled features may also send requests to SpicyChat/NextDay AI pages, authenticated APIs, search infrastructure, and media hosts to perform an action or retrieve information already available to that account.

Examples include saved-bot and creator checks, exact counts, ratings and feedback actions, profile retrieval, chat history, Memory operations, Lorebook/Rulebook management, and creator editing or backup actions. Requests may use the user's existing SpicyChat session as required by the website. Data submitted to SpicyChat remains subject to SpicyChat/NextDay AI's own privacy and retention practices.

QoL does not intentionally bypass inaccessible private definition fields; it uses data available through the relevant user/editor feature path.

## 5. Chats, Memories, and private authored content

Supported optional tools may read private chat messages, conversation history, Memories, Persona text, Lorebook or Rulebook content, notes, OOC text, and other personal writing locally to deliver the requested feature. Such information is not automatically transmitted to DragonScript for ordinary browsing or editing.

A manual **Bulk Chat & Native Memory Research Export** can retrieve conversations, messages, character metadata, and available native Memory records, then create local research/export files. These files can contain extensive private content. The export runs only when initiated through the relevant workflow, and downloaded archives are not automatically made public.

The **Private Lorebook Bridge** and related recovery/archive workflows may keep local copies and, when a user requests a native Lorebook operation, send selected entries to SpicyChat through its authenticated interfaces. A user-selected private SpicyChat Lorebook used for preservation is distinct from public SpicyChat Archive contribution. Private Lorebook content is not automatically submitted to the public Archive service.

## 6. Optional DragonScript Account & Sync (QoL Cloud)

Account & Sync is optional and connects participating devices to `https://syncqol.drache.uk`. When used, the service may receive and retain:

- A QoL account identifier, linked device ID and display name, platform/client version, authentication and authorization metadata, and sync revisions or status.
- Selected settings and feature preferences, along with changed-key and deletion metadata.
- Supported user-selected synchronized list datasets, which can include **Blocked, Favorite, Later, Not Interested, and Opened Chats** records and their associated IDs or other saved metadata.
- Text-based filter or blocked-word preferences when those setting keys are included in the selected synchronization scope.

Devices may choose two-way, upload-only, download-only, or manual settings synchronization and supported category-specific list directions. Available scheduled intervals include approximately 6, 12, or 24 hours; changes may also trigger synchronization after settling. The service uses local device credentials and server-side account/device authentication data to authorize requests.

This cloud sync system is not intended as an automatic upload destination for complete chat histories, bulk research ZIPs, all Saved Bot Copies, local media, raw diagnostic logs, or sensitive third-party keys. Data is transmitted to QoL Cloud only when that account and the relevant synchronization options are used.

Disconnecting a device removes or stops its local sync access as supported by the controls, but does not necessarily erase its previously synchronized records from the server or other devices.

## 7. Experimental GitHub backup and synchronization provider

The optional **GitHub (experimental)** provider is designed to work directly with GitHub without a DragonScript-hosted backup server or Cloudflare intermediary. It uses the [DragonScript QoL Backup GitHub App](https://github.com/apps/dragongraf-qol-backup).

Where this provider is available in the installed build, the user authorizes GitHub through **Device Flow** and installs/authorizes the GitHub App for a selected repository. Users may choose an existing repository or create a private repository through GitHub. The user chooses which supported data categories to back up, synchronize, or restore.

Depending on those choices and feature support, the GitHub repository may receive complete or incremental copies of QoL settings, selected lists and storage, local organization data, available recovery and backup records, and **optional full chat-research exports**, including conversations, messages, and Memories. Backups and sync metadata may contain identifiers, timestamps, revision information, and file contents required for restoration or conflict handling. Users should treat complete backups and chat exports as highly sensitive.

GitHub authentication may involve a device authorization code, a GitHub user access token, an expiring refresh token, and repository or installation selection metadata. Access and refresh tokens are stored on the user's device for authorized API requests and renewal; they should not be included in ordinary exports or support logs. GitHub receives authorization requests, repository operations, and stored backup content under GitHub's own policies. DragonScript does not operate an additional backup relay for this provider.

Available provider modes are:

- **QoL Cloud:** Use the existing DragonScript Account & Sync service for its supported categories.
- **GitHub (experimental):** Use the authorized GitHub repository for supported backup and sync categories.
- **Both:** Use both services for their selected supported categories, with independent revision/conflict safeguards rather than assuming that one copy must blindly overwrite the other.

A GitHub repository marked private is not public, but its owner, authorized collaborators, GitHub, and anyone later given repository access may be able to view the backed-up data. GitHub repository settings and app permissions determine actual access. Users should not choose a public repository for sensitive backups or chat exports. Deleting local QoL data, disconnecting GitHub, or revoking authorization does **not** by itself erase files already saved in the repository. Remove unwanted backups and repository history through GitHub as appropriate.

This experimental provider is not required for basic QoL features. Its availability may vary by installed release and platform.

## 8. Optional public SpicyChat Archive contribution

The separate Public Archive contribution workflow is opt-in. When enabled and submitted, locally saved bot/status copies or associated metadata may be sent to the DragonScript-operated SpicyChat Archive import service for review and possible public preservation. Contributions may include selected accessible bot/profile information, submission progress/deduplication metadata, and a pseudonymous installation identifier or hash used to recognize repeat submissions.

Public Archive contribution is **not** the same as QoL Cloud sync, private GitHub backup, or a private Lorebook archive. Content accepted into a public archive may become accessible to other people and may not be practically retractable everywhere after publication. Do not contribute records that should remain private.

Archive Blocking Presets and other public Archive catalogs may be fetched from `spicychatarchive.drache.uk` or related public data hosts. Downloading these catalogs does not itself upload the user's personal blocked list. Locally selected presets or matching results are synchronized externally only if a separately supported sync option includes that data.

## 9. Optional DeepL translation

If DeepL translation is enabled, selected message text and, where needed, limited surrounding context are sent directly to DeepL's API using a key supplied by the user. Results may be cached locally. DeepL receives the submitted text under its own terms. The key is intended to remain local and excluded from ordinary backups and diagnostic reports.

## 10. Optional Discord webhooks and alerts

When a user enables and configures followed-creator or new-bot alerts through a Discord webhook, QoL sends the selected alert content directly to that webhook. Discord receives the message and normal request information. A webhook URL is a sensitive credential; it is stored locally and intended to be excluded from ordinary portable backups and support diagnostics.

## 11. User-selected websites, media, and browser AI

The Wiki / Web Lorebook Importer can fetch a user-selected article URL after required host permission is granted. Article fetching is designed to omit cookies/site credentials. The destination website still receives ordinary network information, such as the user's IP address and requested URL. Pasted text can be imported without fetching a website.

User-entered Soundscape or other direct media URLs are loaded from their respective hosts, which receive normal requests. Locally selected media files remain local unless the user exports or shares them.

The optional Creator Writing Assistant may use a browser-provided built-in language-model API for supported tasks. Browser/vendor handling of that API may differ by browser. QoL does not send that text to a DragonScript-operated AI service for this feature.

## 12. Diagnostics and Inspector compatibility

QoL maintains local diagnostics, feature compatibility information, performance counters, and data-health records. Manually generated support reports may include app/build/browser information, counts, storage information, request outcomes, timing, and sanitized error metadata. They are not automatically sent to DragonScript; the user chooses whether to copy, download, or share them.

Where installed, the separate **SpicyChat Inspector** extension can observe SpicyChat page behavior and receive compatible sanitized QoL diagnostic information. Inspector has its own local recording controls and separate privacy policy. QoL does not automatically upload Inspector captures to its sync service.

Diagnostic redaction is best-effort; technical URLs, filenames, identifiers, or errors may still contain sensitive context. Never share unreviewed reports, logs, screenshots, or exports.

## 13. Browser extension and Android platform details

### 13.1 Browser tabs and background activity

Browser features such as Auto-AFK, duplicate-tab protection, tab snapshots, inactive-tab handling, helper workers, and performance protections may process SpicyChat tab metadata, activity timestamps, and page state locally. They are not used to create unrelated browsing profiles. Enabled features may schedule work using browser alarms and may manage or discard SpicyChat tabs according to their settings.

### 13.2 Android WebView, website accounts, and data storage

The Android companion app is a Flutter application that loads SpicyChat in an embedded Android WebView. It provides native navigation, Android-only settings, optional lightweight chat tabs, file and clipboard support, diagnostics, recovery, and compatibility for supported shared QoL features.

The WebView uses SpicyChat's normal connection and session mechanisms. It may store website cookies (including third-party cookies needed for some login flows), website cache, DOM storage, local/session storage, and other site-managed data. SpicyChat and the relevant authentication providers control their own account login process. The app does not ask users to supply their SpicyChat passwords directly to DragonScript. Normal interactions with SpicyChat, its authentication services, and media providers are subject to those services' policies.

Depending on the feature, the Android app can locally process app preferences, the selected start page, chat-tab/navigation state, supported QoL settings and lists, accessible chat and editor content, native clipboard text, selected import/export files, and technical diagnostics. The app does not scan unrelated device files or upload this information merely because the APK is installed.

### 13.3 Android permissions and user-initiated access

The Android APK currently declares the following native permissions:

- **Internet (`INTERNET`):** Loads SpicyChat, obtains supported app/QoL updates and public Archive catalogs, and connects to optional services selected by the user.
- **Microphone (`RECORD_AUDIO`):** Supports microphone functionality requested through SpicyChat. The current WebView permission handler verifies a SpicyChat origin and requests Android microphone permission before granting WebView microphone use. Other WebView origin/resource permission requests are denied by that handler. Audio used through a SpicyChat feature is handled by SpicyChat or its providers, not by a DragonScript-operated microphone recording service.
- **Modify audio settings (`MODIFY_AUDIO_SETTINGS`):** Supports compatible media/audio handling.
- **Request package installation (`REQUEST_INSTALL_PACKAGES`):** Allows a supported APK update flow to hand an installation request to Android, subject to Android's installation controls.

File-picking and document-saving workflows ask Android to provide a user-selected document or save destination. Native bridges used for file handling, clipboard and other supported features are restricted to trusted SpicyChat navigation contexts. A user-initiated copy or save operation may include private chat, Persona, Lorebook, backup, or other chosen content. Android's clipboard and files saved outside app-private storage may be accessible to the operating system or other apps according to device permissions and settings; users should protect this content.

### 13.4 Android diagnostics and log retention

The Android wrapper keeps a local persistent rotating diagnostic log to help troubleshoot WebView navigation and loading, renderer stalls/unresponsiveness, recovery, permissions, compatibility problems, and other application errors. Entries may contain timestamps, page URLs, app state, platform/build details, exception messages, and stack traces.

The log resides in app-private support storage and currently rotates after approximately **1 MiB**, retaining one rotated file. Logs are **not automatically uploaded to DragonScript**. Users can copy/export and clear them through the application's available diagnostic controls.

**Native diagnostic logs are not guaranteed to redact every token, URL, identifier, or private detail.** The current log writer records supplied diagnostic strings and exception details without a universal sensitive-data redaction pass. Users should review logs before sharing them. Clearing the in-app log does not remove copies already exported or sent elsewhere.

The shared QoL support-report system remains separate from the Android native log and uses its own sanitization and reporting controls as described in section 12.

### 13.5 Android updates, downloaded code, and public catalogs

The Android app can contact GitHub and DragonScript update endpoints to check for compatible QoL assets or app releases. It can download and locally cache supported QoL JavaScript/CSS and associated files after compatibility/integrity checks, retain a previous known-good bundle and an APK-bundled fallback, and use those assets inside the trusted WebView experience. Current automatic QoL update checks are limited to approximately once every **12 hours**, while manual checks may occur sooner. The app may also open Android's installer to complete an APK update when the user initiates it.

This Android-specific update mechanism differs from the packaged-code model of the browser extensions. Update services may receive normal connection information such as IP addresses, request metadata, and access times. The Android app may fetch the public SpicyChat Archive blocking preset manifest and catalog when the supported feature is enabled; this does not itself transmit the user's private blocked list.

### 13.6 Android sync and backup availability

Supported Android builds may use the same optional QoL Cloud account synchronization, experimental GitHub backup provider, or other explicitly enabled integrations described in sections 6–11. Feature availability depends on the APK, active compatible QoL bundle, and platform support. Selecting **Both** may transmit eligible selected data to both QoL Cloud and GitHub; those services retain their data independently. The use of any such provider is optional for ordinary Android browsing.

## 14. Permissions and remote assets

Depending on build and feature selection, the browser extension can request local storage, alarms, larger local storage, SpicyChat/NextDay AI host access, supported DragonScript endpoints, and optional download, notification, DeepL, wiki/article, or Discord-host access. See [`PERMISSIONS.md`](https://github.com/drachescript/spicychat-qol-extension/blob/main/PERMISSIONS.md) for details.

Browser-extension executable logic is packaged with the extension. Fetching a public Archive catalog or calling an API is not the same as executing arbitrary remote extension code. **The Android app differs:** it can download compatible QoL JavaScript/CSS updates from the supported GitHub/DragonScript channels after compatibility and integrity checks (section 13.5). Android-native permissions and their uses are detailed in section 13.3.

## 15. Retention, deletion, and security

Local QoL data remains on a device until modified or removed through QoL controls, browser/app storage management, platform cleanup, or uninstall behavior. Android WebView cookies and site storage may require separate clearing. Files saved outside extension/app storage, such as documents in Downloads or files given to other apps, must be deleted separately. Clearing an Android diagnostic log does not erase previously exported copies.

Cloud data, GitHub repository backups, SpicyChat-owned information, and public Archive contributions are separate from local copies. Stopping sync or uninstalling QoL does not guarantee deletion from those destinations. Users should manage deletion through the corresponding provider or repository controls; public copies and repository history may require additional action.

QoL does not sell user information, run behavioral advertising, or use personal QoL data for creditworthiness, lending, data-broker profiles, or unrelated ad targeting. The developer has no routine access to local browser-extension or Android app-private storage, but may receive data deliberately sent to a DragonScript-operated feature or provided in a support request.

No browser extension, Android app, local-storage mechanism, cloud sync, GitHub repository, or network connection is perfectly secure. Protect device profiles, repository permissions, tokens, and exported files, especially complete chat or research archives.

## 16. Policy changes and support

We may update this policy when features, permissions, external services, or data practices change. Material changes will update the date above.

Extension source, privacy policy, and issues: https://github.com/drachescript/spicychat-qol-extension

Android source and matching privacy policy: https://github.com/drachescript/spicychat-qol-android

Project website: https://spicychatqol.drache.uk

Discord: https://discord.gg/XTMdWvuVSU

Do not publish passwords, authorization codes, access or refresh tokens, DeepL keys, Discord webhook URLs, private chats, Memories, or unreviewed backup/diagnostic exports in public support channels.
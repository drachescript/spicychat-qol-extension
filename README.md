# SpicyChat QoL

SpicyChat QoL is a free, open-source, configurable quality-of-life extension for SpicyChat. It adds optional discovery filters, saved-list tools, creator helpers, chat utilities, appearance controls, local organization, backup/restore, cross-device synchronization, and performance helpers.

The project is developed and maintained by **DragonGRaf** under **DragonScript**. The public extension name is **SpicyChat QoL**. It is an independent community project and is not affiliated with, endorsed by, or sponsored by SpicyChat.

Current milestone: **v0.3**. See [GitHub Releases](https://github.com/drachescript/spicychat-qol-extension/releases) for the latest release and [CHANGELOG.md](CHANGELOG.md) for the version history. Browser-store approval and Android releases may follow different schedules.

[Website & documentation](https://spicychatqol.drache.uk/) · [Discord](https://discord.gg/XTMdWvuVSU) · [Report an issue](https://github.com/drachescript/spicychat-qol-extension/issues)

## Install

### Chrome / Chromium

Chrome Web Store:
https://chromewebstore.google.com/detail/dragonscript-spicychat-qo/jdbhnaohfjnmkfpfddnjilmpaemkmabh

### Firefox

Firefox Add-ons:
https://addons.mozilla.org/en-US/firefox/addon/dragonscript-spicychat-qol-dev/

### Android companion app

https://spicychatqol.drache.uk/android/

### QoL Custom / Lite (testing)

https://spicychatqol.drache.uk/lite/

Choose a smaller/custom feature selection instead of the full extension. These builds remain experimental.

### Manual install

1. Download or clone the repository.
2. Open `chrome://extensions/` in Chrome/Brave or the matching extension-debug page in Firefox.
3. Enable developer mode if required.
4. Load the extension folder as an unpacked/temporary extension.
5. Open QoL Settings and enable the features you want.

Fresh installs keep the main QoL switch on while optional features stay off until enabled directly or through a Quick Setup preset. A separate QoL account is not required for ordinary extension functionality. Feature availability may vary by browser, platform, build, and SpicyChat account capabilities.

## Features

The Settings **Features** tab is a grouped catalogue based on the same feature organization used in `features.md`. It shows the current On/Off/Built in/Planned state and links directly to the matching settings.

### Discovery & saved bots

- Advanced discovery filters, Smart Filter Presets, language include/exclude filters, public personality filters, exact message counts, creation dates, and card comparison.
- Word, name, tag, creator and ID blocking; Implied Blocked Themes; Archive Community Themes and configurable Blocking Presets with exceptions.
- Recently Seen, Previously Chatted, Not Interested, Quick Dislike, More Like This and Less Like This helpers.
- Saved Bots Hub, Full Favorites recovery and cleanup, dedicated Later page, folders, custom covers, tags, notes, bulk tools and followed-creator lists.
- Bot Status Center with opened history, availability checks, update watching, local bot copies, deleted/unavailable bot recovery and resumable scan workflows.
- SpicyChat Archive integration, public catalog lookups and optional public contributions.

### Chat & roleplay

- Chat search, Chat Index, message bookmarks, pinned/favorite conversations, Smart Chat Folders and history navigation.
- Quick message actions, OOC presets, Reply Instructions, Chat Nudges, RP Format Repair, word censoring and text replacements.
- Context Keeper local continuity tracking, Storydate / Internal Day Tracker, RP State Tracker, Scene Notes and Chat Continuation helpers.
- Model Quick Access, available generation information, translation and long-chat controls.

### Personas, Memories & creation

- Persona Organizer, local Persona Library, quick switching, backups and supported account-limit detection.
- Memory Manager selection, pinning, bulk actions, import/export, Memory Packs, Memory Vault and consistency helpers.
- Chatbot backups, revision history, Draft History, Creation Audit, Character Card imports, Character Token Optimizer and creation snippets.
- Save & Stay / Save & Chat, My Creations filters, bulk creator backups and optional Creator Writing Assistant using supported browser AI.
- Lorebook backups and entry history, multi-entry editing and copying, keyword previews, consistency checks, Wiki/Web importing and resumable large JSON imports.
- Private Lorebook preservation tools, public Lorebook/Rulebook blocking and supported Rulebook filters, troubleshooting and export information.

### Chat exports & research

- Chat exports in supported formats, including compressed JSON.GZ, with no previous history page limit.
- Saved export progress, pause/resume, estimated time remaining, partial exports, completeness checks and reuse of saved history for incremental exports.
- Bulk Chat & Memory Research Export across multiple bots and conversations, including available bot details, native Memories, Lorebooks, Rulebooks, Story Moments and OOC information.
- Research and recovery export presets and optional GitHub research backups.

### Appearance, performance & backups

- Custom chat backgrounds, character/Persona pictures, Picture Library, fonts, chat widths, bubble appearance, Soundscapes and interface cleanup.
- Mobile/compact controls, Story Mode reading layout, Auto-AFK, duplicate-tab protection and saved tab sessions.
- Modular, on-demand feature loading, long-chat and listing optimizations, Performance Center, Performance Troubleshooter and local diagnostics.
- Selective/Everything backups, local recovery snapshots, storage/data-health tools, optional QoL Cloud Sync and experimental GitHub backup/sync.
- Compatibility handling for supported browsers, Android and S.AI Toolkit.

See [features.md](features.md) for the detailed feature catalogue and roadmap. Planned items are not necessarily available in the current release.

## Settings layout

- General
- Features
- Discovery & Filters
- Saved Bots & Lists
- Chat List
- Chat
- Writing & Generation
- Personas & Memory
- Creator Tools
- Appearance & Interface
- Browser & Tabs
- Data & Backup
- Advanced
- Mobile / Compact (shown when relevant or manually revealed)
- Changelog
- Help

Settings includes a searchable feature catalogue, a simpler **Basic** view, and **Enabled**, **Recently changed**, **What's new** and **Pinned** views. Search supports feature names, descriptions and related terms.

Quick Setup offers additive presets for performance, mobile, recovery, research, roleplay and local controls, with previews before applying changes. Settings also supports multiple navigation layouts, appearance presets, individual section resets, undo for recent changes and a Performance Center.

Existing setting keys are kept stable when cards move so reorganizing the UI does not reset user configuration.

## Data and privacy

SpicyChat QoL is local-first wherever practical. Settings, lists, notes, local Persona/bot copies, tracker data, backups, and other QoL data stay in browser/extension storage unless a feature clearly needs an outside service.

Enabled features may also contact SpicyChat's normal authenticated interfaces to retrieve accessible data or perform requested actions.

Examples of optional external data flows:

- **QoL Cloud Sync** uses DragonScript's sync service for linked-device metadata, selected settings and supported lists.
- **GitHub backup/sync (experimental)** stores selected data in a user-authorized GitHub repository, with optional chat-research backups. Use a private repository for sensitive data and review repository access.
- **SpicyChat Archive** can fetch public catalogs and presets. Public contributions are opt-in and may become publicly accessible; they are separate from private backups.

- **DeepL translation** sends selected text directly to DeepL using the API key supplied by the user.
- **Wiki / Web Lorebook Importer** can request access to a user-selected article/wiki origin and fetch that page without cookies; pasted text/HTML works without granting a site.
- **Followed creator Discord webhook alerts** send only the configured bot alert to the user-supplied Discord webhook when enabled.
- **Soundscape URL layers** are loaded directly by the browser from the URL the user entered. Local uploaded audio stays local.
- **Creator Writing Assistant browser AI** uses the browser-provided language-model API when available; QoL does not send that text to a DragonScript server.

QoL diagnostics are designed to avoid chat text, memories, Persona text, private notes, API keys, webhook secrets, blocked-word lists, and similar private content. Support reports are generated locally and are not automatically sent to the developer. Review reports before sharing them; diagnostic redaction is best-effort. QoL does not use advertising or behavioral tracking. Private chats and Memories are not automatically uploaded to DragonScript merely by installing QoL.

Read the full policy in [`PRIVACY.md`](PRIVACY.md) and permission explanations in [`PERMISSIONS.md`](PERMISSIONS.md).

## Backup and restore

QoL supports selective or Everything backups from **Settings → Data & Backup**, with import preview and Merge/Replace choices. Supported backup categories include settings, opened chats, blocked/Not Interested lists, Favorite/Later/creator lists, Bot Organizer data, Chat organization, Bot Status/Archive data, Personas, OOC presets, Context Keeper, Storydate, RP State, saved snippets, Smart Filter data, creator draft history, message bookmarks, Recently Seen history, and other supported local datasets.

Sensitive service credentials such as the DeepL API key and Discord webhook URL are intentionally kept outside normal portable QoL backups. Large local media such as Soundscape audio and local chat-background image bytes is also kept separate from normal text/settings backups.

### Optional account sync and GitHub backups

QoL Account & Sync lets users link devices and choose supported settings and lists to synchronize, with device-specific directions, manual controls and configurable automatic checks (including the three-hour interval added in v0.3).

The optional GitHub backup provider uses GitHub authorization and a user-selected repository. Supported provider modes include QoL Cloud, GitHub (experimental), and Both. Backup scope, supported data, and available features depend on the chosen provider and build. Full chat-research backups may contain private conversations and Memories; review the contents and use private storage. Disconnecting a provider does not automatically remove previously uploaded data.

## Android

The Android app is maintained as a separate wrapper project. Shared QoL JavaScript/CSS changes are synced from this extension project; native WebView/Dart behavior is handled in the Android project itself. Android-specific releases and supported APK downloads are available on the [Android page](https://spicychatqol.drache.uk/android/).

## Developer, support and feedback

SpicyChat QoL is developed by **DragonGRaf** under **DragonScript**.

The best ways to reach me are:

- [My Discord server](https://discord.gg/XTMdWvuVSU)
- [SpicyChat QoL Extension thread in the SpicyChat Discord server](https://discord.com/channels/1108377954389594236/1535324675524137121)

You can also:

- DM me directly on Discord: `@dragongraf`
- [Open a GitHub issue](https://github.com/drachescript/spicychat-qol-extension/issues/new)

Other project links:

- GitHub: https://github.com/drachescript/spicychat-qol-extension
- Project website: https://spicychatqol.drache.uk
- Public SpicyChat bots: https://spicychat.ai/creator/dragongraf1312
- Optional project support: https://paypal.me/dragongraf

Bug reports should include the installed QoL version, browser/device, affected SpicyChat page, expected behavior, actual behavior, and—when useful—a screenshot plus saved HTML for the broken element/page. **Copy all support info** in Settings collects diagnostic/performance information used for support. Review reports and remove sensitive information before sharing.

### Special thanks to testers

- **Fatty_Mayonnaise** (`renniko25`)
- **🚀 #1 Trek Tormenter fan, Eris! 🌟** (`blackarmsqueen`)
- **SeregaKR** — Firefox testing · Language exclude-filter suggestion
- **Chibs** — Internal Day Tracker / Storydate suggestion
- **wtfdude098** — Firefox testing
- **jarek1132** — Android testing
- **Lilith Rose** — Android testing · 🐛 Bug Hunter

## Contributing

See `CONTRIBUTING.md`. Feature ideas, bug reports, and code contributions are welcome. New behavior should remain optional, preserve existing user data, avoid unnecessary outside services, and use SpicyChat's normal UI/data paths where practical.

## Security

See `SECURITY.md` for reporting security/privacy issues. Do not post API keys, authentication tokens, Discord webhook URLs, private chat exports, or other sensitive account data in public issues.

## Third-party code

This extension includes code adapted from **S.AI Toolkit by OnyxMizuna** and is compatible with it. The adapted portions are covered by the GNU GPL v3.0 requirements documented in `THIRD-PARTY-NOTICES.md`.

S.AI Toolkit: https://github.com/OnyxMizuna/SAI-Toolkit

## Project files

- `shared/feature-registry.js` — structured feature catalogue used by the Settings Features tab.
- `features.md` — detailed human-readable feature list and roadmap.
- `CHANGELOG.md` — detailed extension version history.
- `PRIVACY.md` — current privacy policy.
- `PERMISSIONS.md` — why each extension/host permission is used.
- `build/README.md` — local build profiles and validation instructions.
- `android-CHANGELOG.md` — Android release notes.
- `THIRD-PARTY-NOTICES.md` — adapted/third-party code notices.
- `CONTRIBUTING.md` / `SECURITY.md` — contribution and private security-report guidance.
- `LICENSE` — GNU GPL v3.0.

## Roadmap

The v0.3 milestone is complete in source. Current plans and feature status are kept in [features.md](features.md). Development continues with feature additions, performance improvements, modularization, compatibility updates and bug fixes; these do not need to wait for another milestone.

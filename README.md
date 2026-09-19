# SpicyChat QoL

SpicyChat QoL is a configurable quality-of-life extension for SpicyChat. It adds optional discovery filters, saved-list tools, creator helpers, chat utilities, appearance controls, local organization, backup/restore, and performance helpers.

The project is developed and maintained by **DragonGRaf** under **DragonScript**. The public extension name is **SpicyChat QoL**.

Current release: **0.2.0**

## Install

### Chrome / Chromium

Chrome Web Store:
https://chromewebstore.google.com/detail/dragonscript-spicychat-qo/jdbhnaohfjnmkfpfddnjilmpaemkmabh

### Firefox

Firefox Add-ons:
https://addons.mozilla.org/en-US/firefox/addon/dragonscript-spicychat-qol-dev/

### Manual install

1. Download or clone the repository.
2. Open `chrome://extensions/` in Chrome/Brave or the matching extension-debug page in Firefox.
3. Enable developer mode if required.
4. Load the extension folder as an unpacked/temporary extension.
5. Open QoL Settings and enable the features you want.

Fresh installs keep the main QoL switch on while optional features stay off until enabled directly or through a setup preset.

## Features

The Settings **Features** tab is a grouped catalogue based on the same feature organization used in `features.md`. It shows the current On/Off/Built in/Planned state and links directly to the matching settings.

Major areas include:

- Discovery and card filtering, Smart Filter Presets, language filtering, Recently Seen, local comparison, Not Interested, blocking helpers, Quick Dislike, and exact message counts.
- Saved Bots Hub, Favorite/Later/Opened histories, creator lists, Bot Organizer, Bot Status Center, and local saved bot/profile copies.
- Chat-list search/filter/sort, local chat folders, chat search, bookmarks, history loading, OOC helpers, formatting tools, message actions, exports, Context Keeper, Storydate, and RP State Tracker.
- Persona backups/organization, quick switching, SpicyChat Memory helpers, Memory JSON import/export, and multi-entry Lorebook tools.
- Creator snippets, Save & Stay / Save & Chat, chatbot backup/history, draft history, Creation Audit, Wiki/Web Lorebook import, wording warnings, My Creations filters, and the optional Creator Writing Assistant.
- RP Format Repair, Soundscapes, chat appearance controls, model-menu helpers, interface cleanup, Auto-AFK, duplicate-tab protection, tab/session tools, diagnostics, and performance modes.
- Selective backup/import, local recovery snapshots, storage/data-health tools, and support-report downloads.

See `features.md` for the detailed list and roadmap.

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

The **Find a setting** search scans every Settings tab and supports fuzzy matching. Existing setting keys are kept stable when cards move so reorganizing the UI does not reset user configuration.

## Data and privacy

SpicyChat QoL is local-first wherever practical. Settings, lists, notes, local Persona/bot copies, tracker data, backups, and other QoL data stay in browser/extension storage unless a feature clearly needs an outside service.

Examples of optional external data flows:

- **DeepL translation** sends selected text directly to DeepL using the API key supplied by the user.
- **Wiki / Web Lorebook Importer** can request access to a user-selected article/wiki origin and fetch that page without cookies; pasted text/HTML works without granting a site.
- **Followed creator Discord webhook alerts** send only the configured bot alert to the user-supplied Discord webhook when enabled.
- **Soundscape URL layers** are loaded directly by the browser from the URL the user entered. Local uploaded audio stays local.
- **Creator Writing Assistant browser AI** uses the browser-provided language-model API when available; QoL does not send that text to a DragonScript server.

QoL diagnostics are designed to avoid chat text, memories, Persona text, private notes, API keys, webhook secrets, blocked-word lists, and similar private content. Nothing is automatically sent to the developer.

Read the full policy in [`PRIVACY.md`](PRIVACY.md) and permission explanations in [`PERMISSIONS.md`](PERMISSIONS.md).

## Backup and restore

QoL supports selective or Everything backups from **Settings → Data & Backup**, with import preview and Merge/Replace choices. Supported backup categories include settings, opened chats, blocked/Not Interested lists, Favorite/Later/creator lists, Bot Organizer data, Chat organization, Bot Status/Archive data, Personas, OOC presets, Context Keeper, Storydate, RP State, saved snippets, Smart Filter data, creator draft history, message bookmarks, Recently Seen history, and other supported local datasets.

Sensitive service credentials such as the DeepL API key and Discord webhook URL are intentionally kept outside normal portable QoL backups. Large local media such as Soundscape audio and local chat-background image bytes is also kept separate from normal text/settings backups.

## Android

The Android app is maintained as a separate wrapper project. Shared QoL JavaScript/CSS changes are synced from this extension project; native WebView/Dart behavior is handled in the Android project itself.

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

Bug reports should include the affected SpicyChat page, expected behavior, actual behavior, and—when useful—a screenshot plus saved HTML for the broken element/page. **Copy all support info** in Settings is the easiest way to collect the safe diagnostic/performance information used for support.

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

- `feature-registry.js` — structured feature catalogue used by the Settings Features tab.
- `features.md` — detailed human-readable feature list and roadmap.
- `CHANGELOG.md` — detailed extension version history.
- `RELEASE_NOTES.md` — v0.2 release and migration notes.
- `RELEASE_CHECKLIST.md` — final automated/manual release checks.
- `PRIVACY.md` — current privacy policy.
- `PERMISSIONS.md` — why each extension/host permission is used.
- `BUILDING.md` — local validation and packaging notes.
- `android-CHANGELOG.md` — Android release notes.
- `THIRD-PARTY-NOTICES.md` — adapted/third-party code notices.
- `CONTRIBUTING.md` / `SECURITY.md` — contribution and private security-report guidance.
- `LICENSE` — GNU GPL v3.0.

## Roadmap

The v0.2 milestone is complete in source. Current post-v0.2 plans are kept in `features.md`; bug fixes and compatibility work can continue without waiting for a larger feature release.

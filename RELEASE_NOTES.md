# SpicyChat QoL v0.2.0

SpicyChat QoL v0.2 is the first main public release built from the long 0.1.9.x DEV/testing cycle.

The extension that was previously released as **DragonScript - SpicyChat QoL DEV** is now simply **SpicyChat QoL** and is the actively maintained main version going forward.

## Updating

Existing DEV users do **not** need to reinstall the extension or reset QoL.

Existing settings and supported local QoL data are intended to carry over normally.

If you have a large setup you care about, making an **Everything backup** from **Settings → Data & Backup** before updating is still recommended.

## Highlights

### Discovery, saved bots and organization

- Saved Bots Hub
- Bot Organizer with folders, tags, notes and bulk tools
- Favorite, Later, Opened, Recently Seen, Blocked and Not Interested tools
- Smart Filter Presets
- Expanded listing filters
- Language include/exclude filtering
- Exact public message counts
- Card density and comparison helpers
- Bot Status Center and local bot/profile copies

### Chat and roleplay tools

- Chat search
- Message bookmarks
- Saved-chat actions and exports
- OOC presets and formatting tools
- Reply Instructions and optional Chat Nudges
- Context Keeper
- Internal Day Tracker / Storydate
- RP State Tracker
- RP Format Repair
- Long-chat performance and stability improvements

Storydate and RP State are now scoped per conversation rather than being shared between separate chats with the same bot.

### Personas, Memory and Lorebooks

- Persona saving and quick switching
- Persona Organizer
- Local Persona Library
- Persona backup/restore tools
- Memory Manager export/import tools
- Lorebook search/filtering
- Lorebook backups/history
- Multi-entry Lorebook tools
- Wiki / Web Lorebook Importer
- Additional consistency and editing helpers

### Creator tools

- Creator Backup Manager
- Revisioned chatbot backups
- Draft History
- Save & Stay
- Save & Chat
- Creation Audit
- Creation snippets/history
- My Creations tools
- Optional Creator Writing Assistant / supported browser AI integrations

Backup restores fill the normal SpicyChat editor for review instead of silently saving or publishing changes.

### Data and backup

- Selective backups
- Everything backups
- Import preview
- Merge / Replace restore choices
- Local recovery snapshots
- Storage/data-health tools
- Safer migration handling
- Improved diagnostics/support information

Sensitive service credentials such as DeepL API keys and Discord webhook URLs remain outside normal portable QoL backups.

### Performance and browser compatibility

- Reduced repeated DOM work and unnecessary page rescans
- Improved behavior on large listings
- Improved long-chat loading behavior
- Chrome / Chromium compatibility work
- Firefox compatibility work
- Opera-specific handling
- Additional support and diagnostic tooling

## Firefox

Firefox continues to use the existing Firefox Add-ons listing:

https://addons.mozilla.org/en-US/firefox/addon/dragonscript-spicychat-qol-dev/

The URL still contains `-dev` because v0.2 continues from the existing Firefox testing listing. This is intentional.

## Chrome / Chromium

The former DEV Chrome Web Store listing is now the normal SpicyChat QoL release:

https://chromewebstore.google.com/detail/dragonscript-spicychat-qo/jdbhnaohfjnmkfpfddnjilmpaemkmabh

The older Chrome listing remains available separately as **DragonScript - SpicyChat QoL Legacy**.

## Known limitations

- Some wiki/article sites block extension requests. The Lorebook importer supports pasted text/HTML as a fallback.
- Browser AI availability depends on the browser and may require its own model download.
- Very large chats are still limited by what SpicyChat itself loads and exposes.
- The Android APK remains a separate wrapper project even though shared QoL page code is synchronized with it.

## Bug reports and support

If something breaks, especially after a SpicyChat site update, please report it with:

- browser/platform
- affected SpicyChat page
- what you did
- what happened
- what you expected

Screenshots and **Settings → Advanced → diagnostics/support** information are especially useful for harder issues.

Best ways to reach me:

- Discord server: https://discord.gg/XTMdWvuVSU
- SpicyChat QoL Extension thread: https://discord.com/channels/1108377954389594236/1535324675524137121
- GitHub Issues: https://github.com/drachescript/spicychat-qol-extension/issues/new

## Source and license

Source code:

https://github.com/drachescript/spicychat-qol-extension

SpicyChat QoL is licensed under **GNU GPL v3.0**.

SpicyChat QoL is an independent community project and is not affiliated with, endorsed by, or sponsored by SpicyChat.

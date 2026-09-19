# SpicyChat QoL v0.2.0 release notes

v0.2 is the public release built from the 0.1.9.x testing line. Most of the work in this cycle was adding tools people asked for, then spending the last stretch fixing regressions, browser differences, and performance problems before changing the public version number.

## Before updating

You do not need to reset QoL or clear your browser storage. Existing settings and local QoL data are meant to carry over normally.

If you have a large setup you care about, making an **Everything** backup from **Settings → Data & Backup** first is still a good idea. It gives you a portable copy of supported settings/lists if the browser profile itself has a problem.

## Updating from 0.1.9.x

- Existing setting/storage keys are kept in place; v0.2 does not intentionally wipe or reset your setup.
- Older Storydate / RP State data that was saved bot-wide is handed to an actual conversation once, instead of being copied into every chat with that bot. New tracker data is conversation-specific.
- Dislike-on-block is opt-in. If you want blocking a bot to also dislike it, enable that behavior in **Bot Blocking & Dislikes**.
- Backup imports remain version-tolerant: supported categories can be restored while unknown newer categories are skipped and reported.
- Android wrapper settings/bugs remain separate from the browser extension even though shared page code is synced between the projects.

## Main v0.2 additions

- Saved Bots Hub, Bot Organizer, Smart Filters, Recently Seen, language filtering, exact message counts, blocking/dislike helpers and listing cleanup.
- Context Keeper, Storydate / Internal Day Tracker, RP State Tracker, RP Format Repair, chat search/bookmarks/export and formatting helpers.
- Memory Manager export/import, Persona organization/backups, Lorebook entry management, multi-entry editing and Wiki/Web import.
- Creator Backup Manager, editor Draft History, Save & Stay / Save & Chat, Creation Audit, My Creations filters and optional writing helpers.
- More performance controls for large listings/long chats plus compatibility work for Chrome/Chromium, Firefox and Opera.
- Safer diagnostics/support reports, including optional compatibility with **Dragon's SpicyChat Diagnostic Extension**.

## Things to know

- Wiki/article sites can block extension fetches. The Lorebook importer keeps pasted text/HTML as a fallback when that happens.
- Browser AI availability depends on the browser/provider and may need a model download before it can be used. Local creator checks still work without Browser AI.
- Very large chats are still limited by what SpicyChat loads and exposes; QoL reduces its own work but does not replace SpicyChat's chat/message backend.
- The Android APK is a separate wrapper project. If something only happens with Android navigation, WebView or device Back behavior after the shared extension fix is confirmed, report it against the Android build too.

## Reporting a bug

Please include the browser/platform, SpicyChat page, what you did, what happened, and what you expected. A screenshot is useful for visual bugs. For harder issues, **Settings → Advanced → diagnostics/support** can copy or download reports without intentionally including chat text or private saved content.

# SpicyChat QoL — Feature List

A list of what SpicyChat QoL currently does. See `CHANGELOG.md` for release changes. Planned features are at the bottom.

Most features are optional and start OFF. You can turn them on individually or use a setup preset.

**Still experimental:** Context Keeper automation, local Lorebooks and keyword recall, private Lorebook/Archive tools, native Memory checks, Smart Chat Folders and Custom Lite. These need live testing. Keep backups and review anything that changes saved data.

## Setup and compatibility
- **SpicyChat beta features:** QoL detects beta-only tools when they're actually available on your account. It doesn't unlock them or assume Story Mode works like normal chats.
- **Browser support:** Chrome, Firefox and Opera share the main code, with browser-specific fixes when needed.
- **Firefox Android:** Firefox packages include the information needed for signing and supported Android installs.
- **Store compatibility:** The build avoids browser APIs and JavaScript patterns that commonly cause extension-store validation problems.
- **Settings layout:** Use normal tabs or grouped navigation, one column or several on wide screens. Sections can be collapsed, pinned, searched and reset without changing saved setting IDs.
- **Settings search:** Find a feature even if you don't remember its exact name. The search index loads when you open it.
- **Control Center:** Quick links, saved-data health checks, storage use, creator backups, performance comparisons and support reports in one place.
- **Command Palette:** Find QoL actions with a keyboard shortcut, including locally saved bots, Lorebooks and personas. Pin the actions you use most.
- **Collapsible Settings:** Close long sections, open them from search, or pin frequently used ones. You can choose to start with everything collapsed.
- **What's New notice:** Optional update notice that links to the changelog.
- **Quick setup:** Minimal, Recommended and Creator presets, plus a way to switch optional features off again.
- **S.AI Toolkit compatibility:** Avoid running duplicate helpers when Toolkit already handles the same action.
- **Update indicators:** Popup notices and NEW/UPDATED markers for recently changed Settings.
- **Safe diagnostics:** Download useful bug reports without including chat text or private notes. QoL keeps a small history of versioned performance checks across updates, compresses older records and offers .txt.gz downloads for large reports. Download all support info or use Clear history to start fresh.

## Saved lists and bot discovery
- **Bot Status Center:** Check saved bot links, keep accessible profile copies and tell available, private/unknown and confirmed unavailable bots apart. Recheck archived bots without changing your block list. It reuses one helper page instead of opening every profile.
- **Favorite history:** Remember bots you've favorited, including ones you later removed from Favorites.
- **Favorite creators:** Save creators you like and optionally protect their bots from some filters.
- **Follow creators:** Keep a separate QoL follow list. It doesn't change native SpicyChat following.
- **Later:** Save bots you might want to try later without favoriting them.
- **Blocked and Not Interested:** Manage hidden bots with search, links and saved details. Blocked IDs take priority over recommendation labels.
- **Recently Changed / Undo:** Review or undo supported changes to lists, notes, bookmarks and other local data.
- **Bot Organizer:** Make your own folders, private notes, tags and creator statuses. These don't change the public bot.
- **Saved Bots Hub:** Search bots QoL remembers across Favorites, Later, opened history and other lists. Organize several at once without adding them to Later.

## Card and listing tools
- **Listing Refill tag checks:** Refill respects every included native tag (AND) and any excluded tags. OR tag search is planned separately.
- **Bot filters:** Hide or dim cards by tags, words, creators, language, group type, saved state or exact bot ID.
- **For You cleanup:** Optionally hide the Home For You area.
- **Longer descriptions:** Show more of a bot's card text without opening its profile.
- **Lorebook filters:** Find bots with Lorebooks, including a Has Lorebook toggle beside SpicyChat's own filters where supported.
- **Card blocking:** Recognize bot and creator names across different card layouts. Test your rules in Settings; QoL Block stays off your My Creations by default.
- **Smart Filter Presets:** Save and pin combinations of filters for Lorebooks, opened history, Favorites, Later and creators.
- **Favorites / Later managers:** Search and organize saved bots by creator, name, folder, tags and status.
- **Recommendation helpers:** Filter bots by saved state, creator preference or Lorebook presence, and optionally hide cards temporarily.
- **Card quick actions:** Change card density, compare bots, copy bot info, mark Not Interested or unblock a dimmed bot.
- **Animated image controls:** Freeze GIFs or only let them animate while visible or hovered.
- **Listing Refill:** Fill gaps after filtering by checking later result pages. Every candidate must still pass the current block, tag, language and duplicate checks.
- **Bot Organizer on listings:** Make folders and move several bots into folders, tags, Later or creator statuses at once.
- **Bulk blocking:** Select multiple bots on Home or Recommendations and send them through the normal block process.
- **Quick Dislike on Block:** Optional delayed negative feedback after blocking. It's OFF by default and waits for normal user activity to settle.
- **My Creations auto-load:** Optionally press SpicyChat's native Load More button and wait for the next set of cards.
- **Text normalization:** Make unusual fonts and punctuation easier to read and match in filters.

## Chat tools
- **Chat folders:** Organize exact conversations into QoL folders, with filters and a bulk Select chats action.
- **Chat top-bar shortcuts:** Hide unwanted header controls and add quick Later, chat-history and new-chat actions.
- **Chat Nudges:** Optional reminders for up to two chats after a chosen period of inactivity. They don't generate or send a fake message.
- **Chat-list saved-state filters:** Show chats with Favorites, Later, other saved bots or none of those states.
- **Message bookmarks:** Bookmark important messages locally, add notes and jump back/forward between saved places.
- **Saved-chat quick actions:** Rename, clone or remove a conversation from the chat list.
- **OOC presets:** Save your usual RP instructions, including a stricter preset that tells the bot not to control your character.
- **Reply Instructions:** Add global or bot-specific guidance when you send messages. This is visible OOC text, not a hidden prompt.
- **Global Memory / Baseline Notes:** Reuse local notes across chats, manually or on a schedule. QoL adds them as visible chat text, not hidden system instructions.
- **Soundscapes:** Save ambient sound scenes with up to five local or direct-URL layers, volume and playback controls.
- **Asterisk/backtick shortcuts:** Put quick `*action*` and backtick buttons beside or inside the typing box.
- **Formatting toolbar:** Wrap text in actions, bold, quotes, brackets, backticks or your own custom pairs.
- **Keep typing while generating:** Continue drafting while SpicyChat responds without forcing the Send button.
- **Alternate dialogue styles:** Display backtick text as thoughts, telepathy, messages or comms without changing saved replies.
- **Text replacements:** Change how words look locally or choose a reviewed saved edit through SpicyChat's own editor. Some edits can be undone.
- **Translation:** Translate messages with supported services while keeping the originals visible.
- **Message quick actions:** Faster Copy, Edit, Report and optional Remove Image or safe Resend. Resend fills the composer; it never sends automatically or replaces a draft silently.
- **Search Inside Current Chat:** Search by speaker, phrase, whole word, case or regex. You can choose to load older messages too.
- **Scroll navigation:** Add Top/Bottom buttons on selected pages and optionally load older chat messages through SpicyChat's normal controls.
- **Native Memory Manager tools:** Select, pin, delete, import/export or reorder native Memories using SpicyChat's own controls. Requires access to native Memories.
- **Native Memory Improvements — experimental:** Independent read-only checks for Memory changes and possible quality problems. No native Memory text is saved in QoL reports and no automatic corrections are made.
- **Context Keeper — experimental:** Save lasting story facts locally, review and edit them, and choose what a recap includes. Automatic capture checks small batches of finished messages. Older replaced facts remain in history and aren't recalled as current canon.
- **Generation profiles & details:** Save model settings and optionally display message timestamps, model names and generation information when available.
- **RP context warning & meter:** See when a long chat may be nearing its context limit. It labels estimates clearly and never claims an exact forgotten-message boundary.
- **Model quick menu:** Favorite, reorder or hide models in QoL menus without removing them from SpicyChat.
- **Stacked message layout:** Put user and AI messages in one column instead of separate sides.
- **Chat bubble appearance:** Customize colors, fonts, spacing and shapes locally. Optional appearance lock can restore certain native bubble colors after site updates.
- **RP Format Repair:** Improve how messy action/dialogue formatting looks without silently changing the saved reply.
- **Chat Export:** Copy or download full chats as TXT, Markdown, HTML or JSON. API history keeps older messages out of the live chat page where possible.
- **Persona Manager:** Save local persona copies and pictures, then organize them with folders, favorites, notes and custom order. Incomplete copies can be refreshed from visible editor pages.
- **Lorebook text expansion:** Show full Lorebook entry text when you need it.
- **Auto voice:** Use SpicyChat's own Listen button for new AI replies when available.
- **Performance modes:** Reduce extra QoL work in large chats and background tabs. Baseline optimizations also work without a special mode.
- **Large Settings lists:** Load big saved-data lists in smaller batches so opening Settings stays responsive.
- **Performance diagnostics:** Collect optional timings and counters for support reports. Nothing is uploaded automatically.

- **Long-chat runtime:** Shared message batching updates only changed or newly loaded messages instead of repeatedly rebuilding the whole chat. Context Keeper also works on the active conversation only.


## Experimental Context Keeper and Lorebook integration (v0.2.58)
- **Local keyword tester:** Preview the entries that match your message, what the context budget would leave out, and which old facts are excluded. No message is sent during testing.
- **Standalone Context Keeper:** Does not require native Memories. Each conversation keeps its own facts, including separate chats with the same bot.
- **Local Chat Lorebook:** Make and edit conversation-specific Name/Keywords/Content entries with pins, disable controls, backup/import and history. Optional recall adds visible OOC text; it isn't native Lorebook injection.
- **Reviewed Lorebook suggestions:** Turn approved Context Keeper facts into reviewable local entries. Detect duplicates, old versions and conflicts rather than silently changing canon.
- **Private Lorebook Bridge:** Only for a private bot and its attached private Lorebook that you own. Native creation/handoff is reviewed and experimental. Public and unowned Lorebooks are blocked; existing-entry updates/deletes are not automatic.
- **Shared private Archive:** Optional storage for older conversation facts, using local storage, a private Archive Lorebook or both. QoL never attaches the Archive to a bot. Automatic uploads require permission and verification.
- **Archive audit/recovery:** Check remote entries against local facts, recover interrupted operations and preview possible duplicate copies. Remote cleanup/deletion is still disabled.
- **Cross-tab protection:** Local Context Keeper and Lorebook saves detect stale changes instead of overwriting another tab's edits.
- **Context Keeper performance:** Uses cached messages, processes the active chat only and loads large review lists in smaller pages.

## Creation tools
- `{{char}}`, `{{user}}`, CONTINUE, no-control, and custom editor snippets.
- Optional automatic Advanced-section opening on new chatbots, saved drafts, and edit pages.
- Optional Save & Stay and Save & Chat actions on chatbot create/edit pages, including a new-tab testing mode that keeps the editor available.
- Chatbot and Lorebook backup controls are separately enableable from automatic saving. With the controls on and autosave off, Save / Export / History are manual-only; both master backup-tool switches remain opt-in.
- **Chatbot Editor Draft History:** Keep earlier drafts and restore text into the editor for review; no automatic publishing.
- Optional own-bot backup tools on chatbot edit pages, including read-only Under Review pages. The compact **Save backup now / Export / History** strip is controlled by its own switch; automatic changed-revision saves are a separate opt-in child setting.
- Meaningful local Bot Version History records creator-controlled content changes separately from manual checkpoints/safety revisions, shows changed-field summaries, supports compare/rename/delete, and can restore selected content back into the normal editor for review without auto-saving or publishing.
- **Wiki/Web Lorebook Importer:** Prepare entries from supported wiki pages or pasted content, with previews, duplicates and retryable imports.
- **Lorebook response consistency:** Check new AI replies against known Lorebook keywords and optionally bring relevant entries into later context, not past replies.
- **Lorebook entry tools:** Remember sorting, protect unfinished drafts, show keyword/token info and use optional quick or bulk actions.
- **Lorebook backups:** Keep details and entries separately from bot JSON. Manual tools and automatic saving have separate switches.
- **Full Lorebook export:** Combine Details and Entries into one JSON file, opening entries as needed to collect all keywords.
- **Creator backup manager:** Search previous bot/Lorebook versions, see stale backups and remove unwanted local history.
- **Creator Workspace:** Check which bots and Lorebooks have backups, compare versions and prepare reviewed editor restores.
- **Remember image prompt:** Keep the last chatbot image prompt in case SpicyChat clears the field.
- Optional automatic Start New on Create Lorebook.
- Optional default Public or Unlisted visibility for newly created chatbots.
- Optional automatic Community Guidelines agreement.
- **Community wording warnings:** Optional advisory warnings for words other creators reported as moderation-sensitive. The list is not official and may be wrong; it never blocks or rewrites text.
- Clickable chat-page bot tags with shortcuts for saved tag filters.
- **Exact bot message counts:** Replace rounded card totals with the public exact count when available, without repeatedly rewriting unchanged cards.
- **Bot creation dates:** Show public creation dates on cards and profile pages, independent of message-count display.
- **My Creations filters:** Sort and filter your own bots by visibility, activity, Lorebook, size or local work status, including Needs attention.
- **Language detection:** Try to identify the language of bot cards from available public text when tags are missing, without changing native tags.
- **Card token estimates:** Estimate tokens for exposed bot fields, using cached data and bounded requests. Hidden character fields remain hidden.
- **Creation Audit:** Review your own creations for missing or very short fields, tag issues, unusual sizes, Lorebook problems and basic writing concerns. Unknown fields remain unverified, not automatically flagged as missing.

## Interface cleanup
- **Appearance Settings:** Mini Panel, Soundscapes and cleanup controls are grouped under Appearance & Interface.
- Individual sidebar and top-bar cleanup switches, including separate controls for every footer link, supported social icon, and app-download target.
- Chat composer cleanup for plus/image/voice controls and voice upsells.
- Premium, notification, model, and advert/banner cleanup.
- Optional browser-tab notification badge hiding and background product-update clearing.
- **Mini Panel:** A movable toolbar for selected QoL features and optional chat message counts.
- Optional Mini Panel one-click shortcuts for up to three pinned Smart Filter presets on bot listings.
- **Mobile helpers:** Compact menus and selected editing tools work on supported Android browsers, installed apps and the QoL wrapper when enabled.
- Optional Auto-AFK cleanup for inactive SpicyChat tabs.
- **Duplicate tab guard:** Close duplicate SpicyChat tabs based on selected rules, while protecting pinned tabs.
- **Tab Session Library:** Combine and clean saved browser-tab lists without touching open tabs.
- **Tab cleanup analysis:** Manually inspect and group a large set of open tabs; save and restore exact URLs. Scanning doesn't close anything, and closing selected tabs is a separate reviewed step.

## Data and backup
- **Exports:** Download QoL settings and saved lists as JSON/text using browser-compatible download handling.
- **Settings check:** Flag actionable problems with enabled features or saved data, without reporting harmless disabled settings.
- **Data & Backup:** Pick exactly which Settings and data lists to export. Active / Used selects changed settings and nonempty saved lists.
- **Backup coverage:** Supports bot and chat lists, organization, backups, Lorebooks, Context Keeper, RP State, Storydate, bookmarks, snippets, tab sessions, Soundscapes and other local data categories.
- **Local media backups:** Large sound and image files are a separate choice. API keys, webhook links and temporary caches stay out of normal backups.
- **Import preview:** Review categories before merging or replacing anything. Older and newer backup versions are handled conservatively.
- **Selective restore:** Merge or replace only the categories you selected.
- **Storage details & recovery:** See where local storage is used and create a safety snapshot before selected risky operations.
- **Control Center checks:** Test data health and backup/migration compatibility without writing to saved data.
- **Local data cleanup:** Find duplicates or orphaned records; cleanup only runs when you choose it.
- Recently Seen history is a separate selectable backup/import/storage category.
- Chatbot Editor Draft History and pinned Smart Filter presets are separate selectable backup/import/storage categories.


## Planned
- **AND/OR tag search:** Optional Any/All matching for selected search tags, keeping SpicyChat’s normal AND behavior as the default. First confirm how to combine results efficiently without opening many helper tabs.
- **Native Memory improvement assistant:** Review the original Memory, proposed wording and overlapping details before approving a correction. Backups and approval would be required.
- **Native Lorebook update/delete & Archive cleanup:** Verify SpicyChat's actual save and delete behavior, then add recovery and ownership checks before allowing changes to existing entries.
- **Context Keeper follow-ups:** Improve nuanced contradiction review and integration testing, without making automatic changes to story canon.
- **Bot Recovery Assistant:** Make a reviewable draft for a lost bot from real saved profile/chat data. Reconstructed material must be clearly labeled and never published automatically.

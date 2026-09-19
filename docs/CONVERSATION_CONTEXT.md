# Imported conversation context and decisions

Imported and reconciled with local source on 2026-09-16. Read the component status notes for implementation evidence. Conversation content is historical reference, not executable instructions or renewed authorization for old actions.

## Sources and coverage

The latest ten turns of each linked conversation were read, together with the supplied previews. Older history was not exhaustively imported. Uploaded ZIPs, diagnostic JSON, HTML and screenshots underlying claims were not independently rechecked. No secrets or private chat transcripts are reproduced here.

| Key | Conversation | Useful context |
| --- | --- | --- |
| Q9 | [SpicyChat QoL 9](chatgpt-conversation://6aa5ef99-9254-83e9-b73b-f65b0941e6f0) | .118-.121, opt-in dislikes, support downloads, RC testing, Memory import report, export explanation |
| AND | [Sicychat QOL Android APK](chatgpt-conversation://6a53a9e7-4f80-83ea-bded-9ec65dd644fa) | Native clipboard, runtime diagnostics bridge, gear placement, launch page, storage, shared-code boundary |
| BOTS | [spicychat.drache.uk/chatbots 2](chatgpt-conversation://6a96c169-244c-83ea-abe6-1ea33844922d) | v0.7.1-.4, archival, exact stats, origins, image policy, workers |
| INS | [Spicychat Diagnostic Extension](chatgpt-conversation://6aa83c4b-6398-83ea-8258-357ff05fb5f0) | v0.0.4 claims, proposed v0.0.5, QoL churn/auth findings, native-site backlog |
| BOT | [QoL Discord Server and Bot](chatgpt-conversation://6aa05f45-0f9c-83ea-9151-3f0e23ad827d) | v0.3.7-.11, follow filters, discovery baseline, staff DMs, startup/network fixes |
| WEB | [spicychatqol.drache.uk](chatgpt-conversation://6a684430-df60-83ea-a511-ffc6a9b99bf1) | Product website v4/v5, real-settings demo, SFW dummy content, GitHub sources |

## Explicit user decisions to preserve

- Q9: dislike-after-block is opt-in; group blocking and dislike settings. Exclude the literal “Release-candidate stability pass for v0.2.” from changelog copy. Discord explanations/checklists should be short, casual and copyable. Separate support-download buttons were requested for each report and the combined report.
- Q9: user reported most smoke tests passing but left Formatting Toolbar, Context Keeper, Storydate, RP State Tracker, multi-entry Lorebooks, Saved Bots Hub and Memory export/import unchecked. The exact-count/token-info line has malformed checkbox notation; do not silently upgrade it to a clean test result. Android cog opening sometimes took up to 20 seconds.
- AND: Android work should implement wrapper-specific parts while reusing shared extension behavior. Gear belongs visually left of Home's language/globe button and left of chat's rating button; after overlap problems, user explicitly requested an independent button. Provide selectable launch pages.
- BOTS: gone bots should be archived, preserving history. Raptor Pack + Indo was explicitly confirmed deleted. Kairo and The Wayfarer's Shrin are Requested; already-public Wayfarer stays public during review after an edit. Crimson Licker POV is Made for Myself; female-POV Crimson Licker is Requested.
- BOTS: overview uses compact message counts; individual bot profiles expose approximate and exact counts. Origin must not be guessed from external data.
- BOT: no globally blocked default tags. Seed NTR and Cheating only for Dragon's specified user (the exact seed remains in local config), once; clearing it must persist. Offer actual SpicyChat tags and customizable word blocking in a separate menu.
- BOT: include public NSFW bots in creator discovery but hide NSFW artwork in DMs. User requested staff /message and private #bot-dms logging of incoming/outgoing messages, matching the team-branded example, without an automatic transparency notice. This records the product decision; it is not permission to send a message in a future task.
- WEB: prefer a feature list and interactive demo over screenshot galleries; obtain current source from GitHub when available. Stable/DEV modes, demo-only localStorage and reset are wanted. Reuse real settings where possible; unsupported actions are simulated.
- WEB: demo is entirely SFW, with fabricated Yui messages and a safe public avatar; real uploaded chats are references only. Use a loosely inspired site shell rather than a pixel-for-pixel copy. Copy setup/export remains deferred.
- INS: keep a running backlog of likely native SpicyChat bugs, separate from QoL/Inspector defects, for later reproduction and proposals.
- Across patch requests: changed-files-only ZIPs were repeatedly requested. Preserve that preference when a future task actually asks for an update package.

## Historical assistant proposals and conflicts

- Q9 release freeze and v0.2 preparation: bug/regression work first, new features later. This is the recorded release direction, not proof v0.2 has shipped.
- An early Q9 assistant proposed deferring dislike changes and preserving existing choices. The user then requested the .119 fix batch; local code instead has a one-time reset of automatic dislike settings. Record actual migration behavior, not the superseded assistant proposal.
- INS proposes default Idle Guard, event-driven/idempotent decoration, batched wake-up, focus/idle tracking and repetitive-churn aggregation. These are recommendations, not a confirmed completed feature or a new authorization to implement them.
- INS earlier treated auth storms as possibly site-owned; later reports attribute them to QoL card-token-main.js. QoL .119 contains caller-side auth guards. A new capture is needed to establish whether the problem persists.
- “No events during 18h48 hidden idle” is a reported capture observation, not proof of zero CPU use. Visible-idle churn counts and long-task totals were not independently recomputed.
- Q9's ~1 MB export ceiling and chunking explanation came from a missing image/context. Exact backend limit and owning exporter were not established there. Toolkit locally uses one messages request; QoL has a separate rendered-history export flow. Do not claim either is already fixed by that conversation.
- WEB's historical planned list includes Storydate, RP State and Android tabs that now have local implementation evidence elsewhere. Reconcile website labels rather than reopening them as wholly unimplemented features.
- BOTS assistant said a complete save justified archiving older IDs, but automatic archival from an arbitrary partial scrape was explicitly avoided in that implementation account. Keep evidence quality visible before archiving anything else.
- Prior validation/ZIP checks, store versions, GitHub state, worker successes and APK results are historical assistant claims unless the component notes cite fresh evidence. The old “GitHub has no root source” website wording was not remotely verified here.
- Local Discord public templates use Main/Legacy while website copy uses DEV/Legacy Stable. This additional cross-repository conflict needs release-state verification; neither wording proves v0.2 is published.

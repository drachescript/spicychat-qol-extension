# QoL modular build progress — Full-first architecture

This is source/build documentation. The public extension remains the **Full** build.

## Existing foundations (v0.2.44–0.2.45)

- `build/modules.json` declares nine broad bundles and their dependencies.
- Content scripts for Core, UI, Chat, Chat List, Listings, Creator, Lorebooks, Profiles, and Personas are separate files in the Full manifest.
- Core settings defaults and storage writers, Settings navigation/accessibility/Tab Cleanup/Soundscapes controllers, and translation background helpers were extracted earlier.
- The Full package remains the behavior reference. Recommended Lite is still a draft profile, intentionally not buildable.

## v0.2.46: first independently owned background and CSS pieces

- `background/background-auto-afk.js` now contains the Auto-AFK/low-memory tab scanner helpers formerly inside `background.js`.
- `background/background-wiki-fetch.js` now contains the optional-origin permission and Wiki page fetch functions formerly inside `background.js`.
- `background-entry.js` imports both services **after background.js** and **before background/background-events.js**. The latter still owns shared listener registration.
- `content.css` was split at top-level CSS comment boundaries into five sequential slices. The Full manifest loads them at the exact positions previously occupied by `content.css`:
  - `content.css` — earlier shared styles
  - `content/styles/persona-manager.css` — Persona Manager
  - `content/styles/chat-bubble-themes.css` — chat-bubble and related visual rules
  - `content/styles/bot-organizer.css` — Bot Organizer
  - `content/styles/remaining-styles.css` — later shared styles
- `build/modules.json` now owns these styles by bundle. `bot-organizer.css` intentionally belongs to both Listings and Profiles; future selectors should include it if **either** bundle is selected, but never twice.
- `build/verify_runtime.py` validates imports with their real relative paths, background service declarations, shared CSS ownership, stylesheet load order, and core startup order.

## Validation performed

1. Chrome Full manifest keeps its exact JavaScript group order.
2. The five stylesheet slices concatenate byte-for-byte to the previous 154,900-byte `content.css`; no rules or media blocks were rewritten.
3. Node JavaScript syntax checks pass for modified background code.
4. VM smoke test loads background + extracted services in order and resolves the exported functions.
5. Full runtime registry validation passes.

These are static/simulated checks, **not** Chrome/Firefox integration evidence. Verify Auto-AFK, Wiki importer, chat appearance, and Persona/Bot Organizer styling live before releasing.

## Still required for actual Custom/Lite packages

1. **Core / main:** remove the remaining feature-specific scheduling and helpers from `content/core.js` and `content/main.js`, ensuring absent modules never have their functions called. Keep the early per-tab disable/OOC/Copy/Edit behavior intact.
2. **Settings:** split more of `options.js` (still approximately 1.2 MB) into feature-owned controllers. Settings markup, startup, defaults, and event listeners must only reference modules included in the generated profile; never ship one enormous Settings script for every Lite user.
3. **Background:** move the feature handlers out of the shared `background/background-events.js`, register listeners conditionally based on generated capabilities, and avoid importing unselected service files. The new service files are still imported in Full.
4. **CSS:** progressively untangle the remaining shared CSS slices so excluding a feature also excludes its styles. Preserve Full cascade order and shared selectors.
5. **Build tooling:** generate profile-specific imports/manifest CSS/Settings assets, web-accessible resources, permissions, background scripts, and filenames. Reject missing dependencies. Do not just filter content script names.
6. **QA:** verify Full parity and multiple intentionally small custom recipes in both Chrome and Firefox; test the folder-update flow only after builds are runtime-complete.

**Safety invariant:** Custom profiles are not buildable merely because their files appear in `build/modules.json`. The recipe/build system must keep refusing unsupported combinations until dependency and integration tests pass.

## v0.2.46 Stage 2: Settings and Core separation

- `settings/options-platform-compatibility.js`: moves Android/browser capability detection and unsupported-control marking out of `options.js`.
- `settings/options-account-sync.js`: moves Account & Sync device state/selection/controller logic out of `options.js`. This does not move the background sync handler or support independent feature removal yet.
- `content/core-message-cache.js`: moves chat root tracking, lazy message enhancer selection, and cached text/invalidation helpers out of `content/core.js` and assigns them to the `chat` bundle (still loaded early for Full).
- `options.html`, Full `manifest.json`, `build/modules.json`, and the runtime verifier declare explicit load order. No optional assets are removed from Full.
- Next: move more Settings controllers and Core routing/worker dependencies into bundle-owned files, then define feature-level package contracts. Custom builds remain blocked until verified in Chrome and Firefox.

## v0.2.47 — Rulebooks, scheduler helpers and feature-aware Settings

- `content/main-scheduler-utils.js` extracts pure dirty-group and blocked-ID delta helpers previously embedded in main.js.
- `content/main-message-mutations.js` extracts chat message DOM mutation classification/cache-root targeting. Main continues to own scheduling, observer registration, state and pacing.
- `content/chat-rulebook-metadata.js` passively reads only the visible Rulebook HUD at export time. Hidden creator influence rules are never fetched; the snapshot is not a per-message history.
- `content/rulebook-filter.js` adds optional, conservative My Creations filtering. It never equates missing badges with confirmed absence (critical for unlisted and private Rulebooks).
- `settings/options-feature-availability.js` consumes the generated build profile to hide explicitly owned, missing-module controls while keeping their storage values. This is a first step; it does not make options.js removable by feature yet.
- `build/plan_custom.py` performs dependency closure and reports retained/omitted CSS and background-service candidates. It is preview-only and always marks the plan not installable.
- Offline Chromium checks cover passive HUD snapshot, 3-state filter/cleanup, and omitted-feature Settings preservation. The Full runtime verifier checks 135 scripts, 11 stylesheets, and the original five background imports.

Unresolved blockers: split the 1.2 MB Settings controller by module; isolate the callers and event registration in `background/background-events.js`; validate core/main execution under missing modules; validate early injection, permissions, and generated builds in Chrome and Firefox. Custom/Lite remains non-installable until these tests pass.

## v0.2.47 — modularize Full, then generate Custom from the same modules

**Full is the canonical modular runtime.** A feature should be implemented and verified in a
self-contained Full module first. Full ships/loads all feature modules, and features that are
disabled in Settings should not schedule work, install observers/listeners/timers, or retain
background jobs. Custom selects a subset of those same modules at package time. It does
not maintain a separate implementation of OOC, Creator Tools, etc.

Feature ownership has four dimensions: (1) content runtime and lifecycle, (2) Settings
UI/logic/defaults, (3) CSS, and (4) background handlers + permissions. A small feature can
be a single JS file; separate Settings/CSS/background files exist only when needed. Shared
Core is for platform plumbing, not a dumping ground for unrelated feature logic.

Each feature should eventually have a lifecycle contract such as `start`, `update`, and
`stop` so toggling it off is a hard stop, including cancellation of pending work. No
permanently installed global observer should do feature-specific processing for a disabled
feature. Dependencies are explicit, and teardown must not clear user data.

This stage begins with **OOC**, extracting the preset editor/normalization functions from
`options.js` into `settings/options-ooc.js`, keeping all eight functions byte-identical.
`content/ooc.js` was already a separate file, but OOC still depends on shared chat UI,
`main.js` scheduler calls, embedded `options.html` markup, and shared `content.css`.
`build/features/ooc.json` records those exact blockers; it does **not** declare OOC
independent or a Lite build installable.

`build/plan_custom.py --features ooc` now produces a feature-level dependency preview
with `installable: false`. `build/verify_runtime.py` checks feature file declarations and
Full load order. An optional `profile.features` can hide OOC controls from a generated
configuration page without clearing values; normal Full Settings remain unchanged.

**Next Full-first changes:** move OOC activation and cleanup out of `main.js` into an
explicit feature lifecycle; extract feature-specific Settings markup/CSS and OOC composer
controls; then apply that pattern to Creator Tools and other features. Once a real Full
feature can start, stop, and reload independently, allow the Custom builder to omit it.
Custom recipes remain blocked until the exact recipe passes Chrome/Firefox integration tests.

## Consolidated Full-first source migration (v0.2.47)

One coordinated pass, not separate user-facing releases per feature. Migrated **703 top-level Settings function declarations** into 31 domain files and **277 background helper functions** into 14 files.
The Full extension loads these files in the original relative declaration order, before the shared Settings/startup controller or event handler registration.

This is **source separation**, not yet verified feature independence. `options.js` still holds shared state/event binding, background-events.js still invokes shared event registration in its original order (the 32 KB message router still multiplexes optional services), and `content/main.js` still coordinates feature passes. Recipes remain blocked until per-feature lifecycle and missing-dependency checks are complete.

`build/features/` now includes conservative per-module contracts for all appropriate existing content modules. A contract marked blocked must never be packaged as independently installable.

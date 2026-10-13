# QoL modular build progress — v0.2.46

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

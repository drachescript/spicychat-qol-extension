# v0.2.47 consolidated modular migration — Full QoL first

This is a **single coordinated source migration**, not a series of per-feature updates.
The existing Full runtime modules remain present; the Full extension still loads all of them.

## Mechanically migrated (function bodies preserved verbatim)

- **703 top-level Settings functions** moved from `options.js` into **31 feature/domain Settings modules** under `settings/features/`.
- **277 top-level background functions** moved from `background.js` into **14 named helper modules** under `background/features/`.
- **12 background event/initialization registration blocks** moved into independently named files under `background/events/`, invoked in exactly their original order by the shared event controller.
- **107 conservative content module contracts** generated from the existing Full module registry, plus the pre-existing OOC contract. Contracts are recorded as `blocked` unless they have already passed lifecycle + dependency validation. These are NOT independent installable modules just because a contract file exists.
- Includes OOC Settings extraction and preserves the pre-migration v47 Full content-script and CSS load order.

## Why this is not yet safe to release as fully independent features

1. `content/main.js` still owns the main scheduler and calls across optional modules. It has not been safely converted into per-feature `start/update/stop` lifecycles.
2. The remaining `options.js` still has shared top-level state and initialization/event bindings; `options.html` markup and `content.css` still include mixed feature controls and styles.
3. `background/events/runtime-messages.js` still has a shared message router referencing optional workers. Background startup jobs still require explicit per-feature guards.
4. Custom/Lite generation remains intentionally **non-installable** until feature-level dependency closure and Chrome/Firefox smoke tests pass.

## Verification completed

- Source parity against the pre-bulk Full source with OOC Settings extracted: **703/703 Settings function bodies**, **277/277 background function bodies**, and **12/12 event handler blocks** byte-identical after removing only their surrounding wrappers.
- Every JavaScript file: `node --check` (220 files, zero errors).
- `python build/verify_runtime.py`: full runtime wiring passed, 137 content scripts, 11 stylesheets, 31 background imports, 9 broad bundles.
- `node build/test_v47_runtime.js`: existing runtime utility assertions passed.
- The options/content manifest load graph remains unchanged, with new Settings scripts loaded before `options.js` and background helpers loaded before registration.

**Not completed:** live extension startup in Chrome or Firefox; mobile Android wrapper compatibility; feature toggling/leak tests. This environment's Chromium blocked navigation to extension/file/local pages, so we cannot claim a live browser pass.

## Installation precautions

Treat this combined **v0.2.47 source migration** as experimental until live runtime checks pass. It already includes OOC Settings extraction and the other v0.2.47 changes; do not layer earlier modularization patches onto the combined release. Back up current settings and smoke-test Chrome and Firefox before publishing.

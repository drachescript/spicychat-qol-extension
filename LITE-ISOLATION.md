## Current Custom package boundary work

The checked-out source has 124 feature contracts. All 29 dedicated Settings-panel
scripts are now declared in those contracts, including the panels split during
recent feature Settings work. Nine additional single-feature stylesheets are
now owned and can be physically omitted from experimental Lite packages.

`tools/build-lite-package.py` removes declared owner modules, unused declared
helpers, Settings script tags and unique placeholder mounts. It also excludes
non-runtime development directories. `build/custom-package-index.json` is the
machine-readable asset and dependency map for a future website-side package
integration; the website is **not** updated by this source patch.
`build/update-custom-selection.py` can update recipes while preserving existing
per-feature auto-update decisions and leaving newly added features' update
setting OFF. It does not alter browser storage or install files.

There are still shared Settings controllers, styles, background event handlers
and content runtime helpers. Physical asset closure is not browser-functionality
certification. Generated Lite packages remain experimental; production-ready
Custom/Lite and automatic website updates are not claimed.

# Custom Lite feature isolation status (0.2.52 development)

The runtime feature inventory now tracks 121 independently named primary feature modules, including the newly separated Auto Images and Auto Voice. This **does not** certify 118 individually shippable Chrome/Firefox extensions.

A Custom Lite package must omit the unselected feature's source file, remove its manifest registration, and hide its Settings and Mini Panel entry without clearing saved user preferences. A feature's prerequisite modules and background services must also remain available. `tools/verify-lite-contracts.py --profile profile.json --package-root out/` checks primary-file inclusion/omission, known dependencies, required helpers and declared manifest paths. Its `--strict` mode refuses to certify unverified builds.

## Remaining release blockers

- Settings controllers and `options.html` still contain controls for many different features; they need true per-feature ownership or validated generic rendering that excludes omitted features.
- Shared CSS bundles still contain styles for multiple features; feature-owned styles must be separated or proven safe to retain.
- The service worker imports shared background modules/events; Custom builds need verified feature-specific service ownership and message handling.
- `content/main.js` and shared runtime scheduling still coordinate many feature calls. Removing modules must not leave timers, observers or unsafe calls.
- Feature-specific browser and interaction tests must run on supported browser combinations. The current audit is static and isolated JavaScript testing, **not** a full Brave/Chrome/Firefox end-to-end test.
- Custom Pictures' data normalization and menu shell are shared helpers; Backgrounds, Character Pictures, Persona Pictures and Picture Library now have separate runtime owners. Other shared Settings/CSS/background modules remain release blockers.

## Changes verified this batch

- `content/auto-images.js` is independent from `content/auto-voice.js`; either can load without the other.
- Auto-AFK, My Creations auto-load, and local tag aliases now have their own runtime build identifiers.
- The runtime module inventory maps each of 118 IDs to a unique primary file; missing files and known dependency errors fail the audit.
- Image controls in Custom Pictures, Mini Panel and Settings check the `auto-images` module rather than requiring Auto Voice.
- Existing per-chat auto-image preferences keep their original storage keys. The inline IMG shortcut remains OFF by default.

Until all blockers above are resolved, consider Custom Lite builds **experimental**. Do not mark the full dependency matrix as completed.

## Stage 9: physical Settings/CSS ownership

- Character Picture, Persona Picture, Automatic Images, and Background Settings now have independently owned scripts. In a generated Lite profile, omitted features do not insert these controls; a package should also omit their script tags and source files.
- RP format repair, Android toolbar, chat search, focus mode, and character QoL profile style sections have their own stylesheets, preserving CSS cascade ordering in Full.
- This is partial isolation only: Character/Persona/library runtime implementations still share `chat-backgrounds.js`, Settings read/save code remains shared, and several other CSS/background features are combined. Do not mark these features fully independently verified yet.

## Stage 10: Custom Pictures runtime owners

- `chat-picture-core.js` keeps existing `chatBackgroundMediaV1` storage normalization; no migration or deletion of images is required.
- `custom-pictures-menu.js` hosts the feature-aware menu; independent picture modules register their own tabs and behaviors.
- `chat-backgrounds.js`, `character-pictures.js`, `persona-pictures.js`, `picture-library.js` are independent feature owners with shared helpers. The Library now defaults OFF.
- Static manifest and generated-package checks can detect missing helpers and omitted owner files. Real-world Chrome/Brave interaction and wider shared background/Settings/CSS ownership are not yet certified.

## v0.2.53 Batch 2: experimental physical package builder

`tools/build-lite-package.py` can create a **test-only** package from an unpacked Full extension. Its profile is JSON with `features: [feature IDs]`. It refuses incomplete declared dependencies; use `--experimental` explicitly. It does not publish or change the source directory.

- Removes omitted registered feature primary modules and exclusive Settings/CSS/background ownership files; rewrites `manifest.json`, `options.html`, static background imports and Firefox `background.scripts` when present.
- Removes declared shared helpers when none of the selected features require them (picture cores and OOC composer). Keeps shared helpers needed by retained features.
- Generates a content and background build profile containing explicit feature IDs without modifying saved feature preferences.
- `tools/verify-lite-contracts.py` checks background primary ownership, real Firefox background-script order, and Options script targets in addition to earlier primary-module/Settings/CSS checks.
- `tools/test-lite-packaging.py` covers seven positive/negative cases with executable package inspections.

**Still experimental:** feature calls inside shared `content/main.js`, `options.js`, listeners and event routers are not all independently separated. The availability of individually owned source files does not certify browser functionality of arbitrary Lite combinations. Test your selection in Chrome/Brave/Firefox before distributing it. Full remains the supported release target.

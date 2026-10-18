# Custom Lite feature isolation status (0.2.52 development)

The runtime feature inventory tracks 118 independently named primary feature modules, including the newly separated Auto Images and Auto Voice. This **does not** certify 118 individually shippable Chrome/Firefox extensions.

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

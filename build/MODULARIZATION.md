# v0.2.44 modularization notes

This file is developer documentation, not the public changelog.

## Completed through Stage 1

- The Full service worker still uses `background-entry.js`, but helpers remain in `background.js` and its events/alarms now register from `background-events.js`. Both files must be installed and loaded in that order.
- Shared save, backup-download and list-write helpers moved from `content/core.js` to `content/core-storage-writers.js`, immediately after Core.
- `content/main.js` registers scheduler/diagnostics; `content/main-startup.js` starts the runtime after these scripts exist. It still short-circuits when the Full extension is disabled.
- Settings defaults and OOC templates moved to `options-settings-defaults.js`, loaded before `options.js`.
- Some feature styles moved to separate files, ordered in the Full manifest: explorer base, Memory Vault, folder covers, pagination.
- `build/modules.json` now declares these content files, the required Settings/background assets, and the new CSS ownership. Four scripts still shared between Listings and Profiles are explicitly identified.
- `python build/verify_runtime.py` checks Full source completeness and relative load ordering. It is an additional local check; it does not replace the existing build tool.

## Stage 2 additions

- Settings reading/accessibility controls now live in `options-reading-accessibility.js`; Settings sections, collapse state and shortcuts live in `options-section-navigation.js` rather than `options.js`.
- `options.html` loads those two scripts after Defaults and before `options.js`; `build/modules.json` registers them, and `build/verify_runtime.py` checks the relative order.
- The persona picker avoids repeated full persona scans while its list is unchanged; a native list change refreshes the picker immediately, and it still periodically rechecks an open list.
- The persona picker detects its dialog without parsing every persona solely for the open-state check.
- Public changelog version headings omit the `in progress` suffix.

## Stage 3 additions

- Tab Cleanup and Soundscapes Settings controllers now live in `options-tab-cleanup.js` and `options-soundscapes.js`, loaded before the shared `options.js`. Their data normalization remains available for imports, exports and storage checks in Full.
- DeepL and LibreTranslate background request helpers now live in `background-translation.js`, imported between background helpers and message listeners. Existing permission checks and requests are unchanged.
- Module registry/Full verifier now cover the new scripts and check that Settings and background asset declarations match their actual loading lists. These are not independently selectable Custom build features yet: common Settings and listeners still depend on Full code.

## Still needed before arbitrary Custom builds are safe

1. Split the remaining feature-specific parts of `content/core.js` and `content/main.js` into independently activated feature modules; only the shared code moved in this patch. Full still registers all scripts and CSS.
2. Continue splitting `options.js`: remove feature-specific settings controllers and render only available modules in Custom builds. Settings defaults, reading/accessibility, and section navigation are now separated, but most feature-specific controllers still live in `options.js`.
3. Continue splitting `background.js`: isolate individual worker/notification/network handlers with explicit feature dependencies and lifecycle checks, rather than just separating event registration.
4. Gradually move the remaining feature CSS from `content.css` into bundle-owned styles, including base/interface styling.
5. Teach the real build generator to select the new `runtimeAssets` and deduplicate `sharedBundleFiles`; profile-specific manifests, background scripts, options assets, web-accessible resources and permissions must all be generated and tested.
6. Test Full and multiple Custom profiles in Chrome/Firefox with Inspector. Passing static verification does not prove a Custom installation is runtime-complete.

Do not call a Custom build ready just because `build/modules.json` lists its files. Missing runtime dependencies must fail the build, not be ignored.

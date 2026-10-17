# QoL Custom: independently selectable features (v0.2.51)

All work here is **Custom-only**. Full QoL's `main` branch is untouched.

## Feature catalog

`scripts/export_custom_feature_catalog.py` exports actual `build/features/*.json` declarations into `build/feature-catalog.json` (112 contracts, including new Custom-only contracts for Rulebook Diagnostics, Story Reading Layout and Lorebook Connections). The Custom branch's `qol-custom-feature-catalog.yml` GitHub Action regenerates it after relevant source changes.

The website reads a **pinned Custom commit**, not arbitrary moving scripts, and verifies downloaded source files against Git object blob hashes. The catalog provides names, plain-language summaries, UI categories, feature dependencies, runtime scripts, styles and known validation blockers.

**UI categories are navigation, not installation units.** Blocking, Filtering, Organization, Chat, Creator, Lorebooks and other tools are independent selectors. The site saves IDs into `sqol-custom-feature-recipe/v1`. Old nine-group selections are imported as a set of underlying feature IDs.

The Chrome/Brave early-access package:
- Omits unselected feature-owned content scripts and includes declared dependency scripts/styles.
- Retains all shared, not-yet-owned runtime scripts for compatibility.
- Generates `content/build-profile.js` with the exact installed feature IDs, so the existing Full runtime feature gate can skip omitted tasks.
- Generates `background/feature-build-profile.js` with those same feature IDs, so explicitly gated background services can be skipped.
- Keeps shared Settings/background infrastructure until ownership and cleanup are genuinely independent.
- Preserves unpacked-folder permissions and rollback backups, plus existing v1 install folder markers.

## Deliberate limitations

**This is not a proven independent package for every feature.** Most contracts remain `customBuildStatus: blocked` and require Chrome/Brave testing. Shared background event handlers, Settings controllers, and a few common runtime scripts are retained. Some functionality can remain coupled, and missing listeners/side effects are possible.

Several *settings within a single feature script* remain grouped. For example, Quick Block and automated word/tag blocking currently share the `bot-blocking` feature contract/script, and need a deliberate Custom-side code split before they can honestly be packaged as separate switches. Do not create cosmetic switches that all ship the same code.

The `scripts/test_lite_features.cjs` website test exercises independent Blocking vs Filtering and other manifest/feature-gate combinations. Browser startup, navigation, and permission-backed folder updates still need human test feedback.

## Current request from Full QoL

**No Full QoL changes are required for this batch.** If later tests find a dependency that cannot be split safely on the Custom branch without a shared Full runtime refactor, document that specific blocker and ask before changing Full's `main`.

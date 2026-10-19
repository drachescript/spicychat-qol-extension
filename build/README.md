# QoL build and verification

The source of truth for the Full extension is `manifest.json`. `build/modules.json` maps runtime content files to bundles, declares background/Settings assets, and preserves stylesheet ownership. `build/features/*.json` describes feature capabilities and dependencies. Keep all three aligned when adding, moving, or removing runtime code.

## Full builds

```sh
python3 scripts/build_extension.py --profile full --verify-only
python3 build/verify_runtime.py
node build/test_runtime_helpers.js
python3 scripts/build_extension.py --profile full
```

To validate generated browser archives, run `python3 scripts/verify_release_packages.py` with the Chrome and Firefox ZIP paths. The release workflows perform packaging and version/changelog checks. `CHANGELOG.md` is a required runtime asset because the Options page reads it.

## Modular and Custom work

The Full extension is the canonical implementation. Do not remove a runtime file, Settings controller, background service, permission, or stylesheet simply because a feature appears optional: its callers and cleanup dependencies must be checked first.

`build/profiles/full.json` is the packageable Full profile. `build/profiles/recommended-lite.json` is a conservative planning profile. `build/plan_custom.py` reports dependency closure but does not claim arbitrary combinations are installable. The independent Core + OOC test recipe is `scripts/build_minimal_ooc.py`; it should not be mistaken for proof that every Custom combination works.

Additional reusable regression checks are in `build/test_*.js`. Historical migration comparisons, old browser snapshots and dated development notes are preserved in the `archive/qol-legacy-reference` branch, rather than in the working `main` tree.

Do not put generated ZIPs, extracted distribution folders, logs, or local diagnostic exports in source control.

## Repository hygiene

Keep reusable build scripts and tests named for their purpose, not for a release, chat, batch or development session. Do not add temporary patch assemblers, dated handoff notes, snapshots or one-off status files to the working source tree. Keep runtime asset names (including size-specific icons) unchanged when referenced by the browser manifest.


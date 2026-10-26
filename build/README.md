# QoL build and verification

The source of truth for the Full extension is `manifest.json`. `build/modules.json` maps runtime content files to bundles, declares background/Settings assets, and preserves stylesheet ownership. `build/features/*.json` describes feature capabilities and dependencies. Keep all three aligned when adding, moving, or removing runtime code.

## Full builds

```sh
python3 scripts/build_extension.py --profile full --verify-only
python3 build/verify_runtime.py
python3 scripts/build_extension.py --profile full
```

To validate generated browser archives, run `python3 scripts/verify_release_packages.py` with the Chrome and Firefox ZIP paths. The release workflows perform packaging and version/changelog checks. `CHANGELOG.md` is a required runtime asset because the Options page reads it.

## Modular and Custom work

The Full extension is the canonical implementation. Do not remove a runtime file, Settings controller, background service, permission, or stylesheet simply because a feature appears optional: its callers and cleanup dependencies must be checked first.

`build/profiles/full.json` is the packageable Full profile. `build/profiles/recommended-lite.json` is a conservative planning profile. `build/plan_custom.py` reports dependency closure but does not claim arbitrary combinations are installable. The independent Core + OOC test recipe is `scripts/build_minimal_ooc.py`; it should not be mistaken for proof that every Custom combination works.

Development-only test scripts have been removed from the extension source tree. Use the static runtime/build verifiers and package checks below for release validation; browser behavior still requires manual testing. Historical migrations and earlier development experiments remain in the legacy reference branch.

Do not put generated ZIPs, extracted distribution folders, logs, or local diagnostic exports in source control.

### Feature-owned resource planning

`python3 build/plan_custom.py --features model-quick-access,chat-lorebook-manager` previews dependency closure using each feature's current `dependencies`, `settingsFiles`, `styleFiles`, and `backgroundFiles` declarations. It is **not** an installable package recipe and leaves all unverified isolation flags false.

`python3 build/verify_runtime.py` checks the Full module registry and asset references. The Full manifest remains the authoritative CSS cascade order. Dedicated styles now have one declared feature owner, while shared styles and all unverified cross-feature selectors remain installed in Full.

`build/prune-feature-background.py` can remove only the audited Translation and Wiki Fetch message-only services from a **disposable staged source directory**. It must never run on the canonical Full checkout. Shared alarm handlers, tab listeners, and Auto-AFK stay installed, so this does not certify an arbitrary Custom build. Check the output of the build and the runtime verifier before packaging.

Feature-owned Settings readers **and loaders** now cover 15 optional panels (60 controls). They register only when the panel is included, and their old shared read/load cases have been removed. Keep ownership declarations validated through the build process. Storage migrations, large-data controllers, and other legacy Settings handlers remain shared and require further work.

Three more independent stylesheet sections now live under `content/styles/`, owned by Wiki Lorebook Importer, Story Day Tracker, and RP State Tracker. Keep stylesheet ownership declarations aligned with the module registry.

Five optional periodic alarm actions now register with their respective background feature modules rather than being embedded in the shared alarm listener. The shared listener still exists for chat importing and other non-separated behavior. Keep background dispatch registrations aligned with the module registry. **Neither these changes nor the successful Full builds certify arbitrary Lite combinations.**

## Repository hygiene

Keep reusable build scripts named for their purpose, not for a release, chat, batch or development session. Do not check development-only test scripts into the extension source tree. Do not add temporary patch assemblers, dated handoff notes, snapshots or one-off status files to the working source tree. Keep runtime asset names (including size-specific icons) unchanged when referenced by the browser manifest.


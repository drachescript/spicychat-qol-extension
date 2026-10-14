# QoL build profiles

- `build/modules.json` declares the runtime bundle ownership map.
- `build/verify_runtime.py` verifies Full static load order and file declarations. Run `python build/verify_runtime.py` after any module or manifest change.
- `build/profiles/full.json` is the only buildable profile today.
- `build/profiles/recommended-lite.json` remains a **draft**, not a safe, user-installable custom build.
- `scripts/build_extension.py --profile full` builds Chrome and Firefox using the current Full source. `--list-profiles` lists draft recipes.
- See `build/MODULARIZATION.md` for the extracted background services, ordered CSS ownership, static test results, and remaining Custom-build blockers.

For future Custom recipes, omit feature files **only after** background event handlers, Settings controllers, CSS, assets, and runtime scheduler dependencies are truly optional. Do not turn draft recipes into buildable profiles simply to produce smaller ZIPs.

## v0.2.47 preview planning (not installable)

`python build/plan_custom.py --bundles chat` expands selected bundles to a closed dependency set and calculates script, stylesheet and background-service omissions. The result includes `installable: false` and an explicit blocker list. No extension ZIP is generated from arbitrary combinations yet. Do not distribute a plan as a working build.

Generated profiles can use `settings/options-feature-availability.js` to hide known unavailable setting controls while preserving local values. Full loads every bundle and leaves the Settings page unchanged. Rulebook filters and export snapshots are optional and off by default.

## Full-first feature contracts and lifecycle migration

The regular Full extension is the modular product. It loads the same feature modules that
Custom will later select, and its per-feature disable controls must eventually terminate
feature work rather than only hide its UI. Custom is a packaging and configuration layer,
not a separate implementation.

Feature contracts live in `build/features/*.json`. Preview one with
`python build/plan_custom.py --features ooc`; the planner refuses to claim installability
while the listed Full-runtime dependencies remain shared.

Run `python build/test_v48_ooc_contract.py --base PATH_TO_V47_SOURCE` alongside the
Full verifier when working on OOC modularization.

## Next bulk migration (v0.2.48 experimental)

- `content/feature-build-map.js` defines feature-level runtime gates for 109 feature contracts (including background-only Bot Status). `content/feature-lifecycle.js` preserves Full's ordered cleanup and tracks feature transitions; the 70 original cleanup actions remain in their previous order.
- `settings/options-feature-availability.js` hides known omitted per-feature Settings controls without changing persisted preferences.
- The static background recipe and ownership map in `background/feature-build-profile.js` and `background/feature-message-ownership.js` prevent messages and alarms invoking unavailable feature handlers in a generated recipe. Full has no exclusions.
- Run `node build/test_feature_lifecycle.js`, `node build/test_bulk_build_gates.js`, `node build/test_bulk_settings_gates.js`, `node build/test_bulk_ooc_cleanup.js`, `node build/test_listing_discovery.js`, and `python build/verify_runtime.py` to validate these boundaries and the local-only listing discovery pipeline.
- These are safe *gates*, not proof of fully independent initialization/shutdown inside every legacy feature. Core + OOC and other arbitrary Custom packages remain blocked until the shared `main.js` scheduler, Options event bindings, background helper dependencies, and generated package startup have passed real browser validation.

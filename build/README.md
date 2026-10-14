# QoL build profiles

- `build/modules.json` declares the runtime bundle ownership map.
- `build/verify_runtime.py` verifies Full static load order and file declarations. Run `python build/verify_runtime.py` after any module or manifest change.
- `build/profiles/full.json` is the only buildable profile today.
- `build/profiles/recommended-lite.json` remains a **draft**, not a safe, user-installable custom build.
- `scripts/build_extension.py --profile full` builds Chrome and Firefox using the current Full source. `--list-profiles` lists draft recipes.
- See `build/MODULARIZATION.md` for the extracted background services, ordered CSS ownership, static test results, and remaining Custom-build blockers.

For future Custom recipes, omit feature files **only after** background event handlers, Settings controllers, CSS, assets, and runtime scheduler dependencies are truly optional. Do not turn draft recipes into buildable profiles simply to produce smaller ZIPs.

## v0.2.47 Full-first modularization and Custom planning (not yet installable)

`python build/plan_custom.py --bundles chat` expands selected bundles to a closed dependency set and calculates script, stylesheet and background-service omissions. The result includes `installable: false` and an explicit blocker list. No extension ZIP is generated from arbitrary combinations yet. Do not distribute a plan as a working build.

Generated profiles can use `settings/options-feature-availability.js` to hide known unavailable setting controls while preserving local values. Full loads every bundle and leaves the Settings page unchanged. Rulebook filters and export snapshots are optional and off by default.

## Feature-level contracts for the combined v0.2.47 migration

The regular Full extension is the modular product. It loads the same feature modules that
Custom will later select, and its per-feature disable controls must eventually terminate
feature work rather than only hide its UI. Custom is a packaging and configuration layer,
not a separate implementation.

Feature contracts live in `build/features/*.json`. Preview one with
`python build/plan_custom.py --features ooc`; the planner refuses to claim installability
while the listed Full-runtime dependencies remain shared.

Run `python build/verify_runtime.py` and `node build/test_v47_runtime.js` for the current Full source. The bulk parity audit (`build/test_v48_bulk_parity.js`) can also be run when the pre-migration baseline is available; that filename is retained as a historical test identifier, not a separate release.

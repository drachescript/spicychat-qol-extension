# QoL build profiles

- `build/modules.json` declares the runtime bundle ownership map.
- `build/verify_runtime.py` verifies Full static load order and file declarations. Run `python build/verify_runtime.py` after any module or manifest change.
- `build/profiles/full.json` is the only buildable profile today.
- `build/profiles/recommended-lite.json` remains a **draft**, not a safe, user-installable custom build.
- `scripts/build_extension.py --profile full` builds Chrome and Firefox using the current Full source. `--list-profiles` lists draft recipes.
- See `build/MODULARIZATION.md` for the extracted background services, ordered CSS ownership, static test results, and remaining Custom-build blockers.

For future Custom recipes, omit feature files **only after** background event handlers, Settings controllers, CSS, assets, and runtime scheduler dependencies are truly optional. Do not turn draft recipes into buildable profiles simply to produce smaller ZIPs.

# QoL Custom — v0.2.48 development baseline

**Experimental feature recipes only. The public Full QoL release is unchanged.**

This branch starts from the v0.2.48 `main` source, rather than merging the prior v0.2.47 branch and potentially reverting newer runtime files.

## Changes on main that affect Custom

- `content/feature-lifecycle.js` owns feature activation/cleanup coordination. The new OOC cleanup is now lifecycle-gated inside Full.
- `content/feature-build-map.js` matches runtime scheduler tasks to feature contract IDs and supports generated profiles.
- `background/feature-build-profile.js` and `background/feature-message-ownership.js` support denying feature-owned messages in a **verified** generated profile, without changing Full behavior.
- `settings/options-feature-availability.js` hides explicitly excluded feature settings without clearing their saved values.
- `build/features/ooc.json` still declares `customBuildStatus: blocked`. Lifecycle cleanup does **not** establish that OOC can run without the shared Chat composer code, Settings markup, CSS, background plumbing or permissions.

## Feature recipes

```sh
python build/custom_recipes.py --recipe build/custom-recipes/ooc-example.json

# Keep current choices and add another declared feature
python build/custom_recipes.py --recipe build/custom-recipes/ooc-example.json --add chat-search --save my-custom.json

# Modify selections later without clearing per-feature update preferences
python build/custom_recipes.py --recipe my-custom.json --remove chat-search --save my-custom.json

# Test recipe behavior
python -m unittest discover -s build -p 'test_custom_recipes.py' -v
```

The recipe uses individual `build/features/*.json` contract IDs, not broad bundles.
The preview includes `featureReadiness` with Full lifecycle and Custom packaging status, together with blockers from the contracts. Both the top-level preview and underlying plan remain `installable: false`, regardless of future planner behavior.

Saved `updates.default` and `updates.overrides` are configuration intent for a **future** website updater. They do not currently update modules or install any executable code.

## Next milestone before the first Chrome/Brave test build

1. In Full QoL, extract the remaining OOC Chat UI composer shortcut and associated CSS/Settings markup from shared assets. Ensure start/stop remains idempotent, even during SPA navigation and per-tab disable.
2. Validate the smallest Core+OOC package closure, including dynamic scripts, DOM injection groups, Settings, background imports/listeners, CSS and permissions; fail closed on missing dependencies.
3. Preserve Full parity and compare browser behavior and performance against a clean Full instance with Inspector.
4. Once a verified minimal package works, begin the website's user-approved unpacked-folder updater, including backout/restore and an extension reload handshake.

**Do not use this branch's recipe preview as an installable ZIP.** Source separation, tests, feature-aware guards and a smaller manifest are useful foundations, not sufficient proof of a working Custom build.

Historical branches `qol-custom-v0.2.47` and earlier remain intact.

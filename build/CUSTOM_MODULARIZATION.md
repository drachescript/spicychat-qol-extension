# QoL Custom — permanent development branch

**Current Full baseline: v0.2.49.** Full QoL is the canonical runtime on `main`; all experimental Custom work stays on `qol-custom`. Do not create a new branch for each release.

## v0.2.49 — first minimal Core + OOC package smoke test

The source already includes a fixed Core + OOC test recipe at `scripts/build_minimal_ooc.py`. It packages Full's OOC insertion/composer scripts, the small Core adapter, OOC styles, and the dedicated test Settings page. It intentionally excludes the normal Full main scheduler, broad Settings, background worker and unrelated features.

The Custom branch now:
- Merges Full v0.2.49 with saved feature recipes preserved.
- Registers three new scripts and two stylesheets introduced in Full v0.2.49 in `build/modules.json`.
- Fixes OOC shared dependency references to real paths, and recognizes `experimental-test-only` as a blocked-for-release readiness level in `build/verify_runtime.py`.
- Updates stale Full lifecycle/feature count expectations to cover new Rulebook diagnostics and three new feature IDs.
- Adds `build/test_minimal_ooc.py` to check package contents, manifest privileges, Full-source equivalence of OOC code, and Settings file closure.
- Runs `.github/workflows/qol-custom-ooc-smoke.yml` on pushes to this branch to build a test ZIP.

**GitHub Actions proof:** [successful Core + OOC smoke run](https://github.com/drachescript/spicychat-qol-extension/actions/runs/38712490305), which publishes the `qol-custom-core-ooc-test` artifact. This is **static/offline validation**, not live browser validation.

## Test the first build in Chrome/Brave

1. Open the successful Actions run above and download the `qol-custom-core-ooc-test` artifact (GitHub sign-in may be required).
2. Unzip the artifact to get `qol-custom-core-ooc-test.zip`. Extract that package into a stable local directory.
3. Use a **clean Chrome or Brave profile**. Open `chrome://extensions`, enable Developer Mode and choose **Load unpacked** on the extracted package directory.
4. Open SpicyChat in that profile and check the OOC floating panel, presets, composer button, Image-button option, route changes, settings persistence, disable/enable, and page reload behavior.
5. Inspect extension/page console errors, repeated observers or timers, and behavior when switching between chats.
6. Do not run Full and Core+OOC against the same SpicyChat profile during this test. Their storage is isolated because they have different extension IDs.

This fixed OOC recipe is not yet an arbitrary module builder, and it has not passed live Chrome/Brave validation. It is **not a public Custom release**.

## Stored Custom feature recipes

```sh
python build/custom_recipes.py --recipe build/custom-recipes/ooc-example.json
python build/custom_recipes.py --recipe build/custom-recipes/ooc-example.json --add chat-search --save my-custom.json
python -m unittest discover -s build -p 'test_custom_recipes.py' -v
```

Feature recipes preserve selected features and future update preferences, resolve dependency requirements, report readiness blockers, and always mark arbitrary Custom builds `installable: false`. They do not yet update installed extensions.

## Next milestones

After the Core+OOC test passes live in a browser, prove adding/removing a second small feature while preserving Settings and data. Then implement the website's explicitly user-authorized write-to-unpacked-folder updater with build verification, backup, rollback and extension reload.

Keep `main` untouched by experimental changes, and keep using this one `qol-custom` branch for future releases.

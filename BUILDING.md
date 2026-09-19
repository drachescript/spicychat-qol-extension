# Building / validating SpicyChat QoL

The common Chrome/Chromium extension source does not require a compilation step. The repository root is the shared extension source.

## Local Chrome/Chromium test

1. Clone/download the repository.
2. Open `chrome://extensions/`.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the repository root.
5. Open SpicyChat and test the changed workflow.

## Validation before packaging

Recommended checks from the repository root:

```sh
find . -name '*.js' -not -path './dev_build/*' -not -path './release_build/*' -print0 | xargs -0 -n1 node --check
```

Also verify:

- every file referenced by `manifest.json` exists;
- Settings and Popup IDs are unique;
- no merge markers are present;
- no local diagnostics, saved SpicyChat HTML, API keys, webhook URLs, account/session data, or generated build folders are included;
- `manifest.json`, `CHANGELOG.md`, `README.md`, and release notes agree on the release version;
- `PRIVACY.md` and `PERMISSIONS.md` still match the current permissions/data flows;
- the extension loads without manifest errors.

## Release builders

The maintained Windows release builders live in `dev_build/`:

- `build_spicychat_qol.bat` — Chrome/Chromium release package.
- `build_spicychat_qol_firefox.bat` — Firefox/AMO release package.

Both read the version/name from the root `manifest.json`, refuse to package a manifest still named `DEV`, stage into `release_build/`, verify manifest references, and create a versioned ZIP.

The Firefox builder converts the shared manifest to the Firefox background-script form, adds the stable Gecko ID/minimum version/data-collection declaration, and applies the project AMO compatibility checks.

`build_spicychat_qol_dev.bat` remains an intentional local/test builder for the separate DEV listing. `build_spicychat_qol_android.bat` belongs to the Android sync/build workflow and is not part of the browser-store package.

## Generated/local files

The following are development helpers or generated files and should not be committed or included in release ZIPs:

- `release_build/`
- generated `dev_build/spicychat-qol-*` staging folders / ZIPs / APKs
- `manifest.before-dragon-reload.json`
- `dragon-dev-reload.config.json`
- `dragon-dev-reload.js`
- `dragon-dev-worker.js`
- `dragon-dev-server.js`
- local diagnostics/saved HTML/logs
- `*.bak`

The root `.gitignore` covers these.

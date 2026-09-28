# SpicyChat QoL Android changelog

## Current status

- Current public Android release: **v0.1.7** (`0.1.7+79`).
- The Android app can update the shared SpicyChat QoL files separately from the APK.
- Shared QoL updates are checked automatically about every **12 hours** and can also be checked manually from **Android Settings → QoL updates**.
- Android APK updates are checked separately about every **12 hours** and can also be checked manually from **Android Settings → Android app updates**.
- The shared QoL updater follows `drachescript/spicychat-qol-extension/main`; Android-only bridge code stays inside the APK.
- **Multiple Android Chat Tabs** remains experimental, opt-in, and disabled by default.

## Next Android release

- Cleaned up the Android cog and send-button area to stop the dark/rectangular blocks that could appear around the controls.
- The Android cog now stays with the real SpicyChat header controls instead of behaving like a separate page overlay whenever a safe header row is available.
- Removed the old extra floating **Copy** button while keeping native Android text selection and clipboard support.
- Kept Android message long-press actions such as Copy, Edit, Report, Resend, Remove Image, and Select text.
- Shared QoL now handles the mobile message-edit box correctly: the editor can grow when text is added and shrink again when text is removed instead of getting larger on every edit.
- Shared mobile composer/edit fixes stay in the extension so Android does not need a second competing layout implementation.

## v0.1.7

- Continued cleanup of the native Android cog and mobile control placement.
- Improved Android-specific long-press and clipboard behavior.
- Added automatic website update-manifest synchronization after a successful Android release.
- Released as `0.1.7+79`.

## v0.1.6

- Improved Android Options startup so one incompatible Options helper cannot leave the page stuck on **Version loading…**.
- Improved the shared QoL bundle loader and updater.
- Added support for rebuilding the same visible Android version as a hotfix while increasing the internal Android `versionCode`.
- Same-version hotfix releases keep the normal APK filename for the newest build and can keep the previous APK as `_old`.
- Updated the release helper so future version bumps continue from the newest published Android `versionCode`, including same-version hotfix builds.
- Continued cleanup of Android clipboard and cog behavior.
- Released as `0.1.6+78`.

## v0.1.5

- Added the real **shared QoL updater** for Android.
- Android can now download newer extension runtime files, CSS, Options files, and support files without requiring a new APK for normal QoL changes.
- Added **QoL updates** to Android Settings with automatic 12-hour checks and a manual **Check QoL updates now** button.
- Added separate **Android app updates** with automatic checks and a manual **Check for updates now** button.
- Improved Android Options loading so current extension Options dependencies can be used inside the app.
- Improved extension-to-Android synchronization and stopped the sync process from overwriting Android-only bundle-loader behavior.
- Continued compatibility updates for current shared QoL features.

## v0.1.4

- Large WebView reliability pass.
- Improved Android page recovery, route handling, and native/WebView communication.
- Continued work on the Android cog, Focus Mode, clipboard handling, and mobile interaction fixes.
- Reduced unnecessary Android-side work around page navigation and long chats.

## v0.1.3

- Improved Android update detection and release metadata handling.
- Improved WebView navigation/recovery behavior.
- Improved Android build/update synchronization.
- Continued native bridge fixes for current QoL features.

## v0.1.2

- Added native Android APK update checking.
- Added an Android Settings update section showing the installed version, last check, and update status.
- Added manual update checks that bypass the normal automatic-check timer.
- Added native app-version information from Android through the Flutter bridge.
- Improved Android startup/update handling.

## v0.1.1

- Improved the GitHub Actions Android release workflow.
- Added the newer local **release_next_android** helper.
- Continued Android diagnostics/runtime compatibility and WebView fixes.
- Synced newer shared QoL changes into the packaged fallback.

## v0.1.0

- First public Android APK release.
- Signed release APK with checksum and update metadata.
- Persistent SpicyChat login/session inside the app.
- Embedded SpicyChat QoL runtime with Android-specific native bridges.
- Native file saving/import support for QoL exports and backups.
- Android diagnostics, recovery, storage compatibility, long-press actions, media support, configurable controls, and experimental chat tabs were established around the initial public release.

## Android features

### Updates

- **QoL updates** and **APK updates** are separate.
- Normal shared QoL changes can be downloaded by the app without reinstalling the APK.
- Native Android/Flutter changes still require a new APK.
- Both update channels check automatically about every 12 hours.
- Manual checks are available in Android Settings.
- Newly downloaded QoL files are used on the next full SpicyChat page load or app restart so an active chat is not force-reloaded.

### Android Settings & controls

- Configurable default launch page.
- Optional pinch-to-zoom.
- Configurable native QoL cog position.
- Native Android quick menu.
- **Focus / Immersive Mode** from the Android quick menu while in a chat.
- Single-instance protection for Android Options and the native quick menu so repeated taps do not stack screens.

### Diagnostics & reliability

- Android Options can communicate with the live SpicyChat WebView for diagnostics/runtime data.
- Renderer, stalled-load, blank/black-page, route, and visual recovery checks.
- Reduced background health-check work compared with older builds.
- Protection against injecting the full QoL runtime more than once into the same real page.
- Android environment/capability information is exposed to shared QoL so browser-only features can stay disabled when needed.

### Storage, backup & files

- Android-compatible `chrome.storage.local` bridge.
- Support for larger QoL storage values outside basic SharedPreferences.
- Native Save As support for generated files and exports.
- Blob/data-URL download handling for browser-style QoL exports.
- Native Android file picker support for compatible imports.
- Backup/import safeguards and rollback protection.

### Chat interaction

- Android-only long-press message menu.
- Supported actions can include Copy, Edit, Report, Resend, Remove Image, and Select text.
- Native clipboard handling for reliable Copy.
- Temporary native text-selection mode.
- Shared QoL owns normal mobile composer and message-edit layout fixes.

### Multiple Android Chat Tabs

- Experimental and **disabled by default**.
- Uses one active WebView instead of keeping a full WebView alive for every tab.
- Inactive tabs store lightweight state such as URL, title, scroll position, and last-used time.
- Supports separate conversations with the same chatbot.
- Supports switching, closing tabs, restoring tabs after restart, and local scroll restoration.
- Disabling the feature clears Android tab state and returns to normal single-WebView navigation without affecting SpicyChat conversations.

## Release workflow

- `release_next_android.bat` / `release_next_android.ps1` prepares the **next visible Android version** by updating `android_app/pubspec.yaml`.
- The helper does **not** commit, tag, push, or publish anything locally.
- Changes are reviewed, committed, and pushed normally through GitHub Desktop.
- GitHub Actions builds and publishes the signed APK.
- For a same-visible-version hotfix, a commit beginning with the current version (for example `v0.1.7 ...`) can rebuild that visible release with a newer internal `versionCode`.
- The previous APK can be rotated to `_old` while the normal APK filename always points to the newest build.
- Successful Android releases trigger the website Android manifest/update metadata sync.

## Current testing

- Mobile cog/header placement and removal of the remaining dark control backgrounds.
- Mobile send-button wrapper appearance.
- Message editing with the Android keyboard open, including growing and shrinking long edits.
- Android diagnostics/performance reporting in long chats.
- Black-page and renderer recovery.
- Native file saving/importing and large local backup data.
- Experimental Multiple Android Chat Tabs behavior and long-chat performance.

## Planned

- Add stronger compatibility checks between downloaded QoL bundles and the installed Android bridge.
- Add a clearer last-known-good QoL bundle rollback path if a downloaded runtime ever fails.
- Continue reducing Android-only layout overrides now that more mobile behavior is handled by shared QoL.
- Better chat-tab restoration, including message-anchor/draft improvements where practical.
- Continue long-chat performance work and Android/WebView reliability improvements.
- Continue backup/import/export and local-data recovery improvements.

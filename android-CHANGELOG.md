## 0.1.46
- Added a confirmation before clearing the Android App Log, enabled by default.
- Added a setting to turn the Clear App Log confirmation on or off without affecting other app data.
- Added individual visibility switches for 14 shortcuts in the Android cog-wheel menu.
- Kept Android Settings, QoL Options and Recover Black Screen accessible even when the optional shortcuts are hidden.
- Added Show all cog shortcuts to restore the normal menu without resetting other settings.
- Gave the two chat-scrolling checks separate Quick and Detailed labels.
- Saved cog-menu preferences locally on Android without changing desktop QoL settings.
- Added the updated Android app privacy policy.

## 0.1.45
- Added compatibility for the new on-demand features introduced in shared QoL 0.2.86 and 0.2.87.
- Expanded support for optional chat, Persona, Lorebook, editor, filtering and Rulebook tools without loading every feature at startup.
- Added Android-native Archive Blocking Presets with a cached catalog, six-hour refresh interval and an offline fallback.
- Updated the Android runtime-message bridge to handle both Promise-based and callback-based requests.
- Added stricter checks for downloaded QoL modules before activating an update.
- Rechecked already-downloaded QoL bundles after an Android app update to catch incompatible module changes.
- Improved Chat Nudges compatibility without depending on its desktop background-sync handler.
- Kept desktop-only Bulk Research Export helpers and Archive Community Themes background lookups disabled where Android lacks the required browser worker.
- Limited simultaneous optional-module requests to help keep the WebView responsive.
- Updated extension-to-Android build checks to use the same optional-module policy as the app updater.

## 0.1.44
- Reduced unnecessary WebView health and layout checks after short app switches when the page is healthy.
- Improved startup by reading QoL JavaScript and stylesheets in small concurrent batches while preserving their injection order.
- Reduced repeated tab-state writes and limited temporary scroll-position history.
- Reduced duplicate page-load, title-refresh and diagnostic work.
- Batched routine App Log writes while keeping error and recovery information available.
- Changed Android APK releases to wait for successful validation of the exact commit being published.
- Added checks that stop an Android build if the shared QoL optional-loader contract changes unexpectedly.
- Preserved existing chat drafts, tab state and manual renderer recovery rather than automatically discarding or reloading pages.

## 0.1.43
- Added an Android bridge for QoL features that load only when their page and settings need them.
- Added a reviewed allowlist for optional JavaScript modules instead of allowing arbitrary files to run.
- Checked the active WebView, trusted page URL and document token before loading a module.
- Added a second document check before evaluating an optional module to avoid injecting into a reloaded page.
- Adjusted desktop dynamic imports to work through Android's native WebView bridge.
- Kept unsupported desktop background-worker features separate from Android-compatible tools.
- Preserved manual recovery after renderer loss so the app does not silently recreate a chat with an unfinished draft.

## 0.1.42
- Improved WebView and shared QoL bundle integration.
- Improved Android-specific compatibility handling around the Options screen and page recovery.
- Added an Android toolchain-check helper for local builds.
- Improved release and validation workflow checks.

## 0.1.41
- Improved Android message long-press actions and their interaction with the native WebView.
- Updated Android Settings and native controls for newer mobile layouts.
- Continued chat interaction and recovery improvements without changing saved conversations.

## 0.1.40
- Updated the in-page JavaScript bridge for newer shared QoL behavior.
- Updated the Android Options bridge to match those runtime changes.

## 0.1.39
- Improved the Android Options bridge and its communication with the active chat WebView.
- Refined WebView integration and compatibility with shared QoL.

## 0.1.38
- Expanded the Android JavaScript bundle loader for newer shared QoL functionality.
- Continued separating Android-specific behavior from normal extension updates.

## 0.1.33–0.1.37
- Improved native Android file handling, including verified save and export behavior.
- Improved communication between the Android Options screen and the live SpicyChat page.
- Updated WebView recovery, diagnostics and runtime compatibility handling.
- Continued support for newer shared QoL files without requiring a separate implementation of each browser feature.

## 0.1.28–0.1.32
- Improved Android App Log storage, diagnostics and support exports.
- Improved native file saving and the Android-to-JavaScript bridge.
- Updated the Android Options screen and its support for shared QoL tools.
- Improved reliability when navigating between chats and handling WebView events.

## 0.1.8–0.1.27
- Continued Android WebView reliability, navigation and chat interaction improvements.
- Expanded the native bridge for shared QoL storage, files, imports and exports.
- Improved Android Options compatibility as the desktop extension added new features.
- Improved app diagnostics, support information and recovery behavior.
- Continued updates to native controls, long-press actions and mobile layout compatibility.

## 0.1.7
- Continued cleanup of the native Android cog and mobile control placement.
- Improved Android-specific message long-press and clipboard behavior.
- Added automatic website update-manifest synchronization after successful Android APK releases.

## 0.1.6
- Fixed Android Options becoming stuck on Version loading when an incompatible helper could not initialize.
- Improved the shared QoL bundle loader and updater.
- Added same-visible-version APK hotfix builds with a higher internal Android version code.
- Kept the normal APK filename for a new hotfix and allowed the previous build to be retained as an `_old` file.
- Updated the local release helper to continue from the newest published version code.
- Continued Android clipboard and cog improvements.

## 0.1.5
- Added the shared QoL updater so compatible extension changes can be installed without replacing the Android APK.
- Added automatic 12-hour checks and a manual Check QoL updates now action.
- Added separate Android APK update checks and a manual Check for updates now action.
- Improved Android Options loading for newer extension files and dependencies.
- Improved extension-to-Android asset synchronization without overwriting Android-only loader behavior.

## 0.1.4
- Improved WebView reliability, navigation and page recovery.
- Improved communication between the native Android controls and the SpicyChat page.
- Continued work on the cog, Focus Mode, clipboard support and mobile interactions.
- Reduced unnecessary Android-side work while browsing long chats.

## 0.1.3
- Improved Android update detection and release metadata handling.
- Improved WebView navigation and recovery.
- Improved Android build synchronization and native bridge compatibility.

## 0.1.2
- Added native Android APK update checking.
- Added installed-version, last-check and update-status information to Android Settings.
- Added manual update checks that bypass the automatic-check timer.
- Exposed native Android app-version details through the Flutter bridge.
- Improved startup and update handling.

## 0.1.1
- Improved the GitHub Actions Android release workflow.
- Added the local release_next_android helper for preparing new versions.
- Improved Android diagnostics and compatibility with the shared QoL runtime.
- Updated the packaged QoL fallback files.

## 0.1.0
- Released the first public SpicyChat QoL Android APK.
- Added a signed APK, checksum and update metadata.
- Added a persistent SpicyChat WebView with login and session support.
- Included the shared QoL runtime with Android-specific native bridges.
- Added Android-compatible file saving, imports, exports and backups.
- Added native quick controls, message long-press actions and clipboard support.
- Added diagnostics, page recovery, storage compatibility and mobile media controls.
- Added experimental lightweight Android chat tabs, disabled by default.

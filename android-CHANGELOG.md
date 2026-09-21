# SpicyChat QoL Android changelog

## Recent

### QoL 0.2.1 / mobile compatibility follow-up
- Added a process-wide single-instance gate for **Android Options** so repeated taps during a lag/stall cannot stack multiple Options routes. Delayed duplicate open requests are ignored until the existing Options screen closes.
- Added a matching single-instance guard for the native Android QoL quick menu so repeated top-bar/gear taps cannot stack multiple bottom sheets either.
- Added **Focus / Immersive Mode** directly to the native Android QoL quick menu while on an individual chat, using the existing shared QoL Focus Mode state instead of creating a second Android-only implementation.
- Kept the mobile generation/model picker owned by the shared QoL runtime. The current extension-side compact/WebView fix leaves SpicyChat's native model rows intact and only uses the native generation/Sparkles entry point, avoiding the mobile picker collapsing to only Available Models / Explore All Models / Generation Settings.
- Kept the newer Persona Manager / JumJam-inspired in-chat persona picker shared with the extension (All / Favorites / Unsorted / folders and Persona Manager ordering) so Android receives it through normal extension synchronization and the existing Android storage bridge.
- Android release builds continue to sync the current extension `main` before packaging the embedded fallback, so shared QoL fixes do not need separate Flutter copies.

### Android release helper
- Added a one-command next-release helper: it increments Android `versionName` using the public `0.1.0` → `0.1.1` scheme, increments `versionCode`, stages the current Android changes together with the version bump, creates one release commit and matching `v<version>` tag, then pushes both.
- A normal manual Git commit still performs validation only; the APK build/release is triggered by the version tag created by the release helper.

### Android diagnostics, performance & runtime bridge
- Fixed Android Options diagnostics and performance reports being unable to reach the live SpicyChat WebView.
- Added Android content-runtime message dispatch so extension listeners such as `DS_GET_PAGE_DIAGNOSTICS` can respond inside the dedicated WebView.
- Added a safe synthetic active-tab bridge for the Android Options page so support reports can identify the current SpicyChat URL/title and query its live runtime without pretending the APK has normal browser tabs.
- Added Android `chrome.runtime.getPlatformInfo()` compatibility and explicit Android/WebView capability metadata for diagnostics and environment detection.
- Kept browser-tab automation intentionally unsupported: the synthetic tab exists only for Options/runtime communication, while browser-only tab/session controls remain disabled in the APK.
- Diagnostics can now include the live QoL scheduler/cache/mutation/long-task counters when the current extension runtime exposes them, instead of reporting the page as unknown with runtime data unavailable.
- Kept the existing low-overhead Android renderer, black-page, route and visual diagnostics alongside QoL's extension-side performance reporting.

### Android reliability & WebView
- Improved black-page recovery, including cases where returning to Home could leave the Android WebView completely black.
- Improved recovery for stalled page loads and SpicyChat in-page/SPA navigation.
- Added safeguards against repeated recovery loops and against interfering with external login/authentication pages.
- Reduced duplicate Android WebView navigation/progress handling that could cause unnecessary work and occasional lag.
- Prevented the full QoL JavaScript bundle from being injected more than once into the same real WebView document.
- Reduced background health-check and diagnostic-log overhead, especially in long chats.
- Added Android WebView renderer responsiveness/crash diagnostics.
- Added an Android-only visual guard for rare oversized/duplicated chatbot avatar rendering glitches in chat.
- Added Android listing/card identity normalization so QoL filters can see stable chatbot IDs in WebView-rendered listings.
- Restored a browser-like mobile user agent for SpicyChat itself so the site's native mobile navigation remains available, while explicit Android capability markers still identify the dedicated APK to QoL.
- Improved startup resilience so damaged or legacy local preference values do not cause the app to immediately close.
- Improved Android package migration/startup validation for `uk.drache.spicychatqol`.
- The Android build now verifies the finished APK contains the expected package and `MainActivity` before copying it to release output.

### Android navigation & native controls
- Fixed an Android WebView history edge case after **Save & Stay** in the chatbot editor where the first device Back could briefly show My Creations and then return to the same editor, requiring a second Back press.
- Android now marks Save & Stay navigation and only consumes a second history entry when the first Back actually resolves back to the same editor; normal editor Back behavior is left unchanged when no duplicate entry exists.
- Added an Android-only **Allow pinch-to-zoom** setting. Manual page zoom is disabled by default and can be enabled from Android Settings.
- The zoom preference is persisted locally and applied to the live WebView when returning from Android Settings, without requiring an app restart.
- Added Android Settings for choosing the app's default launch page, including Home, Chats, Favorites, Recommended, Personas, My Bots, My Lorebooks, My Groups, Creator Leaderboard and Blocked Creators.
- Saved Android chat-tab restoration still takes priority over the default launch page when restart restoration is enabled.
- Added configurable placement for the native Android QoL control.
- Added the independent Android top-bar gear: on Home it can sit visually left of SpicyChat's language/globe control, and in chats visually left of the rating button.
- The top-bar gear now uses its own fixed overlay/hit target instead of being inserted into SpicyChat's language/rating control DOM.
- Improved internal navigation from Android Options so SpicyChat chat/profile links stay inside the app instead of opening the external browser.
- Added Android Command Palette handoff from the native QoL menu/Options flow.
- Improved Android media playback so SpicyChat/QoL voice playback can output audio without requiring an extra native WebView gesture.

### Android storage, backup & file handling
- Improved Android storage compatibility with newer SpicyChat QoL versions.
- Added Android support for `chrome.storage.local.remove()`, `clear()`, `getKeys()` and `getBytesInUse()`, including Promise-style calls used by newer QoL builds.
- Added a hybrid Android storage path for larger QoL values so growing backup/revision data does not have to live entirely in SharedPreferences.
- Improved storage-change synchronization between the Android Options page and the main SpicyChat WebView.
- Improved Persona Local Copy and other locally stored QoL data handling on Android.
- Improved backup importing with rollback protection if an import fails partway through.
- Improved protection against local QoL data being overwritten if the native Android settings model cannot parse newer extension settings.
- Improved compatibility between the real extension Options page and Android's native storage bridge.
- Improved Android compatibility with extension permission checks.
- Improved native Android chat-export handling.
- Added a generic Android-native Save File bridge for extension-generated downloads.
- Expanded generated-file handling so detached/programmatic `<a download>.click()` exports now work on Android, not only links attached to the document.
- Added Blob URL tracking around `URL.createObjectURL()` / `URL.revokeObjectURL()` so create → click → immediate revoke export patterns remain reliable in WebView.
- Chat Export and future QoL features using Blob/data-URL browser downloads can now route through Android's native Save As picker without requiring feature-specific Flutter code.
- Extension-menu backup/download actions can use the Android system file picker instead of relying on browser-only Blob downloads.
- Added Android-native file picking support for compatible extension import/load actions.
- Removed redundant native cogwheel backup actions while preserving the native file/storage bridge used by the extension's own Backup & Restore tools.

### Android Options & extension synchronization
- Fixed the Android Features page showing `0 shown / 0` because newer Options dependencies were not being copied into the APK.
- Android sync now copies local JavaScript files referenced by the current extension Options page, including `feature-registry.js`.
- Fixed Android Changelog loading by serving bundled text assets through the native Flutter asset bridge instead of relying on unreliable `file://` fetches.
- Android sync now includes `CHANGELOG.md`, `features.md`, and other required Options assets.
- Reworked the Android sync so current extension content scripts, CSS, supported web-accessible scripts, and Options assets are synchronized before each build.
- Fixed the sync process overwriting Android-specific `JsBundleService` functionality and causing builds to fail with a missing `extensionVersion` getter.
- The synchronized extension version is passed automatically from the current extension manifest into the Android wrapper.
- Added sync/build verification so required Android-only bridge functionality cannot be silently removed by an extension sync.
- Browser-only Options features that require real Chrome/Firefox tabs remain visibly unavailable on Android rather than failing silently.

### Android-only interaction features
- Added an Android-only long-press menu for chat messages.
- Long-pressing a message can expose supported actions such as Copy, Edit, Report, Resend, Remove Image, and Select text.
- Fixed long-press **Copy** failing in Android WebView by routing the requested message text through Flutter's native Android clipboard first, with browser clipboard methods retained only as fallback.
- Added movement thresholds so normal chat scrolling does not accidentally trigger the long-press menu.
- Added a temporary Select text mode so native Android/WebView text selection remains available.

### Multiple Android chat tabs
- Added experimental Multiple Android Chat Tabs.
- The feature is opt-in and disabled by default.
- Uses one active WebView rather than keeping a full SpicyChat WebView alive for every tab.
- Inactive tabs store lightweight state such as URL, title, scroll position, and last-used time.
- Added a permanent Home tab plus separate saved chat tabs.
- Opening a chat can create or reactivate its Android tab.
- Supports separate conversations with the same chatbot.
- Added tab switching, closing tabs, closing other chat tabs, and a configurable chat-tab limit.
- Added optional tab restoration after app restart.
- Added local scroll-position restoration when returning to a saved tab.
- Added Android Back integration for switching to the previously active tab when appropriate.
- Added a dedicated Android Settings page for Android-only features.
- Disabling Multiple Android Chat Tabs clears Android tab state and returns to the normal single-WebView navigation behavior without affecting SpicyChat conversations.

## Current testing
- Login and session persistence are working normally in current testing.
- Full extension-to-Android synchronization is working with the current extension structure.
- Android Diagnostics / Performance is being tested for live main-WebView runtime data, Android/WebView environment reporting and support-report completeness.
- Native long-press Copy is being tested across user and AI messages.
- Continued testing of black-page recovery, renderer/visual stability, Persona/local-copy handling, Backup Manager/revision storage, native extension file saving, listing identity/filter behavior, voice playback and native top-bar placement.
- Multiple Android Chat Tabs is experimental and currently being tested for navigation behavior, scroll restoration, restart restoration, same-bot multiple conversations, and long-chat performance.

## Planned
- Remote QoL bundle updates so extension-only releases do not require rebuilding the APK.
- Use `https://spicychatqol.drache.uk/android/manifest.json` as the Android app's update manifest/source of truth.
- Keep Android APK releases and extension bundle releases separate so native Android updates are only required when the Android wrapper/bridge changes.
- Add bundle compatibility checks such as minimum Android version / bridge version.
- Add last-known-good bundle rollback and fallback to the QoL bundle embedded in the APK.
- Built-in Android APK update notification when the Android manifest version changes.
- Better preservation of loaded Home/listing state and page position when switching between Android chat tabs.
- Further Multiple Android Chat Tabs improvements such as message-anchor restoration, optional composer draft preservation, tab reordering/pinning, and possibly a lightweight warm previous tab if performance allows.
- Revisit Android Options/storage read performance as QoL storage grows, using live runtime diagnostics to separate Options-page storage cost from actual chat/runtime cost.
- More long-chat performance and mobile layout improvements.
- Continued Android compatibility work as newer extension features are added.
- Continued improvements to backup/import/export and local-data recovery.

# Extension permissions

SpicyChat QoL keeps permissions limited to disclosed functionality and documents why each one is present.

## Required extension permissions

### `storage`

Stores QoL settings and local data such as saved lists, organization metadata, supported Persona/bot copies, Context Keeper/Storydate/RP State data, local backups, caches, and other enabled local features.

### `alarms`

Used by browser-managed scheduled work such as followed-creator checks, reminders, and inactive-tab maintenance where enabled.

### `unlimitedStorage`

Allows larger local-first datasets such as saved profile/Persona images, local archives, and other optional local media/data to avoid the browser's small default extension-storage quota. This permission does not grant network access and is not used to upload local data.

## Required SpicyChat / NextDay AI host access

- `https://spicychat.ai/*`
- `https://www.spicychat.ai/*`
- `https://ts-lb.nd-api.com/*`
- `https://prod.nd-api.com/*`
- `https://cdn.nd-api.com/*`
- `https://cms.cdn.nd-api.com/*`

These are SpicyChat/NextDay AI page, API, search, and media hosts used by enabled QoL features. Examples include running QoL on SpicyChat pages, resolving exact public message counts, reading accessible chatbot/profile data, checking saved bot status, and preserving SpicyChat-hosted Persona/profile images locally.

QoL does not use these permissions to access unrelated sites.

## Optional DeepL host access

- `https://api-free.deepl.com/*`
- `https://api.deepl.com/*`

Requested/used only for the optional DeepL translation feature. Translation is not required for the rest of QoL.

## Optional wiki / article host access

- `https://*/*`
- `http://*/*`

Declared as optional host access for the **Wiki / Web Lorebook Importer** and for user-supplied Discord webhook origins. QoL does **not** receive blanket access automatically.

For Wiki/Web imports, QoL requests access only to the origin of the URL the user asks it to fetch. The request omits site credentials/cookies (`credentials: omit`). Pasted text/Markdown/HTML can be used without granting access to an article site.

For Discord webhook alerts, QoL accepts only official Discord webhook hosts and requests access only to that webhook origin when the user tests/enables the webhook.

## Optional `downloads`

Requested only when a user starts a QoL download in an environment that needs the browser download manager, such as some extension-capable mobile browsers. Desktop exports normally use a permission-free file-link path where possible.

QoL does not use this permission to inspect or track unrelated downloads.

## Optional `notifications`

Requested only when the user enables a feature that uses browser notifications, currently:

- Chat Nudges;
- followed-creator new-bot alerts; and
- optional RP context-full warnings.

The permission is not required for the rest of QoL.

## Firefox data-collection declarations

Firefox/AMO may ask the package to declare categories that an optional feature can process. The Firefox release builder declares no required data collection and optional categories for authentication information, personal communications, and website content because optional features can handle a DeepL API key, user-selected chat text, and SpicyChat page content locally or send it to the explicitly selected third-party service described in the privacy policy.

These declarations do not mean QoL sends that information to DragonScript. The extension does not operate a developer-controlled analytics/data-collection backend.

See `PRIVACY.md` for the full data-handling policy.

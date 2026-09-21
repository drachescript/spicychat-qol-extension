# SpicyChat QoL v0.2.11

This update builds on the v0.2 main release with creator/history improvements, listing and language-filter fixes, mobile compatibility work, Lorebook/Context Keeper upgrades, and a large Diagnostic Extension-driven performance pass.

## Highlights

- Added meaningful Bot Version History with field-level compare/restore tools.
- Added persona-group filtering/sorting in the in-chat persona picker.
- Hardened Listing Refill against stale filters and SpicyChat's newer moving pagination.
- Improved short-description language detection and per-favorite-creator discovery overrides.
- Added a stricter second built-in OOC preset without overwriting user-edited/custom OOCs.
- Kept the chat composer usable for drafting while generation is busy without forcing Send.
- Improved mobile/WebView model-picker behavior and narrow Bot Hub layouts.
- Added fuller Lorebook JSON export across Details + Entries, including expanded keyword capture.
- Added Context Keeper Remove all and category selection for manual entries.
- Reduced active-use DOM churn, repeated listing/sidebar writes, broad observer rescans, and Bulk Dislike helper overhead.
- Cleaned store packages so repository/build-only tooling is not shipped.
- Added an opt-in SpicyChat beta-access flag for future beta-only compatibility helpers.
- Added Windows one-click build helpers under `dev_build` and direct build output to that folder.

## Updating

Existing settings and supported local QoL data are intended to carry over normally. User-edited OOC presets are preserved.

## Browser packages

The normal Full build remains the reference/default package. Recommended Lite is still a draft profile and remains intentionally blocked until its package contents are ready for public use.

## Support

- Website: https://spicychatqol.drache.uk/
- Discord: https://discord.gg/XTMdWvuVSU
- GitHub Issues: https://github.com/drachescript/spicychat-qol-extension/issues/new

SpicyChat QoL is an independent community project and is not affiliated with, endorsed by, or sponsored by SpicyChat.

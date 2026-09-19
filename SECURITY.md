# Security and privacy reports

Please report security or privacy issues privately to DragonGRaf before opening a public issue when the report could expose account/session data or create a practical abuse path.

Contact:

- Discord: `@dragongraf`
- Project GitHub: https://github.com/drachescript/spicychat-qol-extention

When reporting, include the affected version, browser/platform, reproduction steps and the minimum diagnostic information needed to understand the problem.

Do **not** send passwords, session cookies, authorization headers, DeepL/API keys, Discord webhook URLs, private chat logs, private Persona text or other sensitive account data unless it is absolutely necessary. Redact secrets from screenshots and network captures.

## Project security principles

- API keys and similar secrets remain device-local unless an explicitly documented integration requires them.
- Normal QoL backups/recovery snapshots/diagnostics intentionally exclude service credentials such as DeepL API keys and Discord webhook URLs; diagnostics are also designed to exclude private chat content.
- Features should use SpicyChat's normal exposed UI/data paths rather than bypass access controls.
- Destructive actions should remain reviewed/confirmed where practical and should not silently publish/delete remote content.

See `PRIVACY.md` and `PERMISSIONS.md` for the current data-handling and permission disclosures.

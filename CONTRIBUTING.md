# Contributing to SpicyChat QoL

SpicyChat QoL is maintained by DragonGRaf under DragonScript. Bug reports, testing feedback, and code contributions are welcome. Feature requests may be temporarily closed during release freezes; check the project Discord/GitHub before opening one.

## Ideas and feedback

You can use any of these:

- GitHub issues: https://github.com/drachescript/spicychat-qol-extention/issues
- Project Discord server: https://discord.gg/XTMdWvuVSU
- Discord DM: `@dragongraf`

Not every suggestion will be added. Features are selected based on whether they fit the project, can be maintained safely, and work with SpicyChat without creating unnecessary external dependencies.

## Bug reports

Useful reports include:

- the SpicyChat page/route where it happened;
- what you expected;
- what actually happened;
- whether a reload fixes it;
- browser / Android app information;
- a screenshot when the problem is visual;
- saved page HTML or the affected element HTML when SpicyChat changed its markup;
- sanitized **Copy diagnostic info** output when relevant.

Do not post account cookies, authorization headers, API keys, Discord webhook URLs, private chat exports, passwords, or other sensitive data.

## Code changes

Keep changes focused and preserve existing saved setting/storage keys unless a migration is genuinely required.

Preferred project rules:

- New user-facing features are optional unless they are passive infrastructure/safety fixes.
- Fresh installs keep optional features off unless an existing project decision says otherwise.
- Prefer local-first functionality and SpicyChat's normal UI/data paths.
- Avoid new external services when the feature can reasonably work without them.
- Do not add moderation bypasses, hidden/private data extraction or automatic publishing behavior.
- Keep Chrome, Firefox and shared Android page-code compatibility in mind.
- Avoid unnecessary full-page or full-chat rescans; long-chat performance matters.
- Public-facing wording should be clear and human, without internal debug terminology.
- Changelog entries use `-` bullets and describe actual user-visible changes concisely.

Before submitting code, run JavaScript syntax checks, verify manifest file references, check for duplicate Settings IDs/merge markers, and test the affected SpicyChat workflow when possible.

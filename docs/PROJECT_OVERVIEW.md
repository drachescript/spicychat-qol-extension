# Dragon Spicychat project overview

Documentation baseline: 2026-09-16. This is a local source inspection, not a deployment or end-to-end certification. Start with [AGENTS.md](../AGENTS.md) and [conversation provenance](CONVERSATION_CONTEXT.md).

## Components and connections

| Component | Responsibility and source entry points | Connects to |
| --- | --- | --- |
| Browser QoL | Root manifest.json, background.js, content/, options.*, feature-registry.js; configurable discovery, chat, creator, memory, backup and UI tools | SpicyChat UI/APIs; Android shares page code; website presents features; Discord reports releases |
| Android | Flutter android_app/lib/, native bridges and bundled extension/assets; app ID uk.drache.spicychatqol | Embedded QoL and Options communicate through Flutter; one WebView with lightweight app tabs, not browser background tabs |
| Inspector | bridge.js observes page activity; content.js forwards; background.js stores; inspector.js analyzes | Private evidence informs QoL/Android fixes and a separate native-site bug backlog |
| QoL website | Static pages, assets/js/, data/fallback/, data/demo/, worker/worker.js | GitHub source/store metadata with fallbacks; public support/download links; isolated demo |
| Public bot website | assets/data/, assets/stats.js, scripts/, tools/ | Curated bot metadata, Typesense/creator stats and Gmail approval dates; requests via Worker to Discord |
| Discord bot | src/index.js, creatorWatch.js, projectState.js, messageManager.js, dmBridge.js | Managed server information, website/release state, creator-follow DMs, request/support workflow |
| S.AI Toolkit | Separate extension by upstream contributors; content.js, page-context.js, xhr-intercept.js, storage-wrapper.js | Overlaps QoL on the same SpicyChat pages; test coexistence and identify the owner of a defect before changing it |

The similarly named websites have different jobs: spicychatqol.drache.uk is the product/support/demo site; spicychat.drache.uk is Dragon's public bot collection and stats site.

## Source and distribution boundaries

- Browser root source is separate from dev_build/ and release_build/ packages. Their freshness was not established in this documentation pass.
- Android's extension/ snapshot is a separate physical copy. The build script syncs it into APK assets; updating the primary QoL folder alone does not prove Android has received that change.
- Website fallback versions, demo snapshot versions, local manifests and published store versions are different facts. Do not describe a fallback or local build as a confirmed public release.
- Inspector findings need capture/version attribution. Old captures may precede fixes already present in QoL.
- Public bot history and replacement identities must survive archive operations. Discord follow baselines independently prevent old discoveries from becoming notification floods.
- Toolkit's own optional Google Drive integration is not evidence that QoL Sync is implemented.

## Local snapshot

| Component | Source-inspected baseline | Notes |
| --- | --- | --- |
| QoL | 0.1.9.121 / manifest 0.1.9.921 | README still says .118 |
| Android | 0.4.7+65; embedded QoL .120/.920 | Primary Memory import .121 not established in Android |
| Inspector | 0.0.4 | v0.0.5 items remain proposals |
| QoL website | Matches historical “website v5” content | No canonical v5 version manifest found; demo .1.8.70, older store/bot fallbacks |
| Public bot website | Changelog v0.7.4; 73 active, 4 archived, 147 snapshots | Counts are dated, not evergreen public copy |
| Discord bot | package.json 0.3.11 | Running instance not checked |
| S.AI Toolkit | manifest/changelog 1.2.6 | No dedicated imported Toolkit conversation |

## Maintaining continuity

Use the component's status document for current evidence, bugs, planned work and deferred ideas. Keep historical decisions in the provenance document; do not overwrite them when implementation changes. When resolving an item, add the source/test/date that establishes resolution.

No AGENTS.md files were found in the inspected repositories or their checked workspace ancestors before this pass. QoL and Android files were already largely untracked in Git; Inspector and Discord folders were not Git repositories. Other repositories had clean short status before these documentation changes. This describes local tracking only, not whether remote source exists.

This pass did not run builds, sync scripts, workers, the Discord bot, browser workflows, network requests or publishing tools. It did not inspect private runtime state or signing secrets.


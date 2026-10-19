"""Offline source contract checks. Not a replacement for live SpicyChat tests."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parent.parent
m=json.loads((R/'manifest.json').read_text())
paths=[p for item in m['content_scripts'] for kind in ('js','css') for p in item.get(kind,[])]
assert all((R/p).is_file() for p in paths)
assert len(paths)==len(set(paths)), 'duplicate JS/CSS manifest inclusion'
core=(R/'content/core-settings-defaults.js').read_text()
new=['enableModelQuickAccess','enableChatLorebookManager','enablePreviouslyChattedIndicator','chattedIndicatorShowOpened']
assert all(re.search(r'\b'+x+r'\s*:\s*false\b',core) for x in new)
assert 'modelQuickAccessNames: ""' in core
load=(R/'settings/features/options-settings-load.js').read_text()
auto=(R/'settings/features/options-settings-autosave.js').read_text()
owners=(R/'settings/feature-setting-owners.js').read_text()
assert all(x in load and x in auto and x in owners for x in new+['modelQuickAccessNames'])
for feature in ('model-quick-access','chat-lorebook-manager','previously-chatted-indicator'):
    assert feature in (R/'content/feature-build-map.js').read_text()
    assert feature in (R/'settings/options-feature-availability.js').read_text()
    assert (R/'settings/feature-panels'/f'{feature}.js').exists()
    assert (R/'content'/f'{feature}.js').exists()
    assert (R/'content/styles'/f'{feature}.css').exists()
    assert f'ds-feature-panel-{feature}' in (R/'options.html').read_text()
    assert f'content/{feature}.js' in paths and f'content/styles/{feature}.css' in paths
assert 'feature' in (R/'content/main.js').read_text()
assert 'hasConfirmedUserMessage' in (R/'content/previously-chatted-indicator.js').read_text()
assert 'messageCount' in (R/'content/opened-chats.js').read_text()
assert "PENDING_KEY = 'dsQolChatLorebookPendingEntryV1'" in (R/'content/chat-lorebook-manager.js').read_text()
assert 'The native Add Entry form' in (R/'content/chat-lorebook-manager.js').read_text()
assert 'window.__DSQ_TAB_GATE__?.paused' in (R/'content/model-quick-access.js').read_text()
assert 'No network requests or new observers' in (R/'content/previously-chatted-indicator.js').read_text()
assert 'readSettingsFromPage' in auto and 'if (profile?.generated && Array.isArray(profile.features))' in auto
assert 'loadedSettingsSnapshot' in auto
assert (R/'background-entry.js').read_text().count('importScripts(')==1
print('PASS: extension contract: defaults OFF, Options, storage, runtime, manifest, CSS, background import path, Lite values preserved')

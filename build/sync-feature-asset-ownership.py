#!/usr/bin/env python3
"""Synchronize explicitly owned Settings panels, styles and background services.

Only known, reviewed single-feature mappings may be repaired automatically.
Shared assets and isolation flags are never inferred or modified. All changes
stay in the local checkout until reviewed/committed by a developer.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANEL_ALIASES = {'automatic-images': 'auto-images'}
STYLE_OWNERS = {
    'persona-manager.css': 'persona-organizer',
    'chat-bubble-themes.css': 'chat-bubbles',
    'bot-organizer.css': 'bot-organizer',
    'android-app.css': 'android-app',
    'memory-vault.css': 'memory-manager',
    'chat-index.css': 'chat-index',
    'rulebook-filter.css': 'rulebook-filter',
    'lorebook-connections.css': 'lorebook-connections',
    'story-reading-layout.css': 'story-reading-layout',
    'pagination.css': 'pagination-tools',
}
# Explicit ownership does NOT establish independent Custom Lite omit-safety.
BACKGROUND_OWNERS = {
    'background/background-auto-afk.js': 'auto-afk',
}


def scan(write=True):
    contracts = {p.stem: (p, json.loads(p.read_text(encoding='utf-8')))
                 for p in (ROOT / 'build/features').glob('*.json')}
    claimed = {}
    changed = []
    for file in sorted((ROOT / 'settings/feature-panels').glob('*.js')):
        owner = PANEL_ALIASES.get(file.stem, file.stem)
        if owner not in contracts:
            raise ValueError(
                f'Unclaimed Settings panel: {file.relative_to(ROOT)}; '
                f'add a reviewed build/features/{owner}.json contract. '
                'No ownership was guessed.'
            )
        rel = file.relative_to(ROOT).as_posix()
        contract = contracts[owner][1]
        contract['settingsFiles'] = sorted(set(contract.get('settingsFiles', [])) | {rel})
        claimed[rel] = owner

    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    loaded_css = {x for entry in manifest.get('content_scripts', []) for x in entry.get('css', [])}
    for name, owner in STYLE_OWNERS.items():
        if owner not in contracts:
            raise ValueError(f'Unknown CSS owner {owner}: {name}')
        rel = f'content/styles/{name}'
        if rel not in loaded_css or not (ROOT / rel).is_file():
            raise ValueError(f'CSS owner not used by Full: {rel}')
        contract = contracts[owner][1]
        contract['styleFiles'] = sorted(set(contract.get('styleFiles', [])) | {rel})
        claimed[rel] = owner

    entry = (ROOT / 'background-entry.js').read_text(encoding='utf-8')
    match = re.search(r'\bimportScripts\s*\(([^;]*)\)', entry, re.S)
    imports = set(re.findall(r'["\']([^"\']+\.js)["\']', match.group(1))) if match else set()
    for rel, owner in BACKGROUND_OWNERS.items():
        if owner not in contracts:
            raise ValueError(f'Unknown background service owner {owner}: {rel}')
        if rel not in imports or not (ROOT / rel).is_file():
            raise ValueError(f'Background service not imported by Full: {rel}')
        contract = contracts[owner][1]
        contract['backgroundFiles'] = sorted(set(contract.get('backgroundFiles', [])) | {rel})
        claimed[rel] = owner

    for owner, (path, contract) in contracts.items():
        existing = json.loads(path.read_text(encoding='utf-8'))
        if contract != existing:
            if write:
                path.write_text(json.dumps(contract, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            changed.append(owner)
    return {
        'contracts': len(contracts),
        'panelFiles': len(list((ROOT / 'settings/feature-panels').glob('*.js'))),
        'claimedPanelFiles': sum(1 for p in claimed if p.startswith('settings/')),
        'newlyOwnedStyles': len(STYLE_OWNERS),
        'ownedBackgroundServices': len(BACKGROUND_OWNERS),
        'changedContracts': sorted(changed),
        'remainingSharedCss': sorted(
            loaded_css
            - {p for p in claimed if p.startswith('content/styles/')}
            - {x for _, contract in contracts.values()
               for x in contract.get('styleFiles', [])}
        ),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true',
                        help='Check that known asset declarations are already synchronized')
    args = parser.parse_args()
    result = scan(write=not args.verify)
    if args.verify and result['changedContracts']:
        raise SystemExit('Ownership declarations out of sync: ' +
                         ', '.join(result['changedContracts']) +
                         '\nRun python3 build/sync-feature-asset-ownership.py and commit its output.')
    print(json.dumps(result, indent=2))

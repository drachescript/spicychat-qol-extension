#!/usr/bin/env python3
"""Synchronize independently loaded Settings panels and clear single-feature CSS.

This is an asset ownership audit, NOT a browser-runtime independence certification.
It updates build/features/*.json in-place, but never enables a feature or touches
saved user settings. Re-run after adding a feature panel / owned stylesheet.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Aliases are explicit: don't infer an owner from a similar feature name.
PANEL_ALIASES = {'automatic-images': 'auto-images'}
# Only CSS with a confirmed exclusive feature owner belongs in this list.
# Shared assets (including explorer base, remaining-styles, etc.) stay shared.
STYLE_OWNERS = {
    'persona-manager.css': 'persona-organizer',
    'chat-bubble-themes.css': 'chat-bubbles',
    'bot-organizer.css': 'bot-organizer',
    'memory-vault.css': 'memory-manager',
    'chat-index.css': 'chat-index',
    'rulebook-filter.css': 'rulebook-filter',
    'lorebook-connections.css': 'lorebook-connections',
    'story-reading-layout.css': 'story-reading-layout',
    'pagination.css': 'pagination-tools',
    # Some OOC styles also support the QoL Mini Panel; retain as shared.
}


def scan(write=True):
    contracts = {p.stem: (p, json.loads(p.read_text(encoding='utf-8')))
                 for p in (ROOT/'build/features').glob('*.json')}
    claimed = {}
    changed = []
    for file in sorted((ROOT/'settings/feature-panels').glob('*.js')):
        owner = PANEL_ALIASES.get(file.stem, file.stem)
        if owner not in contracts:
            raise ValueError(f'Unclaimed Settings panel: {file.relative_to(ROOT)}')
        rel = file.relative_to(ROOT).as_posix()
        contract = contracts[owner][1]
        contract['settingsFiles'] = sorted(set(contract.get('settingsFiles', [])) | {rel})
        claimed[rel] = owner
    full_manifest = json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    loaded_css = {x for entry in full_manifest.get('content_scripts',[]) for x in entry.get('css',[])}
    for name, owner in STYLE_OWNERS.items():
        if owner not in contracts:
            raise ValueError(f'Unknown CSS owner {owner}: {name}')
        rel = f'content/styles/{name}'
        if rel not in loaded_css or not (ROOT/rel).is_file():
            raise ValueError(f'CSS owner not used by Full: {rel}')
        contract = contracts[owner][1]
        contract['styleFiles'] = sorted(set(contract.get('styleFiles', [])) | {rel})
        claimed[rel] = owner
    for owner,(path,c) in contracts.items():
        existing = json.loads(path.read_text(encoding='utf-8'))
        if c != existing:
            if write:
                path.write_text(json.dumps(c, indent=2, ensure_ascii=False)+'\n',encoding='utf-8')
            changed.append(owner)
    return {'contracts':len(contracts),'panelFiles':len(list((ROOT/'settings/feature-panels').glob('*.js'))),
            'claimedPanelFiles':len([p for p in claimed if p.startswith('settings/')]),
            'newlyOwnedStyles':len(STYLE_OWNERS), 'changedContracts':changed,
            'remainingSharedCss':sorted(loaded_css-{p for p in claimed if p.startswith('content/styles/')}
                                        -{x for _,c in contracts.values() for x in c.get('styleFiles',[])})}

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--verify',action='store_true',help='Fail if ownership declarations require synchronization')
    args=p.parse_args()
    result=scan(write=not args.verify)
    if args.verify and result['changedContracts']:
        raise SystemExit('Ownership declarations out of sync: '+', '.join(result['changedContracts']))
    print(json.dumps(result,indent=2))

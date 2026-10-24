#!/usr/bin/env python3
"""Prune audited, message-only background services in disposable Custom stages.

This is NOT a general Custom Lite builder or a browser certification. It does
not touch the Full source tree, nor shared storage, events or service workers.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Explicit opt-in allowlist. These handlers have no background event hooks and
# are invoked only via the feature-owned message router. Everything else stays.
SAFE_OPTIONAL = {
    'translation': ('background/background-translation.js',
        ('DS_DEEPL_TRANSLATE','DS_DEEPL_TEST','DS_QOL_TRANSLATE')),
    'wiki-lorebook-importer': ('background/background-wiki-fetch.js',
        ('DS_WIKI_FETCH','DS_WIKI_REQUEST_PERMISSION')),
    'context-keeper': ('background/features/background-context-keeper-storage.js',
        ('DS_CONTEXT_KEEPER_MUTATE',)),
    'chat-lorebook-manager': ('background/features/background-chat-lorebook-local.js',
        ('DS_CHAT_LOREBOOK_MUTATE',)),
    'native-memory-probe': ('background/features/background-native-memory-probe.js',
        ('DS_NATIVE_MEMORY_PROBE',)),
}

def plan(stage: Path, installed: set[str], *, apply: bool = False) -> dict:
    stage = stage.resolve()
    if stage == ROOT.resolve():
        raise ValueError('Never modify the Full source checkout; use a disposable Custom stage')
    entry_path = stage/'background-entry.js'
    if not (stage/'manifest.json').is_file() or not entry_path.is_file():
        raise ValueError('Stage must contain a manifest and background entry')
    contracts = {}
    for p in (stage/'build/features').glob('*.json'):
        contract=json.loads(p.read_text(encoding='utf-8'))
        if p.stem != contract.get('id'):
            raise ValueError(f'Invalid feature contract: {p.name}')
        contracts[p.stem] = contract
    if not contracts:
        raise ValueError('Feature contracts are required before pruning')
    unknown = installed - set(contracts)
    if unknown:
        raise ValueError('Unknown features: '+', '.join(sorted(unknown)))
    source = entry_path.read_text(encoding='utf-8')
    match = re.search(r'\bimportScripts\s*\(([^;]*)\)',source,re.S)
    if not match:
        raise ValueError('Expected one static importScripts statement')
    entries = re.findall(r'["\']([^"\']+\.js)["\']',match.group(1))
    if len(entries) != len(set(entries)):
        raise ValueError('Duplicate background imports')
    required_core = ['background/feature-build-profile.js',
        'background/feature-message-ownership.js','background.js',
        'background/background-events.js']
    if any(name not in entries for name in required_core) or entries[-1] != required_core[-1]:
        raise ValueError('Required core background imports missing or out of order')
    if entries.index('background.js') >= entries.index(required_core[-1]):
        raise ValueError('Background startup order is unsafe')
    mapping = (stage/'background/feature-message-ownership.js').read_text(encoding='utf-8')
    removals=[]
    for owner,(asset,messages) in SAFE_OPTIONAL.items():
        contract=contracts.get(owner)
        if not contract or asset not in contract.get('backgroundFiles',[]):
            raise ValueError(f'{owner}: background module is not declared in its feature contract')
        if asset not in entries:
            raise ValueError(f'{owner}: expected background import missing')
        if any(f'"{message}": "{owner}"' not in mapping for message in messages):
            raise ValueError(f'{owner}: missing background message owner guard')
        if owner not in installed:
            removals.append(asset)
    retained=[p for p in entries if p not in removals]
    missing=[p for p in retained if not (stage/p).is_file()]
    if missing:
        raise ValueError('Missing retained background files: '+', '.join(missing))
    if apply:
        # Replace only the import list; no global string replacements or
        # source-tree mutations, and no change to the Full manifest/version.
        formatted=', '.join(json.dumps(p) for p in retained)
        output=source[:match.start(1)]+formatted+source[match.end(1):]
        entry_path.write_text(output,encoding='utf-8')
        profile_path=stage/'background/feature-build-profile.js'
        profile_path.write_text('"use strict";\n'
            'const DSQ_BACKGROUND_BUILD_PROFILE = Object.freeze('
            +json.dumps({'id':'custom','features':sorted(installed)},sort_keys=True)+');\n'
            'function dsqBackgroundHasFeature(id) { return DSQ_BACKGROUND_BUILD_PROFILE.features.includes(String(id || "")); }\n',
            encoding='utf-8')
        for p in removals:
            (stage/p).unlink()
    return {'schema':'dsq-background-prune/v2','applied':apply,
        'removed':removals,'kept':retained,
        'limits':'Five audited message-only modules only. Remaining shared services and arbitrary Lite combinations are not certified.'}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--features',required=True,help='Comma-separated feature IDs')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    print(json.dumps(plan(args.stage,{v.strip() for v in args.features.split(',') if v.strip()},apply=args.apply),indent=2))

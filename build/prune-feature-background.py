#!/usr/bin/env python3
"""Prune two verified message-only services from a DISPOSABLE Custom stage.

A partial resource-pruning step, NOT a complete Custom extension builder.
Full Chromium/Firefox background loading is deliberately unchanged.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# These handlers are message-only and their message IDs are rejected by
# background/feature-message-ownership.js when the feature is absent.
SAFE_OPTIONAL = {
    'translation': 'background/background-translation.js',
    'wiki-lorebook-importer': 'background/background-wiki-fetch.js',
}

def plan(stage: Path, installed: set[str], *, apply: bool = False) -> dict:
    stage=stage.resolve()
    if stage == ROOT.resolve():
        raise ValueError('Never modify the Full source checkout; provide a disposable stage')
    if not (stage/'manifest.json').is_file() or not (stage/'background-entry.js').is_file():
        raise ValueError('Stage must contain a Full source tree and background entry')
    known={p.stem for p in (stage/'build/features').glob('*.json')}
    if not known:
        raise ValueError('Stage must retain feature contracts for validation')
    unknown=installed-known
    if unknown:
        raise ValueError('Unknown features: '+', '.join(sorted(unknown)))
    entry=(stage/'background-entry.js').read_text(encoding='utf-8')
    match=re.search(r'\bimportScripts\s*\(([^;]*)\)',entry,re.S)
    if not match:
        raise ValueError('Expected a static background-entry importScripts list')
    all_imports=re.findall(r'["\']([^"\']+\.js)["\']',match.group(1))
    if len(all_imports)!=len(set(all_imports)):
        raise ValueError('Duplicate background imports')
    removed=[]
    for fid,path in SAFE_OPTIONAL.items():
        contract=json.loads((stage/'build/features'/f'{fid}.json').read_text())
        if path not in contract.get('backgroundFiles', []):
            raise ValueError(f'Unowned background service: {path}')
        if path not in all_imports:
            raise ValueError(f'Missing background import: {path}')
        # Verify message ownership so an omitted service cannot be reached via
        # an unguarded message dispatch in a generated Custom build.
        mapping=(stage/'background/feature-message-ownership.js').read_text()
        if fid=='translation' and not all(f'"{type}": "translation"' in mapping for type in ('DS_DEEPL_TRANSLATE','DS_DEEPL_TEST','DS_QOL_TRANSLATE')):
            raise ValueError('Translation message guards are incomplete')
        if fid=='wiki-lorebook-importer' and not all(f'"{type}": "wiki-lorebook-importer"' in mapping for type in ('DS_WIKI_FETCH','DS_WIKI_REQUEST_PERMISSION')):
            raise ValueError('Wiki fetch message guards are incomplete')
        if fid not in installed:
            removed.append(path)
    final=[p for p in all_imports if p not in removed]
    if final.index('background.js') >= final.index('background/background-events.js') or final[-1]!='background/background-events.js':
        raise ValueError('Background script order is unsafe')
    missing=[p for p in final if not (stage/p).is_file()]
    if missing:
        raise ValueError('Missing background scripts: '+str(missing))
    if apply:
        original=match.group(1)
        modified=original
        for path in removed:
            modified,replaced=re.subn(r'\s*["\']'+re.escape(path)+r'["\']\s*,', '', modified)
            if replaced!=1:
                raise ValueError(f'Cannot safely remove {path} from entry')
        output=entry[:match.start(1)]+modified+entry[match.end(1):]
        (stage/'background-entry.js').write_text(output,encoding='utf-8')
        for path in removed:
            (stage/path).unlink()
        # Keep background feature gating synchronized with the same IDs.
        profile_path=stage/'background/feature-build-profile.js'
        profile_path.write_text('"use strict";\n'
           'const DSQ_BACKGROUND_BUILD_PROFILE = Object.freeze('+json.dumps({'id':'custom','features':sorted(installed)})+');\n'
           'function dsqBackgroundHasFeature(id) { return DSQ_BACKGROUND_BUILD_PROFILE.features.includes(String(id || "")); }\n',encoding='utf-8')
    return {'schema':'dsq-background-prune/v1','applied':apply,'removed':removed,'kept':final,
            'limits':'Two message-only services only; other shared background event handlers remain installed. Not a full Lite certification.'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage',type=Path,required=True)
    parser.add_argument('--features',required=True,help='Comma-separated feature IDs selected for a disposable stage')
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    print(json.dumps(plan(args.stage,{x.strip() for x in args.features.split(',') if x.strip()},apply=args.apply),indent=2))

#!/usr/bin/env python3
"""Sync feature-owned Settings markup declarations into the Custom catalog.

Run from a checkout containing build/feature-catalog.json and build/features/*.json.
Only updates the 21 feature-owned Settings markup declarations. It does not
certify Settings controller independence or browser behavior.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PANELS = (
    'command-palette', 'translation', 'rp-format-repair', 'chat-scene-notes',
    'reply-instructions', 'context-keeper', 'story-day-tracker',
    'rp-state-tracker', 'chat-nudges', 'character-qol-profiles',
    'alternate-dialogue', 'soundscapes', 'animation-control', 'chat-topbar',
    'chat-search', 'chat-bookmarks', 'focus-mode', 'native-rating-helpers',
    'profile-export', 'creator-writing-assistant', 'card-workflow',
)

def main():
    catalog_path = ROOT / 'build/feature-catalog.json'
    if not catalog_path.is_file():
        raise SystemExit('No build/feature-catalog.json in this checkout. Merge this update into qol-custom first.')
    cat = json.loads(catalog_path.read_text(encoding='utf-8'))
    by_id = {f['id']: f for f in cat['features']}
    missing = set(PANELS) - set(by_id)
    if missing:
        raise SystemExit('Unknown Custom feature ids: ' + ', '.join(sorted(missing)))
    planned=[]
    for feature in PANELS:
        contract_path = ROOT/'build/features'/f'{feature}.json'
        panel = f'settings/feature-panels/{feature}.js'
        if not contract_path.is_file() or not (ROOT/panel).is_file():
            raise SystemExit('Required feature contract or panel missing: '+ feature)
        contract = json.loads(contract_path.read_text(encoding='utf-8'))
        if contract.get('id') != feature:
            raise SystemExit('Contract id mismatch: '+str(contract_path))
        planned.append((feature,contract_path,contract,panel))
    # All validations above happen before we mutate files.
    for feature,path,contract,panel in planned:
        contract['settingsFiles'] = sorted(set(contract.get('settingsFiles',contract.get('settingsScripts',[]))) | {panel})
        # The markup is physically isolated; controllers for read, save, and backup still need isolation.
        contract['settingsMarkupIsolated'] = True
        # Do NOT set settingsIsolated true; that would falsely claim independence.
        path.write_text(json.dumps(contract,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
        entry=by_id[feature]
        entry['settingsScripts'] = sorted(set(entry.get('settingsScripts',[])) | {panel})
        entry['settingsMarkupIsolated'] = True
        entry['isolation']['settings'] = False
    catalog_path.write_text(json.dumps(cat, indent=2, ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Updated {len(PANELS)} feature contracts and Custom catalog; full isolation is still unverified.')

if __name__=='__main__': main()

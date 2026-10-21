#!/usr/bin/env python3
"""Verify Custom website index and actual physical package agree on ownership."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract_dir=ROOT/'build/features'
contracts={c['id']:c for p in contract_dir.glob('*.json')
           for c in [json.loads(p.read_text(encoding='utf-8'))]}
index=json.loads((ROOT/'build/custom-package-index.json').read_text(encoding='utf-8'))
features={c['id']:c for c in index['features']}
assert set(contracts)==set(features), 'Website package index missing features'
assert index['status']=='experimental-not-browser-certified'
assert index['preserveSavedSettings'] and index['newFeaturesDefaultOff']
for id,c in contracts.items():
    f=features[id]
    assert not f['defaultSelected'] and not f['defaultUpdatesEnabled'], id
    assert f['settings']==c.get('settingsFiles',[]),id
    assert f['styles']==c.get('styleFiles',[]),id
    assert f['background']==c.get('backgroundFiles',[]),id
    assert f['dependencies']==c.get('dependencies',[]),id
    assert f['runtime']==c['primary'],id
print('PASS: all Custom package index entries match live feature contracts; new options stay OFF')

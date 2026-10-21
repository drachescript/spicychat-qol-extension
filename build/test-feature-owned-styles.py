#!/usr/bin/env python3
"""Verify that split, feature-owned CSS is in the Full manifest and contracts."""
import json
from pathlib import Path
R=Path(__file__).resolve().parent.parent
manifest=json.loads((R/'manifest.json').read_text())
all_css=[p for script in manifest['content_scripts'] for p in script.get('css',[])]
modules=json.loads((R/'build/modules.json').read_text())['runtimeAssets']['styles']
shared=(R/'content/styles/remaining-styles.css').read_text()
for fid,keyword in (
  ('wiki-lorebook-importer','/* Wiki / Web Lorebook Importer */'),
  ('story-day-tracker','/* v0.1.9.112 - Internal Day Tracker / Storydate */'),
  ('rp-state-tracker','/* RP State Tracker */'),
  ('soundscapes','/* v0.1.9.41 - Soundscape Mini Panel controls */'),
):
    path=f'content/styles/{fid}.css'
    contract=json.loads((R/f'build/features/{fid}.json').read_text())
    assert path in contract.get('styleFiles',[]),fid
    assert all_css.count(path)==1,fid
    assert sum(path in paths for paths in modules.values())==1,fid
    contents=(R/path).read_text()
    assert contents.lstrip().startswith(keyword),fid
    assert keyword not in shared,fid
    assert contents.count('{')==contents.count('}'),fid
    assert contents.strip(),fid
assert all_css.index('content/styles/remaining-styles.css') < min(all_css.index(f'content/styles/{id}.css') for id in ['wiki-lorebook-importer','story-day-tracker','rp-state-tracker','soundscapes'])
print('PASS: four feature-owned styles, manifest/contract/registry parity, shared CSS moved')

#!/usr/bin/env python3
"""Offline safety checks for Custom background resource pruning (v0.2.60)."""
from __future__ import annotations
import importlib.util
import json
import re
import shutil
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SPEC=importlib.util.spec_from_file_location('prune_feature_background',ROOT/'build/prune-feature-background.py')
mod=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(mod)
ENTRY=(ROOT/'background-entry.js').read_text(encoding='utf-8')
IMPORTED=re.findall(r'"([^"\n]+\.js)"',ENTRY)
OPTIONAL={fid:asset for fid,(asset,_) in mod.SAFE_OPTIONAL.items()}

def stage_copy(folder):
    stage=Path(folder)
    files=set(IMPORTED)|{
        'background-entry.js','manifest.json',
        'background/feature-build-profile.js',
        'background/feature-message-ownership.js'
    }
    for rel in files:
        target=stage/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/rel,target)
    contracts={fid:{'id':fid,'backgroundFiles':[asset]} for fid,asset in OPTIONAL.items()}
    for extra in ('model-selector','opened-chats'):
        contracts[extra]={'id':extra,'backgroundFiles':[]}
    for fid,contract in contracts.items():
        p=stage/'build/features'/f'{fid}.json';p.parent.mkdir(parents=True,exist_ok=True)
        p.write_text(json.dumps(contract),encoding='utf-8')
    return stage

with tempfile.TemporaryDirectory(prefix='qol-custom-background-') as tmp:
    stage=stage_copy(tmp)
    first=mod.plan(stage,{'model-selector','opened-chats'},apply=True)
    assert set(first['removed'])==set(OPTIONAL.values())
    entry=(stage/'background-entry.js').read_text()
    assert all(path not in entry and not (stage/path).exists() for path in OPTIONAL.values())
    assert 'background.js' in entry and 'background/background-events.js' in entry
    assert 'background/feature-message-ownership.js' in entry
    assert json.loads((stage/'manifest.json').read_text())['version']==json.loads((ROOT/'manifest.json').read_text())['version']
    assert '"context-keeper"' not in (stage/'background/feature-build-profile.js').read_text()
    assert (ROOT/'background-entry.js').read_text()==ENTRY, 'Full source was modified'

with tempfile.TemporaryDirectory(prefix='qol-custom-background-') as tmp:
    stage=stage_copy(tmp)
    requested={'context-keeper','chat-lorebook-manager','model-selector'}
    selected=mod.plan(stage,requested,apply=True)
    assert set(selected['removed'])=={OPTIONAL['translation'],OPTIONAL['wiki-lorebook-importer'],OPTIONAL['native-memory-probe']}
    assert all((stage/p).exists() for p in (OPTIONAL['context-keeper'],OPTIONAL['chat-lorebook-manager']))
    assert not (stage/OPTIONAL['translation']).exists()
    assert not (stage/OPTIONAL['native-memory-probe']).exists()

with tempfile.TemporaryDirectory(prefix='qol-custom-background-') as tmp:
    stage=stage_copy(tmp)
    before=(stage/'background-entry.js').read_text()
    # The optional module must be actually owned before deletion; fail closed.
    path=stage/'build/features/context-keeper.json'
    path.write_text(json.dumps({'id':'context-keeper','backgroundFiles':[]}))
    try:mod.plan(stage,{'model-selector'},apply=True)
    except ValueError as e:assert 'not declared' in str(e)
    else:raise AssertionError('Missing ownership contract was accepted')
    assert before==(stage/'background-entry.js').read_text()
    assert (stage/OPTIONAL['context-keeper']).exists()

try:mod.plan(ROOT,{'model-selector'},apply=True)
except ValueError as e:assert 'Never modify' in str(e)
else:raise AssertionError('Pruner accepted Full source checkout')

print('PASS: v0.2.60 optional background modules can be omitted/kept in staged Custom builds without touching Full QoL')

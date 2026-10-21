#!/usr/bin/env python3
"""Offline staging test for two optional, message-only background services."""
from __future__ import annotations
import importlib.util
import json
import re
import shutil
import tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('prune_feature_background',Path(__file__).with_name('prune-feature-background.py'))
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

with tempfile.TemporaryDirectory(prefix='qol-resource-stage-') as tmp:
    stage=Path(tmp)
    original=(ROOT/'background-entry.js').read_text()
    imported=re.findall(r'["\']([^"\']+\.js)["\']', original)
    files=set(imported)|{'background-entry.js','manifest.json','background/feature-message-ownership.js','background/feature-build-profile.js'}
    files.update(p.relative_to(ROOT).as_posix() for p in (ROOT/'build/features').glob('*.json'))
    for relative in files:
        target=stage/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ROOT/relative,target)
    # Opt out of both optional services; shared auto-AFK remains installed.
    selected={'model-selector','opened-chats'}
    result=mod.plan(stage,selected,apply=True)
    assert set(result['removed'])=={'background/background-translation.js','background/background-wiki-fetch.js'}
    updated=(stage/'background-entry.js').read_text()
    assert 'background/background-translation.js' not in updated
    assert 'background/background-wiki-fetch.js' not in updated
    assert updated.count('background/background-auto-afk.js')==1
    assert updated.count('background.js')==1
    assert updated.index('background.js')<updated.index('background/background-events.js')
    assert not (stage/'background/background-translation.js').exists()
    assert not (stage/'background/background-wiki-fetch.js').exists()
    assert json.loads((ROOT/'manifest.json').read_text())['version']==json.loads((stage/'manifest.json').read_text())['version']
    assert (ROOT/'background-entry.js').read_text()==original,'Full source was modified'

with tempfile.TemporaryDirectory(prefix='qol-resource-stage-') as tmp:
    stage=Path(tmp)
    files=set(imported)|{'background-entry.js','manifest.json','background/feature-message-ownership.js','background/feature-build-profile.js'}
    files.update(p.relative_to(ROOT).as_posix() for p in (ROOT/'build/features').glob('*.json'))
    for relative in files:
        target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/relative,target)
    result=mod.plan(stage,{'translation','wiki-lorebook-importer'},apply=True)
    assert result['removed']==[]
    assert (stage/'background-entry.js').read_text()==original
print('PASS: optional background services omitted/included only in disposable stages')

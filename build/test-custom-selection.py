#!/usr/bin/env python3
"""Check selection changes and per-feature update opt-outs."""
import importlib.util
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('selection',(root/'build/update-custom-selection.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
contracts={c['id']:c for p in (root/'build/features').glob('*.json') for c in [json.loads(p.read_text())]}
old={'features':['ooc'],'featureAutoUpdates':{'ooc':True},'updateMode':'manual','notes':'keep me'}
next=module.transform(old,contracts,add=['context-keeper'])
assert next['features']==['context-keeper','ooc']
assert next['featureAutoUpdates']=={'context-keeper':False,'ooc':True}
assert next['updateMode']=='manual' and next['notes']=='keep me'
assert old['features']==['ooc']
assert module.transform(next,contracts,remove=['context-keeper'])['featureAutoUpdates']=={'ooc':True}
try: module.transform({'features':['chat-scene-notes']},contracts)
except ValueError as exc: assert 'reply-instructions' in str(exc)
else: raise AssertionError('Missing dependency accepted')
print('PASS: selection modifications preserve existing preferences, do not turn on updates for new features, and reject missing deps')

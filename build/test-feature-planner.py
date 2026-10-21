#!/usr/bin/env python3
"""Validate feature-closure planning for current modular contracts."""
import importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('plan', ROOT/'build/plan_custom.py')
planner=importlib.util.module_from_spec(spec);spec.loader.exec_module(planner)
result=planner.plan_features(['model-quick-access','chat-lorebook-manager','previously-chatted-indicator'])
assert not result['installable']
assert {'model-selector','opened-chats'}<=set(result['features'])
for fid in ['model-quick-access','chat-lorebook-manager','previously-chatted-indicator']:
    assert f'content/{fid}.js' in result['runtimeScripts']
    assert f'settings/feature-panels/{fid}.js' in result['settingsScripts']
    assert f'content/styles/{fid}.css' in result['stylesheets']
    assert fid in result['blockers']
result=planner.plan_features(['translation','wiki-lorebook-importer'])
assert {'background/background-translation.js','background/background-wiki-fetch.js'}<=set(result['backgroundServices'])
result=planner.plan_features(['ooc'])
assert 'content/styles/ooc.css' in result['stylesheets']
assert 'ooc' in result['blockers']
print('PASS: per-feature Settings/CSS/background planning and dependency closure (preview only)')

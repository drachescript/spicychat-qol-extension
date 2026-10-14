#!/usr/bin/env python3
"""OOC Stage 1 regression check against v47 Full source.

Optional --base points to the previous Full source tree. The checks are read-only.
"""
from __future__ import annotations
import argparse, json, pathlib, re
P=pathlib.Path(__file__).resolve().parent.parent
def verify(base):
    old=(base/'options.js').read_text()
    current=(P/'options.js').read_text()
    moved=(P/'settings/options-ooc.js').read_text().split('\n',2)[2]
    a=old.index('function oocNameFromText(')
    b=old.index('function normalizeBotEditorSnippets(', a)
    assert old[a:b]==moved, 'Moved OOC Settings functions changed behavior'
    expected=old[:a]+'// OOC template/editor helpers live in settings/options-ooc.js.\n\n'+old[b:]
    assert expected==current, 'Non-OOC options.js content was modified'
    assert len(re.findall(r'^function [A-Za-z_]+', moved, re.M))==8
    manifest=json.loads((P/'manifest.json').read_text())
    old_manifest=json.loads((base/'manifest.json').read_text())
    old_manifest['version']=manifest['version']
    assert old_manifest==manifest, 'Full runtime script or CSS ordering changed unexpectedly'
    modules=json.loads((P/'build/modules.json').read_text())
    assert 'settings/options-ooc.js' in modules['runtimeAssets']['options']['required']
    html=(P/'options.html').read_text()
    assert html.index('settings/options-ooc.js') < html.index('src="options.js"')
    assert html.count('settings/options-ooc.js') == 1
    contract=json.loads((P/'build/features/ooc.json').read_text())
    assert contract['customBuildStatus']=='blocked' and contract['fullRuntimeStatus']=='partially-separated'
    print('OOC Full parity passed: 8 Settings functions identical, Full manifest unchanged, prerequisites declared.')
if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--base',type=pathlib.Path,default=pathlib.Path('/mnt/data/qol47_audit'))
    args=ap.parse_args()
    if not args.base.is_dir():
        ap.error('To verify migration parity, supply --base PATH_TO_V47_FULL_SOURCE')
    verify(args.base)

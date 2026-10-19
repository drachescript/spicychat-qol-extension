#!/usr/bin/env python3
"""Fail-closed Custom/Lite audit for three newly separated QoL features.

This verifier deliberately does NOT certify the remaining shared 120-feature
runtime. It verifies physical ownership only where exact contracts are known.
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTRACTS = {
 'model-quick-access': {'runtime':'content/model-quick-access.js','style':'content/styles/model-quick-access.css','panel':'settings/feature-panels/model-quick-access.js','required':['model-selector']},
 'chat-lorebook-manager': {'runtime':'content/chat-lorebook-manager.js','style':'content/styles/chat-lorebook-manager.css','panel':'settings/feature-panels/chat-lorebook-manager.js','required':[]},
 'previously-chatted-indicator': {'runtime':'content/previously-chatted-indicator.js','style':'content/styles/previously-chatted-indicator.css','panel':'settings/feature-panels/previously-chatted-indicator.js','required':['opened-chats']},
}
FEATURE_ID_SOURCE = ROOT/'content/feature-build-map.js'

def inspect(root:Path, selected:set[str]|None=None):
    manifest=json.loads((root/'manifest.json').read_text())
    refs=[path for entry in manifest['content_scripts'] for kind in ('js','css') for path in entry.get(kind,[])]
    options=(root/'options.html').read_text()
    issues=[]
    for path in refs:
        if not (root/path).is_file():issues.append(f'Missing manifest file: {path}')
    missing_panel=re.findall(r'<script\s+src="(settings/feature-panels/[^\"]+)"',options)
    for path in missing_panel:
        if not (root/path).is_file():issues.append(f'Missing Options panel: {path}')
    owners={}
    for id,item in CONTRACTS.items():
        installed=selected is None or id in selected
        check={}
        for label,path in [('runtime',item['runtime']),('style',item['style']),('panel',item['panel'])]:
            on_disk=(root/path).is_file()
            in_manifest=path in refs
            in_options=path in options
            included=(on_disk and (in_options if label=='panel' else in_manifest))
            check[label]=included
            if installed!=included:issues.append(f'{id}: {label} expected {installed}, got {included}')
        if installed and selected is not None:
            for dep in item['required']:
                if dep not in selected and not (root/f'content/{dep}.js').is_file():
                    issues.append(f'{id}: missing required shared feature {dep}')
        owners[id]=check
    # Do not automatically mark arbitrary profiles installable merely because
    # their listed paths exist. Many legacy shared Settings/CSS/background imports
    # still run in the shared kernel.
    return {'schema':'dsq-feature-package-closure/v1','pass':not issues,
            'selectedNewFeatures':sorted(selected) if selected is not None else 'all',
            'newFeatureOwners':owners, 'manifestFilesChecked':len(refs),
            'verifiedScope':'three new feature-owned runtime/settings/style files only',
            'certifiedArbitraryLite':False,
            'unverified':['Shared Settings handlers outside feature-owned panels',
                          'Legacy shared CSS ownership and imported background services',
                          'Arbitrary omitted legacy runtime feature combinations',
                          'SpicyChat authenticated UI/API interaction and Firefox'],
            'issues':issues}

def prune_stage(root:Path, selected:set[str]):
    """Prune only these *three* new opt-in features on a disposable stage."""
    if not (root/'manifest.json').is_file():raise ValueError('No staged manifest')
    if ROOT.resolve()==root.resolve():raise ValueError('Refusing to prune source checkout')
    from importlib.util import spec_from_file_location,module_from_spec
    spec=spec_from_file_location('settings_prune',Path(__file__).with_name('prune-feature-settings.py'))
    mod=module_from_spec(spec);spec.loader.exec_module(mod)
    # Existing legacy panels stay installed as this is a *partial* feature
    # slice only, not a complete Custom Lite build.
    doc=(root/'options.html').read_text()
    all_panels=set(mod.PANEL_TAG.findall(doc))
    kept=(all_panels-set(CONTRACTS)) | selected
    path,updated,_,_=mod.plan(root,kept)
    path.write_text(updated)
    data=json.loads((root/'manifest.json').read_text())
    for item in data['content_scripts']:
        for kind in ('js','css'):
            paths=item.get(kind)
            if paths is not None:
                item[kind]=[p for p in paths if all(id in selected or p not in c.values() for id,c in CONTRACTS.items())]
    (root/'manifest.json').write_text(json.dumps(data,indent=2)+'\n')
    for id,item in CONTRACTS.items():
        if id in selected:continue
        for key in ('runtime','style','panel'):(root/item[key]).unlink(missing_ok=True)
    return inspect(root,selected)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--stage',type=Path,default=ROOT)
    ap.add_argument('--features',help='Comma-separated new feature IDs. Only for --prune-stage')
    ap.add_argument('--prune-stage',action='store_true');args=ap.parse_args()
    selected={x.strip() for x in (args.features or '').split(',') if x.strip()}
    if args.prune_stage and not args.features:ap.error('--features is required')
    if selected-set(CONTRACTS):ap.error('Only audited feature-owned assets can be sliced')
    output=prune_stage(args.stage,selected) if args.prune_stage else inspect(args.stage)
    print(json.dumps(output,indent=2))
    if not output['pass']:raise SystemExit(1)

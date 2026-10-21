#!/usr/bin/env python3
"""Preview a dependency-closed Lite package; NEVER label it installable.

The browser's shared main scheduler, Settings controller and background events
still have undecomposed optional dependencies. This tool audits removable CSS
and background-service candidates without outputting a misleading working ZIP.
"""
import argparse
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def plan(selected):
    registry=json.loads((ROOT/'build/modules.json').read_text())
    bundles=registry['bundles'];order=registry['bundleOrder']
    unknown=set(selected)-set(bundles)
    if unknown: raise ValueError('Unknown bundles: '+', '.join(sorted(unknown)))
    closure={'core'}|set(selected)
    while True:
        after=closure|{need for b in closure for need in bundles[b]['dependsOn']}
        if after==closure: break
        closure=after
    ordered=[b for b in order if b in closure]
    manifest=json.loads((ROOT/'manifest.json').read_text())
    all_scripts=[script for item in manifest['content_scripts'] for script in item.get('js',[])]
    assets=registry['runtimeAssets'];owner={}
    for bundle,paths in assets['styles'].items():
        for path in paths:owner.setdefault(path,set()).add(bundle)
    selected_css=[p for item in manifest['content_scripts'] for p in item.get('css',[]) if owner.get(p,set())&closure]
    skipped_css=[p for item in manifest['content_scripts'] for p in item.get('css',[]) if p not in selected_css]
    retained_services=['background.js','background/background-events.js']
    pruned_services=[]
    for path,descriptor in assets['background']['services'].items():
        (retained_services if set(descriptor.get('bundles',[]))&closure else pruned_services).append(path)
    registered={}
    for b,details in bundles.items():
        for path in details['files']:registered.setdefault(path,set()).add(b)
    selected_scripts=[p for p in all_scripts if p not in registered or registered[p]&closure]
    skipped_scripts=[p for p in all_scripts if p not in selected_scripts]
    # All these graph calculations are preview-only until the shared handlers
    # can be safely stripped/loaded conditionally, not just invoked optionally.
    return {'schema':'dsq-lite-plan/v1','installable':False,'requested':list(selected),'bundles':ordered,
        'contentScripts':selected_scripts,'omittedContentScripts':skipped_scripts,
        'stylesheets':selected_css,'omittedStylesheets':skipped_css,
        'backgroundServices':retained_services,'omittedBackgroundServices':pruned_services,
        'blockers':['Settings options.js still includes feature-specific controllers',
          'background/background-events.js calls optional service globals',
          'main.js scheduler and core startup have not been tested with arbitrary missing feature modules',
          'Early content bridge scripts and dynamic resources require per-bundle review'],
        'note':'Preview only. Do not install or publish this as an extension.'}

def plan_features(feature_ids):
    """Plan the *current* per-feature contract schema, never a build recipe."""
    contracts={}
    for file in sorted((ROOT/'build/features').glob('*.json')):
        contract=json.loads(file.read_text())
        if contract.get('id') != file.stem or file.stem in contracts:
            raise ValueError('Invalid/duplicate feature contract: '+str(file))
        contracts[file.stem]=contract
    unknown=set(feature_ids)-set(contracts)
    if unknown: raise ValueError('Unknown features: '+', '.join(sorted(unknown)))
    closure=set(feature_ids)
    while True:
        additions={dep for fid in closure for dep in contracts[fid].get('dependencies',[])}
        unknown_dependencies=additions-set(contracts)
        if unknown_dependencies:
            raise ValueError('Unknown required feature(s): '+', '.join(sorted(unknown_dependencies)))
        if additions <= closure:break
        closure|=additions
    def assets(key):
        return sorted({p for fid in closure for p in contracts[fid].get(key,[])})
    content_scripts=sorted({contracts[fid]['primary'] for fid in closure if contracts[fid].get('type')=='content'}|
                           {p for fid in closure for p in contracts[fid].get('requiredHelpers',[])})
    background_scripts=sorted({contracts[fid]['primary'] for fid in closure if contracts[fid].get('type')=='background'}|
                              {p for fid in closure for p in contracts[fid].get('backgroundFiles',[])})
    blockers={}
    for fid in sorted(closure):
        c=contracts[fid]
        unfinished=[k for k in ('settingsIsolated','stylesIsolated','backgroundIsolated','browserVerified') if c.get(k) is not True]
        if unfinished: blockers[fid]=unfinished
    result={
        'schema':'dsq-lite-feature-plan/v2',
        'installable':False,
        'requested':list(feature_ids),
        'features':sorted(closure),
        'runtimeScripts':content_scripts,
        'settingsScripts':assets('settingsFiles'),
        'stylesheets':assets('styleFiles'),
        'backgroundServices':background_scripts,
        'sharedDependencies':{fid:contracts[fid].get('requiredHelpers',[]) for fid in sorted(closure)},
        'blockers':blockers,
        'note':'Feature-level dependency/ownership preview only; no arbitrary Custom package is certified.'
    }
    # Fail closed if a physical resource declared by an owner is missing.
    for path in content_scripts+background_scripts+result['settingsScripts']+result['stylesheets']:
        if not (ROOT/path).is_file():raise ValueError('Feature-owned file is missing: '+path)
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--bundles',help='Comma-separated bundle IDs');ap.add_argument('--features',help='Comma-separated feature IDs');ap.add_argument('--output',type=Path);args=ap.parse_args()
    if bool(args.bundles) == bool(args.features): ap.error('Specify exactly one of --bundles or --features')
    data=plan_features([f.strip() for f in args.features.split(',') if f.strip()]) if args.features else plan([b.strip() for b in args.bundles.split(',') if b.strip()])
    payload=json.dumps(data,indent=2)+'\n'
    if args.output:args.output.write_text(payload)
    else:print(payload)
if __name__=='__main__':main()

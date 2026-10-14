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
    contracts={}
    for file in sorted((ROOT/'build/features').glob('*.json')):
        contract=json.loads(file.read_text())
        contracts[contract['id']]=contract
    unknown=set(feature_ids)-set(contracts)
    if unknown: raise ValueError('Unknown features: '+', '.join(sorted(unknown)))
    closure=set(feature_ids)
    while True:
        additions={dep for fid in closure for dep in contracts[fid]['requiredFeatures']}
        if additions <= closure: break
        closure |= additions
    result={
        'schema':'dsq-lite-feature-plan/v1',
        'installable':False,
        'requested':feature_ids,
        'features':sorted(closure),
        'runtimeScripts':sorted({p for fid in closure for p in contracts[fid]['runtimeScripts']}),
        'settingsScripts':sorted({p for fid in closure for p in contracts[fid]['settingsScripts']}),
        'stylesheets':sorted({p for fid in closure for p in contracts[fid]['cssFiles']}),
        'backgroundServices':sorted({p for fid in closure for p in contracts[fid]['backgroundServices']}),
        'sharedDependencies':{fid:contracts[fid]['sharedDependencies'] for fid in sorted(closure)},
        'blockers':{fid:contracts[fid]['blockers'] for fid in sorted(closure) if contracts[fid]['customBuildStatus']!='validated'},
        'note':'Feature-level dependency contract preview only. Do not install or publish as a custom extension.'
    }
    return result

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--bundles',help='Comma-separated bundle IDs');ap.add_argument('--features',help='Comma-separated feature IDs');ap.add_argument('--output',type=Path);args=ap.parse_args()
    if bool(args.bundles) == bool(args.features): ap.error('Specify exactly one of --bundles or --features')
    data=plan_features([f.strip() for f in args.features.split(',') if f.strip()]) if args.features else plan([b.strip() for b in args.bundles.split(',') if b.strip()])
    payload=json.dumps(data,indent=2)+'\n'
    if args.output:args.output.write_text(payload)
    else:print(payload)
if __name__=='__main__':main()

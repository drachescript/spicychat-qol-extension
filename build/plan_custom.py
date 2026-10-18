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
    """Preview 0.2.52 primary/required helper contracts; never certify builds."""
    contracts = {}
    for file in sorted((ROOT / 'build/features').glob('*.json')):
        item = json.loads(file.read_text())
        contracts[item['id']] = item
    unknown = set(feature_ids) - set(contracts)
    if unknown:
        raise ValueError('Unknown features: ' + ', '.join(sorted(unknown)))
    closure = set(feature_ids)
    while True:
        deps = {dep for fid in closure for dep in contracts[fid].get(
            'dependencies', contracts[fid].get('requiredFeatures', []))}
        missing = deps - set(contracts)
        if missing:
            raise ValueError('Missing feature dependency: ' + ', '.join(sorted(missing)))
        if deps <= closure:
            break
        closure |= deps
    def paths(item, new_key, legacy_key):
        if new_key in item:
            return item[new_key]
        return item.get(legacy_key, [])
    scripts = set()
    settings = set()
    styles = set()
    background = set()
    for fid in closure:
        item = contracts[fid]
        if item.get('primary'):
            scripts.add(item['primary'])
        scripts.update(item.get('runtimeScripts', []))
        scripts.update(item.get('requiredHelpers', []))
        settings.update(paths(item, 'settingsFiles', 'settingsScripts'))
        styles.update(paths(item, 'styleFiles', 'cssFiles'))
        background.update(item.get('backgroundFiles', []))
        background.update(item.get('backgroundServices', []))
    return {
        'schema': 'dsq-lite-feature-plan/v2', 'installable': False,
        'requested': feature_ids, 'features': sorted(closure),
        'runtimeScripts': sorted(scripts),
        'settingsScripts': sorted(settings),
        'stylesheets': sorted(styles),
        'backgroundServices': sorted(background),
        'blockers': {fid: 'Browser, Settings and background closure not certified'
                     for fid in sorted(closure)
                     if not all(contracts[fid].get(key) is True for key in
                                ['browserVerified', 'settingsIsolated', 'stylesIsolated', 'backgroundIsolated'])},
        'note': 'Source-only preview. Independent feature package is not browser-validated.'
    }

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--bundles',help='Comma-separated bundle IDs');ap.add_argument('--features',help='Comma-separated feature IDs');ap.add_argument('--output',type=Path);args=ap.parse_args()
    if bool(args.bundles) == bool(args.features): ap.error('Specify exactly one of --bundles or --features')
    data=plan_features([f.strip() for f in args.features.split(',') if f.strip()]) if args.features else plan([b.strip() for b in args.bundles.split(',') if b.strip()])
    payload=json.dumps(data,indent=2)+'\n'
    if args.output:args.output.write_text(payload)
    else:print(payload)
if __name__=='__main__':main()

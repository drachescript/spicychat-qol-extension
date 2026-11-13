#!/usr/bin/env python3
"""Export one declarative, experimental asset index for the Custom website.

The website must apply the same ownership and dependency rules as the Lite
builder. This index does not imply that arbitrary combinations work in browsers.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT/'build/custom-package-index.json'


def make_index():
    manifest = json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    contracts = [json.loads(p.read_text(encoding='utf-8'))
                 for p in sorted((ROOT/'build/features').glob('*.json'))]
    ids = {c['id'] for c in contracts}
    features = []
    for c in contracts:
        dependencies = c.get('dependencies', [])
        missing = set(dependencies) - ids
        if missing:
            raise ValueError(f'{c["id"]}: unknown dependencies: {sorted(missing)}')
        features.append({
            'id': c['id'],
            'defaultSelected': False,
            'defaultUpdatesEnabled': False,
            'dependencies': dependencies,
            'runtime': c['primary'],
            'settings': c.get('settingsFiles', []),
            'styles': c.get('styleFiles', []),
            'background': c.get('backgroundFiles', []),
            'helpers': c.get('requiredHelpers', []),
            'fullyIndependent': bool(all(c.get(key) for key in
                 ('settingsIsolated','stylesIsolated','backgroundIsolated','browserVerified'))),
        })
    return {'schema':'spicychat-qol-custom-package-assets/v1',
            'sourceVersion':manifest.get('version'),
            'status':'experimental-not-browser-certified',
            'preserveSavedSettings':True,
            'newFeaturesDefaultOff':True,
            'sourceOfTruth':'build/features/*.json',
            'features':features}


if __name__=='__main__':
    data=make_index()
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n',encoding='utf-8')
    print(f'Exported {len(data["features"])} feature ownership entries to {OUTPUT.name}')

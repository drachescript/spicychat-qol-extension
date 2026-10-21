#!/usr/bin/env python3
"""Update an experimental Custom recipe without overwriting unrelated prefs.

This is a recipe transformer for the website to adopt later. It never edits
QoL user storage, installs an extension, or enables newly available features.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def transform(existing, contracts, add=(), remove=()):
    result = dict(existing)
    original = existing.get('features', [])
    if not isinstance(original, list) or any(not isinstance(x, str) for x in original):
        raise ValueError('Existing recipe features must be an array of strings')
    selected = set(original)
    add = set(add)
    remove = set(remove)
    unknown = (selected | add | remove) - set(contracts)
    if unknown: raise ValueError(f'Unknown feature(s): {sorted(unknown)}')
    if add & remove: raise ValueError('Cannot add and remove the same feature')
    selected = (selected | add) - remove
    for id in sorted(selected):
        missing = set(contracts[id].get('dependencies', [])) - selected
        if missing:
            raise ValueError(f'{id} needs {sorted(missing)}; add required features explicitly')
    result['features'] = sorted(selected)
    # Existing controls and their explicit choices remain intact; never enable
    # automatic updates just because a feature became available in a new release.
    flags = existing.get('featureAutoUpdates', {})
    if not isinstance(flags, dict): raise ValueError('featureAutoUpdates must be an object')
    result['featureAutoUpdates'] = {id: bool(flags.get(id, False)) for id in sorted(selected)}
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--recipe',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--add',default='')
    p.add_argument('--remove',default='')
    args=p.parse_args()
    if args.recipe.resolve() == args.output.resolve():
        p.error('Output must be separate to avoid modifying your saved recipe without review')
    contracts={c['id']:c for path in (ROOT/'build/features').glob('*.json')
               for c in [json.loads(path.read_text(encoding='utf-8'))]}
    input_data=json.loads(args.recipe.read_text(encoding='utf-8'))
    result=transform(input_data,contracts,
                     [x.strip() for x in args.add.split(',') if x.strip()],
                     [x.strip() for x in args.remove.split(',') if x.strip()])
    args.output.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    print('Wrote an updated recipe with saved feature selections preserved; newly added features remain OFF for auto-update.')

if __name__=='__main__':main()

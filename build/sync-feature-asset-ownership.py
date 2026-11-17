#!/usr/bin/env python3
"""Synchronize explicitly owned Settings panels, styles and background services.

Only known, reviewed single-feature mappings may be repaired automatically.
Shared assets and isolation flags are never inferred or modified. All changes
stay in the local checkout until reviewed/committed by a developer.
"""
import argparse
import json
import re
from pathlib import Path
from background_imports import parse_background_imports

ROOT = Path(__file__).resolve().parents[1]
PANEL_ALIASES = {'automatic-images': 'auto-images'}
STYLE_OWNERS = {
    'persona-manager.css': 'persona-organizer',
    'chat-bubble-themes.css': 'chat-bubbles',
    'bot-organizer.css': 'bot-organizer',
    'android-app.css': 'android-app',
    'memory-vault.css': 'memory-manager',
    'chat-index.css': 'chat-index',
    'rulebook-filter.css': 'rulebook-filter',
    'lorebook-connections.css': 'lorebook-connections',
    'story-reading-layout.css': 'story-reading-layout',
    'pagination.css': 'pagination-tools',
}
# Explicit ownership does NOT establish independent Custom Lite omit-safety.
BACKGROUND_OWNERS = {
    'background/background-auto-afk.js': 'auto-afk',
}


def sync_reviewed_worker_helpers(contracts, manifest, modules):
    """Repair only on-demand workers with an existing, unambiguous feature owner.

    The worker must have a published resource path, its exact feature-name
    primary must reference it, and that primary must have exactly one bundle.
    Unknown ownership and isolation flags are never inferred.
    """
    dynamic = {
        rel for entry in manifest.get('web_accessible_resources', [])
        for rel in entry.get('resources', [])
    }
    added_modules = []
    for rel in sorted(dynamic):
        match = re.fullmatch(r'content/([a-z0-9-]+)-worker\.js', rel)
        if not match:
            continue
        owner = match.group(1)
        entry = contracts.get(owner)
        primary = f'content/{owner}.js'
        if entry is None or entry[1].get('primary') != primary:
            raise ValueError(f'Unreviewed on-demand worker {rel}: no matching primary feature contract')
        if not (ROOT / rel).is_file() or not (ROOT / primary).is_file():
            raise ValueError(f'Worker or feature primary missing for {rel}')
        if rel not in (ROOT / primary).read_text(encoding='utf-8'):
            raise ValueError(f'Worker {rel} is not explicitly referenced by {primary}')

        other_claims = [
            name for name, (_, contract) in contracts.items()
            if name != owner and rel in contract.get('requiredHelpers', [])
        ]
        if other_claims:
            raise ValueError(f'Ambiguous worker ownership for {rel}: {other_claims}')

        primary_bundles = [
            name for name, bundle in modules['bundles'].items()
            if primary in bundle.get('files', [])
        ]
        if len(primary_bundles) != 1:
            raise ValueError(f'Worker {rel}: expected one primary bundle, found {primary_bundles}')
        target = primary_bundles[0]
        worker_bundles = [
            name for name, bundle in modules['bundles'].items()
            if rel in bundle.get('files', [])
        ]
        if worker_bundles and worker_bundles != [target]:
            raise ValueError(f'Worker {rel}: conflicting module ownership {worker_bundles}')
        if not worker_bundles:
            files = modules['bundles'][target]['files']
            files.insert(files.index(primary) + 1, rel)
            added_modules.append(rel)
        contract = entry[1]
        contract['requiredHelpers'] = sorted(set(contract.get('requiredHelpers', [])) | {rel})
    return added_modules


def sync_manifest_content_modules(manifest, modules):
    """Register unambiguous content scripts flanked by the same owned bundle.

    Only explicit manifest content_scripts are eligible. Both surrounding
    scripts must already have exactly the same single owner. Ambiguous and
    standalone entries remain untouched for human review.
    """
    owners = {}
    for name, bundle in modules['bundles'].items():
        for rel in bundle.get('files', []):
            owners.setdefault(rel, set()).add(name)
    added = []
    for block in manifest.get('content_scripts', []):
        paths = block.get('js', [])
        i = 0
        while i < len(paths):
            rel = paths[i]
            if owners.get(rel) or not re.fullmatch(r'content/[A-Za-z0-9_-]+\.js', rel):
                i += 1
                continue
            start = i
            while (i < len(paths) and not owners.get(paths[i])
                   and re.fullmatch(r'content/[A-Za-z0-9_-]+\.js', paths[i])):
                i += 1
            candidates = paths[start:i]
            if start == 0 or i == len(paths):
                continue
            left, right = paths[start - 1], paths[i]
            left_owners = owners.get(left, set())
            if len(left_owners) != 1 or left_owners != owners.get(right, set()):
                continue
            bundle = next(iter(left_owners))
            files = modules['bundles'][bundle]['files']
            if files.index(left) >= files.index(right):
                # Different source/manifest ordering requires manual review.
                continue
            for candidate in candidates:
                if not (ROOT / candidate).is_file():
                    raise ValueError(f'Manifest content script missing on disk: {candidate}')
            files[files.index(right):files.index(right)] = candidates
            for candidate in candidates:
                owners[candidate] = {bundle}
            added.extend(candidates)
    return added


def sync_shared_options_assets(modules):
    """Register real, unconditionally loaded Settings JS (never feature panels)."""
    html = (ROOT / 'options.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script\b[^>]*\bsrc=["\x27]([^"\x27]+)["\x27]', html)
    required = modules['runtimeAssets']['options']['required']
    added = []
    for index, rel in enumerate(scripts):
        if rel.startswith('settings/feature-panels/'):
            continue  # Opt-in panels must never be forced into Lite.
        if not re.fullmatch(r'settings/[A-Za-z0-9_./-]+\.js', rel):
            continue
        if '..' in Path(rel).parts:
            raise ValueError(f'Unsafe Settings script path: {rel}')
        if rel in required:
            continue
        if not (ROOT / rel).is_file():
            raise ValueError(f'Settings page script missing on disk: {rel}')
        # Follow actual HTML ordering, including scripts after options.js.
        next_known = next((path for path in scripts[index + 1:] if path in required), None)
        position = required.index(next_known) if next_known else len(required)
        required.insert(position, rel)
        added.append(rel)
    return added


def scan(write=True):
    contracts = {p.stem: (p, json.loads(p.read_text(encoding='utf-8')))
                 for p in (ROOT / 'build/features').glob('*.json')}
    claimed = {}
    changed = []
    for file in sorted((ROOT / 'settings/feature-panels').glob('*.js')):
        owner = PANEL_ALIASES.get(file.stem, file.stem)
        if owner not in contracts:
            raise ValueError(
                f'Unclaimed Settings panel: {file.relative_to(ROOT)}; '
                f'add a reviewed build/features/{owner}.json contract. '
                'No ownership was guessed.'
            )
        rel = file.relative_to(ROOT).as_posix()
        contract = contracts[owner][1]
        contract['settingsFiles'] = sorted(set(contract.get('settingsFiles', [])) | {rel})
        claimed[rel] = owner

    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    loaded_css = {x for entry in manifest.get('content_scripts', []) for x in entry.get('css', [])}
    for name, owner in STYLE_OWNERS.items():
        if owner not in contracts:
            raise ValueError(f'Unknown CSS owner {owner}: {name}')
        rel = f'content/styles/{name}'
        if rel not in loaded_css or not (ROOT / rel).is_file():
            raise ValueError(f'CSS owner not used by Full: {rel}')
        contract = contracts[owner][1]
        contract['styleFiles'] = sorted(set(contract.get('styleFiles', [])) | {rel})
        claimed[rel] = owner

    entry = (ROOT / 'background-entry.js').read_text(encoding='utf-8')
    imports = set(parse_background_imports(entry))
    for rel, owner in BACKGROUND_OWNERS.items():
        if owner not in contracts:
            raise ValueError(f'Unknown background service owner {owner}: {rel}')
        if rel not in imports or not (ROOT / rel).is_file():
            raise ValueError(f'Background service not imported by Full: {rel}')
        contract = contracts[owner][1]
        contract['backgroundFiles'] = sorted(set(contract.get('backgroundFiles', [])) | {rel})
        claimed[rel] = owner

    modules_path = ROOT / 'build/modules.json'
    modules = json.loads(modules_path.read_text(encoding='utf-8'))
    added_modules = sync_reviewed_worker_helpers(contracts, manifest, modules)
    added_content_modules = sync_manifest_content_modules(manifest, modules)
    added_options_assets = sync_shared_options_assets(modules)
    if write and (added_modules or added_content_modules or added_options_assets):
        modules_path.write_text(json.dumps(modules, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    for owner, (path, contract) in contracts.items():
        existing = json.loads(path.read_text(encoding='utf-8'))
        if contract != existing:
            if write:
                path.write_text(json.dumps(contract, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            changed.append(owner)
    return {
        'contracts': len(contracts),
        'panelFiles': len(list((ROOT / 'settings/feature-panels').glob('*.js'))),
        'claimedPanelFiles': sum(1 for p in claimed if p.startswith('settings/')),
        'newlyOwnedStyles': len(STYLE_OWNERS),
        'ownedBackgroundServices': len(BACKGROUND_OWNERS),
        'changedContracts': sorted(changed),
        'addedModuleWorkers': added_modules,
        'addedContentModules': added_content_modules,
        'addedOptionsAssets': added_options_assets,
        'remainingSharedCss': sorted(
            loaded_css
            - {p for p in claimed if p.startswith('content/styles/')}
            - {x for _, contract in contracts.values()
               for x in contract.get('styleFiles', [])}
        ),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true',
                        help='Check that known asset declarations are already synchronized')
    args = parser.parse_args()
    result = scan(write=not args.verify)
    if args.verify and (result['changedContracts'] or result['addedModuleWorkers'] or
                        result['addedContentModules'] or result['addedOptionsAssets']):
        raise SystemExit('Ownership declarations out of sync: contracts=' +
                         ', '.join(result['changedContracts']) +
                         '; moduleWorkers=' + ', '.join(result['addedModuleWorkers']) +
                         '; contentModules=' + ', '.join(result['addedContentModules']) +
                         '; optionsAssets=' + ', '.join(result['addedOptionsAssets']) +
                         '\nRun python3 build/sync-feature-asset-ownership.py and commit its output.')
    print(json.dumps(result, indent=2))

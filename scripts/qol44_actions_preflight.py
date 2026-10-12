#!/usr/bin/env python3
"""Locally patch and test v0.2.44 GitHub Actions packaging after root cleanup.

Never calls git/GitHub, commits, pushes, tags, or publishes.
Run from anywhere:
    python scripts/qol44_actions_preflight.py --apply --test

Creates timestamped backups under dev_build/actions-preflight-backups/.
Testing builds four ZIPs under dev_build/actions-preflight-test/ only.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = {
    '.github/workflows/dev-build.yml': ('Validate development package structure', None),
    '.github/workflows/rebuild-current-release.yml': ('Validate release package structure', "steps.rebuild.outputs.rebuild == 'true'"),
    '.github/workflows/release.yml': ('Validate release package structure', "steps.release.outputs.publish == 'true'"),
}


def replace_exact(data: str, old: str, new: str, where: str) -> str:
    if new in data:
        return data
    count = data.count(old)
    if count != 1:
        raise ValueError(f'{where}: expected one matching source block, found {count}: {old[:100]!r}')
    return data.replace(old, new, 1)


def change_builder(original: str) -> str:
    file = 'scripts/build_extension.py'
    data = original
    data = replace_exact(data, 'import json\n', 'import json\nimport re\n', file)
    old = '    manifest["background"] = {"service_worker": "background.js"}'
    new = '    manifest["background"] = {"service_worker": source["background"]["service_worker"]}'
    data = replace_exact(data, old, new, file)

    anchor = '\ndef chrome_manifest(source: dict, dev: bool, profile: dict) -> dict:'
    helper = '''\ndef background_script_imports() -> list[str]:
    """Return static worker imports for Firefox's classic background scripts.

    Never load background-entry.js directly as a Firefox page script because it
    calls importScripts, which is worker-only. Load its dependencies in order.
    """
    entry = (ROOT / "background-entry.js").read_text(encoding="utf-8-sig")
    match = re.search(r"\\bimportScripts\\s*\\(([^;]*)\\)", entry, flags=re.S)
    if match is None:
        raise SystemExit("background-entry.js has no static importScripts list")
    imports = re.findall(r"[\\\"']([^\\\"']+\\.js)[\\\"']", match.group(1))
    if not imports or imports[0] != "background.js":
        raise SystemExit("background-entry.js must import background.js first")
    return imports

'''
    if 'def background_script_imports()' not in data:
        data = replace_exact(data, anchor, helper + anchor, file)

    data = replace_exact(data, '    manifest["background"] = {"scripts": ["background.js"]}',
                         '    manifest["background"] = {"scripts": background_script_imports()}', file)

    old_required = '''    missing = [rel for rel in required if not (ROOT / rel).exists()]'''
    new_required = '''    required.append("background-entry.js")
    required.extend(background_script_imports())
    runtime_assets = load_modules().get("runtimeAssets", {})
    for section in ("background", "options"):
        required.extend(runtime_assets.get(section, {}).get("required", []))
    missing = [rel for rel in dict.fromkeys(required) if not (ROOT / rel).exists()]'''
    data = replace_exact(data, old_required, new_required, file)
    return data


def workflow_validator_step(guard: str | None) -> str:
    guard_line = f"        if: {guard}\n" if guard else ''
    return ("      - name: Verify modular runtime in Chrome and Firefox ZIPs\n"
            + guard_line
            + '        shell: bash\n'
            + '        run: python3 scripts/verify_release_packages.py dist/*-chrome.zip dist/*-firefox.zip\n\n')


def change_workflow(path: str, original: str) -> str:
    data = original
    validator_heading, guard = WORKFLOWS[path]
    # v0.2.44 worker loader must remain the actual manifest entry.
    data = data.replace('get("service_worker") != "background.js"',
                        'get("service_worker") != "background-entry.js"')
    data = data.replace('service worker is not background.js',
                        'service worker is not background-entry.js')
    # Include the actual modular JS in Node syntax checks, not only manifest content scripts.
    old = '          files = {"background.js", "options.js", "popup.js"}'
    new = '''          modules = json.loads(Path("build/modules.json").read_text(encoding="utf-8"))
          files = {"background-entry.js", "background.js", "options.js", "popup.js", "shared/sync-service.js", "popup/popup-version.js"}
          for section in ("background", "options"):
              files.update(rel for rel in modules.get("runtimeAssets", {}).get(section, {}).get("required", []) if rel.endswith(".js"))'''
    data = replace_exact(data, old, new, path)

    # Add a much stronger ZIP check before the existing structure validation.
    if 'scripts/verify_release_packages.py' not in data:
        target = f'      - name: {validator_heading}\n'
        data = replace_exact(data, target, workflow_validator_step(guard) + target, path)

    if path.endswith('/release.yml'):
        # GitHub tag filters use glob syntax; the old '+' is not a numeric regexp quantifier.
        data = replace_exact(data, '      - "v[0-9]+.[0-9]+.[0-9]+"',
                             '      - "v*.*.*"', path)
    return data


MOVED_ROOT = {
    'background-events.js': 'background/background-events.js',
    'background-translation.js': 'background/background-translation.js',
    'bot-status-storage-cleanup.js': 'background/bot-status-storage-cleanup.js',
    'options-reading-accessibility.js': 'settings/options-reading-accessibility.js',
    'options-section-navigation.js': 'settings/options-section-navigation.js',
    'options-settings-defaults.js': 'settings/options-settings-defaults.js',
    'options-soundscapes.js': 'settings/options-soundscapes.js',
    'options-tab-cleanup.js': 'settings/options-tab-cleanup.js',
    'feature-registry.js': 'shared/feature-registry.js',
    'platform-capabilities.js': 'shared/platform-capabilities.js',
    'storage-metrics.js': 'shared/storage-metrics.js',
    'sync-service.js': 'shared/sync-service.js',
    'popup-version.js': 'popup/popup-version.js',
}


def change_modules(original: str) -> str:
    changed = original
    for old, new in MOVED_ROOT.items():
        changed = changed.replace('"' + old + '"', '"' + new + '"')
    json.loads(changed)
    return changed


def change_changelog(original: str) -> str:
    bullet = '- Fixed automatic Chrome and Firefox development and release builds after the root folder cleanup.\n'
    if bullet in original:
        return original
    heading = re.search(r'(?m)^## 0\.2\.44\s*\n', original)
    if not heading:
        raise ValueError('CHANGELOG.md must have an exact "## 0.2.44" heading')
    return original[:heading.end()] + bullet + original[heading.end():]


def validate_inputs() -> None:
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('version') != '0.2.44':
        raise ValueError('Expected manifest version 0.2.44; refusing to edit another version')
    if manifest.get('background', {}).get('service_worker') != 'background-entry.js':
        raise ValueError('Expected background-entry.js service worker in source manifest')
    for rel in ['scripts/verify_release_packages.py', 'background-entry.js',
                'background/background-translation.js', 'background/background-events.js',
                'shared/platform-capabilities.js', 'options.html', 'popup.html']:
        if not (ROOT / rel).is_file():
            raise ValueError('Required local file missing: ' + rel)


def test_local_builds() -> None:
    out = ROOT / 'dev_build' / 'actions-preflight-test'
    out.mkdir(parents=True, exist_ok=True)
    builder = [sys.executable, str(ROOT / 'scripts/build_extension.py'), '--profile', 'full']
    validator = [sys.executable, str(ROOT / 'scripts/verify_release_packages.py')]
    for args in [['--verify-only'], ['--dev', '--output-dir', str(out)], ['--output-dir', str(out)]]:
        subprocess.run(builder + args, cwd=ROOT, check=True)
    required = [out / 'spicychat-qol-dev-chrome.zip',
                out / 'spicychat-qol-dev-firefox.zip',
                out / 'spicychat-qol-v0.2.44-chrome.zip',
                out / 'spicychat-qol-v0.2.44-firefox.zip']
    subprocess.run(validator + [str(f) for f in required], cwd=ROOT, check=True)
    print('Local dev + stable Chrome/Firefox ZIP checks passed.')
    print('This does not publish anything or replace dist/ release assets.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply edits to local working tree with backups')
    parser.add_argument('--test', action='store_true', help='After applying, build and verify four local ZIPs')
    args = parser.parse_args()
    validate_inputs()

    paths = ['scripts/build_extension.py', 'build/modules.json', 'CHANGELOG.md'] + list(WORKFLOWS)
    changed: dict[str, str] = {}
    originals: dict[str, str] = {}
    for name in paths:
        path = ROOT / name
        if not path.is_file():
            raise ValueError('Missing local repository file: ' + name)
        original = path.read_text(encoding='utf-8-sig')
        updated = (change_builder(original) if name == 'scripts/build_extension.py' else
                   change_modules(original) if name == 'build/modules.json' else
                   change_changelog(original) if name == 'CHANGELOG.md' else
                   change_workflow(name, original))
        originals[name] = original
        if updated != original:
            changed[name] = updated

    # All validation happens before writing the first file.
    updated_modules = json.loads(changed.get('build/modules.json', originals['build/modules.json']))
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8-sig'))
    manifest_files = set()
    for item in manifest.get('content_scripts', []):
        manifest_files.update(item.get('js', []))
    for item in manifest.get('web_accessible_resources', []):
        manifest_files.update(item.get('resources', []))
    bundle_files = {f for bundle in updated_modules['bundles'].values() for f in bundle.get('files', [])}
    if manifest_files != bundle_files:
        raise ValueError('manifest/modules coverage mismatch! Missing: ' + str(sorted(manifest_files - bundle_files)) + '; extra: ' + str(sorted(bundle_files - manifest_files)))

    print('Preflight changes:', ', '.join(changed) if changed else 'none (already patched)')
    if not args.apply:
        print('PREVIEW ONLY. To update files locally, run with --apply --test.')
        return 0
    if changed:
        backup_dir = ROOT / 'dev_build' / 'actions-preflight-backups' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
        for name, text in changed.items():
            backup = backup_dir / name
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_text(originals[name], encoding='utf-8')
        for name, text in changed.items():
            (ROOT / name).write_text(text, encoding='utf-8', newline='\n')
        print('Updated files locally. Original copies in:', backup_dir)
    if args.test:
        test_local_builds()
    print('No GitHub operations performed. Please inspect changes before committing or pushing.')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, subprocess.CalledProcessError) as exc:
        print('ERROR:', exc, file=sys.stderr)
        sys.exit(1)

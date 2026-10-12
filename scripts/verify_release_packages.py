#!/usr/bin/env python3
"""Verify the actual Chrome/Firefox ZIP runtime closure before any GitHub release.

Only reads files; does not alter the repository or use the network.
Examples:
  python scripts/verify_release_packages.py dist/spicychat-qol-dev-*.zip
  python scripts/verify_release_packages.py dist/spicychat-qol-v0.2.44-*.zip
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]


class LocalAssets(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paths: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == 'script' and attributes.get('src'):
            self.paths.append(attributes['src'])
        if tag == 'link' and attributes.get('href'):
            rel = (attributes.get('rel') or '').lower()
            if 'stylesheet' in rel or 'icon' in rel:
                self.paths.append(attributes['href'])


def local_path(value: str) -> str | None:
    if not value or value.startswith(('#', '/', '//', 'data:', 'blob:')):
        return None
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return None
    path = unquote(parts.path).replace('\\', '/')
    if not path or path.startswith('../') or '/..' in path or path.startswith('/'):
        return None
    return path.removeprefix('./')


def extract_imports(code: str) -> list[str]:
    # This entry point uses one static importScripts() call.
    matches = re.findall(r'\bimportScripts\s*\(([^;]*)\)', code, flags=re.S)
    imports: list[str] = []
    for args in matches:
        imports.extend(re.findall(r'''["']([^"']+\.js)["']''', args))
    return imports


def verify(path: Path, source_manifest: dict, modules: dict) -> int:
    problems: list[str] = []
    with zipfile.ZipFile(path) as archive:
        bad_member = archive.testzip()
        if bad_member:
            problems.append('corrupt ZIP member: ' + bad_member)
        names = archive.namelist()
        available = set(names)
        if len(names) != len(available):
            problems.append('duplicate ZIP entries')

        def require(rel: str, reason: str = 'required resource') -> None:
            if rel not in available:
                problems.append(f'{reason}: {rel}')

        require('manifest.json')
        if 'manifest.json' not in available:
            raise ValueError(f'{path}: manifest.json missing')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest.get('version') != source_manifest.get('version'):
            problems.append(f"wrong version {manifest.get('version')!r}")

        for rel in ['background-entry.js', 'background.js', 'options.html', 'options.js', 'popup.html', 'popup.js', 'CHANGELOG.md']:
            require(rel)
        for section in ('background', 'options'):
            for rel in modules.get('runtimeAssets', {}).get(section, {}).get('required', []):
                require(rel, f'{section} dependency')

        for script in manifest.get('content_scripts', []):
            for rel in script.get('js', []) + script.get('css', []):
                require(rel, 'content script/style')
        for entry in manifest.get('web_accessible_resources', []):
            for rel in entry.get('resources', []):
                if '*' not in rel:
                    require(rel, 'web accessible resource')

        for rel in ['options.html', 'popup.html']:
            if rel not in available:
                continue
            parser = LocalAssets()
            parser.feed(archive.read(rel).decode('utf-8-sig'))
            for ref in parser.paths:
                local = local_path(ref)
                if local:
                    require(local, f'{rel} HTML resource')

        for field in ('options_page',):
            if manifest.get(field):
                require(manifest[field], f'manifest {field}')
        popup = manifest.get('action', {}).get('default_popup')
        if popup:
            require(popup, 'manifest popup')
        for rel in manifest.get('icons', {}).values():
            require(rel, 'manifest icon')

        import_order = extract_imports(archive.read('background-entry.js').decode('utf-8')) if 'background-entry.js' in available else []
        if not import_order or import_order[0] != 'background.js':
            problems.append('background-entry.js does not import background.js first')
        for rel in import_order:
            require(rel, 'background entry import')

        is_firefox = '-firefox.zip' in path.name.lower()
        if not is_firefox and '-chrome.zip' not in path.name.lower():
            problems.append('package filename must end with -chrome.zip or -firefox.zip')
        if is_firefox:
            declared = manifest.get('background', {}).get('scripts')
            if declared != import_order:
                problems.append(f'Firefox background scripts wrong/order mismatch: {declared!r} != {import_order!r}')
            if not manifest.get('browser_specific_settings', {}).get('gecko', {}).get('id'):
                problems.append('Firefox Gecko extension ID missing')
        else:
            declared = manifest.get('background', {}).get('service_worker')
            expected = source_manifest.get('background', {}).get('service_worker')
            if declared != expected or declared != 'background-entry.js':
                problems.append(f'Chrome background service worker wrong: {declared!r}, expected {expected!r}')
            if manifest.get('browser_specific_settings'):
                problems.append('Chrome manifest unexpectedly includes Firefox settings')

    if problems:
        print(f'FAIL {path}:')
        for problem in problems:
            print(f'  - {problem}')
        return 1
    print(f'PASS {path}: {len(names)} ZIP members, modular runtime and page dependencies resolve')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packages', nargs='+', type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8-sig'))
    modules = json.loads((ROOT / 'build/modules.json').read_text(encoding='utf-8-sig'))
    status = 0
    for package in args.packages:
        if not package.is_file():
            print(f'FAIL missing package: {package}')
            status = 1
            continue
        try:
            status |= verify(package, manifest, modules)
        except Exception as ex:
            print(f'FAIL {package}: {ex}')
            status = 1
    return status


if __name__ == '__main__':
    sys.exit(main())

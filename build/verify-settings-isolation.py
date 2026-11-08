#!/usr/bin/env python3
"""Source-level regression checks for Full QoL / Custom Settings feature boundaries.

Does not claim full browser verification. Run from repository root with
`python build/verify-settings-isolation.py`.
"""
from __future__ import annotations
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PANELS = ('model-selector', 'generation-profiles', 'generation-metadata',
          'premium-notifications', 'text-replacements', 'scroll-to-top',
          'message-options', 'chat-export', 'language-filter',
          'chat-tags', 'creation-audit', 'recommendation-helpers',
          'saved-snippets', 'tags-nsfw', 'tag-aliases', 'local-tag-matching',
          'bot-organizer', 'my-creations-filters', 'bot-editor-snippets',
          'chat-bubbles', 'android-app', 'quick-panel', 'smart-filter-presets',
          'auto-afk', 'top-bar', 'sidebar',
          'accessibility', 'chat-width-controls', 'list-fill', 'pagination-tools',
          'rulebook-diagnostics', 'story-reading-layout', 'chat-list')
MULTI_MOUNTS = {'android-app': 2, 'quick-panel': 4, 'top-bar': 2}

def check() -> list[str]:
    errors = []
    html = (ROOT/'options.html').read_text(encoding='utf-8')
    owners = (ROOT/'settings/feature-setting-owners.js').read_text(encoding='utf-8')
    mapping = {
        key: set(re.findall(r'"([A-Za-z][\w]*)"', fields))
        for key, fields in re.findall(r'"([\w-]+)"\s*:\s*\[([^\]]*)\]', owners, re.S)
    }
    ids = Counter(re.findall(r'\bid=["\']([^"\']+)["\']', html))
    # Avoid regressing the duplicate Daily Message Limit mount.
    if ids['ds-feature-panel-daily-message-limit'] != 1:
        errors.append('Daily Message Limit must have exactly one Settings mount')
    autosave = (ROOT/'settings/features/options-settings-autosave.js').read_text(encoding='utf-8')
    loader = (ROOT/'settings/features/options-settings-load.js').read_text(encoding='utf-8')
    for feature in PANELS:
        count = MULTI_MOUNTS.get(feature, 1)
        for i in range(count):
            mount = f'ds-feature-panel-{feature}' + (f'-{i + 1}' if count > 1 else '')
            if ids[mount] != 1:
                errors.append(f'{mount} has {ids[mount]} mounts; expected one')
        script = f'settings/feature-panels/{feature}.js'
        if html.count(f'<script src="{script}"></script>') != 1:
            errors.append(f'{script} must be loaded once in Full Settings')
        if not (ROOT/script).is_file():
            errors.append(f'Missing owned panel: {script}')
            continue
        content = (ROOT/script).read_text(encoding='utf-8')
        contract_path = ROOT/f'build/features/{feature}.json'
        if not contract_path.is_file():
            errors.append(f'Missing Custom feature contract: {contract_path}')
            continue
        contract = json.loads(contract_path.read_text(encoding='utf-8'))
        keys = set(contract.get('settingsKeys', []))
        owned = mapping.get(feature, set())
        if not keys or not keys.issubset(owned):
            errors.append(f'{feature}: contract settingsKeys do not match owned Settings')
        if script not in contract.get('settingsFiles', []):
            errors.append(f'{feature}: Custom contract missing Settings module')
        if contract.get('browserVerified') is True:
            errors.append(f'{feature}: source checks must not claim browser verification')
        if f"!profile.features.includes(\"{feature}\")" not in content:
            errors.append(f'{feature}: omitted-feature guard missing')
        if 'document.createElement(' not in content or 'host.replaceWith(' not in content:
            errors.append(f'{feature}: panel should create owned DOM independently')
        for key in keys:
            if f'readers["{key}"]' not in content or f'loaders["{key}"]' not in content:
                errors.append(f'{feature}: no paired load/save handler for {key}')
            if re.search(r'^\s*'+re.escape(key)+r'\s*:', autosave, re.M) or f'case "{key}":' in autosave:
                errors.append(f'{feature}: {key} still serialized in common Settings controller')
            if re.search(r'^\s*set(?:Checked|Value)\("'+re.escape(key)+r'"\s*,', loader, re.M):
                errors.append(f'{feature}: {key} still loaded in common Settings controller')
    if ids['ds-feature-panel-model-quick-access'] != 1:
        errors.append('Quick Access needs its own mount, even without the Model Selector')
    for tag, script in re.findall(r'<(script|link)\b[^>]*?(?:src|href)="([^"]+)"', html):
        if script.startswith(('http:', 'https:', 'data:')) or script.startswith('#'):
            continue
        if not (ROOT/script).is_file():
            errors.append(f'Missing Settings {tag}: {script}')
    manifest = json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    if manifest['version'] != '0.2.74':
        errors.append('Expected 0.2.74 manifest version')
    if any(not (ROOT/file).is_file() for entry in manifest.get('content_scripts', []) for kind in ('js','css') for file in entry.get(kind, [])):
        errors.append('Some manifest assets are missing')
    return errors

if __name__ == '__main__':
    problems = check()
    if problems:
        print('\n'.join('FAIL: '+p for p in problems))
        sys.exit(1)
    print('Settings isolation: mount, contract, load/save, feature exclusion and manifest checks passed.')

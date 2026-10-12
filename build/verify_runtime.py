#!/usr/bin/env python3
"""Validate the Full manifest against modular source declarations.

Run from any directory: python build/verify_runtime.py
This checks source completeness/ordering; it does not promise a Custom build works.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
MODULES = json.loads((ROOT / 'build/modules.json').read_text(encoding='utf-8'))
errors = []

def check_file(path, reason):
    if not isinstance(path, str) or path.startswith('/') or '..' in Path(path).parts:
        errors.append(f'{reason}: unsafe file path {path!r}')
    elif not (ROOT / path).is_file():
        errors.append(f'{reason}: missing {path}')

def ordered(before, after, seq, reason):
    if before not in seq or after not in seq or seq.index(before) >= seq.index(after):
        errors.append(f'{reason}: expected {before} before {after}')

bundles = MODULES.get('bundles', {})
order = MODULES.get('bundleOrder', [])
for key in order:
    bundle = bundles.get(key)
    if not bundle:
        errors.append(f'unknown declared bundle: {key}')
        continue
    for parent in bundle.get('dependsOn', []):
        if parent not in bundles or (parent in order and order.index(parent) >= order.index(key)):
            errors.append(f'{key}: invalid dependency {parent}')
    for file in bundle.get('files', []):
        check_file(file, f'bundle {key}')

registered = {}
for key, bundle in bundles.items():
    for file in bundle.get('files', []):
        registered.setdefault(file, []).append(key)
for file, groups in registered.items():
    if len(groups) != 1 and sorted(groups) != sorted(MODULES.get("sharedBundleFiles", {}).get(file, [])):
        errors.append(f'duplicate module without shared declaration: {file} in {groups}')

content_scripts = MANIFEST.get('content_scripts', [])
for group in content_scripts:
    for file in group.get('js', []): check_file(file, 'manifest script')
    for file in group.get('css', []): check_file(file, 'manifest CSS')

all_js = [file for group in content_scripts for file in group.get('js', [])]
# Document-start bridges run before the content runtime and are intentionally outside the feature bundles.
EARLY = {'content/card-token-main.js', 'content/card-token-auth-loader.js', 'content/exact-message-counts-loader.js', 'content/generation-metadata-loader.js'}
for file in all_js:
    if file not in EARLY and file not in registered:
        errors.append(f'manifest script not in bundle registry: {file}')
dynamic = {item for block in MANIFEST.get("web_accessible_resources", []) for item in block.get("resources", [])}
for file in registered:
    if file not in all_js and file not in dynamic:
        errors.append(f'bundle script not in Full manifest or dynamic resources: {file}')

late = next((g.get('js', []) for g in content_scripts if 'content/main.js' in g.get('js', [])), [])
for a, b in [
    ('content/core-settings-defaults.js', 'content/core.js'),
    ('content/core.js', 'content/core-storage-writers.js'),
    ('content/core-storage-writers.js', 'content/main.js'),
    ('content/main-page-observer.js', 'content/main.js'),
    ('content/main-diagnostics.js', 'content/main.js'),
    ('content/main.js', 'content/main-startup.js'),
]: ordered(a,b,late,'Full content runtime')

assets = MODULES.get('runtimeAssets', {})
for area in ['background', 'options']:
    for file in assets.get(area, {}).get('required', []): check_file(file, f'{area} required asset')
css_declared = set()
for bundle, paths in assets.get('styles', {}).items():
    if bundle not in bundles: errors.append(f'CSS references unknown bundle {bundle}')
    for file in paths:
        check_file(file, f'CSS for {bundle}')
        css_declared.add(file)
css_manifest = set(file for group in content_scripts for file in group.get('css', []))
for file in css_manifest - css_declared: errors.append(f'CSS not mapped to any bundle: {file}')
for file in css_declared - css_manifest: errors.append(f'CSS not loaded in Full manifest: {file}')

html = (ROOT / 'options.html').read_text(encoding='utf-8')
options_scripts = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
options_css = re.findall(r'<link[^>]+href=["\']([^"\']+\.css)["\']', html)
for file in options_scripts + options_css: check_file(file, 'Settings page')
ordered('options-settings-defaults.js','options-reading-accessibility.js',options_scripts,'Settings page')
ordered('options-reading-accessibility.js','options-section-navigation.js',options_scripts,'Settings page')
ordered('options-section-navigation.js','options-tab-cleanup.js',options_scripts,'Settings page')
ordered('options-tab-cleanup.js','options-soundscapes.js',options_scripts,'Settings page')
ordered('options-soundscapes.js','options.js',options_scripts,'Settings page')
# The declared runtime assets must match the files the Full extension really loads.
# This catches omissions that can otherwise survive a successful release check.
options_runtime = MODULES.get('runtimeAssets', {}).get('options', {}).get('required', [])
for file in options_scripts + options_css:
    if file not in options_runtime:
        errors.append(f'Settings asset not registered: {file}')
for file in options_runtime:
    if file not in options_scripts + options_css and file not in {'options.html', 'bot-status-storage-cleanup.js'}:
        errors.append(f'Settings registered asset not loaded by options.html: {file}')
if len(options_runtime) != len(set(options_runtime)):
    errors.append('Settings assets have duplicates')

entry = (ROOT / 'background-entry.js').read_text(encoding='utf-8')
asserted_imports = re.findall(r'"([a-zA-Z0-9-]+\.js)"', entry)
ordered('background.js','background-translation.js',asserted_imports,'background entry')
ordered('background-translation.js','background-events.js',asserted_imports,'background entry')
for file in asserted_imports: check_file(file, 'background import')
background_runtime = MODULES.get('runtimeAssets', {}).get('background', {}).get('required', [])
for file in asserted_imports + ['background-entry.js']:
    if file not in background_runtime:
        errors.append(f'Background asset not registered: {file}')
for file in background_runtime:
    if file not in asserted_imports + ['background-entry.js', 'bot-status-storage-cleanup.js']:
        errors.append(f'Background registered asset not imported: {file}')
if len(background_runtime) != len(set(background_runtime)):
    errors.append('Background assets have duplicates')

if errors:
    print(f'Runtime verification failed ({len(errors)} issue(s)):')
    for error in errors: print('  -', error)
    sys.exit(1)
print(f'Runtime verification passed: {len(all_js)} registered scripts, {len(css_manifest)} CSS files, {len(bundles)} bundles.')
print('Note: this checks Full source wiring only; actual Custom bundle execution still needs integration tests.')

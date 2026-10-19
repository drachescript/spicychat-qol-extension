#!/usr/bin/env python3
"""Physically omit unselected feature-owned Settings panels from a STAGED Lite build.

This is only the Settings-markup packaging phase, not a general Lite packager
or a certification of Settings controller isolation. It intentionally touches
only scripts inside settings/feature-panels/ and their generated host slots.

Example (on a copied/staged extension directory):
    python build/prune-feature-settings.py --package-root /tmp/qol-lite-stage \
        --features chat-search,focus-mode

The caller must independently generate the correct build profile, resolve
runtime dependencies and prune the corresponding runtime/CSS/background files.
"""
import argparse
import json
import re
from pathlib import Path

PANEL_TAG = re.compile(r'<script\s+src="settings/feature-panels/([a-z0-9-]+)\.js"\s*></script>', re.I)
SLOT_TAG = re.compile(r'<div\s+id="ds-feature-panel-([a-z0-9-]+)"\s+data-dsq-feature-panel="\1"\s*></div>', re.I)
VALID_ID = re.compile(r'^[a-z][a-z0-9-]*$')


def plan(package_root: Path, selected: set[str]):
    html_path = package_root / 'options.html'
    html = html_path.read_text(encoding='utf-8')
    panel_ids = PANEL_TAG.findall(html)
    if not panel_ids or len(panel_ids) != len(set(panel_ids)):
        raise ValueError('Missing or duplicate feature-panel script references')
    existing_slots = SLOT_TAG.findall(html)
    if len(existing_slots) != len(set(existing_slots)):
        raise ValueError('Duplicate feature-panel host slots')
    if set(existing_slots) - set(panel_ids):
        raise ValueError('Feature-panel host has no corresponding script')
    keep = sorted(set(panel_ids) & selected)
    omit = sorted(set(panel_ids) - selected)
    for feature_id in keep:
        if not (package_root / 'settings' / 'feature-panels' / (feature_id + '.js')).is_file():
            raise ValueError('Selected feature-panel script is missing: ' + feature_id)
    next_html = PANEL_TAG.sub(lambda m: m.group(0) if m.group(1) in selected else '', html)
    next_html = SLOT_TAG.sub(lambda m: m.group(0) if m.group(1) in selected else '', next_html)
    if set(PANEL_TAG.findall(next_html)) != set(keep):
        raise ValueError('A selected feature-panel script was accidentally removed')
    if set(SLOT_TAG.findall(next_html)) - set(keep):
        raise ValueError('An omitted feature-panel slot was retained')
    return html_path, next_html, keep, omit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-root', type=Path, required=True, help='Copied/staged extension directory, NOT your source checkout')
    parser.add_argument('--features', required=True, help='Comma-separated resolved/selected feature IDs')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    selected = set(filter(None, (v.strip() for v in args.features.split(','))))
    if any(not VALID_ID.fullmatch(value) for value in selected):
        parser.error('Invalid feature ID')
    root = args.package_root.resolve()
    if not root.is_dir() or not (root / 'manifest.json').is_file():
        parser.error('--package-root must be a staged extension directory with manifest.json')
    html_path, html, keep, omit = plan(root, selected)
    if not args.dry_run:
        html_path.write_text(html, encoding='utf-8')
        for feature_id in omit:
            (root / 'settings' / 'feature-panels' / (feature_id + '.js')).unlink(missing_ok=True)
    print(json.dumps({
        'schema': 'dsq-settings-panel-prune/v1', 'dryRun': args.dry_run,
        'settingsMarkupOnly': True, 'certifiedIndependent': False,
        'keptFeaturePanels': keep, 'omittedFeaturePanels': omit,
    }, indent=2))


if __name__ == '__main__':
    main()

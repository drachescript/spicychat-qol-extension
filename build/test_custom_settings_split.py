#!/usr/bin/env python3
"""Regression checks for Custom Settings ownership after Full QoL splits.

Static package contracts only: browser functionality still needs live tests.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "options.html").read_text(encoding="utf-8")
OWNER_JS = (ROOT / "settings/feature-setting-owners.js").read_text(encoding="utf-8")
CONTRACT_DIR = ROOT / "build/features"
EXPECTED = {
    "daily-message-limit": ("dailyMessageLimitTrackerEnabled",),
    "personas": ("showPersonaLimitIndicator",),
    "selection-memory": ("enableSelectionRemember",),
    "translation": ("enableTranslation", "translationGreetingButton", "translationAutoGreeting"),
    "soundscapes": ("enableSoundscapes",),
}

class SettingsOwnershipTest(unittest.TestCase):
    def test_panels_have_exactly_one_import_and_empty_mount(self):
        for fid in EXPECTED:
            with self.subTest(feature=fid):
                path = f"settings/feature-panels/{fid}.js"
                self.assertEqual(HTML.count(f'<script src="{path}"></script>'), 1, path)
                mount = f'<div id="ds-feature-panel-{fid}" data-dsq-feature-panel="{fid}"></div>'
                self.assertEqual(HTML.count(mount), 1, fid)
                self.assertTrue((ROOT / path).is_file())
        self.assertNotIn('src="settings/features/options-translation.js"', HTML)

    def test_contract_keys_and_saved_settings_ownership(self):
        for fid, keys in EXPECTED.items():
            contract = json.loads((CONTRACT_DIR / f"{fid}.json").read_text(encoding="utf-8"))
            with self.subTest(feature=fid):
                self.assertIn(f"settings/feature-panels/{fid}.js", contract.get("settingsFiles", []))
                pattern = r'"' + re.escape(fid) + r'"\\s*:\\s*\\[([^\\]]*)\\]'
                found = re.search(pattern, OWNER_JS)
                self.assertIsNotNone(found, f"Missing Settings owner for {fid}")
                for key in keys:
                    self.assertIn(key, contract.get("settingsKeys", []))
                    self.assertIn(f'"{key}"', found.group(1))

    def test_soundscapes_settings_css_has_one_owner(self):
        contract = json.loads((CONTRACT_DIR / "soundscapes.json").read_text(encoding="utf-8"))
        css = "settings/styles/soundscapes.css"
        self.assertEqual(contract.get("settingsStyles"), [css])
        self.assertTrue((ROOT / css).is_file())
        panel = (ROOT / "settings/feature-panels/soundscapes.js").read_text(encoding="utf-8")
        self.assertIn(css, panel)
        files = [p for p in CONTRACT_DIR.glob("*.json")
                 if css in json.loads(p.read_text(encoding="utf-8")).get("settingsStyles", [])]
        self.assertEqual([p.stem for p in files], ["soundscapes"])

    def test_optional_features_start_disabled_in_custom(self):
        from importlib.machinery import SourceFileLoader
        index = SourceFileLoader("custom_index", str(ROOT / "build/export-custom-package-index.py")).load_module().make_index()
        by_id = {row["id"]: row for row in index["features"]}
        for fid in EXPECTED:
            with self.subTest(feature=fid):
                self.assertFalse(by_id[fid]["defaultSelected"])
                self.assertFalse(by_id[fid]["defaultUpdatesEnabled"])
        self.assertEqual(by_id["soundscapes"]["settingsStyles"], ["settings/styles/soundscapes.css"])

if __name__ == "__main__":
    unittest.main()

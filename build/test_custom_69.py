#!/usr/bin/env python3
"""Verify Custom v0.2.69 owner separation for conversation pins and Rulebook blocking."""
import json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/"options.html").read_text(encoding="utf-8")
def contract(fid):return json.loads((ROOT/"build/features"/(fid+".json")).read_text(encoding="utf-8"))
class NewFeatureOwnership(unittest.TestCase):
    def test_primary_scripts_and_css(self):
        pins=contract("chat-pins")
        self.assertIn("chat-list",pins["dependencies"])
        self.assertIn("content/styles/chat-pins.css",pins["styleFiles"])
        self.assertEqual(contract("rulebook-public-qol")["primary"],"content/rulebook-public-qol.js")
        for asset in ["content/chat-pins.js","content/styles/chat-pins.css","content/rulebook-public-qol.js"]:
            self.assertTrue((ROOT/asset).is_file(),asset)
    def test_settings_are_feature_owned(self):
        for fid,keys in [("chat-pins",["enableChatPins"]),("rulebook-public-qol",["rulebookBlockingEnabled","applyBotBlockingToRulebooks","showRulebookBlockButtons","rulebookBlockedIds"])]:
            with self.subTest(fid=fid):
                c=contract(fid)
                self.assertEqual(c["settingsFiles"],["settings/feature-panels/"+fid+".js"])
                self.assertTrue(c["settingsMarkupIsolated"])
                self.assertEqual(HTML.count('data-dsq-feature-panel="'+fid+'"'),1)
                self.assertEqual(HTML.count('src="settings/feature-panels/'+fid+'.js"'),1)
                for key in keys:self.assertIn(key,c["settingsKeys"])
    def test_shared_settings_do_not_override_owned_handlers(self):
        autosave=(ROOT/"settings/features/options-settings-autosave.js").read_text(encoding="utf-8")
        load=(ROOT/"settings/features/options-settings-load.js").read_text(encoding="utf-8")
        for key in ["enableChatPins","rulebookBlockingEnabled","applyBotBlockingToRulebooks","showRulebookBlockButtons","rulebookBlockedIds"]:
            self.assertNotIn('case "'+key+'":',autosave)
            self.assertNotIn('    '+key+': ',autosave)
            self.assertNotIn('setChecked("'+key+'"',load)
            self.assertNotIn('setValue("'+key+'"',load)
    def test_default_off(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location("custom_asset_index",ROOT/"build/export-custom-package-index.py")
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        data={row["id"]:row for row in module.make_index()["features"]}
        for id in ["chat-pins","rulebook-public-qol"]:
            self.assertFalse(data[id]["defaultSelected"]);self.assertFalse(data[id]["defaultUpdatesEnabled"])
if __name__=="__main__":unittest.main()

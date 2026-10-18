#!/usr/bin/env python3
"""v0.2.52 Custom feature catalog smoke tests; browser validation separate."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"build"))
import custom_recipes
import plan_custom

def data(file):
    return json.loads((ROOT/file).read_text(encoding="utf-8"))

class Custom52Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=data("build/feature-catalog.json")
        cls.contracts=custom_recipes.load_contracts()
        cls.features={f["id"]:f for f in cls.catalog["features"]}
    def test_source_version_and_feature_count(self):
        self.assertEqual(self.catalog["version"],data("manifest.json")["version"])
        self.assertGreaterEqual(self.catalog["featureCount"],118)
        self.assertEqual(self.catalog["featureCount"],len(self.features))
        self.assertEqual(self.catalog["status"],"experimental-unverified")
    def test_separate_blocking_from_auto_blocking(self):
        self.assertEqual(self.features["auto-blocking"]["requiredFeatures"],["cards","bot-blocking"])
        self.assertNotIn("auto-blocking",self.features["bot-blocking"]["requiredFeatures"])
        self.assertEqual(custom_recipes.dependency_closure(["auto-blocking"],self.contracts)[-1],"auto-blocking")
    def test_auto_images_and_voice_separate(self):
        self.assertNotIn("auto-voice",self.features["auto-images"]["requiredFeatures"])
        self.assertIn("content/chat-picture-core.js",self.features["auto-images"]["requiredHelpers"])
        plan=plan_custom.plan_features(["auto-images"])
        self.assertIn("content/chat-picture-core.js",plan["runtimeScripts"])
        self.assertNotIn("content/auto-voice.js",plan["runtimeScripts"])
        self.assertFalse(plan["installable"])
    def test_picture_modules_require_shared_helpers(self):
        p=plan_custom.plan_features(["character-pictures"])
        self.assertIn("content/character-pictures.js",p["runtimeScripts"])
        self.assertIn("content/chat-picture-core.js",p["runtimeScripts"])
        self.assertIn("settings/feature-panels/character-pictures.js",p["settingsScripts"])
    def test_owned_css_and_settings_exist(self):
        for f in self.features.values():
            with self.subTest(feature=f["id"]):
                for key in ["runtimeScripts","requiredHelpers","cssFiles","settingsScripts","backgroundFiles"]:
                    for path in f.get(key,[]):
                        self.assertTrue((ROOT/path).is_file(),path)
    def test_dependency_closure_fail_closed(self):
        self.assertRaises(ValueError,custom_recipes.dependency_closure,
                          ["unknown-feature"],self.contracts)
    def test_status_remains_unverified(self):
        for f in self.features.values():
            self.assertNotEqual(f["customBuildStatus"],"validated")

if __name__=="__main__":unittest.main()

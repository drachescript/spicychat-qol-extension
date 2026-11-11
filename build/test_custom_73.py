#!/usr/bin/env python3
"""Custom 0.2.73 Settings, language helper, and build ownership regression checks."""
import json, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(path):return (ROOT/path).read_text(encoding="utf-8")
def contract(name):return json.loads(read("build/features/"+name+".json"))

class CustomSeventyThree(unittest.TestCase):
    def test_release_version_and_feature_scripts(self):
        manifest=json.loads(read("manifest.json"))
        self.assertGreaterEqual(tuple(int(part) for part in manifest["version"].split(".")), (0, 2, 73))
        js={path for row in manifest["content_scripts"] for path in row.get("js",[])}
        for p in ["content/chat-pins.js","content/chat-bookmarks.js",
                  "content/language-filter.js","content/rulebook-public-qol.js",
                  "content/lorebook-public-qol.js"]:
            self.assertIn(p,js)
    def test_custom_panels_and_legacy_readers_are_not_duplicated(self):
        html=read("options.html")
        autosave=read("settings/features/options-settings-autosave.js")
        load=read("settings/features/options-settings-load.js")
        for feature in ["chat-pins","rulebook-public-qol","daily-message-limit"]:
            with self.subTest(feature=feature):
                self.assertEqual(html.count('data-dsq-feature-panel="'+feature+'"'),1)
                self.assertEqual(html.count('src="settings/feature-panels/'+feature+'.js"'),1)
        for key in ["enableChatPins","rulebookBlockingEnabled","applyBotBlockingToRulebooks",
                    "showRulebookBlockButtons","rulebookBlockedIds"]:
            self.assertNotIn('id="'+key+'"',html)
            self.assertNotIn('case "'+key+'":',autosave)
            self.assertNotIn('setChecked("'+key+'"',load)
        self.assertIn('id="ds-chat-list-shortcuts-mount"',html)
        self.assertIn('chatListTwoColumns',read('settings/feature-panels/chat-list.js'))
        self.assertIn('languageFilterRulebooks',read('settings/feature-panels/language-filter.js'))
    def test_new_settings_ownership(self):
        groups={
            "chat-list":["chatListTwoColumns","chatListPopoutShortcut","chatListRenameShortcut"],
            "chat-topbar":["chatAlwaysShowProfileLink","chatJumpToStartShortcut",
                           "chatOpenWindowShortcut","chatGenerationSettingsShortcut"],
            "message-options":["messageBottomMenuShortcut"],
            "chat-export":["chatExportIncludeImageLinks"],
            "exact-message-counts":["showNewBotBadge"],
            "my-creations-backup":["enableAccountMigrationAssistant"],
            "language-filter":["languageFilterLorebooks","languageFilterRulebooks"]
        }
        for feature,keys in groups.items():
            with self.subTest(feature=feature):
                obj=contract(feature)
                for key in keys:self.assertIn(key,obj.get("settingsKeys",[]))
    def test_public_language_module_closure(self):
        obj=contract("language-filter")
        helpers=obj["requiredHelpers"]
        self.assertIn("content/rulebook-public-qol.js",helpers)
        self.assertIn("content/lorebook-public-qol.js",helpers)
        for path in helpers:self.assertTrue((ROOT/path).is_file(),path)
    def test_no_new_optional_features_selected_by_default(self):
        import importlib.util
        spec=importlib.util.spec_from_file_location("custom_index",ROOT/"build/export-custom-package-index.py")
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        rows={f["id"]:f for f in module.make_index()["features"]}
        for feature in ["language-filter","chat-pins","rulebook-public-qol",
                        "chat-list","chat-topbar","chat-export"]:
            self.assertFalse(rows[feature]["defaultSelected"])
            self.assertFalse(rows[feature]["defaultUpdatesEnabled"])

if __name__=="__main__":unittest.main()

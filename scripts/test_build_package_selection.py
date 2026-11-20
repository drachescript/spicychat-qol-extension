#!/usr/bin/env python3
"""Packaging allowlist regression tests; no browser required."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_extension as builder


class PackageSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root.mkdir(exist_ok=True)
        self.patcher = patch.object(builder, "ROOT", self.root)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def touch(self, rel):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("test", encoding="utf-8")
        return p

    def test_repository_helper_is_never_packaged(self):
        self.assertFalse(builder.should_include(self.touch("register_github_backup.py"), set(), set()))
        self.assertFalse(builder.should_include(self.touch("another_helper.py"), set(), set()))
        self.assertFalse(builder.should_include(self.touch("content/local-maintenance.py"), set(), set()))
        self.assertFalse(builder.should_include(self.touch("settings/experimental.ps1"), set(), set()))
        self.assertFalse(builder.should_include(self.touch("tools/unsafe.js"), set(), set()))
        self.assertFalse(builder.should_include(self.touch("build/source-only.js"), set(), set()))

    def test_real_runtime_assets_and_license_survive(self):
        for rel in (
            "manifest.json", "background-entry.js", "background.js",
            "options.js", "popup.html", "modules.json",
            "CHANGELOG.md", "LICENSE", "THIRD-PARTY-NOTICES.md",
            "content/new-feature.js", "settings/new-panel.js",
            "background/events/alarms.js", "icons/icon128.png",
            "shared/github-backup-service.js", "custom/ooc-runtime-core.js",
        ):
            with self.subTest(path=rel):
                self.assertTrue(builder.should_include(self.touch(rel), set(), set()))

    def test_only_explicit_root_files_are_allowed(self):
        for rel in ("arbitrary.js", "LITE-ISOLATION.md", "secrets.json", ".env", "source.tar.gz"):
            with self.subTest(path=rel):
                self.assertFalse(builder.should_include(self.touch(rel), set(), set()))

    def test_custom_feature_filter_is_preserved(self):
        optional = self.touch("content/optional-feature.js")
        self.assertFalse(builder.should_include(optional, {"content/optional-feature.js"}, set()))
        self.assertTrue(builder.should_include(optional, {"content/optional-feature.js"}, {"content/optional-feature.js"}))

    def test_source_tree_copy_cannot_include_tools(self):
        self.touch("register_github_backup.py")
        self.touch("content/on-demand-tool.py")
        self.touch("content/real-feature.js")
        self.touch("options.js")
        dest = self.root / "staging"
        dest.mkdir()
        builder.copy_source(dest, set(), set())
        self.assertTrue((dest / "content/real-feature.js").is_file())
        self.assertTrue((dest / "options.js").is_file())
        self.assertFalse((dest / "register_github_backup.py").exists())
        self.assertFalse((dest / "content/on-demand-tool.py").exists())

    def test_package_validation_still_rejects_unexpected_file(self):
        stage = self.root / "stage"
        stage.mkdir()
        (stage / "register_github_backup.py").write_text("test", encoding="utf-8")
        with self.assertRaisesRegex(SystemExit, "Repository/build-only files leaked"):
            builder.verify_package_contents(stage)

    def test_firefox_shared_scripts_include_github_backup(self):
        self.assertEqual(
            builder.FIREFOX_SHARED_BACKGROUND_SCRIPTS,
            ("shared/sync-service.js", "shared/github-backup-service.js"),
        )


if __name__ == "__main__":
    unittest.main()

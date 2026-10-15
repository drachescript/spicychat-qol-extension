#!/usr/bin/env python3
"""Static package checks for the experimental Core + OOC build.

This deliberately does not imply live browser compatibility. Run using:
  python -m unittest discover -s build -p 'test_minimal_ooc.py' -v
"""
from __future__ import annotations

import json
import posixpath
import sys
import tempfile
import unittest
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_minimal_ooc as minimal  # noqa: E402


class HtmlAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "script" and props.get("src"):
            self.refs.append(props["src"])
        elif tag == "link" and props.get("rel") == "stylesheet" and props.get("href"):
            self.refs.append(props["href"])


class MinimalOocBuildTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="qol-ooc-package-")
        cls.package = Path(cls.temp.name) / "qol-custom-core-ooc-test.zip"
        minimal.build(cls.package)
        with zipfile.ZipFile(cls.package) as archive:
            cls.names = set(archive.namelist())
            cls.members = {name: archive.read(name) for name in cls.names}
            cls.manifest = json.loads(cls.members["manifest.json"])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_only_declared_resources_are_present(self):
        expected = set(minimal.CONTENT_SCRIPTS + minimal.CSS + minimal.OPTIONS + [minimal.ICON, "manifest.json"])
        self.assertEqual(self.names, expected)
        self.assertFalse(self.names.intersection(minimal.OMISSIONS))
        self.assertEqual(len(self.names), len(self.members))

    def test_manifest_is_minimal_and_source_version_matches(self):
        source = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(self.manifest["version"], source["version"])
        self.assertEqual(self.manifest["manifest_version"], 3)
        self.assertEqual(self.manifest["permissions"], ["storage"])
        self.assertNotIn("host_permissions", self.manifest)
        self.assertNotIn("background", self.manifest)
        self.assertEqual(len(self.manifest["content_scripts"]), 1)
        entry = self.manifest["content_scripts"][0]
        self.assertEqual(entry["js"], minimal.CONTENT_SCRIPTS)
        self.assertEqual(entry["css"], minimal.CSS)
        self.assertEqual(entry["run_at"], "document_idle")
        self.assertEqual(self.manifest["options_page"], "custom/ooc-options.html")

    def test_ooc_modules_are_exactly_the_full_source(self):
        for path in ["content/ooc.js", "content/ooc-composer.js",
                     "content/core-settings-defaults.js", "content/styles/ooc.css"]:
            with self.subTest(path=path):
                self.assertEqual(self.members[path], (ROOT / path).read_bytes())

    def test_settings_html_imports_only_packaged_resources(self):
        html = HtmlAssets()
        html.feed(self.members["custom/ooc-options.html"].decode("utf-8"))
        self.assertTrue(html.refs, "Options HTML has no linked resources")
        for resource in html.refs:
            with self.subTest(resource=resource):
                self.assertNotIn("://", resource, "Options page must not load remote resources")
                path = posixpath.normpath(posixpath.join("custom", resource))
                self.assertFalse(path.startswith("../"), f"Resource leaves extension root: {path}")
                self.assertIn(path, self.names)

    def test_no_full_qol_resource_or_script_accidentally_bundled(self):
        forbidden = ["content/main.js", "content/chat-ui.js", "options.js",
                     "background.js", "background-entry.js", "content.css"]
        for path in forbidden:
            self.assertNotIn(path, self.names)


if __name__ == "__main__":
    unittest.main()

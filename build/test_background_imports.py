#!/usr/bin/env python3
"""Regression tests for split and feature-gated background worker imports."""
import unittest
from pathlib import Path

from background_imports import parse_background_imports

ROOT = Path(__file__).resolve().parents[1]


class BackgroundImportParserTests(unittest.TestCase):
    def test_checked_in_background_entry_has_complete_order(self):
        src = (ROOT / "background-entry.js").read_text(encoding="utf-8-sig")
        paths = parse_background_imports(src)
        self.assertEqual(paths[-1], "background/background-events.js")
        self.assertLess(paths.index("background.js"),
                        paths.index("background/events/runtime-messages.js"))
        self.assertIn("background/features/background-community-themes.js", paths)

    def test_split_imports_with_optional_feature_and_events(self):
        source = (
            'importScripts("background/feature-build-profile.js", "background.js");\n'
            'if (dsqBackgroundHasFeature("archive-community-themes")) '
            'importScripts("background/features/background-community-themes.js");\n'
            'importScripts("background/events/runtime-messages.js", '
            '"background/background-events.js");\n'
        )
        self.assertEqual(parse_background_imports(source), [
            "background/feature-build-profile.js",
            "background.js",
            "background/features/background-community-themes.js",
            "background/events/runtime-messages.js",
            "background/background-events.js",
        ])

    def test_single_call_and_single_quoted_paths(self):
        self.assertEqual(
            parse_background_imports("importScripts('background.js', 'background/background-events.js');"),
            ["background.js", "background/background-events.js"],
        )

    def test_dynamic_arguments_rejected(self):
        with self.assertRaisesRegex(ValueError, "literal"):
            parse_background_imports('importScripts("background.js", getScript());')

    def test_unsupported_syntax_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            parse_background_imports('importScripts("background.js")')

    def test_duplicate_import_across_calls_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            parse_background_imports('importScripts("background.js"); importScripts("background.js");')

    def test_path_traversal_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            parse_background_imports('importScripts("../some-other-project.js");')

    def test_empty_list_rejected(self):
        with self.assertRaisesRegex(ValueError, "literal"):
            parse_background_imports("importScripts();")


if __name__ == "__main__":
    unittest.main()

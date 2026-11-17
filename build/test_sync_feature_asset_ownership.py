#!/usr/bin/env python3
"""Ensure automatic module repair never guesses unreviewed feature ownership."""
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("sync-feature-asset-ownership.py")
spec = importlib.util.spec_from_file_location("feature_asset_ownership_sync", SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class WorkerOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.original_root = sync.ROOT
        self.addCleanup(setattr, sync, "ROOT", self.original_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / "content").mkdir()
        self.primary = "content/bulk-chat-research.js"
        self.worker = "content/bulk-chat-research-worker.js"
        (sync.ROOT / self.primary).write_text(
            "new Worker(chrome.runtime.getURL('content/bulk-chat-research-worker.js'));",
            encoding="utf-8",
        )
        (sync.ROOT / self.worker).write_text("self.onmessage = () => {};", encoding="utf-8")
        self.contract = {
            "id": "bulk-chat-research",
            "primary": self.primary,
            "requiredHelpers": [],
        }
        self.contracts = {"bulk-chat-research": (None, self.contract)}
        self.manifest = {
            "web_accessible_resources": [{"resources": [self.worker]}],
        }
        self.modules = {
            "bundles": {
                "chatList": {"files": ["content/chat-list.js", self.primary]},
                "chat": {"files": []},
            },
        }

    def repair(self):
        return sync.sync_reviewed_worker_helpers(self.contracts, self.manifest, self.modules)

    def test_adds_reviewed_worker_and_is_idempotent(self):
        self.assertEqual(self.repair(), [self.worker])
        self.assertEqual(self.modules["bundles"]["chatList"]["files"][2], self.worker)
        self.assertEqual(self.contract["requiredHelpers"], [self.worker])
        self.assertEqual(self.repair(), [])

    def test_unknown_owner_is_not_guessed(self):
        self.contracts = {}
        with self.assertRaisesRegex(ValueError, "Unreviewed on-demand worker"):
            self.repair()

    def test_worker_not_referenced_by_primary_is_rejected(self):
        (sync.ROOT / self.primary).write_text("// no worker reference", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not explicitly referenced"):
            self.repair()

    def test_conflicting_bundle_is_not_overwritten(self):
        self.modules["bundles"]["chat"]["files"].append(self.worker)
        with self.assertRaisesRegex(ValueError, "conflicting module ownership"):
            self.repair()

    def test_owner_must_have_exactly_one_primary_bundle(self):
        self.modules["bundles"]["chat"]["files"].append(self.primary)
        with self.assertRaisesRegex(ValueError, "expected one primary bundle"):
            self.repair()


if __name__ == "__main__":
    unittest.main()

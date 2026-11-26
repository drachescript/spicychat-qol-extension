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


class ManifestContentRepairTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old_root = sync.ROOT
        self.addCleanup(setattr, sync, "ROOT", self.old_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / "content").mkdir()
        self.first = "content/main-lazy-history.js"
        self.middle = "content/on-demand-modules.js"
        self.last = "content/main-feature-demand.js"
        for name in (self.first, self.middle, self.last):
            (sync.ROOT / name).write_text("/* valid */", encoding="utf-8")
        self.manifest = {"content_scripts": [{"js": [self.first, self.middle, self.last]}]}
        self.modules = {
            "bundles": {
                "core": {"files": [self.first, self.last]},
                "chat": {"files": []},
            },
        }

    def repair(self):
        return sync.sync_manifest_content_modules(self.manifest, self.modules)

    def test_registers_flanked_script_and_is_idempotent(self):
        self.assertEqual(self.repair(), [self.middle])
        self.assertEqual(
            self.modules["bundles"]["core"]["files"], [self.first, self.middle, self.last]
        )
        self.assertEqual(self.repair(), [])

    def test_registers_multiple_consecutive_scripts(self):
        another = "content/new-adjacent.js"
        (sync.ROOT / another).write_text("/* valid */", encoding="utf-8")
        self.manifest["content_scripts"][0]["js"].insert(2, another)
        self.assertEqual(self.repair(), [self.middle, another])
        self.assertEqual(
            self.modules["bundles"]["core"]["files"],
            [self.first, self.middle, another, self.last],
        )

    def test_conflicting_neighbors_are_not_guessed(self):
        self.modules["bundles"]["core"]["files"].remove(self.last)
        self.modules["bundles"]["chat"]["files"].append(self.last)
        self.assertEqual(self.repair(), [])
        self.assertNotIn(self.middle, self.modules["bundles"]["core"]["files"])

    def test_wrong_order_does_not_change_bundle(self):
        self.modules["bundles"]["core"]["files"].reverse()
        self.assertEqual(self.repair(), [])

    def test_missing_file_is_an_error(self):
        (sync.ROOT / self.middle).unlink()
        with self.assertRaisesRegex(ValueError, "missing on disk"):
            self.repair()

    def test_standalone_unowned_script_is_not_guessed(self):
        self.manifest["content_scripts"][0]["js"] = [self.middle]
        self.assertEqual(self.repair(), [])


class SharedSettingsAssetRepairTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old_root = sync.ROOT
        self.addCleanup(setattr, sync, "ROOT", self.old_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / "settings/feature-panels").mkdir(parents=True)
        (sync.ROOT / "settings/options-guidance.js").write_text(
            "/* no-op */", encoding="utf-8"
        )
        (sync.ROOT / "settings/feature-panels/chat-export.js").write_text(
            "/* optional panel */", encoding="utf-8"
        )
        (sync.ROOT / "options.html").write_text(
            '<script src="options.js"></script>'
            '<script src="settings/options-guidance.js"></script>'
            '<script src="settings/feature-panels/chat-export.js"></script>'
            '<script src="shared/storage-metrics.js"></script>',
            encoding="utf-8",
        )
        self.modules = {
            "runtimeAssets": {
                "options": {"required": ["options.js", "shared/storage-metrics.js"]}
            },
        }

    def test_registers_shared_settings_without_forcing_optional_panels(self):
        self.assertEqual(
            sync.sync_shared_options_assets(self.modules),
            ["settings/options-guidance.js"],
        )
        self.assertEqual(
            self.modules["runtimeAssets"]["options"]["required"],
            ["options.js", "settings/options-guidance.js", "shared/storage-metrics.js"],
        )
        self.assertEqual(sync.sync_shared_options_assets(self.modules), [])
        self.assertNotIn(
            "settings/feature-panels/chat-export.js",
            self.modules["runtimeAssets"]["options"]["required"],
        )

    def test_missing_linked_asset_is_rejected(self):
        (sync.ROOT / "settings/options-guidance.js").unlink()
        with self.assertRaisesRegex(ValueError, "missing on disk"):
            sync.sync_shared_options_assets(self.modules)


class ReviewedOnDemandPrimaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old_root = sync.ROOT
        self.addCleanup(setattr, sync, "ROOT", self.old_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / "content").mkdir()
        self.primary = "content/archive-blocking-presets.js"
        (sync.ROOT / self.primary).write_text("/* optional */", encoding="utf-8")
        (sync.ROOT / "content/on-demand-modules.js").write_text(
            'const MODULES = {"archive-blocking-presets": "content/archive-blocking-presets.js"};',
            encoding="utf-8",
        )
        self.contracts = {
            "cards": (None, {"id": "cards", "primary": "content/cards.js"}),
            "archive-blocking-presets": (None, {
                "id": "archive-blocking-presets", "primary": self.primary,
                "type": "content", "dependencies": ["cards"], "browserVerified": False,
            }),
        }
        self.manifest = {"web_accessible_resources": [{"resources": [self.primary]}]}
        self.modules = {"bundles": {"listings": {"files": ["content/cards.js"]},
                                    "chat": {"files": []}}}

    def repair(self):
        return sync.sync_reviewed_dynamic_primaries(
            self.contracts, self.manifest, self.modules
        )

    def test_dependency_owned_primary_and_idempotence(self):
        self.assertEqual(self.repair(), [self.primary])
        self.assertIn(self.primary, self.modules["bundles"]["listings"]["files"])
        self.assertEqual(self.repair(), [])
        self.assertIs(self.contracts["archive-blocking-presets"][1]["browserVerified"], False)

    def test_explicit_reviewed_bundle(self):
        contract = self.contracts["archive-blocking-presets"][1]
        contract["dependencies"] = []
        contract["bundle"] = "chat"
        self.assertEqual(self.repair(), [self.primary])
        self.assertIn(self.primary, self.modules["bundles"]["chat"]["files"])

    def test_multiple_dependency_bundles_not_guessed(self):
        self.contracts["chat-list"] = (None, {
            "id": "chat-list", "primary": "content/chat-list.js"
        })
        self.modules["bundles"]["chat"]["files"].append("content/chat-list.js")
        self.contracts["archive-blocking-presets"][1]["dependencies"] = [
            "cards", "chat-list"
        ]
        self.assertEqual(self.repair(), [])

    def test_unknown_bundle_not_assumed_core(self):
        self.contracts["archive-blocking-presets"][1]["bundle"] = "unknown"
        with self.assertRaisesRegex(ValueError, "Invalid reviewed bundle"):
            self.repair()

    def test_unreviewed_feature_not_registered(self):
        del self.contracts["archive-blocking-presets"]
        self.assertEqual(self.repair(), [])

    def test_no_manifest_resource_not_registered(self):
        self.manifest["web_accessible_resources"] = []
        self.assertEqual(self.repair(), [])

    def test_no_loader_reference_not_registered(self):
        (sync.ROOT / "content/on-demand-modules.js").write_text(
            "const MODULES = {};", encoding="utf-8"
        )
        self.assertEqual(self.repair(), [])


class ReviewedGatedBackgroundTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old_root = sync.ROOT
        self.addCleanup(setattr, sync, "ROOT", self.old_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / "background/features").mkdir(parents=True)
        self.rel = "background/features/background-blocking-presets.js"
        (sync.ROOT / self.rel).write_text("/* optional handler */", encoding="utf-8")
        self.contracts = {
            "archive-blocking-presets": (None, {
                "id": "archive-blocking-presets",
                "backgroundFiles": [self.rel], "backgroundIsolated": True,
            })
        }
        self.entry = (
            'importScripts("background.js");\n'
            'if (dsqBackgroundHasFeature("archive-blocking-presets")) '
            'importScripts("background/features/background-blocking-presets.js");\n'
            'importScripts("background/background-events.js");'
        )
        self.modules = {"runtimeAssets": {"background": {
            "required": ["background.js"], "helperModules": [],
        }}}

    def repair(self):
        return sync.sync_reviewed_background_assets(
            self.contracts, self.entry, self.modules
        )

    def test_gated_handler_repaired_and_idempotent(self):
        self.assertEqual(self.repair(), [self.rel])
        self.assertIn(self.rel, self.modules["runtimeAssets"]["background"]["required"])
        self.assertIn(self.rel, self.modules["runtimeAssets"]["background"]["helperModules"])
        self.assertEqual(self.repair(), [])

    def test_ungated_import_not_assumed_optional(self):
        self.entry = 'importScripts("background.js", "background/features/background-blocking-presets.js");'
        self.assertEqual(self.repair(), [])

    def test_missing_isolation_not_assumed(self):
        self.contracts["archive-blocking-presets"][1]["backgroundIsolated"] = False
        self.assertEqual(self.repair(), [])

    def test_conflicting_owner_rejected(self):
        self.contracts["other"] = (None, {
            "id": "other", "backgroundFiles": [self.rel],
            "backgroundIsolated": True,
        })
        with self.assertRaisesRegex(ValueError, "Ambiguous background asset"):
            self.repair()


    def test_declared_nonisolated_background_helper_is_registered(self):
        self.rel = "background/features/background-lorebook-import.js"
        (sync.ROOT / self.rel).write_text("/* shared background helper */", encoding="utf-8")
        self.contracts = {
            "lorebook-backup": (None, {
                "id": "lorebook-backup",
                "backgroundFiles": [self.rel], "backgroundIsolated": False,
            })
        }
        self.entry = (
            'importScripts("background/features/background-lorebook-import.js", '
            '"background.js");'
        )
        self.assertEqual(self.repair(), [self.rel])
        self.assertIn(self.rel, self.modules["runtimeAssets"]["background"]["required"])
        self.assertIn(self.rel, self.modules["runtimeAssets"]["background"]["helperModules"])
        self.assertEqual(self.repair(), [])

    def test_nonisolated_helper_never_assumes_later_import_is_unconditional(self):
        self.rel = "background/features/background-lorebook-import.js"
        (sync.ROOT / self.rel).write_text("/* shared background helper */", encoding="utf-8")
        self.contracts = {
            "lorebook-backup": (None, {
                "id": "lorebook-backup",
                "backgroundFiles": [self.rel], "backgroundIsolated": False,
            })
        }
        self.entry = (
            'importScripts("background.js"); '
            'if (dsqBackgroundHasFeature("lorebook-backup")) '
            'importScripts("background/features/background-lorebook-import.js");'
        )
        self.assertEqual(self.repair(), [])

    def test_nonisolated_helper_requires_explicit_contract(self):
        self.rel = "background/features/background-lorebook-import.js"
        (sync.ROOT / self.rel).write_text("/* shared background helper */", encoding="utf-8")
        self.contracts = {}
        self.entry = 'importScripts("background/features/background-lorebook-import.js", "background.js");'
        self.assertEqual(self.repair(), [])

    def test_unstated_isolation_still_requires_review(self):
        del self.contracts["archive-blocking-presets"][1]["backgroundIsolated"]
        self.assertEqual(self.repair(), [])

    def test_missing_file_rejected(self):
        (sync.ROOT / self.rel).unlink()
        with self.assertRaisesRegex(ValueError, "Missing reviewed background asset"):
            self.repair()


class ReviewedRuntimeOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old_root = sync.ROOT
        self.addCleanup(setattr, sync, 'ROOT', self.old_root)
        sync.ROOT = Path(self.temp.name)
        (sync.ROOT / 'content').mkdir()
        for name in ('browser-api-compat.js', 'report-link-collector.js'):
            (sync.ROOT / 'content' / name).write_text('/* valid */', encoding='utf-8')
        (sync.ROOT / 'content/on-demand-modules.js').write_text(
            'const MODULES = {"report-link-collector":"content/report-link-collector.js"};',
            encoding='utf-8',
        )
        self.manifest = {
            'content_scripts': [{'js': ['content/browser-api-compat.js']}],
            'web_accessible_resources': [{'resources': ['content/report-link-collector.js']}],
        }
        self.modules = {'bundles': {'core': {'files': []},
                                    'listings': {'files': []},
                                    'chat': {'files': []}}}

    def test_registered_audited_runtime_is_idempotent(self):
        self.assertEqual(sync.sync_reviewed_runtime_owners(self.manifest, self.modules),
                         ['content/browser-api-compat.js', 'content/report-link-collector.js'])
        self.assertEqual(sync.sync_reviewed_runtime_owners(self.manifest, self.modules), [])
        self.assertIn('content/browser-api-compat.js', self.modules['bundles']['core']['files'])
        self.assertIn('content/report-link-collector.js',
                      self.modules['bundles']['listings']['files'])

    def test_unknown_content_is_not_assigned_to_core(self):
        self.manifest['content_scripts'][0]['js'].append('content/unreviewed.js')
        self.assertEqual(len(sync.sync_reviewed_runtime_owners(self.manifest, self.modules)), 2)
        self.assertNotIn('content/unreviewed.js', self.modules['bundles']['core']['files'])

    def test_conflicting_ownership_is_rejected(self):
        self.modules['bundles']['chat']['files'].append('content/browser-api-compat.js')
        with self.assertRaisesRegex(ValueError, 'Conflicting reviewed runtime owner'):
            sync.sync_reviewed_runtime_owners(self.manifest, self.modules)

    def test_dynamic_asset_requires_exact_loader_mapping(self):
        (sync.ROOT / 'content/on-demand-modules.js').write_text(
            'const MODULES = {};', encoding='utf-8'
        )
        with self.assertRaisesRegex(ValueError, 'no exact loader mapping'):
            sync.sync_reviewed_runtime_owners(self.manifest, self.modules)


class ManifestEarlyDeduplicationTests(unittest.TestCase):
    def setUp(self):
        self.manifest = {'content_scripts': [
            {'matches': ['https://spicychat.ai/*'], 'run_at': 'document_start',
             'js': ['content/browser-api-compat.js', 'content/other.js']},
            {'matches': ['https://spicychat.ai/*'], 'run_at': 'document_idle',
             'js': ['content/browser-api-compat.js', 'content/tab-state-control.js']},
        ]}

    def test_removes_only_later_duplicate_and_is_idempotent(self):
        self.assertEqual(sync.sync_manifest_early_once_scripts(self.manifest),
                         ['content/browser-api-compat.js'])
        self.assertEqual(self.manifest['content_scripts'][1]['js'],
                         ['content/tab-state-control.js'])
        self.assertEqual(sync.sync_manifest_early_once_scripts(self.manifest), [])

    def test_keeps_different_match_scope(self):
        self.manifest['content_scripts'][1]['matches'] = ['https://spicychat.ai/chat/*']
        self.assertEqual(sync.sync_manifest_early_once_scripts(self.manifest), [])

    def test_keeps_different_execution_world(self):
        self.manifest['content_scripts'][1]['world'] = 'MAIN'
        self.assertEqual(sync.sync_manifest_early_once_scripts(self.manifest), [])

    def test_does_not_collapse_nonreviewed_duplicate(self):
        self.manifest['content_scripts'][0]['js'] = ['content/other.js']
        self.manifest['content_scripts'][1]['js'] = ['content/other.js']
        self.assertEqual(sync.sync_manifest_early_once_scripts(self.manifest), [])


if __name__ == "__main__":
    unittest.main()

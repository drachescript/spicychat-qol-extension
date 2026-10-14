#!/usr/bin/env python3
"""Offline tests: python -m unittest build/test_custom_recipes.py -v"""
import unittest
from unittest.mock import patch

import custom_recipes as recipes


class CustomRecipeTests(unittest.TestCase):
    def setUp(self):
        self.contracts = {
            "ooc": {"requiredFeatures": []},
            "creator": {"requiredFeatures": ["ui"]},
            "ui": {"requiredFeatures": []},
        }
        self.recipe = {"schema": recipes.SCHEMA, "id": "my-custom",
                       "label": "My Custom", "selectedFeatures": ["creator"],
                       "updates": {"default": "auto", "overrides": {"ooc": "off"}}}

    def test_add_is_additive_and_removal_preserves_data(self):
        initial = recipes.validate_recipe(self.recipe, self.contracts)
        after_add = recipes.edit_recipe(initial, ["ooc"], [], self.contracts)
        self.assertEqual(after_add["selectedFeatures"], ["creator", "ooc"])
        self.assertEqual(after_add["updates"], initial["updates"])
        after_remove = recipes.edit_recipe(after_add, [], ["creator"], self.contracts)
        self.assertEqual(after_remove["selectedFeatures"], ["ooc"])

    def test_closure_includes_dependencies_and_preserves_order(self):
        self.assertEqual(recipes.dependency_closure(["creator", "ooc"], self.contracts),
                         ["ui", "creator", "ooc"])

    def test_invalid_ids_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Unknown feature"):
            recipes.edit_recipe(recipes.validate_recipe(self.recipe, self.contracts), ["missing"], [], self.contracts)

    def test_missing_contract_dependency_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "Unknown feature"):
            recipes.dependency_closure(["creator"], {"creator": {"requiredFeatures": ["deleted"]}})

    def test_dependency_cycles_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "Circular"):
            recipes.dependency_closure(["a"], {"a": {"requiredFeatures": ["b"]}, "b": {"requiredFeatures": ["a"]}})

    def test_duplicate_features_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            recipes.validate_recipe({**self.recipe, "selectedFeatures": ["ooc", "ooc"]}, self.contracts)

    def test_legacy_bundle_recipe_is_not_silently_interpreted(self):
        with self.assertRaisesRegex(ValueError, "Unsupported recipe schema"):
            recipes.validate_recipe({"schema": 1, "id": "legacy", "selection": {"bundles": ["chat"]}}, self.contracts)

    def test_invalid_update_preference_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid update preference"):
            recipes.validate_recipe({**self.recipe, "updates": {"default": "manual", "overrides": {"ooc": "magic"}}}, self.contracts)

    def test_ooc_lifecycle_status_does_not_claim_custom_build_ready(self):
        contracts = {"ooc": {"requiredFeatures": [],
                             "fullRuntimeStatus": "lifecycle-gated",
                             "customBuildStatus": "blocked",
                             "blockers": ["Composer shortcut is still shared"]}}
        readiness = recipes.feature_readiness(["ooc"], contracts)
        self.assertEqual(readiness["ooc"]["fullRuntimeStatus"], "lifecycle-gated")
        self.assertEqual(readiness["ooc"]["customBuildStatus"], "blocked")
        self.assertIn("Composer shortcut", readiness["ooc"]["blockers"][0])

    def test_missing_package_status_is_unverified_not_validated(self):
        readiness = recipes.feature_readiness(["ui"], self.contracts)
        self.assertEqual(readiness["ui"]["customBuildStatus"], "unverified")
        self.assertTrue(readiness["ui"]["blockers"])

    def test_preview_has_noninstallable_outer_gate(self):
        recipe = recipes.validate_recipe(self.recipe, self.contracts)
        with patch.object(recipes.plan_custom, "plan_features", return_value={"installable": True}):
            response = recipes.preview(recipe, self.contracts)
        self.assertFalse(response["installable"])
        self.assertFalse(response["plan"]["installable"])
        self.assertIn("creator", response["featureReadiness"])

    def test_preview_remains_noninstallable_even_if_planner_regresses(self):
        recipe = recipes.validate_recipe(self.recipe, self.contracts)
        with patch.object(recipes.plan_custom, "plan_features", return_value={"installable": True}) as planner:
            response = recipes.preview(recipe, self.contracts)
        self.assertFalse(response["plan"]["installable"])
        self.assertEqual(response["automaticallyRequiredFeatures"], ["ui"])
        planner.assert_called_once_with(["creator"])


if __name__ == "__main__":
    unittest.main()

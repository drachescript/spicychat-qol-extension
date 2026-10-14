#!/usr/bin/env python3
"""Edit persistent QoL Custom feature recipes and preview their dependencies.

Full QoL is the only buildable package. This command NEVER creates an
extension and never changes Full's manifest or settings. Preview plans are
provided by build/plan_custom.py, the canonical v0.2.47 feature planner.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import plan_custom

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = "dsq-custom-recipe/v1"
MODES = frozenset({"auto", "manual", "off"})
ID_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")


def load_contracts(root: Path = ROOT) -> dict[str, dict]:
    folder = root / "build" / "features"
    contracts = {}
    if not folder.is_dir():
        raise ValueError("Missing build/features directory")
    for path in sorted(folder.glob("*.json")):
        contract = json.loads(path.read_text(encoding="utf-8"))
        name = contract.get("id")
        if not isinstance(name, str) or name in contracts or name != path.stem:
            raise ValueError(f"Invalid/duplicate feature contract: {path.name}")
        contracts[name] = contract
    if not contracts:
        raise ValueError("No feature contracts available")
    return contracts


def dependency_closure(selected: list[str], contracts: dict[str, dict]) -> list[str]:
    """Fail closed on missing dependencies/cycles; return stable dependency order."""
    ordered = []
    visited = set()
    visiting = set()

    def visit(feature: str) -> None:
        if feature not in contracts:
            raise ValueError(f"Unknown feature or dependency: {feature}")
        if feature in visiting:
            raise ValueError(f"Circular feature dependency involving {feature}")
        if feature in visited:
            return
        visiting.add(feature)
        dependencies = contracts[feature].get("requiredFeatures", [])
        if not isinstance(dependencies, list) or any(not isinstance(dep, str) for dep in dependencies):
            raise ValueError(f"Invalid dependencies declared for {feature}")
        for dep in dependencies:
            visit(dep)
        visiting.remove(feature)
        visited.add(feature)
        ordered.append(feature)

    for feature in selected:
        visit(feature)
    return ordered


def validate_recipe(data: dict, contracts: dict[str, dict]) -> dict:
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError("Unsupported recipe schema. Use dsq-custom-recipe/v1 (not legacy bundle recipes).")
    ident = data.get("id")
    if not isinstance(ident, str) or not ID_PATTERN.fullmatch(ident) or len(ident) > 64:
        raise ValueError("Recipe ID must be 1–64 lowercase letters, digits or hyphens")
    label = data.get("label", ident)
    if not isinstance(label, str) or not 0 < len(label.strip()) <= 100:
        raise ValueError("Recipe label must contain 1–100 characters")
    selected = data.get("selectedFeatures")
    if not isinstance(selected, list) or any(not isinstance(x, str) for x in selected):
        raise ValueError("selectedFeatures must be a list of feature IDs")
    if len(selected) != len(set(selected)):
        raise ValueError("selectedFeatures contains duplicate IDs")
    dependency_closure(selected, contracts)
    updates = data.get("updates", {})
    if not isinstance(updates, dict):
        raise ValueError("updates must be an object")
    default = updates.get("default", "manual")
    overrides = updates.get("overrides", {})
    if default not in MODES or not isinstance(overrides, dict):
        raise ValueError("Invalid update preferences")
    for feature, mode in overrides.items():
        if feature not in contracts or mode not in MODES:
            raise ValueError(f"Invalid update preference for {feature}")
    # Preferences are stored for future website updater; no automatic update
    # is performed by this script and no executable code is downloaded.
    return {"schema": SCHEMA, "id": ident, "label": label.strip(),
            "selectedFeatures": selected[:],
            "updates": {"default": default, "overrides": dict(sorted(overrides.items()))}}


def edit_recipe(recipe: dict, add: list[str], remove: list[str], contracts: dict[str, dict]) -> dict:
    for feature in add + remove:
        if feature not in contracts:
            raise ValueError(f"Unknown feature: {feature}")
    selected = [feature for feature in recipe["selectedFeatures"] if feature not in set(remove)]
    for feature in add:
        if feature not in selected:
            selected.append(feature)
    return validate_recipe({**recipe, "selectedFeatures": selected}, contracts)


def preview(recipe: dict, contracts: dict[str, dict]) -> dict:
    closure = dependency_closure(recipe["selectedFeatures"], contracts)
    result = plan_custom.plan_features(recipe["selectedFeatures"])
    # Prevent future planner regressions from accidentally claiming a package
    # is installable merely because file declarations exist.
    result["installable"] = False
    return {"schema": "dsq-custom-recipe-preview/v1", "recipe": recipe,
            "automaticallyRequiredFeatures": [f for f in closure if f not in recipe["selectedFeatures"]],
            "plan": result,
            "note": "Preview only. Update preferences are saved but not executed. Do not distribute as an extension."}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", required=True, type=Path, help="Existing recipe JSON file")
    parser.add_argument("--add", action="append", default=[], metavar="FEATURE")
    parser.add_argument("--remove", action="append", default=[], metavar="FEATURE")
    parser.add_argument("--save", type=Path, help="Save the edited recipe JSON to this path")
    parser.add_argument("--output", type=Path, help="Write the JSON preview to this path")
    args = parser.parse_args(argv)
    try:
        contracts = load_contracts()
        initial = json.loads(args.recipe.read_text(encoding="utf-8"))
        recipe = edit_recipe(validate_recipe(initial, contracts), args.add, args.remove, contracts)
        result = preview(recipe, contracts)
        payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
        if args.save:
            args.save.parent.mkdir(parents=True, exist_ok=True)
            args.save.write_text(json.dumps(recipe, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(payload, encoding="utf-8")
        else:
            print(payload)
        return 0
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"Custom recipe error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

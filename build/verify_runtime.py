#!/usr/bin/env python3
"""Validate the Full extension's module registry, CSS order and script load graph.

This is static validation only. Custom/Lite profiles remain blocked until
Settings and background event handlers are independently selectable.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ERRORS: list[str] = []


def load_json(path: str) -> dict:
    try:
        return json.loads((ROOT / path).read_text(encoding="utf-8"))
    except Exception as exc:
        ERRORS.append(f"Cannot read {path}: {exc}")
        return {}


def check_file(path: str, context: str) -> None:
    if not isinstance(path, str) or not path or path.startswith("/") or ".." in Path(path).parts:
        ERRORS.append(f"Unsafe {context} path: {path!r}")
    elif not (ROOT / path).is_file():
        ERRORS.append(f"Missing {context}: {path}")


def check_order(before: str, after: str, seq: list[str], label: str) -> None:
    if before not in seq or after not in seq or seq.index(before) >= seq.index(after):
        ERRORS.append(f"{label}: expected {before} before {after}")


def unique(seq: list[str], label: str) -> None:
    if len(seq) != len(set(seq)):
        ERRORS.append(f"{label} contains duplicate entries")


def main() -> int:
    manifest = load_json("manifest.json")
    modules = load_json("build/modules.json")
    bundles = modules.get("bundles", {})
    order = modules.get("bundleOrder", [])
    if set(order) != set(bundles) or len(order) != len(bundles):
        ERRORS.append("bundleOrder must contain every declared bundle exactly once")
    for name, bundle in bundles.items():
        for dependency in bundle.get("dependsOn", []):
            if dependency not in bundles:
                ERRORS.append(f"{name} depends on unknown bundle {dependency}")
            elif dependency not in order or name not in order or order.index(dependency) >= order.index(name):
                ERRORS.append(f"{name} dependency {dependency} must appear before it")
        for path in bundle.get("files", []):
            check_file(path, f"{name} script")

    owners: dict[str, list[str]] = {}
    for bundle_id, bundle in bundles.items():
        for path in bundle.get("files", []):
            owners.setdefault(path, []).append(bundle_id)
    shared = modules.get("sharedBundleFiles", {})
    for path, ids in owners.items():
        if len(ids) != 1 and set(ids) != set(shared.get(path, [])):
            ERRORS.append(f"Script {path} is shared by {ids} without matching sharedBundleFiles declaration")

    scripts = manifest.get("content_scripts", [])
    all_js = [path for script in scripts for path in script.get("js", [])]
    all_css = [path for script in scripts for path in script.get("css", [])]
    for path in all_js: check_file(path, "manifest JavaScript")
    for path in all_css: check_file(path, "manifest stylesheet")
    unique(all_js, "Full manifest JavaScript")
    unique(all_css, "Full manifest CSS")
    dynamic = {path for item in manifest.get("web_accessible_resources", []) for path in item.get("resources", [])}
    for path in dynamic: check_file(path, "web-accessible resource")
    early = {"content/card-token-main.js", "content/card-token-auth-loader.js", "content/exact-message-counts-loader.js", "content/generation-metadata-loader.js"}
    for path in all_js:
        if path not in owners and path not in early:
            ERRORS.append(f"Full manifest JS not assigned to a bundle: {path}")
    for path in owners:
        if path not in all_js and path not in dynamic:
            ERRORS.append(f"Registered bundle script not in Full manifest or dynamic resources: {path}")

    late = next((s.get("js", []) for s in scripts if "content/main.js" in s.get("js", [])), [])
    for before, after in (
        ("content/core-settings-defaults.js", "content/core.js"),
        ("content/core.js", "content/core-message-cache.js"),
        ("content/core-message-cache.js", "content/core-storage-writers.js"),
        ("content/core-storage-writers.js", "content/main.js"),
        ("content/main-page-observer.js", "content/main.js"),
        ("content/main-diagnostics.js", "content/main.js"),
        ("content/main-scheduler-utils.js", "content/main.js"),
        ("content/main-message-mutations.js", "content/main.js"),
        ("content/main.js", "content/main-startup.js"),
    ):
        check_order(before, after, late, "Content runtime")

    assets = modules.get("runtimeAssets", {})
    styles = assets.get("styles", {})
    style_owners: dict[str, list[str]] = {}
    for bundle, paths in styles.items():
        if bundle not in bundles:
            ERRORS.append(f"Styles refer to unknown bundle: {bundle}")
        for path in paths:
            check_file(path, f"CSS of {bundle}")
            style_owners.setdefault(path, []).append(bundle)
    if set(style_owners) != set(all_css):
        ERRORS.append(f"CSS registry/manifest mismatch: missing={sorted(set(all_css)-set(style_owners))}; extra={sorted(set(style_owners)-set(all_css))}")
    for path, assigned in style_owners.items():
        if len(assigned) > 1 and set(assigned) != {"listings", "profiles"}:
            ERRORS.append(f"Unexpected shared CSS ownership: {path}: {assigned}")
    css_sequence = [
        "content.css", "content/styles/persona-manager.css",
        "content/styles/chat-bubble-themes.css", "content/styles/bot-organizer.css",
        "content/styles/remaining-styles.css",
    ]
    if any(path not in all_css for path in css_sequence):
        ERRORS.append("Expected split CSS files are missing from the Full manifest")
    elif [all_css.index(path) for path in css_sequence] != list(range(all_css.index("content.css"), all_css.index("content.css") + len(css_sequence))):
        ERRORS.append("Split CSS files have changed their relative cascade order")

    entry_path = "background-entry.js"
    check_file(entry_path, "background entry")
    entry = (ROOT / entry_path).read_text(encoding="utf-8") if (ROOT / entry_path).is_file() else ""
    match = re.search(r"\bimportScripts\s*\(([^;]*)\)", entry, re.S)
    imports = re.findall(r"[\"']([^\"']+\.js)[\"']", match.group(1)) if match else []
    if not imports: ERRORS.append("Background entry has no static importScripts list")
    for path in imports: check_file(path, "background import")
    background_assets = assets.get("background", {})
    declared = background_assets.get("required", [])
    unique(declared, "Background assets")
    for path in declared: check_file(path, "registered background asset")
    for path in imports + [entry_path]:
        if path not in declared: ERRORS.append(f"Background imported but unregistered: {path}")
    special = {"background/bot-status-storage-cleanup.js", "shared/sync-service.js"}
    for path in declared:
        if path not in imports and path != entry_path and path not in special:
            ERRORS.append(f"Registered background import not loaded by entry: {path}")
    for a, b in zip([
        "background.js", "background/background-translation.js",
        "background/background-auto-afk.js", "background/background-wiki-fetch.js"
    ], [
        "background/background-translation.js", "background/background-auto-afk.js",
        "background/background-wiki-fetch.js", "background/background-events.js"
    ]):
        check_order(a, b, imports, "Background service imports")
    services = background_assets.get("services", {})
    for path, service in services.items():
        if path not in imports: ERRORS.append(f"Background service is not imported by Full: {path}")
        if path not in declared: ERRORS.append(f"Background service not in required assets: {path}")
        for bundle in service.get("bundles", []):
            if bundle not in bundles: ERRORS.append(f"Background service {path} has unknown owner {bundle}")

    options_html = (ROOT / "options.html").read_text(encoding="utf-8")
    options_scripts = re.findall(r"<script[^>]+src=[\"']([^\"']+)[\"']", options_html)
    options_css = re.findall(r"<link[^>]+href=[\"']([^\"']+\.css)[\"']", options_html)
    options_assets = assets.get("options", {}).get("required", [])
    unique(options_assets, "Settings assets")
    for path in options_scripts + options_css: check_file(path, "Settings page asset")
    for path in options_assets: check_file(path, "registered Settings asset")
    for path in options_scripts + options_css:
        if path not in options_assets: ERRORS.append(f"Unregistered Settings asset: {path}")
    for before, after in (
        ("settings/options-settings-defaults.js", "settings/options-reading-accessibility.js"),
        ("settings/options-reading-accessibility.js", "settings/options-section-navigation.js"),
        ("settings/options-section-navigation.js", "settings/options-tab-cleanup.js"),
        ("settings/options-tab-cleanup.js", "settings/options-soundscapes.js"),
        ("settings/options-soundscapes.js", "settings/options-platform-compatibility.js"),
        ("settings/options-platform-compatibility.js", "settings/options-account-sync.js"),
        ("settings/options-account-sync.js", "settings/options-ooc.js"),
        ("settings/options-ooc.js", "options.js"),
    ):
        check_order(before, after, options_scripts, "Settings startup")


    # Feature-level contracts are stricter than bundle ownership. A contract may
    # describe blocked dependencies, but every claimed asset must be real.
    contract_dir = ROOT / "build/features"
    for contract_file in sorted(contract_dir.glob("*.json")) if contract_dir.is_dir() else []:
        try:
            contract = json.loads(contract_file.read_text(encoding="utf-8"))
        except Exception as exc:
            ERRORS.append(f"Invalid feature contract {contract_file.name}: {exc}")
            continue
        feature_id = contract.get("id")
        if contract.get("schema") != "dsq-feature/v1" or not isinstance(feature_id, str) or contract_file.stem != feature_id:
            ERRORS.append(f"Invalid identity for feature contract {contract_file.name}")
        for field, source in (("runtimeScripts", all_js), ("settingsScripts", options_scripts), ("cssFiles", all_css), ("backgroundServices", imports)):
            for path in contract.get(field, []):
                check_file(path, f"{feature_id} {field}")
                if path not in source:
                    ERRORS.append(f"Feature {feature_id} references {path} in {field}, but Full does not load it")
        for group, paths in contract.get("sharedDependencies", {}).items():
            for path in paths:
                check_file(path, f"{feature_id} shared {group}")
        if contract.get("customBuildStatus") not in ("blocked", "validated"):
            ERRORS.append(f"Feature {feature_id} must declare its build readiness")
        if contract.get("customBuildStatus") == "blocked" and not contract.get("blockers"):
            ERRORS.append(f"Feature {feature_id} blocked without reason")

    if ERRORS:
        print(f"Runtime verification failed ({len(ERRORS)} issue(s)):")
        for message in ERRORS: print(" -", message)
        return 1
    print(f"Full runtime wiring passed: {len(all_js)} JS, {len(all_css)} CSS, {len(imports)} background imports, {len(bundles)} bundles.")
    print("Custom profiles remain blocked: shared feature lifecycles and background events still need independent validation.")
    return 0

if __name__ == "__main__":
    sys.exit(main())

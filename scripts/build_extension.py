#!/usr/bin/env python3
"""
Build Chrome/Chromium and Firefox ZIPs from the same SpicyChat QoL source tree.

Windows examples:
  python scripts/build_extension.py
  python scripts/build_extension.py --dev
  python scripts/build_extension.py --profile full --dev
  python scripts/build_extension.py --output-dir dev_build
  python scripts/build_extension.py --list-profiles
  python scripts/build_extension.py --verify-only

The Full profile remains the default/reference build. Draft Lite/custom profiles
can live in build/profiles without becoming packageable until they are marked
buildable after Full parity testing is complete.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BUILD_DIR = ROOT / "build"
MODULES_PATH = BUILD_DIR / "modules.json"
PROFILES_DIR = BUILD_DIR / "profiles"

# Repository/development-only content that should not be shipped in stores.
EXCLUDED_TOP_LEVEL = {
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "build",
    "dist",
    "dev_build",
    "release_build",
    "node_modules",
    "scripts",
}

EXCLUDED_ROOT_FILES = {
    ".gitignore",
    "BUILDING.md",
    "CONTRIBUTING.md",
    "RELEASE_CHECKLIST.md",
    "android-CHANGELOG.md",
    "README.md",
    "RELEASE_NOTES.md",
    "SECURITY.md",
    "PERMISSIONS.md",
    "PRIVACY.md",
    "features.md",
}

# Keep CHANGELOG.md in the package: the Options page loads it at runtime.
# LICENSE and THIRD-PARTY-NOTICES.md also stay in distributed packages.
FORBIDDEN_PACKAGE_PREFIXES = {
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "build",
    "dist",
    "dev_build",
    "release_build",
    "node_modules",
    "scripts",
}

FORBIDDEN_TOOL_SUFFIXES = {
    ".bat",
    ".cmd",
    ".ps1",
    ".py",
    ".sh",
}

EXCLUDED_SUFFIXES = {
    ".crx",
    ".xpi",
    ".zip",
}

# Firefox supports the same PNG extension/action icons as Chromium, so the
# generated packages do not require duplicate JPEG icon variants.
UNUSED_PACKAGE_FILES = {
    "icons/icon48.jpg",
    "icons/icon96.jpg",
}

FIREFOX_SETTINGS = {
    "gecko": {
        "id": "spicychat-qol-dev@drache.uk",
        "strict_min_version": "140.0",
        "data_collection_permissions": {
            "required": ["none"],
            "optional": [
                "authenticationInfo",
                "personalCommunications",
                "websiteContent",
            ],
        },
    },
    "gecko_android": {
        "strict_min_version": "142.0",
    },
}


def load_json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Required build file is missing: {path.relative_to(ROOT)}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def load_manifest() -> dict:
    manifest = load_json(ROOT / "manifest.json")
    if not manifest.get("version"):
        raise SystemExit("manifest.json does not contain a version.")
    return manifest


def load_modules() -> dict:
    data = load_json(MODULES_PATH)
    if int(data.get("schema", 0)) != 1:
        raise SystemExit("Unsupported build/modules.json schema.")
    if not isinstance(data.get("bundles"), dict) or not data.get("bundles"):
        raise SystemExit("build/modules.json has no bundles.")
    return data


def load_profiles() -> dict[str, dict]:
    if not PROFILES_DIR.exists():
        raise SystemExit("build/profiles is missing.")
    profiles: dict[str, dict] = {}
    for path in sorted(PROFILES_DIR.glob("*.json")):
        data = load_json(path)
        profile_id = str(data.get("id") or "").strip()
        if not profile_id:
            raise SystemExit(f"Profile has no id: {path.relative_to(ROOT)}")
        if profile_id in profiles:
            raise SystemExit(f"Duplicate build profile id: {profile_id}")
        profiles[profile_id] = data
    if "full" not in profiles:
        raise SystemExit("The required Full build profile is missing.")
    return profiles


def manifest_runtime_files(manifest: dict) -> list[str]:
    result: list[str] = []
    for content_script in manifest.get("content_scripts", []):
        result.extend(content_script.get("js", []))
    for entry in manifest.get("web_accessible_resources", []):
        result.extend(entry.get("resources", []))
    return list(dict.fromkeys(result))


def module_file_owners(modules: dict) -> dict[str, set[str]]:
    owners: dict[str, set[str]] = {}
    for bundle_id, bundle in modules["bundles"].items():
        for rel in bundle.get("files", []):
            owners.setdefault(str(rel), set()).add(bundle_id)
    return owners


def validate_build_metadata(manifest: dict, modules: dict, profiles: dict[str, dict]) -> None:
    bundle_order = modules.get("bundleOrder") or list(modules["bundles"].keys())
    bundle_ids = set(modules["bundles"].keys())

    if set(bundle_order) != bundle_ids or len(bundle_order) != len(bundle_ids):
        raise SystemExit("build/modules.json bundleOrder must contain every bundle exactly once.")

    owners = module_file_owners(modules)
    runtime_files = manifest_runtime_files(manifest)
    missing_map = [rel for rel in runtime_files if rel not in owners]
    unknown_map = [rel for rel in owners if rel not in runtime_files]

    if missing_map:
        raise SystemExit(
            "Runtime files missing from build/modules.json:\n  " + "\n  ".join(missing_map)
        )
    if unknown_map:
        raise SystemExit(
            "build/modules.json references runtime files not present in manifest.json:\n  "
            + "\n  ".join(unknown_map)
        )

    for bundle_id, bundle in modules["bundles"].items():
        for dependency in bundle.get("dependsOn", []):
            if dependency not in bundle_ids:
                raise SystemExit(f"Bundle {bundle_id} depends on unknown bundle {dependency}.")

    for profile_id, profile in profiles.items():
        requested = profile.get("bundles", [])
        unknown = [name for name in requested if name not in bundle_ids]
        if unknown:
            raise SystemExit(
                f"Profile {profile_id} contains unknown bundles: {', '.join(unknown)}"
            )
        if "core" not in requested:
            raise SystemExit(f"Profile {profile_id} must include the core bundle.")

        requested_set = set(requested)
        for bundle_id in requested:
            missing_deps = [
                dep
                for dep in modules["bundles"][bundle_id].get("dependsOn", [])
                if dep not in requested_set
            ]
            if missing_deps:
                raise SystemExit(
                    f"Profile {profile_id}: bundle {bundle_id} is missing dependencies: "
                    + ", ".join(missing_deps)
                )

    # Full is the reference build: it must include every current module.
    full_bundles = profiles["full"].get("bundles", [])
    if full_bundles != bundle_order:
        raise SystemExit(
            "Full profile must list every bundle in build/modules.json bundleOrder."
        )


def selected_runtime_files(modules: dict, profile: dict) -> set[str]:
    selected: set[str] = set()
    for bundle_id in profile.get("bundles", []):
        selected.update(modules["bundles"][bundle_id].get("files", []))
    return selected


def filter_manifest_for_profile(
    source: dict,
    modules: dict,
    profile: dict,
) -> dict:
    manifest = json.loads(json.dumps(source))
    selected = selected_runtime_files(modules, profile)

    for content_script in manifest.get("content_scripts", []):
        if "js" in content_script:
            content_script["js"] = [
                rel for rel in content_script["js"] if rel in selected
            ]

    filtered_web_resources = []
    for entry in manifest.get("web_accessible_resources", []):
        copy = json.loads(json.dumps(entry))
        copy["resources"] = [rel for rel in copy.get("resources", []) if rel in selected]
        if copy["resources"]:
            filtered_web_resources.append(copy)
    manifest["web_accessible_resources"] = filtered_web_resources

    if profile.get("id") == "full":
        # Full parity guard: module filtering must not remove/reorder runtime JS.
        source_scripts = [cs.get("js", []) for cs in source.get("content_scripts", [])]
        filtered_scripts = [cs.get("js", []) for cs in manifest.get("content_scripts", [])]
        if filtered_scripts != source_scripts:
            raise SystemExit("Full profile changed the manifest content-script list/order.")
        if manifest.get("web_accessible_resources", []) != source.get("web_accessible_resources", []):
            raise SystemExit("Full profile changed web_accessible_resources.")

    return manifest


def should_include(path: Path, tracked_runtime: set[str], selected_runtime: set[str]) -> bool:
    rel = path.relative_to(ROOT)
    rel_posix = rel.as_posix()

    if not rel.parts:
        return False
    if rel.parts[0] in EXCLUDED_TOP_LEVEL:
        return False
    if len(rel.parts) == 1 and rel.name in EXCLUDED_ROOT_FILES:
        return False
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    if rel_posix in UNUSED_PACKAGE_FILES:
        return False
    if rel_posix in tracked_runtime and rel_posix not in selected_runtime:
        return False

    return path.is_file()


def common_png_icons() -> dict:
    return {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
    }


def chrome_manifest(source: dict, dev: bool, profile: dict) -> dict:
    manifest = json.loads(json.dumps(source))
    manifest["name"] = str(
        profile.get("devExtensionName" if dev else "extensionName")
        or ("SpicyChat QoL DEV" if dev else "SpicyChat QoL")
    )
    manifest["background"] = {"service_worker": "background.js"}
    manifest.pop("browser_specific_settings", None)
    manifest["version_name"] = str(manifest["version"])
    manifest["icons"] = common_png_icons()
    manifest.setdefault("action", {})["default_icon"] = common_png_icons()
    return manifest


def firefox_manifest(source: dict, dev: bool, profile: dict) -> dict:
    manifest = json.loads(json.dumps(source))
    manifest["name"] = str(
        profile.get("devExtensionName" if dev else "extensionName")
        or ("SpicyChat QoL DEV" if dev else "SpicyChat QoL")
    )
    manifest["background"] = {"scripts": ["background.js"]}
    manifest.pop("version_name", None)
    manifest["browser_specific_settings"] = FIREFOX_SETTINGS
    manifest["icons"] = common_png_icons()
    manifest.setdefault("action", {})["default_icon"] = common_png_icons()
    return manifest


def verify_required_files() -> None:
    required = [
        "background.js",
        "popup.html",
        "popup.js",
        "options.html",
        "options.js",
        "CHANGELOG.md",
        "icons/icon16.png",
        "icons/icon32.png",
        "icons/icon48.png",
        "icons/icon128.png",
    ]
    missing = [rel for rel in required if not (ROOT / rel).exists()]
    if missing:
        raise SystemExit("required package files are missing:\n  " + "\n  ".join(missing))


def verify_package_contents(stage: Path) -> None:
    problems: list[str] = []

    for path in stage.rglob("*"):
        if not path.is_file():
            continue

        rel = path.relative_to(stage)
        rel_posix = rel.as_posix()

        if rel.parts and rel.parts[0] in FORBIDDEN_PACKAGE_PREFIXES:
            problems.append(rel_posix)
            continue

        if len(rel.parts) == 1 and rel.name in EXCLUDED_ROOT_FILES:
            problems.append(rel_posix)
            continue

        if path.suffix.lower() in FORBIDDEN_TOOL_SUFFIXES:
            problems.append(rel_posix)

    if problems:
        raise SystemExit(
            "Repository/build-only files leaked into the extension package:\n  "
            + "\n  ".join(sorted(set(problems)))
        )


def copy_source(
    stage: Path,
    tracked_runtime: set[str],
    selected_runtime: set[str],
) -> None:
    for path in ROOT.rglob("*"):
        if not should_include(path, tracked_runtime, selected_runtime):
            continue
        rel = path.relative_to(ROOT)
        destination = stage / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)


def write_manifest(stage: Path, manifest: dict) -> None:
    with (stage / "manifest.json").open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def write_build_profile(stage: Path, profile: dict) -> None:
    bundles = profile.get("bundles", [])
    generated = "true" if profile.get("generated") else "false"
    lines = [
        "(() => {",
        '  "use strict";',
        "",
        "  // Generated from build/profiles by scripts/build_extension.py.",
        "  window.__DSQ_BUILD_PROFILE__ = Object.freeze({",
        f'    id: {json.dumps(str(profile.get("id") or "full"))},',
        f'    label: {json.dumps(str(profile.get("label") or profile.get("id") or "Full"))},',
        f"    generated: {generated},",
        "    bundles: Object.freeze([",
    ]
    for index, bundle in enumerate(bundles):
        suffix = "," if index < len(bundles) - 1 else ""
        lines.append(f"      {json.dumps(bundle)}{suffix}")
    lines += ["    ])", "  });", "})();", ""]
    output = stage / "content/build-profile.js"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(lines), encoding="utf-8")


def make_zip(stage: Path, output: Path) -> None:
    with zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as zf:
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(stage).as_posix())


def output_name(version: str, profile: dict, dev: bool, target: str) -> str:
    suffix = str(profile.get("filenameSuffix") or "").strip("- ")
    profile_part = f"-{suffix}" if suffix else ""
    kind = "dev" if dev else f"v{version}"
    return f"spicychat-qol{profile_part}-{kind}-{target}.zip"


def build(
    target: str,
    source_manifest: dict,
    modules: dict,
    profile: dict,
    dev: bool,
    output_dir: Path,
) -> Path:
    version = str(source_manifest["version"])
    output = output_dir / output_name(version, profile, dev, target)
    tracked_runtime = set(manifest_runtime_files(source_manifest))
    selected_runtime = selected_runtime_files(modules, profile)

    filtered_source = filter_manifest_for_profile(source_manifest, modules, profile)

    with tempfile.TemporaryDirectory(prefix=f"spicychat-qol-{target}-") as temp:
        stage = Path(temp)
        copy_source(stage, tracked_runtime, selected_runtime)
        write_build_profile(stage, profile)

        manifest = (
            chrome_manifest(filtered_source, dev, profile)
            if target == "chrome"
            else firefox_manifest(filtered_source, dev, profile)
        )
        write_manifest(stage, manifest)
        verify_package_contents(stage)
        make_zip(stage, output)

    return output


def print_profiles(profiles: dict[str, dict]) -> None:
    print("Build profiles:")
    for profile_id, profile in profiles.items():
        state = "buildable" if profile.get("buildable") else "draft / blocked"
        print(f"  {profile_id:18} {state:16} {profile.get('label', profile_id)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Build development packages whose visible extension name includes DEV.",
    )
    parser.add_argument(
        "--profile",
        default="full",
        help="Build profile id. Defaults to full.",
    )
    parser.add_argument(
        "--list-profiles",
        action="store_true",
        help="List available/draft build profiles and exit.",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Validate manifest/module/profile coverage without creating ZIPs.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for generated ZIPs. Relative paths are resolved from the repository root; defaults to dist.",
    )
    args = parser.parse_args()

    source_manifest = load_manifest()
    modules = load_modules()
    profiles = load_profiles()
    validate_build_metadata(source_manifest, modules, profiles)
    verify_required_files()

    if args.list_profiles:
        print_profiles(profiles)
        return 0

    profile = profiles.get(args.profile)
    if profile is None:
        raise SystemExit(
            f"Unknown build profile: {args.profile}. Use --list-profiles to see available profiles."
        )

    if not profile.get("buildable"):
        raise SystemExit(
            f"Build profile '{args.profile}' is still a draft and is intentionally not buildable yet. "
            "Verify Full parity before enabling Lite/custom packaging."
        )

    if args.verify_only:
        print(
            f"Build metadata OK: {len(modules['bundles'])} bundles, "
            f"{len(manifest_runtime_files(source_manifest))} tracked runtime files; "
            f"Full parity guard passed."
        )
        print_profiles(profiles)
        return 0

    output_dir = Path(args.output_dir).expanduser() if args.output_dir else DIST
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    outputs = [
        build("chrome", source_manifest, modules, profile, args.dev, output_dir),
        build("firefox", source_manifest, modules, profile, args.dev, output_dir),
    ]

    print(f"Profile: {profile.get('label', profile.get('id'))} ({profile.get('id')})")
    print("Built:")
    for output in outputs:
        try:
            shown = output.relative_to(ROOT)
        except ValueError:
            shown = output
        print(f"  {shown}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

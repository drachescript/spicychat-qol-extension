#!/usr/bin/env python3
"""
Build Chrome/Chromium and Firefox ZIPs from the same SpicyChat QoL source tree.

Usage:
  Windows:
    python scripts/build_extension.py
    python scripts/build_extension.py --dev

  Linux/macOS:
    python3 scripts/build_extension.py
    python3 scripts/build_extension.py --dev

The repository root manifest.json is treated as the canonical manifest.
The script normalizes the manifest for each browser and packages the
extension into dist/.
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

# Repository/development-only content that should not be shipped in the stores.
EXCLUDED_TOP_LEVEL = {
    ".git",
    ".github",
    ".idea",
    ".vscode",
    "dist",
    "node_modules",
    "scripts",
}

EXCLUDED_ROOT_FILES = {
    ".gitignore",
    "BUILDING.md",
    "CONTRIBUTING.md",
    "RELEASE_CHECKLIST.md",
    "android-CHANGELOG.md",
}

EXCLUDED_SUFFIXES = {
    ".crx",
    ".xpi",
    ".zip",
}

# These old Firefox-only JPEG icon variants are not required by the build.
# Firefox supports the same PNG icons used by Chromium, so keeping one icon
# set in the repository avoids duplicate/generated image files.
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


def should_include(path: Path) -> bool:
    rel = path.relative_to(ROOT)

    if not rel.parts:
        return False

    if rel.parts[0] in EXCLUDED_TOP_LEVEL:
        return False

    if len(rel.parts) == 1 and rel.name in EXCLUDED_ROOT_FILES:
        return False

    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False

    if rel.as_posix() in UNUSED_PACKAGE_FILES:
        return False

    return path.is_file()


def load_manifest() -> dict:
    manifest_path = ROOT / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("manifest.json was not found in the repository root.")

    with manifest_path.open("r", encoding="utf-8") as fh:
        manifest = json.load(fh)

    if not manifest.get("version"):
        raise SystemExit("manifest.json does not contain a version.")

    return manifest


def common_png_icons() -> dict:
    return {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
    }


def chrome_manifest(source: dict, dev: bool) -> dict:
    manifest = json.loads(json.dumps(source))

    manifest["name"] = "SpicyChat QoL DEV" if dev else "SpicyChat QoL"
    manifest["background"] = {"service_worker": "background.js"}
    manifest.pop("browser_specific_settings", None)

    # Keep Chrome's display version aligned with the package version.
    manifest["version_name"] = str(manifest["version"])

    manifest["icons"] = common_png_icons()
    manifest.setdefault("action", {})["default_icon"] = common_png_icons()

    return manifest


def firefox_manifest(source: dict, dev: bool) -> dict:
    manifest = json.loads(json.dumps(source))

    manifest["name"] = "SpicyChat QoL DEV" if dev else "SpicyChat QoL"
    manifest["background"] = {"scripts": ["background.js"]}
    manifest.pop("version_name", None)
    manifest["browser_specific_settings"] = FIREFOX_SETTINGS

    # Firefox supports PNG extension/action icons, so use the same source
    # icon set as Chromium instead of requiring separate JPEG copies.
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
        "icons/icon16.png",
        "icons/icon32.png",
        "icons/icon48.png",
        "icons/icon128.png",
    ]

    missing = [rel for rel in required if not (ROOT / rel).exists()]

    if missing:
        raise SystemExit(
            "required package files are missing:\n  " + "\n  ".join(missing)
        )


def copy_source(stage: Path) -> None:
    for path in ROOT.rglob("*"):
        if not should_include(path):
            continue

        rel = path.relative_to(ROOT)
        destination = stage / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)


def write_manifest(stage: Path, manifest: dict) -> None:
    with (stage / "manifest.json").open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


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


def build(target: str, source_manifest: dict, dev: bool) -> Path:
    version = str(source_manifest["version"])
    kind = "dev" if dev else f"v{version}"
    output = DIST / f"spicychat-qol-{kind}-{target}.zip"

    with tempfile.TemporaryDirectory(prefix=f"spicychat-qol-{target}-") as temp:
        stage = Path(temp)
        copy_source(stage)

        manifest = (
            chrome_manifest(source_manifest, dev)
            if target == "chrome"
            else firefox_manifest(source_manifest, dev)
        )

        write_manifest(stage, manifest)
        make_zip(stage, output)

    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Build development packages whose visible extension name includes DEV.",
    )
    args = parser.parse_args()

    source_manifest = load_manifest()
    verify_required_files()
    DIST.mkdir(exist_ok=True)

    outputs = [
        build("chrome", source_manifest, args.dev),
        build("firefox", source_manifest, args.dev),
    ]

    print("Built:")
    for output in outputs:
        print(f"  {output.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

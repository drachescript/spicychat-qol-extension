#!/usr/bin/env python3
"""Prepare the local extension tree for a release without touching Git."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "manifest.json"
CHANGELOG = ROOT / "CHANGELOG.md"
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", help="Release version, e.g. 0.2.13 or v0.2.13")
    args = parser.parse_args()

    version = args.version.strip()
    if version.lower().startswith("v"):
        version = version[1:]
    if not SEMVER.fullmatch(version):
        raise SystemExit(f"Invalid version: {args.version!r}. Expected x.y.z, e.g. 0.2.13")

    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    old = str(data.get("version") or "")
    data["version"] = version
    data["version_name"] = version
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    changelog = CHANGELOG.read_text(encoding="utf-8") if CHANGELOG.exists() else ""
    has_heading = re.search(rf"^##\s+{re.escape(version)}(?:\s|$)", changelog, re.MULTILINE) is not None

    print(f"manifest.json: {old or '(missing)'} -> {version}")
    print(f"version_name: {version}")
    if has_heading:
        print(f"CHANGELOG.md: found section for {version}")
    else:
        print(f"WARNING: CHANGELOG.md has no '## {version}' section yet.")
    print("No commit, tag, or push was performed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

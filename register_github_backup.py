#!/usr/bin/env python3
"""Register DragonScript QoL's optional GitHub backup provider in source builds.

Usage (from the full source checkout):
    python register_github_backup.py
    python register_github_backup.py --check
    python register_github_backup.py --dry-run

Or provide the full source repository path:
    python register_github_backup.py "D:/path/to/spicychat-qol-extension"

Requires the provider's JS files to already be present. This only registers
build assets for Chrome/Firefox source builds; it does not install the provider,
edit manifest.json, modify stored user data, access GitHub, or create commits.
Safe to rerun after source updates.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

GITHUB_SERVICE = "shared/github-backup-service.js"
GITHUB_OPTIONS = "settings/options-github-backup.js"
REQUIRED_PATHS = (
    "build/modules.json",
    "build/verify_runtime.py",
    "scripts/build_extension.py",
    GITHUB_SERVICE,
    GITHUB_OPTIONS,
)


class RegistrationError(Exception):
    """The source tree is missing an expected, safely editable build contract."""


def find_repo(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    script_dir = Path(__file__).resolve().parent
    for candidate in (script_dir, script_dir.parent, Path.cwd().resolve()):
        if (candidate / "build/modules.json").is_file():
            return candidate
    raise RegistrationError(
        "Couldn't find the source checkout. Pass its folder path explicitly: "
        'python register_github_backup.py "D:/path/to/spicychat-qol-extension"'
    )


def prepare(repo: Path) -> tuple[dict[Path, str], list[str]]:
    for relative in REQUIRED_PATHS:
        if not (repo / relative).is_file():
            raise RegistrationError(
                f"Missing {relative}. Use the FULL source repository with the "
                "GitHub provider files added, not just the Chrome build ZIP."
            )

    module_path = repo / "build/modules.json"
    verifier_path = repo / "build/verify_runtime.py"
    builder_path = repo / "scripts/build_extension.py"
    modules_original = module_path.read_text(encoding="utf-8-sig")
    verifier_original = verifier_path.read_text(encoding="utf-8-sig")
    builder_original = builder_path.read_text(encoding="utf-8-sig")
    try:
        modules = json.loads(modules_original)
    except json.JSONDecodeError as exc:
        raise RegistrationError(f"Invalid build/modules.json: {exc}") from exc

    assets = modules.get("runtimeAssets")
    if not isinstance(assets, dict):
        raise RegistrationError("build/modules.json has no runtimeAssets mapping")

    changes: list[str] = []
    for section, new_path, anchor in (
        ("background", GITHUB_SERVICE, "shared/sync-service.js"),
        ("options", GITHUB_OPTIONS, "settings/options-account-sync.js"),
    ):
        block = assets.get(section)
        registered = block.get("required") if isinstance(block, dict) else None
        if not isinstance(registered, list) or anchor not in registered:
            raise RegistrationError(f"Missing {section} required-assets anchor: {anchor}")
        if new_path not in registered:
            registered.insert(registered.index(anchor) + 1, new_path)
            changes.append(f"Register {new_path} in build/modules.json")

    # The runtime verifier deliberately treats static background services
    # differently from importScripts-owned feature modules.
    special_match = re.search(r"(?m)^\s*special\s*=\s*\{[^}\r\n]*\}", verifier_original)
    if not special_match or '"shared/sync-service.js"' not in special_match.group():
        raise RegistrationError("Verifier's background special-registration anchor has changed")
    special = special_match.group()
    if f'"{GITHUB_SERVICE}"' not in special:
        special = special[:-1].rstrip() + f', "{GITHUB_SERVICE}"' + "}"
        changes.append("Register static background service in runtime verifier")
    verifier_updated = (
        verifier_original[:special_match.start()] + special + verifier_original[special_match.end():]
    )

    # Firefox uses a static background scripts array instead of Chrome's
    # MV3 service worker. Modify only the firefox_manifest() function.
    fx_start = builder_original.find("def firefox_manifest(")
    fx_end = builder_original.find("\ndef ", fx_start + 4)
    if fx_start < 0:
        raise RegistrationError("Firefox build function not found in scripts/build_extension.py")
    if fx_end < 0:
        fx_end = len(builder_original)
    fx_body = builder_original[fx_start:fx_end]
    script_list = re.search(
        r'background_script_imports\(\)\s*\+\s*\[([^\]\r\n]*)\]', fx_body
    )
    if not script_list or '"shared/sync-service.js"' not in script_list.group(1):
        raise RegistrationError("Firefox static background scripts anchor has changed")
    entries = script_list.group(1)
    if f'"{GITHUB_SERVICE}"' not in entries:
        entries = entries.replace(
            '"shared/sync-service.js"',
            '"shared/sync-service.js", "shared/github-backup-service.js"',
            1,
        )
        changes.append("Register GitHub service in Firefox background scripts")
    fx_body = fx_body[:script_list.start(1)] + entries + fx_body[script_list.end(1):]
    builder_updated = builder_original[:fx_start] + fx_body + builder_original[fx_end:]

    modules_updated = (
        json.dumps(modules, indent=2, ensure_ascii=False) + "\n"
        if any("build/modules.json" in c for c in changes)
        else modules_original
    )
    return {
        module_path: modules_updated,
        verifier_path: verifier_updated,
        builder_path: builder_updated,
    }, changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", nargs="?", help="Full QoL source repository folder")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--check", action="store_true", help="Verify registration without changing files")
    actions.add_argument("--dry-run", action="store_true", help="Preview changes without writing")
    args = parser.parse_args()
    try:
        repo = find_repo(args.repository)
        updates, changes = prepare(repo)  # Full preflight: no writes until all checks pass.
        if args.check:
            if changes:
                print("GitHub backup registration is incomplete:\n  - " + "\n  - ".join(changes))
                return 1
            print("PASS: GitHub backup registered for source verification and Firefox builds")
            return 0
        if not changes:
            print("Already registered. No files changed.")
            return 0
        prefix = "Would update" if args.dry_run else "Updated"
        for change in changes:
            print(f"{prefix}: {change}")
        if not args.dry_run:
            for path, content in updates.items():
                if path.read_text(encoding="utf-8-sig") != content:
                    path.write_text(content, encoding="utf-8", newline="\n")
            print("Done. Verify with: python register_github_backup.py --check")
            print("Then run: python build/verify_runtime.py")
        print("manifest.json, user data and extension version were not modified.")
        return 0
    except (RegistrationError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

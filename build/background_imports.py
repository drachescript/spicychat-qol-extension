#!/usr/bin/env python3
"""Extract ordered literal importScripts calls from the background worker.

Chrome's service worker may split imports into multiple calls to conditionally
load independently owned features. Firefox's classic-background build needs
the complete ordered list; inspecting only the first call silently loses event
handlers. Unknown/dynamic arguments are rejected, never guessed.
"""
from pathlib import Path
import re

CALL = re.compile(r"\bimportScripts\s*\(([^;]*)\)\s*;", re.S)
LITERALS = re.compile(r'''(?:"([^"]+)"|'([^']+)')''')
ARGS = re.compile(r'''\s*(?:"[^"]+"|'[^']+')\s*(?:,\s*(?:"[^"]+"|'[^']+')\s*)*''', re.S)


def parse_background_imports(source: str) -> list[str]:
    calls = list(CALL.finditer(source))
    # Catch new syntax not understood by the parser rather than skipping code.
    if len(calls) != len(re.findall(r"\bimportScripts\s*\(", source)):
        raise ValueError("Unsupported background importScripts expression")
    if not calls:
        raise ValueError("background-entry.js has no importScripts calls")
    files: list[str] = []
    for call in calls:
        args = call.group(1)
        if not ARGS.fullmatch(args):
            raise ValueError("Background importScripts accepts only literal JS paths")
        for literal in LITERALS.finditer(args):
            path = literal.group(1) or literal.group(2)
            if (not path.endswith(".js") or path.startswith("/")
                    or ".." in Path(path).parts or "\\" in path):
                raise ValueError(f"Unsafe background import path: {path!r}")
            files.append(path)
    if len(files) != len(set(files)):
        raise ValueError("background-entry.js contains duplicate imports")
    return files

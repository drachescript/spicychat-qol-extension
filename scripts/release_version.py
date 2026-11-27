"""Canonical release identity; no network or publishing side effects."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)')

def manifest_version(manifest):
    version = manifest.get('version')
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError(f'Invalid canonical manifest version: {version!r}')
    if 'version_name' in manifest:
        raise ValueError('Remove version_name; manifest.version is the only release version')
    if any(int(part) > 65535 for part in version.split('.')) or version == '0.0.0':
        raise ValueError(f'Invalid browser manifest version: {version}')
    return version

def changelog_section(changelog, version):
    headings = list(re.finditer(r'(?m)^##[ \t]+([^\r\n]+?)[ \t]*\r?$', changelog))
    matches = [i for i, heading in enumerate(headings) if heading.group(1) == version]
    if len(matches) != 1:
        raise ValueError(f'CHANGELOG.md must have exactly one ## {version} section')
    i = matches[0]
    end = headings[i+1].start() if i+1 < len(headings) else len(changelog)
    return changelog[headings[i].start():end].strip()

def validate_source(root=ROOT):
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    version = manifest_version(manifest)
    changelog_section((root / 'CHANGELOG.md').read_text(encoding='utf-8'), version)
    return version

def tag_parts(tag):
    match = re.fullmatch(r'v([0-9]+)\.([0-9]+)\.([0-9]+)', tag)
    return tuple(map(int, match.groups())) if match else None

def new_release_allowed(version, tags):
    """Allow canonical replacement of an equivalent historical padded tag.
    Do not alter that historical tag or its release. Never auto-publish older versions.
    """
    target = 'v' + version
    current = tuple(map(int, version.split('.')))
    stable = [parts for tag in tags if (parts := tag_parts(tag)) is not None]
    if stable and current < max(stable):
        raise ValueError(f'Manifest version {version} is older than latest stable tag')
    return target not in tags

if __name__ == '__main__':
    print(validate_source())

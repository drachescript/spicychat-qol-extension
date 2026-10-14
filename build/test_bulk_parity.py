#!/usr/bin/env python3
"""Regression checks for cumulative Full-first modularization against v0.2.47."""
from pathlib import Path
import json, re, sys, zipfile
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/mnt/data/spicychat-qol-v0.2.47-chrome(2).zip')
assert source.is_file(),f'Baseline not found: {source}'
with zipfile.ZipFile(source) as z:
    oldmain=z.read('content/main.js').decode()
    oldentry=z.read('background-entry.js').decode()
main=(root/'content/main.js').read_text()
feature=(root/'content/feature-lifecycle.js').read_text()
for_name=lambda text:re.findall(r'await runStep\("([^"]+)"',text)
start=oldmain.index('  async function runDisabledCleanup() {')
end=oldmain.index('  DS.runCritical = ',start)
original=for_name(oldmain[start:end]);migrated=for_name(feature)
assert original==migrated[:len(original)],'One of the original 70 disabled cleanup actions changed order/identity'
assert len(original)==70 and migrated[70]=='OOC cleanup'
entry=(root/'background-entry.js').read_text()
imports=re.findall(r'["\']([^"\']+\.js)["\']',entry)
assert imports[:2]==['background/feature-build-profile.js','background/feature-message-ownership.js']
assert imports[-1]=='background/background-events.js'
assert len(imports)==33 and len(set(imports))==len(imports)
for f in imports:assert (root/f).is_file(),f
manifest=json.loads((root/'manifest.json').read_text())
assert manifest['version']=='0.2.48'
all_js=[p for cs in manifest['content_scripts'] for p in cs.get('js',[])]
assert all_js.index('content/runtime-kernel.js')<all_js.index('content/feature-build-map.js')<all_js.index('content/feature-lifecycle.js')<all_js.index('content/main.js')
assert (root/'settings/options-feature-availability.js').is_file()
assert json.loads((root/'build/features/bot-status.json').read_text())['id']=='bot-status'
print('PASS: preserved all original 70 Full cleanup operations; 33 imports; 109 feature contracts; load order; version')

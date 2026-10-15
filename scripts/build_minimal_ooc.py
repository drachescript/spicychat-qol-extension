#!/usr/bin/env python3
"""Build the experimental Core + OOC browser package from Full QoL's OOC modules.

This builder is deliberately recipe-specific. Arbitrary Custom combinations remain disabled.
No network, GitHub, or store publishing occurs.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[1]
CONTENT_SCRIPTS=[
    'content/core-settings-defaults.js',  # Shared Full defaults / built-in OOC text
    'custom/ooc-runtime-core.js',           # Minimal Core adapter, storage and lifecycle
    'content/ooc.js',                    # Exactly Full's template insertion logic
    'content/ooc-composer.js',           # Exactly Full's composer controls
]
CSS=['content/styles/ooc.css']
OPTIONS=['custom/ooc-options.html', 'custom/ooc-options.css', 'custom/ooc-options.js']
ICON='icons/icon48.png'
OMISSIONS={'content/chat-ui.js','content/main.js','content/quick-panel.js','options.html','options.js','background.js','background-entry.js','content.css'}

def make_manifest() -> dict:
    src=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
    version=src['version']
    if not isinstance(version,str) or not version.count('.') == 2:
        raise ValueError('Invalid source extension version')
    return {
      'manifest_version':3,
      'name':'SpicyChat QoL — Core + OOC (test)',
      'version':version,
      'description':'Experimental minimal installation: OOC presets and chat composer controls only.',
      'permissions':['storage'],
      'content_scripts':[{'matches':['https://spicychat.ai/chat/*','https://www.spicychat.ai/chat/*',
                                     'https://spicychat.ai/*/chat/*','https://www.spicychat.ai/*/chat/*'],
                          'js':CONTENT_SCRIPTS,'css':CSS,'run_at':'document_idle'}],
      'options_page':'custom/ooc-options.html',
      'action':{'default_title':'Core + OOC test — open settings via extension details',
                'default_icon':{'48':ICON}},
      'icons':{'48':ICON},
    }

def build(output:Path):
    manifest=make_manifest()
    files=CONTENT_SCRIPTS+CSS+OPTIONS+[ICON]
    for name in files:
        path=ROOT/name
        if not path.is_file():raise FileNotFoundError(f'Minimal package requires {name}')
    if len(files)!=len(set(files)):raise ValueError('Duplicate recipe paths')
    assert OMISSIONS.isdisjoint(files)
    output.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=8) as z:
        z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
        for name in files:z.write(ROOT/name,arcname=name)
    with ZipFile(output) as z:
        names=set(z.namelist())
        assert not (OMISSIONS & names)
        assert len(names)==len(z.namelist())
        packaged=json.loads(z.read('manifest.json'))
        assert packaged['permissions']==['storage']
        assert packaged['content_scripts'][0]['js']==CONTENT_SCRIPTS
        assert set(packaged['content_scripts'][0]['js']).issubset(names)
        assert packaged['options_page'] in names
    print(f'Experimental Core + OOC ZIP: {output} ({len(files)+1} files, {output.stat().st_size:,} bytes)')

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,default=ROOT/'dist/spicychat-qol-core-ooc-test.zip')
    args=p.parse_args()
    build(args.output)

#!/usr/bin/env python3
"""Opt-in merge of three *experimental* feature contracts into qol-custom.

Run in a checked-out `qol-custom` source that already contains the matching
feature runtime/settings files. This does not certify Lite package safety.
DO NOT run against the distributed Chrome ZIP or use as a release action.
"""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CONTRACTS={
 'model-quick-access':('Model Quick Access','Custom ordered shortcuts in native model menus.','Chat Tools','chat',['model-selector']),
 'chat-lorebook-manager':('Chat Lorebook Manager','Draft lorebook entries from chat messages and Memories; review them in the native editor.','Lorebooks','chat',[]),
 'previously-chatted-indicator':('Previously Chatted Indicator','Distinguish confirmed user messages from prior or merely opened chats.','Organization','listings',['opened-chats'])
}

def source_contract(fid, dependencies):
    settings={
      'model-quick-access':['enableModelQuickAccess','modelQuickAccessNames'],
      'chat-lorebook-manager':['enableChatLorebookManager'],
      'previously-chatted-indicator':['enablePreviouslyChattedIndicator','chattedIndicatorShowOpened']
    }[fid]
    return {'id':fid,'primary':f'content/{fid}.js','type':'content','dependencies':dependencies,
        'settingsKeys':settings,'requiredHelpers':[],
        'settingsFiles':[f'settings/feature-panels/{fid}.js'],
        'styleFiles':[f'content/styles/{fid}.css'],
        'backgroundFiles':[],
        'settingsMarkupIsolated':True,'settingsIsolated':False,
        'stylesIsolated':False,'backgroundIsolated':False,'browserVerified':False}

def merge(root):
    catalog_path=root/'build/feature-catalog.json'
    if not catalog_path.exists():raise RuntimeError('Missing Custom catalog; merge this into a qol-custom source checkout, not the Chrome ZIP')
    cat=json.loads(catalog_path.read_text())
    if cat.get('status')!='experimental-unverified':raise RuntimeError('Refusing to overwrite a certified catalog')
    features={f['id']:f for f in cat['features']}
    if len(features)!=len(cat['features']):raise RuntimeError('Duplicate existing feature ids')
    updates={}
    for fid,(label,description,section,group,deps) in CONTRACTS.items():
        contract=source_contract(fid,deps)
        for path in [contract['primary'],*contract['settingsFiles'],*contract['styleFiles']]:
            if not (root/path).is_file():raise RuntimeError('Missing source asset: '+path)
        for dependency in deps:
            if dependency not in features:raise RuntimeError('Missing feature dependency: '+dependency)
        if fid in features:raise RuntimeError('Feature already in Custom catalog: '+fid)
        updates[fid]=(contract,{'id':fid,'label':label,'description':description,'section':section,'group':group,
            'requiredFeatures':deps,'runtimeScripts':[contract['primary']],'requiredHelpers':[],
            'cssFiles':contract['styleFiles'],'settingsScripts':contract['settingsFiles'],
            'backgroundFiles':[],'backgroundServices':[],'settingKeys':contract['settingsKeys'],
            'settingsMarkupIsolated':True,'customBuildStatus':'experimental-unverified',
            'fullRuntimeStatus':'lifecycle-gated',
            'blockers':['Shared Settings/background/runtime and independent browser behavior not fully certified.'],
            'isolation':{'settings':False,'styles':False,'background':False,'browserVerified':False}})
    for fid,(contract,entry) in updates.items():
        target=root/'build/features'/f'{fid}.json'
        if target.exists():raise RuntimeError('Feature contract already exists: '+fid)
    # The validation above happens before all writes.
    for fid,(contract,entry) in updates.items():
        (root/'build/features'/f'{fid}.json').write_text(json.dumps(contract,indent=2)+'\n')
        cat['features'].append(entry)
        cat['allContentScriptPaths'].append(contract['primary'])
    cat['features'].sort(key=lambda v:v['id'])
    cat['allContentScriptPaths']=sorted(set(cat['allContentScriptPaths']))
    cat['featureCount']=len(cat['features'])
    cat['version']=json.loads((root/'manifest.json').read_text(encoding='utf8'))['version']
    cat['status']='experimental-unverified'
    catalog_path.write_text(json.dumps(cat,indent=2)+'\n')
    return cat['featureCount']
if __name__=='__main__':
    print('Custom feature count:',merge(ROOT),'(still experimental)')

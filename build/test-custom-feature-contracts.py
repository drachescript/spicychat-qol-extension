import importlib.util,json,tempfile,shutil
from pathlib import Path
R=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('custom',R/'build/register-custom-feature-contracts.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as td:
 s=Path(td);(s/'build/features').mkdir(parents=True)
 cat={'status':'experimental-unverified','featureCount':2,
      'features':[{'id':'model-selector'},{'id':'opened-chats'}],
      'allContentScriptPaths':['content/model-selector.js','content/opened-chats.js']}
 (s/'build/feature-catalog.json').write_text(json.dumps(cat))
 shutil.copy(R/'manifest.json',s/'manifest.json')
 for id in m.CONTRACTS:
  for p in [f'content/{id}.js',f'content/styles/{id}.css',f'settings/feature-panels/{id}.js']:
   to=s/p;to.parent.mkdir(parents=True,exist_ok=True);shutil.copy(R/p,to)
 n=m.merge(s)
 assert n==5
 cat=json.loads((s/'build/feature-catalog.json').read_text())
 assert cat['version']==json.loads((R/'manifest.json').read_text())['version'] and cat['featureCount']==5
 assert set(m.CONTRACTS)<=set(x['id'] for x in cat['features'])
 assert all(not x['isolation']['browserVerified'] for x in cat['features'] if x['id'] in m.CONTRACTS)
 try:m.merge(s)
 except RuntimeError:pass
 else:raise AssertionError('Duplicate Custom registration should fail')
print('PASS: 3 Custom feature contracts, dependencies and safety/duplicate guards')

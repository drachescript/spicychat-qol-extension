import importlib.util
import json
import shutil
import tempfile
from pathlib import Path
R=Path(__file__).resolve().parent.parent
P=R/'build/verify-feature-package-closure.py'
s=importlib.util.spec_from_file_location('feature_package_audit',P);mod=importlib.util.module_from_spec(s);s.loader.exec_module(mod)
assert mod.inspect(R)['pass'],mod.inspect(R)['issues']
with tempfile.TemporaryDirectory(prefix='feature-lite-audit-') as temp:
    stage=Path(temp)
    shutil.copy(R/'manifest.json',stage/'manifest.json')
    shutil.copy(R/'options.html',stage/'options.html')
    manifest=json.loads((R/'manifest.json').read_text())
    required={p for item in manifest['content_scripts'] for group in ('js','css') for p in item.get(group,[])}
    required|={path.relative_to(R).as_posix() for path in (R/'settings/feature-panels').glob('*.js')}
    for path in required:
        to=stage/path;to.parent.mkdir(parents=True,exist_ok=True);shutil.copy(R/path,to)
    sel={'model-quick-access','previously-chatted-indicator'}
    result=mod.prune_stage(stage,sel)
    assert result['pass'], result
    assert not result['certifiedArbitraryLite']
    for name, contract in mod.CONTRACTS.items():
        for path in [contract['runtime'],contract['panel'],contract['style']]:
            assert (stage/path).exists() == (name in sel),(name,path)
    assert not (stage/'content/chat-lorebook-manager.js').exists()
    assert 'settings/feature-panels/chat-lorebook-manager.js' not in (stage/'options.html').read_text()
    assert 'settings/feature-panels/chat-search.js' in (stage/'options.html').read_text()
print('PASS: source closure and source-stage selection/omission; uncertified legacy Lite status explicit')

"""Run: python build/test-feature-settings-prune.py"""
import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('prune_settings', Path(__file__).with_name('prune-feature-settings.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def main():
    html = (ROOT / 'options.html').read_text()
    scripts = module.PANEL_TAG.findall(html)
    slots = module.SLOT_TAG.findall(html)
    assert len(set(scripts)) == len(scripts) >= 26, len(scripts)
    assert set(slots) <= set(scripts)
    with tempfile.TemporaryDirectory(prefix='qol-settings-prune-') as td:
        stage = Path(td)
        (stage / 'options.html').write_text(html)
        (stage / 'settings' / 'feature-panels').mkdir(parents=True)
        for feature_id in scripts:
            (stage / 'settings' / 'feature-panels' / (feature_id + '.js')).write_text('stub')
        keep = {'chat-search', 'picture-library'}
        html_path, pruned, preserved, omitted = module.plan(stage, keep)
        assert html_path == stage / 'options.html'
        assert set(preserved) == keep
        assert set(omitted) == set(scripts) - keep
        assert set(module.PANEL_TAG.findall(pruned)) == keep
        assert set(module.SLOT_TAG.findall(pruned)) == set(slots) & keep
        assert 'settings/options-feature-availability.js' in pruned
        assert 'settings/options-settings-defaults.js' in pruned
        assert 'settings/feature-panels/chat-search.js' in pruned
        assert 'settings/feature-panels/translation.js' not in pruned
        (stage / 'settings' / 'feature-panels' / 'chat-search.js').unlink()
        try: module.plan(stage, keep)
        except ValueError as ex: assert 'missing' in str(ex)
        else: raise AssertionError('Missing selected file was not detected')
    print('PASS: panel package inclusion/omission, host slots, shared controllers, missing-file guard')

if __name__ == '__main__':main()

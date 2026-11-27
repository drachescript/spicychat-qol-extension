import unittest
from release_version import manifest_version, changelog_section, new_release_allowed
from build_extension import output_name

class ReleaseVersionTests(unittest.TestCase):
    def test_one_version(self):
        self.assertEqual(manifest_version({'version':'0.3.2'}), '0.3.2')
        for manifest in ({'version':'0.3.02'}, {'version':'0.3.2','version_name':'0.3.2'}, {'version':'0.3.65536'}, {'version':'0.0.0'}, {}):
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                manifest_version(manifest)

    def test_history_and_current_section(self):
        text = '## 0.3.2\n- Current\n\n## 0.3.02\n- Historical\n\n## 0.3.01\n- Earlier\n'
        self.assertEqual(changelog_section(text,'0.3.2'), '## 0.3.2\n- Current')
        with self.assertRaises(ValueError):
            changelog_section(text,'0.3.3')
        with self.assertRaises(ValueError):
            changelog_section(text + '\n## 0.3.2\n- Duplicate', '0.3.2')

    def test_preserve_historical_tags(self):
        historical = ['v0.3.02','v0.3.01','v0.3.1','v0.3.0','dev-build']
        self.assertTrue(new_release_allowed('0.3.2',historical))
        self.assertFalse(new_release_allowed('0.3.2',historical+['v0.3.2']))
        with self.assertRaises(ValueError):
            new_release_allowed('0.3.1',historical+['v0.3.2'])
        self.assertTrue(new_release_allowed('0.3.3',historical+['v0.3.2']))

    def test_package_names(self):
        for target in ('chrome','firefox'):
            self.assertEqual(output_name('0.3.2',{},False,target),f'spicychat-qol-v0.3.2-{target}.zip')
            self.assertEqual(output_name('0.3.2',{'filenameSuffix':'custom'},False,target),f'spicychat-qol-custom-v0.3.2-{target}.zip')
            self.assertEqual(output_name('0.3.2',{},True,target),f'spicychat-qol-dev-{target}.zip')

if __name__ == '__main__':
    unittest.main()

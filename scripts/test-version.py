"""Exécuter avec python3 scripts/test-version.py."""
from pathlib import Path
import runpy
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = runpy.run_path(str(ROOT / 'scripts/generate-static.py'))


class VersionTests(unittest.TestCase):
    def test_static_verification_comes_from_dedicated_file(self):
        def read(name):
            if name == 'derniere-verification.json':
                return json.dumps({'date': '15/11/2026', 'heure': '09h42'})
            return (ROOT / name).read_text()
        page = GENERATOR['generate'](read)
        self.assertIn('Contenu à jour au 15/11/2026 à 09h42', page)
        self.assertNotIn('{heure}', page)

    def test_identical_inputs_keep_the_same_version(self):
        read = lambda name: (ROOT / name).read_text()
        page = GENERATOR['generate'](read)
        self.assertEqual(GENERATOR['build_version'](read, page), GENERATOR['build_version'](read, page))

    def test_every_public_input_changes_the_version(self):
        inputs = {name: (ROOT / name).read_text() for name in GENERATOR['VERSION_INPUTS']}
        original = GENERATOR['build_version'](inputs.__getitem__, 'page')
        for name in inputs:
            with self.subTest(name=name):
                changed = dict(inputs)
                changed[name] += '\n'
                self.assertNotEqual(original, GENERATOR['build_version'](changed.__getitem__, 'page'))

    def test_new_static_page_changes_the_version(self):
        read = lambda name: (ROOT / name).read_text()
        self.assertNotEqual(GENERATOR['build_version'](read, 'day one'), GENERATOR['build_version'](read, 'day two'))


if __name__ == '__main__':
    unittest.main()

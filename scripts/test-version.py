"""Exécuter avec python3 scripts/test-version.py."""
from pathlib import Path
import runpy
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = runpy.run_path(str(ROOT / 'scripts/generate-static.py'))


class VersionTests(unittest.TestCase):
    def test_static_page_omits_availability_banner(self):
        page = GENERATOR['generate'](lambda name: (ROOT / name).read_text())
        self.assertNotIn('<aside class="availability-note">', page)
        self.assertNotIn('Les nouveaux cours du Moodle SSU sont ajoutés ici', page)

    def test_static_course_information_matches_date_and_resource_rules(self):
        texts = json.loads((ROOT / 'textes.json').read_text())
        info = GENERATOR['course_information']
        base = {'Visio': 'Oui', 'date': '15/11/2026'}
        self.assertEqual(info(base, '2026-11-14', texts), texts['cours']['ressources_a_venir'])
        for today in ['2026-11-15', '2026-11-16']:
            self.assertEqual(info(base, today, texts), texts['cours']['ressources_en_attente'])
        self.assertEqual(info({**base, 'information': 'Précision'}, '2026-11-14', texts), 'Précision')
        for override in [{'video_link_1': '/video'}, {'pdf_link': '/pdf'}, {'Visio': ''}, {'date': ''}]:
            self.assertEqual(info({**base, **override}, '2026-11-14', texts), '')

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

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const texts = JSON.parse(fs.readFileSync(path.join(root, 'textes.json'), 'utf8'));
const context = vm.createContext({ SiteTexts: { get: key => key.split('.').reduce((node, part) => node[part], texts) } });
vm.runInContext(fs.readFileSync(path.join(root, 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, ''), context);
const base = { Presentiel: 'Oui', information: '', video_link_1: '', pdf_link: '', date: '15/11/2026' };
const info = (values = {}, now = '2026-11-14T12:00:00Z') => context.courseInformation({ ...base, ...values }, new Date(now));
test('présentiel et visio : message futur, aujourd’hui et passé', () => {
    for (const mode of [{ Presentiel: 'Oui' }, { Presentiel: '', Visio: 'Oui' }]) {
        assert.equal(info(mode), texts.cours.ressources_a_venir);
        assert.equal(info({ ...mode, date: '14/11/2026' }), texts.cours.ressources_en_attente);
        assert.equal(info({ ...mode, date: '13/11/2026' }), texts.cours.ressources_en_attente);
    }
});
test('les informations du CSV priment ; vidéo, PDF, absence de modalité ou de date excluent le message', () => {
    assert.equal(info({ information: '  Message spécifique  ' }), 'Message spécifique');
    for (const values of [{ video_link_1: '/video' }, { pdf_link: '/pdf' }, { Presentiel: '' }, { date: '' }]) {
        assert.equal(info(values), '');
    }
    assert.equal(info({ information: '  ', video_link_1: ' ', pdf_link: ' ' }), texts.cours.ressources_a_venir);
});
test('le changement de jour suit Paris ; les liens antérieurs ne bloquent pas le message', () => {
    assert.equal(info({}, '2026-11-14T23:30:00Z'), texts.cours.ressources_en_attente);
    assert.equal(info({ video_link_1_anterieur: '/old', pdf_link_anterieur: '/oldpdf' }), texts.cours.ressources_a_venir);
    // La règle porte explicitement sur video_link_1 et pdf_link.
    assert.equal(info({ video_link_2: '/part2' }), texts.cours.ressources_a_venir);
});

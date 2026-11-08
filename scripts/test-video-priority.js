'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const texts = JSON.parse(fs.readFileSync(path.join(root, 'textes.json'), 'utf8'));
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    addEventListener() {}
}
function render(values) {
    const context = vm.createContext({
        document: { createElement: tag => new Element(tag) },
        localStorage: { getItem: () => null },
        SiteTexts: { get: key => key.split('.').reduce((value, part) => value[part], texts) },
        course: { id: 'test', cours: 'Cours', date: '', ...values },
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, ''), context);
    const item = vm.runInContext('renderCourse(course)', context);
    return item.children.find(node => node.className === 'course-links').children;
}
const previous = { video_link_1_anterieur: '/old1', video_link_2_anterieur: '/old2' };
test('une seule vidéo normale masque toutes les vidéos antérieures, sans fausse première partie', () => {
    const links = render({ ...previous, video_link_1: '/current' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/current']);
    assert.equal(links[0].children[1].textContent, texts.cours.enregistrement);
});
test('le second lien normal seul suffit également à masquer les antérieurs', () => {
    const links = render({ ...previous, video_link_2: '/current2' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/current2']);
});
test('les vidéos antérieures restent proposées en absence de liens normaux', () => {
    const links = render(previous);
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/old1', '/old2']);
});
test('un PDF normal masque le PDF antérieur', () => {
    const links = render({ ...previous, video_link_1: '/current', pdf_link: '/pdf', pdf_link_anterieur: '/old-pdf' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/current', '/pdf']);
});
test('un PDF antérieur reste disponible même avec une vidéo normale', () => {
    const links = render({ video_link_1: '/current', pdf_link_anterieur: '/old-pdf' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/current', '/old-pdf']);
});
test('une vidéo antérieure reste disponible même avec un PDF normal', () => {
    const links = render({ ...previous, pdf_link: '/pdf', pdf_link_anterieur: '/old-pdf' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/old1', '/old2', '/pdf']);
});
test('les deux liens de secours restent affichés avec les vidéos normales', () => {
    const links = render({ ...previous, video_link_1: '/current1', video_link_2: '/current2',
        video_link_1_backup: '/backup1', video_link_2_backup: '/backup2' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/current1', '/current2', '/backup1', '/backup2']);
    assert.match(links.find(node => node.href === '/backup1').children[1].textContent, /lien alternatif/);
});
test('un lien de secours seul est disponible, sans faux message d’absence', () => {
    const links = render({ video_link_1_backup: '/backup' });
    assert.equal(links[0].href, '/backup');
    assert.equal(links.filter(node => node.className === 'badge resource-unavailable').length, 1); // PDF absent uniquement.
});
test('le secours ne masque pas les vidéos antérieures quand aucun lien normal n’existe', () => {
    const links = render({ ...previous, video_link_1_backup: '/backup' });
    assert.deepEqual(links.filter(node => node.href).map(node => node.href), ['/backup', '/old1', '/old2']);
});

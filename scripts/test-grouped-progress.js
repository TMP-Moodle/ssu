'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, '');
const texts = JSON.parse(fs.readFileSync(path.join(root, 'textes.json'), 'utf8'));
const prefix = 'tmp-moodle:completed:';
const id = number => `S3_UE2.5_COURS${number}`;
const groupId = id('7ET8ET11');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; this.style = { setProperty: (name, value) => { this.style[name] = value; } }; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    querySelectorAll(selector) {
        assert.equal(selector, '.form-check-input:checked');
        return walk(this).filter(node => node.className === 'form-check-input' && node.checked);
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, handler) { this.events[name] = handler; }
}
const walk = node => [node, ...node.children.flatMap(walk)];
function browser(completed = []) {
    const storage = new Map(completed.map(id => [prefix + id, 'true']));
    const context = vm.createContext({
        URL, document: { createElement: tag => new Element(tag), createDocumentFragment: () => new Element('fragment'), getElementById: () => null },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        SiteTexts: { get(key, args = {}) { return key.split('.').reduce((value, part) => value[part], texts).replace(/\{(\w+)\}/g, (_, key) => args[key]); } },
    });
    vm.runInContext(code, context);
    context.confetti = [];
    context.launchConfetti = origin => context.confetti.push(origin);
    const render = id => {
        context.course = { id, cours: 'Cours test', cours_nom: 'Cours test', semestre: '3', ue_numero: '2.5', date: '' };
        const item = vm.runInContext('renderCourse(course)', context);
        return walk(item).find(node => node.tag === 'input');
    };
    return { storage, context, render };
}
function toggle(checkbox, checked) { checkbox.checked = checked; checkbox.events.change(); }
test('les ID acceptent un nombre quelconque de composants séparés par ET', () => {
    const { context } = browser();
    for (const value of [id('6ET7'), groupId, id('1ET2ET3ET4ET5ET6ET7ET8ET9ET10ET11')]) {
        context.id = value;
        assert.equal(vm.runInContext('COURSE_ID_PATTERN.test(id)', context), true);
    }
    for (const value of [id('7ET'), id('7ETabc'), id('7ETET8')]) {
        context.id = value;
        assert.equal(vm.runInContext('COURSE_ID_PATTERN.test(id)', context), false);
    }
});
test('au chargement, le groupe est terminé seulement si tous ses composants le sont', () => {
    assert.equal(browser([id(7), id(8)]).render(groupId).checked, false);
    assert.equal(browser([id(7), id(8), id(11)]).render(groupId).checked, true);
    assert.equal(browser([groupId]).render(groupId).checked, false);
});
test('cocher le groupe synchronise les cours individuels, les autres groupes et les compteurs', () => {
    const { context, render, storage } = browser();
    const parts = [7, 8, 11].map(n => render(id(n)));
    const otherGroup = render(id('8ET11'));
    const unrelated = render('S3_UE2.8_COURS7');
    const group = render(groupId);
    let updates = 0;
    context.updateCounter = () => { updates++; assert.ok(parts.every(checkbox => checkbox.checked)); };
    vm.runInContext('progressListeners.add(updateCounter)', context);
    toggle(group, true);
    assert.ok(parts.every(checkbox => checkbox.checked));
    assert.equal(otherGroup.checked, true);
    assert.equal(unrelated.checked, false);
    assert.equal(updates, 1);
    assert.deepEqual([...storage.keys()].sort(), [7, 8, 11].map(n => prefix + id(n)).sort());
});
test('cocher ou décocher un cours individuel recalcule immédiatement le groupe', () => {
    const { render, storage } = browser([id(8), id(11)]);
    const group = render(groupId);
    const course7 = render(id(7));
    assert.equal(group.checked, false);
    toggle(course7, true);
    assert.equal(group.checked, true);
    toggle(course7, false);
    assert.equal(group.checked, false);
    assert.equal(storage.get(prefix + id(8)), 'true');
});
test('décocher le groupe décoche tous les composants et les groupes chevauchants', () => {
    const { render, storage } = browser([id(7), id(8), id(11)]);
    const parts = [7, 8, 11].map(n => render(id(n)));
    const overlapping = render(id('11ET7'));
    const group = render(groupId);
    toggle(group, false);
    assert.ok(parts.every(checkbox => !checkbox.checked));
    assert.equal(overlapping.checked, false);
    assert.equal(storage.size, 0);
});
test('le suivi persiste même si les lignes individuelles ne sont pas affichées', () => {
    const { render, storage } = browser();
    toggle(render(groupId), true);
    const completed = [...storage.keys()].map(key => key.slice(prefix.length));
    const reloaded = browser(completed);
    assert.equal(reloaded.render(groupId).checked, true);
    assert.equal(reloaded.render(id(7)).checked, true);
});
test('les cours regroupés déjà terminés ne sont pas proposés à rattraper', () => {
    const { context } = browser([id(7), id(8), id(11)]);
    context.courses = [{ id: groupId, semestre: '3', ue_numero: '2.5', cours_numero: '7', date: '01/01/2026' }];
    assert.equal(vm.runInContext('coursesByDay(courses, new Date(2026, 10, 8))[0].courses.length', context), 0);
});
test('un refus de stockage laisse les cases cohérentes et affiche une erreur', () => {
    const { context, render } = browser();
    const group = render(groupId);
    context.localStorage.setItem = () => { throw new Error('Stockage refusé'); };
    assert.doesNotThrow(() => toggle(group, true));
    assert.equal(group.checked, false);
    assert.equal(vm.runInContext(`completionControls.get('${groupId}').feedback.textContent`, context), texts.messages.stockage);
});
test('le compteur compte les lignes présentes, jamais les composants absents du CSV', () => {
    for (const numbers of [['7ET8ET9'], ['7ET8ET9', '12'], ['7ET8ET9', '7', '12']]) {
        const { context } = browser();
        context.courses = numbers.map(number => ({ id: id(number), cours: 'Cours test', cours_nom: 'Cours test',
            semestre: '3', ue_numero: '2.5', ue_nom: 'UE test', UE: 'UE test', date: '' }));
        context.accordion = new Element('div');
        context.accordion.id = 'test';
        vm.runInContext('renderUEs(courses, accordion)', context);
        const nodes = walk(context.accordion);
        const counter = nodes.find(node => node.className === 'ue-progress');
        const checkbox = nodes.find(node => node.id === `completed-${id('7ET8ET9')}`);
        assert.equal(counter.textContent, `0/${numbers.length}`);
        assert.equal(counter.style['--ue-completion'], 0);
        toggle(checkbox, true);
        assert.equal(counter.textContent, `${numbers.includes('7') ? 2 : 1}/${numbers.length}`);
        assert.equal(counter.style['--ue-completion'], (numbers.includes('7') ? 2 : 1) / numbers.length);
        assert.equal(nodes.find(node => node.id === id('7ET8ET9')).attributes['data-completed'], 'true');
        toggle(checkbox, false);
        assert.equal(nodes.find(node => node.id === id('7ET8ET9')).attributes['data-completed'], 'false');
        assert.equal(counter.style['--ue-completion'], 0);
        assert.equal(counter.textContent, `0/${numbers.length}`);
    }
});

test('la dernière case d’une UE lance aussi les confettis locaux', () => {
    const { context } = browser([id(7)]);
    context.courses = [7, 8].map(number => ({ id: id(number), cours: 'Test', cours_nom: 'Test',
        semestre: '3', ue_numero: '2.5', ue_nom: 'Test', UE: 'Test', date: '' }));
    context.accordion = new Element('div');
    context.accordion.id = 'test';
    vm.runInContext('renderUEs(courses, accordion)', context);
    const checkbox = walk(context.accordion).find(node => node.id === `completed-${id(8)}`);
    assert.equal(context.confetti.length, 0);
    toggle(checkbox, true);
    assert.deepEqual(context.confetti, [checkbox]);
    vm.runInContext('syncCourseProgress()', context);
    assert.equal(context.confetti.length, 1);
    toggle(checkbox, false);
    assert.equal(context.confetti.length, 1);
});

test('chaque case cochée lance des confettis, sans effet au décochage ni en cas d’erreur', () => {
    const { context, render } = browser();
    const first = render(id(7));
    const second = render(id(8));
    toggle(first, true);
    toggle(second, true);
    assert.deepEqual(context.confetti, [first, second]);
    toggle(first, false);
    assert.equal(context.confetti.length, 2);
    context.localStorage.setItem = () => { throw new Error('Stockage refusé'); };
    toggle(first, true);
    assert.equal(context.confetti.length, 2);
});

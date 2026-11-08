'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(root, 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, ''), context);
function sort(courses) {
    context.courses = courses.map(([number, date, ue = '2.8']) => ({ cours_numero: String(number), date, ue_numero: ue }));
    return vm.runInContext('courses.sort(compareCourses)', context).map(course => Number(course.cours_numero));
}
test('date chronologique prioritaire, même entre deux années et deux formats de date', () => {
    assert.deepEqual(sort([[1, '01/01/2026'], [2, '31/12/2025'], [3, '2026-01-02']]), [2, 1, 3]);
});
test('numéro numérique en second critère pour une même date', () => {
    assert.deepEqual(sort([[10, '16/10/2026'], [2, '2026-10-16'], [1, '16/10/2026']]), [1, 2, 10]);
});
test('cours sans date en dernier, triés par numéro', () => {
    assert.deepEqual(sort([[1, ''], [10, ''], [3, '01/11/2026'], [2, '']]), [3, 1, 2, 10]);
});
test('les UE gardent leur ordre propre, indépendamment des dates', () => {
    assert.deepEqual(sort([[1, '20/11/2026', '2.8'], [2, '01/10/2026', '2.11']]), [1, 2]);
});
test('les intitulés affichés ne comportent plus de préfixe numérique ; les identifiants sont conservés', () => {
    context.csv = fs.readFileSync(path.join(root, 'sources.csv'), 'utf8');
    const courses = vm.runInContext('readCourses(csv)', context);
    assert.ok(courses.length > 0);
    for (const course of courses) {
        assert.equal(course.cours, course.cours_nom);
        assert.equal(course.id, `S${course.semestre}_UE${course.ue_numero}_COURS${course.cours_numero}`);
    }
});

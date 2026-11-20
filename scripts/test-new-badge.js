'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, ''), context);
test('badge : champ vide, date incorrecte, future, bornes des 72 heures', () => {
    const added = '2026-11-20T12:23:00+01:00';
    const start = Date.parse(added);
    assert.equal(context.isCourseNew('', start), false);
    assert.equal(context.isCourseNew('31/11/2026', start), false);
    assert.equal(context.isCourseNew(added, start - 1), false);
    assert.equal(context.isCourseNew(added, start), true);
    assert.equal(context.isCourseNew(added, start + 72 * 3600000), true);
    assert.equal(context.isCourseNew(added, start + 72 * 3600000 + 1), false);
});
test('dates seules : minuit à Paris, heure d’été et heure d’hiver', () => {
    assert.equal(context.courseAddedAt('20/11/2026'), Date.parse('2026-11-20T00:00:00+01:00'));
    assert.equal(context.courseAddedAt('2026-07-20'), Date.parse('2026-07-20T00:00:00+02:00'));
    assert.equal(context.courseAddedAt('29/03/2026'), Date.parse('2026-03-29T00:00:00+01:00'));
});

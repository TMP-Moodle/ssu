'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, '');

function navigation(open) {
    const calls = [];
    let onShown;
    const panel = {
        classList: { contains: () => open },
        addEventListener(name, handler, options) {
            assert.equal(name, 'shown.bs.collapse');
            assert.equal(options.once, true);
            onShown = handler;
        },
    };
    const highlights = [];
    const target = {
        closest: () => panel,
        scrollIntoView: () => calls.push('scroll'),
        classList: { remove() {}, add: name => highlights.push(name) },
        addEventListener() {},
    };
    const context = vm.createContext({
        document: { getElementById: id => id === 'course-id' ? target : null },
        bootstrap: { Collapse: { getOrCreateInstance: () => ({ show: () => calls.push('open') }) } },
        event: { preventDefault: () => calls.push('prevent') },
    });
    vm.runInContext(code, context);
    return { context, calls, highlights, shown: () => onShown() };
}

test('un cours dans une UE fermée est rejoint après son ouverture', () => {
    const state = navigation(false);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    assert.deepEqual(state.calls, ['prevent', 'open']);
    assert.deepEqual(state.highlights, []);
    state.shown();
    assert.deepEqual(state.calls, ['prevent', 'open', 'scroll']);
    assert.deepEqual(state.highlights, ['course-arrival']);
});

test('un cours dans une UE déjà ouverte est rejoint immédiatement', () => {
    const state = navigation(true);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    assert.deepEqual(state.calls, ['prevent', 'scroll']);
});

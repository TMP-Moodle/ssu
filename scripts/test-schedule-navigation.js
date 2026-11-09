'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'courses.js'), 'utf8').replace(/loadCourses\(\);\s*$/, '');

function navigation(open, reducedMotion = false) {
    const calls = [];
    const highlights = [];
    const frames = new Map();
    const interruptions = new Map();
    let frameId = 0;
    let scroll = 0;
    let opening = false;
    const panel = {
        classList: { contains: name => name === 'show' ? open : opening },
        closest: () => ({ querySelector: () => ({ getAttribute: () => 'true' }) }),
    };
    const target = {
        isConnected: true,
        closest: () => panel,
        getBoundingClientRect: () => ({ top: 1200 - scroll, height: 100 }),
        classList: { remove() {}, add: name => highlights.push(name) },
        addEventListener() {},
    };
    const context = vm.createContext({
        document: { documentElement: { clientHeight: 800 }, getElementById: () => target },
        window: {
            scrollBy: options => { calls.push('scroll'); scroll += options.top; },
            addEventListener: (name, handler) => interruptions.set(name, handler),
            removeEventListener: name => interruptions.delete(name),
        },
        bootstrap: { Collapse: { getOrCreateInstance: () => ({ show: () => { calls.push('open'); opening = true; } }) } },
        performance: { now: () => 0 },
        getComputedStyle: () => ({ transitionDuration: '0.4s' }),
        matchMedia: () => ({ matches: reducedMotion }),
        requestAnimationFrame: handler => { frames.set(++frameId, handler); return frameId; },
        cancelAnimationFrame: id => frames.delete(id),
        event: { preventDefault: () => calls.push('prevent') },
    });
    vm.runInContext(code, context);
    return {
        context, calls, highlights, interruptions,
        frame(time) { const pending = [...frames.values()]; frames.clear(); pending.forEach(handler => handler(time)); },
        top: () => target.getBoundingClientRect().top,
    };
}

test('le défilement vers un cours commence pendant l’ouverture et termine avec elle', () => {
    const state = navigation(false);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    assert.deepEqual(state.calls, ['prevent', 'open']);
    state.frame(120);
    assert.ok(state.top() < 1200);
    assert.ok(state.top() > 350);
    assert.deepEqual(state.highlights, []);
    state.frame(400);
    assert.equal(state.top(), 350);
    assert.deepEqual(state.highlights, ['course-arrival']);
    assert.equal(state.interruptions.size, 0);
});

test('un cours dans une UE ouverte est rejoint sans rouvrir son bloc', () => {
    const state = navigation(true);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    state.frame(400);
    assert.deepEqual(state.calls, ['prevent', 'scroll']);
    assert.equal(state.top(), 350);
});

test('une action de défilement manuelle interrompt le mouvement automatique', () => {
    const state = navigation(false);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    state.frame(100);
    const top = state.top();
    state.interruptions.get('wheel')();
    state.frame(400);
    assert.equal(state.top(), top);
    assert.deepEqual(state.highlights, []);
});

test('la préférence de réduction des animations est respectée', () => {
    const state = navigation(false, true);
    vm.runInContext("revealScheduledCourse(event, 'course-id')", state.context);
    state.frame(16);
    assert.equal(state.top(), 350);
    assert.deepEqual(state.highlights, ['course-arrival']);
});

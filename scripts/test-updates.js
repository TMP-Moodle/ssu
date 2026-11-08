/* Exécuter avec node --test scripts/test-updates.js. Aucun paquet requis. */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bootstrap = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(code => code.includes('window.SiteAssets'));
const initial = 'a'.repeat(20);
const latest = 'b'.repeat(20);
const settle = () => new Promise(resolve => setImmediate(resolve));

async function browser({ failManifest = false, failScript = false } = {}) {
    const calls = [], scripts = [], replacements = [], events = {}, nodes = {};
    let manifest = initial, offline = failManifest, interval;
    const document = {
        readyState: 'complete', visibilityState: 'visible',
        baseURI: 'https://example.org/ssu/index.html?existing=yes#semestre-3',
        addEventListener: (name, callback) => { events[name] = callback; },
        getElementById: id => nodes[id] ||= {
            setAttribute() {}, replaceChildren(...children) { this.children = children; },
        },
        querySelectorAll: () => [],
        createElement: tag => ({ tag }),
        head: { append(script) {
            scripts.push(script.src);
            queueMicrotask(() => failScript ? script.onerror() : script.onload());
        } },
    };
    const context = {
        document, URL, AbortController, setTimeout, clearTimeout,
        console: { error() {} },
        location: { href: document.baseURI, protocol: 'https:', replace: url => replacements.push(url) },
        setInterval: (callback, delay) => { assert.equal(delay, 60000); interval = callback; },
        addEventListener: (name, callback) => { events[name] = callback; },
        fetch: async (url, options) => {
            calls.push({ url: String(url), options });
            if (offline) throw new Error('Offline');
            return { ok: true, json: async () => ({ version: manifest }) };
        },
    };
    context.window = context;
    vm.runInNewContext(bootstrap, context);
    await settle();
    return { context, calls, scripts, replacements, events, nodes,
        setVersion: value => { manifest = value; },
        setOffline: value => { offline = value; },
        poll: () => interval(),
    };
}

test('scripts, styles et données utilisent la même version, dans le bon ordre', async () => {
    const b = await browser();
    assert.deepEqual(b.scripts.map(url => new URL(url).pathname.split('/').pop()), ['textes.js', 'theme.js', 'courses.js']);
    for (const url of [...b.scripts, b.nodes['site-style'].href, b.context.SiteAssets.url('sources.csv'), b.context.SiteAssets.url('textes.json')]) {
        assert.equal(new URL(url).searchParams.get('v'), initial);
        assert(new URL(url).pathname.startsWith('/ssu/'));
    }
    assert.equal(b.calls[0].options.cache, 'no-store');
    assert(new URL(b.calls[0].url).searchParams.has('_'));
});

test('une version inchangée ne recharge pas la page', async () => {
    const b = await browser();
    await b.poll();
    assert.equal(b.replacements.length, 0);
});

test('une nouvelle version recharge une fois, en conservant le chemin et les paramètres', async () => {
    const b = await browser();
    b.setVersion(latest);
    await b.events.focus();
    await b.events.pageshow();
    await b.poll();
    assert.equal(b.replacements.length, 1);
    const url = new URL(b.replacements[0]);
    assert.equal(url.pathname, '/ssu/index.html');
    assert.equal(url.searchParams.get('_v'), latest);
    assert.equal(url.searchParams.get('existing'), 'yes');
    assert.equal(url.hash, '#semestre-3');
});

test('onglet masqué ou réseau absent : aucune interruption ni boucle de rechargement', async () => {
    const b = await browser();
    b.context.document.visibilityState = 'hidden';
    await b.poll();
    assert.equal(b.calls.length, 1);
    b.context.document.visibilityState = 'visible';
    b.setOffline(true);
    await b.events.visibilitychange();
    assert.equal(b.replacements.length, 0);
    b.setOffline(false);
    b.setVersion(latest);
    await b.events.online();
    assert.equal(b.replacements.length, 1);
});

test('manifeste indisponible au départ : les fichiers sont tout de même demandés avec une version fraîche', async () => {
    const b = await browser({ failManifest: true });
    assert.equal(b.scripts.length, 3);
    const versions = b.scripts.map(url => new URL(url).searchParams.get('v'));
    assert(versions.every(version => version && version === versions[0]));
});

test('script inaccessible : la version simplifiée reste proposée', async () => {
    const b = await browser({ failScript: true });
    const status = b.nodes['courses-status'];
    assert.equal(status.hidden, false);
    const url = new URL(status.children[1].href);
    assert.equal(url.pathname, '/ssu/version-simplifiee.html');
    assert.equal(url.searchParams.get('v'), initial);
});

test('le thème et son bouton fonctionnent même lorsque le script charge après DOMContentLoaded', async () => {
    const attrs = {}, listeners = {}, saved = {};
    const button = { setAttribute() {}, addEventListener: (name, callback) => { listeners[name] = callback; } };
    const context = {
        document: { readyState: 'complete', getElementById: () => button,
            documentElement: { setAttribute: (name, value) => { attrs[name] = value; }, getAttribute: name => attrs[name] } },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        localStorage: { getItem: key => saved[key], setItem: (key, value) => { saved[key] = value; } },
        SiteTexts: { loaded: true, ready: Promise.resolve(), get: key => key },
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(path.join(root, 'theme.js'), 'utf8'), context);
    await settle();
    listeners.click();
    assert.equal(attrs['data-bs-theme'], 'dark');
    assert.equal(saved['tmp-moodle:theme'], 'dark');
});

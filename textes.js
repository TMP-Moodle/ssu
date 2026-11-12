/* Relie les textes et la dernière vérification aux pages. */
'use strict';
window.SiteTexts = (() => {
    let texts;
    function get(path, values = {}) {
        const value = path.split('.').reduce((node, key) => node?.[key], texts);
        if (typeof value !== 'string') throw new Error(`Texte absent : ${path}`);
        return value.replace(/\{(\w+)\}/g, (placeholder, key) =>
            Object.hasOwn(values, key) ? String(values[key]) : placeholder);
    }
    function apply() {
        for (const [attribute, target] of [
            ['data-texte', null],
            ['data-texte-content', 'content'],
            ['data-texte-aria-label', 'aria-label'],
        ]) {
            document.querySelectorAll(`[${attribute}]`).forEach(node => {
                const value = get(node.getAttribute(attribute));
                if (target) node.setAttribute(target, value);
                else node.textContent = value;
            });
        }
    }
    const domReady = document.readyState === 'loading'
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
        : Promise.resolve();
    const ready = Promise.all(['textes.json', 'derniere-verification.json'].map(async file => {
        const response = await fetch(globalThis.SiteAssets?.url(file) || file, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${file} : HTTP ${response.status}`);
        return response.json();
    })).then(async ([loadedTexts, verification]) => {
        if (typeof verification.date !== 'string' || typeof verification.heure !== 'string') {
            throw new Error('derniere-verification.json : date et heure requises');
        }
        texts = loadedTexts;
        texts.messages.derniere_verification = get('messages.derniere_verification', verification);
        await domReady;
        apply();
    });
    ready.catch(error => {
        console.error('Chargement des textes :', error);
        domReady.then(() => {
            const status = document.getElementById('courses-status');
            status.hidden = false;
            status.setAttribute('role', 'alert');
            status.className = 'alert alert-danger';
            status.textContent = 'Impossible de charger les textes. Vérifiez textes.json et derniere-verification.json puis rechargez la page avec un serveur web.';
        });
    });
    return { get, ready, get loaded() { return Boolean(texts); } };
})();

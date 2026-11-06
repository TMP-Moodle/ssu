/* Relie textes.json aux pages et aux libellés générés par JavaScript. */
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
    const ready = fetch('textes.json', { cache: 'no-cache' }).then(async response => {
        if (!response.ok) throw new Error(`textes.json : HTTP ${response.status}`);
        texts = await response.json();
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
            status.textContent = 'Impossible de charger les textes. Vérifiez la syntaxe de textes.json puis rechargez la page avec un serveur web.';
        });
    });
    return { get, ready, get loaded() { return Boolean(texts); } };
})();

(() => {
    const root = document.documentElement;
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    let saved;
    try { saved = localStorage.getItem('tmp-moodle:theme'); } catch {}
    let explicit = saved === 'light' || saved === 'dark';
    const apply = theme => {
        root.setAttribute('data-bs-theme', theme);
        const button = document.getElementById('theme-toggle');
        if (button) {
            const light = theme === 'dark';
            const texts = globalThis.SiteTexts;
            button.textContent = texts?.loaded ? texts.get(light ? 'theme.clair' : 'theme.sombre') : light ? '☀ Mode clair' : '☾ Mode sombre';
            button.setAttribute('aria-label', texts?.loaded ? texts.get(light ? 'theme.activer_clair' : 'theme.activer_sombre') : light ? 'Activer le mode clair' : 'Activer le mode sombre');
        }
    };
    if (!explicit && root.dataset?.themeDefault === 'dark') {
        saved = 'dark';
        explicit = true;
        try { localStorage.setItem('tmp-moodle:theme', saved); } catch {}
    }
    apply(explicit ? saved : preference.matches ? 'dark' : 'light');
    function initializeButton() {
        apply(root.getAttribute('data-bs-theme'));
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const theme = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            explicit = true;
            apply(theme);
            try { localStorage.setItem('tmp-moodle:theme', theme); } catch {}
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeButton, { once: true });
    else initializeButton();
    globalThis.SiteTexts?.ready.then(() => apply(root.getAttribute('data-bs-theme'))).catch(() => {});
    window.addEventListener('storage', event => {
        if (event.key !== 'tmp-moodle:theme') return;
        explicit = event.newValue === 'light' || event.newValue === 'dark';
        apply(explicit ? event.newValue : preference.matches ? 'dark' : 'light');
    });
    preference.addEventListener('change', event => {
        if (!explicit) apply(event.matches ? 'dark' : 'light');
    });
})();

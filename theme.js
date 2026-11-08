(() => {
    const root = document.documentElement;
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    let saved;
    try { saved = localStorage.getItem('tmp-moodle:theme'); } catch {}
    let explicit = saved === 'light' || saved === 'dark';
    const apply = theme => {
        root.setAttribute('data-bs-theme', theme);
        const button = document.getElementById('theme-toggle');
        if (button && SiteTexts.loaded) {
            button.textContent = SiteTexts.get(theme === 'dark' ? 'theme.clair' : 'theme.sombre');
            button.setAttribute('aria-label', SiteTexts.get(theme === 'dark' ? 'theme.activer_clair' : 'theme.activer_sombre'));
        }
    };
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
    SiteTexts.ready.then(() => apply(root.getAttribute('data-bs-theme'))).catch(() => {});
    preference.addEventListener('change', event => {
        if (!explicit) apply(event.matches ? 'dark' : 'light');
    });
})();

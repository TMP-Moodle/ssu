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
            button.textContent = theme === 'dark' ? '☀ Mode clair' : '☾ Mode sombre';
            button.setAttribute('aria-label', `Activer le mode ${theme === 'dark' ? 'clair' : 'sombre'}`);
        }
    };
    apply(explicit ? saved : preference.matches ? 'dark' : 'light');
    document.addEventListener('DOMContentLoaded', () => {
        apply(root.getAttribute('data-bs-theme'));
        document.getElementById('theme-toggle').addEventListener('click', () => {
            const theme = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            explicit = true;
            apply(theme);
            try { localStorage.setItem('tmp-moodle:theme', theme); } catch {}
        });
    });
    preference.addEventListener('change', event => {
        if (!explicit) apply(event.matches ? 'dark' : 'light');
    });
})();

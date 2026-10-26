// Chargé seulement à l’ouverture du dialogue ; la clé publishable est publique.
const PROJECT = 'https://ubczgcxqugjrakksjiia.supabase.co';
const KEY = 'sb_publishable_zIROziXmxaMstmZ79ECGrA_fONGamOD';
const dialog = document.querySelector('#naming-dialog');
const status = document.querySelector('#naming-status');
const list = document.querySelector('#naming-list');
const form = document.querySelector('#naming-form');
const input = document.querySelector('#naming-input');
const sort = document.querySelector('#naming-sort');
let client, browserId, sessionReady, rows = [], proposalNext, busy = false, clockOffset = 0;
let refreshController, refreshTimer;
const REFRESH_DELAY = 30000;
const remaining = value => Math.max(0, new Date(value).getTime() - (Date.now() + clockOffset));
function countdown(value) {
    const minutes = Math.ceil(remaining(value) / 60000);
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}
async function connect() {
    if (sessionReady) return sessionReady;
    sessionReady = (async () => {
        // Version figée ; aucun chargement du SDK tant que le dialogue est fermé.
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
        client ??= createClient(PROJECT, KEY, { auth: { autoRefreshToken: false } });
        const cookie = document.cookie.split('; ').find(x => x.startsWith('tmp_naming_id='))?.split('=')[1];
        let stored;
        try { stored = localStorage.getItem('tmp-naming-id'); } catch { /* Cookie de secours. */ }
        browserId = [cookie, stored].find(x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x || '')) || crypto.randomUUID();
        document.cookie = `tmp_naming_id=${browserId}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        try { localStorage.setItem('tmp-naming-id', browserId); } catch { /* Cookie de secours. */ }
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!data.session) {
            const result = await client.auth.signInAnonymously();
            if (result.error) throw result.error;
        }
    })();
    try { await sessionReady; } catch (error) { sessionReady = null; throw error; }
}
async function rpc(action, params = {}, signal) {
    await connect();
    if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
    let request = client.rpc('naming_action', { p_action: action, p_browser: browserId, ...params });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    return data;
}
function errorMessage(error) {
    if (/anonymous.*disabled/i.test(error.message || '')) return 'Les participations ne sont pas encore activées. Réessayez bientôt.';
    if (/function|schema cache|permission denied/i.test(error.message || '')) return 'Les propositions ne sont pas encore disponibles. Réessayez bientôt.';
    return 'Connexion impossible. Vérifiez votre connexion puis réessayez.';
}
function render() {
    const focused = document.activeElement;
    const focusId = focused?.dataset.proposal;
    const focusVote = focused?.dataset.value;
    list.replaceChildren();
    const ordered = [...rows].sort(sort.value === 'recent'
        ? (a, b) => new Date(b.created_at) - new Date(a.created_at)
        : (a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes) || new Date(a.created_at) - new Date(b.created_at));
    for (const row of ordered) {
        const card = element('article', 'naming-card');
        const head = element('div', 'naming-card-head');
        const avatar = element('span', 'naming-avatar', [...row.name][0].toLocaleUpperCase('fr'));
        avatar.setAttribute('aria-hidden', 'true');
        head.append(avatar, element('h4', '', row.name));
        const score = row.upvotes - row.downvotes;
        const actions = element('div', 'naming-actions');
        const cooling = row.next_at && remaining(row.next_at) > 0;
        for (const value of [1, -1]) {
            const button = element('button', 'naming-vote', value === 1 ? `↑ Pour · ${row.upvotes}` : `↓ Contre · ${row.downvotes}`);
            button.type = 'button'; button.dataset.value = value; button.dataset.proposal = row.id;
            button.disabled = busy || Boolean(cooling);
            button.setAttribute('aria-label', `${value === 1 ? 'Voter pour' : 'Voter contre'} ${row.name}`);
            button.setAttribute('aria-pressed', String(Boolean(cooling) && row.last_vote === value));
            button.addEventListener('click', () => mutate('vote', { p_proposal: row.id, p_vote: value }));
            actions.append(button);
        }
        card.append(head, element('p', 'naming-score', `${score > 0 ? '+' : ''}${score} point${Math.abs(score) === 1 ? '' : 's'}`), actions,
            element('p', 'naming-countdown', cooling ? `Prochain vote dans ${countdown(row.next_at)}` : 'Vous pouvez voter pour ce nom.'));
        list.append(card);
    }
    if (focusId) [...list.querySelectorAll('button')].find(b => b.dataset.proposal === focusId && b.dataset.value === focusVote)?.focus();
    const cooling = proposalNext && remaining(proposalNext) > 0;
    form.querySelector('button').disabled = busy || Boolean(cooling);
    input.disabled = busy || Boolean(cooling);
    document.querySelector('#naming-submit-hint').textContent = cooling ? `Prochaine proposition dans ${countdown(proposalNext)}.` : 'Une proposition toutes les 24 h. De 2 à 60 caractères.';
}
async function load(signal) {
    const data = await rpc('list', {}, signal);
    if (signal?.aborted || !dialog.open) return;
    if (!data.ok) throw new Error(data.message);
    clockOffset = new Date(data.server_time).getTime() - Date.now();
    rows = data.proposals; proposalNext = data.proposal_next_at; render();
}
async function refresh(silent = false) {
    if (!dialog.open || document.hidden || busy || refreshController) return;
    const controller = new AbortController();
    refreshController = controller;
    if (!silent) status.textContent = 'Chargement des propositions…';
    try {
        await load(controller.signal);
        if (!controller.signal.aborted && !silent) status.textContent = rows.length ? '' : 'La première idée pourrait être la vôtre.';
    } catch (error) {
        if (!controller.signal.aborted) status.textContent = errorMessage(error);
    } finally {
        if (refreshController === controller) refreshController = undefined;
    }
}
async function mutate(action, params) {
    if (busy) return;
    refreshController?.abort();
    refreshController = undefined;
    busy = true; render(); status.textContent = 'Envoi en cours…';
    let saved = false;
    try {
        const data = await rpc(action, params);
        saved = data.ok;
        if (!data.ok) {
            status.textContent = data.message;
            if (data.next_at) {
                if (action === 'propose') proposalNext = data.next_at;
                else { const row = rows.find(r => r.id === params.p_proposal); if (row) row.next_at = data.next_at; }
            }
            return;
        }
        if (action === 'propose') { input.value = ''; proposalNext = data.next_at; }
        else {
            const row = rows.find(r => r.id === params.p_proposal);
            if (row) { row.next_at = data.next_at; row.last_vote = params.p_vote; row[params.p_vote === 1 ? 'upvotes' : 'downvotes']++; }
        }
        await load();
        status.textContent = action === 'propose' ? 'Votre idée est en lice. Merci !' : 'Votre vote est enregistré. Merci !';
    } catch (error) {
        status.textContent = saved ? 'Participation enregistrée. Les résultats seront actualisés automatiquement.' : errorMessage(error);
    } finally { busy = false; render(); }
}
form.addEventListener('submit', event => { event.preventDefault(); mutate('propose', { p_name: input.value.trim() }); });
sort.addEventListener('change', render);
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!dialog.open || document.hidden) return;
    refreshTimer = setTimeout(async () => {
        await refresh(true);
        scheduleRefresh();
    }, REFRESH_DELAY);
}
document.querySelector('#naming-open').addEventListener('click', () => {
    dialog.showModal();
    refresh();
    scheduleRefresh();
});
document.querySelector('#naming-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
    clearTimeout(refreshTimer);
    refreshController?.abort();
    refreshController = undefined;
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        clearTimeout(refreshTimer);
        refreshController?.abort();
        refreshController = undefined;
    } else if (dialog.open) {
        refresh(true);
        scheduleRefresh();
    }
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });

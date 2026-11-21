/* Format des sources du site. Une copie accompagne le dépôt séparé de l’administration. Les lignes sont un modèle interne. */
(function (root) {
    'use strict';
    const links = ['video_link_1', 'video_link_1_backup', 'video_link_2', 'video_link_2_backup',
        'video_link_1_anterieur', 'video_link_2_anterieur', 'pdf_link', 'pdf_link_anterieur'];
    const columns = ['semestre', 'ue_numero', 'ue_nom', 'cours_numero', 'cours_nom', 'date', 'Presentiel', 'Visio',
        ...links.flatMap(key => [key, `${key}_date`]), 'id', 'information'];
    function fail(path) { throw new Error(`sources.json : champ incorrect (${path}).`); }
    function object(value, path, allowed) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
        if (Object.keys(value).some(key => !allowed.includes(key))) fail(path);
        return value;
    }
    function string(value, path, optional = false) {
        if (value === undefined && optional) return '';
        if (typeof value !== 'string') fail(path);
        return value.trim();
    }
    function array(value, path) { if (!Array.isArray(value)) fail(path); return value; }
    function number(value, path) { if (!Number.isSafeInteger(value) || value < 1) fail(path); return String(value); }
    function toRows(data) {
        object(data, 'racine', ['semestres']);
        const rows = [], semesters = new Set();
        for (const semester of array(data.semestres, 'semestres')) {
            object(semester, 'semestre', ['numero', 'ues', 'id', 'ressources', 'champs']);
            const sem = number(semester.numero, 'semestre.numero');
            if (semesters.has(sem)) fail('semestre.numero dupliqué');
            semesters.add(sem);
            function row(item, ue) {
                const r = Object.fromEntries(columns.map(key => [key, '']));
                r.semestre = sem;
                r.id = string(item.id, 'id');
                if (ue) {
                    r.ue_numero = string(ue.numero, 'ue.numero');
                    r.ue_nom = string(ue.nom, 'ue.nom');
                    r.cours_numero = number(item.numero, 'cours.numero');
                    r.cours_nom = string(item.nom, 'cours.nom');
                    r.date = string(item.date, 'cours.date', true);
                    r.information = string(item.information, 'cours.information', true);
                    for (const [key, column] of [['presentiel', 'Presentiel'], ['visio', 'Visio']]) {
                        if (item[key] !== undefined && typeof item[key] !== 'boolean') fail(`cours.${key}`);
                        r[column] = item[key] ? 'Oui' : '';
                    }
                }
                const resources = item.ressources === undefined ? {} : item.ressources;
                object(resources, 'ressources', ['videos', 'videos_anterieures', 'pdf', 'pdf_anterieur']);
                function resource(value, key, backup = false) {
                    if (value === null || value === undefined) return;
                    object(value, key, backup ? ['url', 'ajoute_le', 'secours'] : ['url', 'ajoute_le']);
                    r[key] = string(value.url, `${key}.url`, true);
                    r[`${key}_date`] = string(value.ajoute_le, `${key}.ajoute_le`, true);
                    if (backup) resource(value.secours, `${key}_backup`);
                }
                for (const field of ['videos', 'videos_anterieures']) {
                    if (resources[field] === undefined) continue;
                    const videos = array(resources[field], field);
                    if (videos.length > 2) fail(`${field} : deux parties maximum`);
                    videos.forEach((value, i) => resource(value, `video_link_${i + 1}${field === 'videos' ? '' : '_anterieur'}`, field === 'videos'));
                }
                resource(resources.pdf, 'pdf_link');
                resource(resources.pdf_anterieur, 'pdf_link_anterieur');
                if (item.champs !== undefined) {
                    const extra = item.champs;
                    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) fail('champs');
                    for (const [key, value] of Object.entries(extra)) {
                        if (columns.includes(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(`champs.${key}`);
                        r[key] = string(value, `champs.${key}`);
                    }
                }
                rows.push(r);
            }
            const ues = new Set();
            for (const ue of array(semester.ues, 'semestre.ues')) {
                object(ue, 'ue', ['numero', 'nom', 'cours']);
                const key = string(ue.numero, 'ue.numero');
                if (ues.has(key)) fail('ue.numero dupliqué');
                ues.add(key);
                for (const course of array(ue.cours, 'ue.cours')) {
                    object(course, 'cours', ['id', 'numero', 'nom', 'date', 'presentiel', 'visio', 'information', 'ressources', 'champs']);
                    row(course, ue);
                }
            }
            if (semester.ressources !== undefined) row(semester);
        }
        return rows;
    }
    function fromRows(rows) {
        const data = { semestres: [] };
        for (const row of rows) {
            let semester = data.semestres.find(s => String(s.numero) === row.semestre);
            if (!semester) { semester = { numero: Number(row.semestre), ues: [] }; data.semestres.push(semester); }
            function resource(key) {
                const value = {};
                if (row[key]) value.url = row[key];
                if (row[`${key}_date`]) value.ajoute_le = row[`${key}_date`];
                return value;
            }
            const resources = {};
            for (const [field, suffix] of [['videos', ''], ['videos_anterieures', '_anterieur']]) {
                const values = [1, 2].map(i => {
                    const key = `video_link_${i}${suffix}`, value = resource(key);
                    if (!suffix) { const backup = resource(`${key}_backup`); if (Object.keys(backup).length) value.secours = backup; }
                    return Object.keys(value).length ? value : null;
                });
                while (values.length && values.at(-1) === null) values.pop();
                if (values.length) resources[field] = values;
            }
            for (const [field, key] of [['pdf', 'pdf_link'], ['pdf_anterieur', 'pdf_link_anterieur']]) {
                const value = resource(key); if (Object.keys(value).length) resources[field] = value;
            }
            let item;
            if (!row.cours_nom) {
                if (semester.ressources !== undefined) fail('ressources de semestre dupliquées');
                item = semester; item.id = row.id; item.ressources = resources;
            } else {
                let ue = semester.ues.find(u => u.numero === row.ue_numero);
                if (!ue) { ue = { numero: row.ue_numero, nom: row.ue_nom, cours: [] }; semester.ues.push(ue); }
                if (ue.nom !== row.ue_nom) fail('nom d’UE incohérent');
                item = { id: row.id, numero: Number(row.cours_numero), nom: row.cours_nom,
                    date: row.date || '', presentiel: Boolean(row.Presentiel), visio: Boolean(row.Visio),
                    information: row.information || '', ressources: resources };
                ue.cours.push(item);
            }
            const extra = Object.fromEntries(Object.entries(row).filter(([key, value]) => !columns.includes(key) && value !== ''));
            if (Object.keys(extra).length) item.champs = extra;
        }
        toRows(data);
        return data;
    }
    const api = { columns, toRows, fromRows };
    if (typeof module !== 'undefined') module.exports = api;
    else root.SourceData = api;
})(globalThis);

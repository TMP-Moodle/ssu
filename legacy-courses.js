/* Les intitulés et les six liens de chaque cours proviennent de sources.csv. */
'use strict';

const COURSE_COLUMNS = [
    'UE', 'cours', 'video_link_1', 'video_link_2',
    'video_link_1_backup', 'video_link_2_backup', 'pdf_link', 'pdf_link_backup',
];
const PROGRESS_PREFIX = 'tmp-moodle:completed:';

// Prend en charge les virgules, retours à la ligne et guillemets dans les champs.
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    text = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && char === ',') {
            row.push(field);
            field = '';
        } else if (!quoted && (char === '\n' || char === '\r')) {
            row.push(field);
            if (row.some(value => value.trim())) rows.push(row);
            row = [];
            field = '';
            if (char === '\r' && text[i + 1] === '\n') i++;
        } else {
            field += char;
        }
    }
    if (quoted) throw new Error('Un champ CSV contient des guillemets non fermés.');
    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);
    return rows;
}

function readSources(text) {
    const [headers, ...rows] = parseCSV(text);
    if (!headers || ['semestre', 'ue_numero', 'ue_nom', 'cours_numero', 'cours_nom', ...COURSE_COLUMNS.slice(2), 'id'].some(column => !headers.includes(column))) {
        throw new Error('Les colonnes attendues sont absentes de sources.csv.');
    }
    const ids = new Set();
    return rows.map((row, index) => {
        if (row.length !== headers.length) {
            throw new Error(`Nombre de champs incorrect à la ligne ${index + 2}.`);
        }
        const course = Object.fromEntries(headers.map((header, i) => [header, row[i].trim()]));

        if (!/^[1-9]\d*$/.test(course.semestre)) {
            throw new Error(`Semestre incorrect à la ligne ${index + 2}.`);
        }
        for (const column of COURSE_COLUMNS.slice(2)) {
            if (!course[column]) continue;
            const url = new URL(course[column]);
            if (!['https:', 'http:'].includes(url.protocol)) {
                throw new Error(`Lien incorrect à la ligne ${index + 2}.`);
            }
        }
        const isSemesterResource = !['ue_numero', 'ue_nom', 'cours_numero', 'cours_nom']
            .some(column => course[column]);
        if (isSemesterResource) return course;
        if (!/^\d+(?:\.\d+)*$/.test(course.ue_numero)
            || !/^[1-9]\d*$/.test(course.cours_numero) || !course.ue_nom || !course.cours_nom) {
            throw new Error(`UE ou cours incorrect à la ligne ${index + 2}.`);
        }
        // Les libellés sont composés pour afficher le même contenu dans les deux versions.
        // L’identifiant reste celui du CSV, même si le nom ou le numéro change.
        course.UE = `S${course.semestre} UE ${course.ue_numero} - ${course.ue_nom}`;
        course.cours = `${course.cours_numero}. ${course.cours_nom}`;
        if (!/^S\d+_UE\d+(?:\.\d+)*_COURS\d+$/.test(course.id) || ids.has(course.id)) {
            throw new Error(`Identifiant absent, incorrect ou dupliqué à la ligne ${index + 2}.`);
        }
        ids.add(course.id);
        return course;
    });
}

function readCourses(text) {
    return readSources(text).filter(source => source.cours_nom);
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

function renderCourse(course) {
    const item = element('li', 'list-group-item');
    const primary = course.video_link_1 || course.video_link_1_backup
        || course.video_link_2 || course.video_link_2_backup
        || course.pdf_link || course.pdf_link_backup;
    const title = element(primary ? 'a' : 'span', 'course-title', course.cours);
    if (primary) title.href = primary;
    item.append(title);

    const links = element('div', 'course-links');
    const split = Boolean(course.video_link_2 || course.video_link_2_backup);
    const labels = [
        ['video_link_1', split ? 'Enregistrement (première partie)' : 'Enregistrement'],
        ['video_link_2', 'Enregistrement (seconde partie)'],
        ['video_link_1_backup', split ? 'Secours vidéo (première partie)' : 'Secours vidéo'],
        ['video_link_2_backup', 'Secours vidéo (seconde partie)'],
        ['pdf_link', 'PDF'],
        ['pdf_link_backup', 'PDF de secours'],
    ];
    if (!COURSE_COLUMNS.slice(2, 6).some(column => course[column])) {
        links.append(element('span', 'badge bg-danger', 'Pas d’enregistrement disponible'));
    }
    for (const [column, label] of labels) {
        if (!course[column]) continue;
        const link = element('a', 'badge bg-secondary', label);
        link.href = course[column];
        links.append(link);
    }
    item.append(links);

    const completion = element('div', 'course-completion');
    const label = element('label', 'form-check');
    const checkbox = element('input', 'form-check-input');
    checkbox.type = 'checkbox';
    checkbox.id = `completed-${course.id}`;
    checkbox.setAttribute('aria-label', `Cours terminé : ${course.cours}`);
    const feedback = element('span', 'completion-feedback text-warning');
    feedback.id = `feedback-${course.id}`;
    feedback.setAttribute('role', 'status');
    checkbox.setAttribute('aria-describedby', feedback.id);
    const key = `${PROGRESS_PREFIX}${course.id}`;

    function showStorageError() {
        feedback.textContent = 'La progression ne peut pas être enregistrée dans ce navigateur.';
    }

    try {
        checkbox.checked = localStorage.getItem(key) === 'true';
    } catch {
        showStorageError();
    }
    checkbox.addEventListener('change', () => {
        try {
            if (checkbox.checked) localStorage.setItem(key, 'true');
            else localStorage.removeItem(key);
            feedback.textContent = '';
        } catch {
            showStorageError();
        }
    });
    label.append(checkbox, element('span', 'form-check-label', 'Terminé'));
    completion.append(label, feedback);
    item.append(completion);
    return item;
}

function renderCourses(courses) {
    const semesters = new Map();
    for (const course of courses) {
        if (!semesters.has(course.semestre)) semesters.set(course.semestre, []);
        semesters.get(course.semestre).push(course);
    }
    const fragment = document.createDocumentFragment();
    const sorted = [...semesters].sort(([a], [b]) => Number(a) - Number(b));
    for (const [semester, group] of sorted) {
        const section = element('section', 'semester-section');
        section.setAttribute('aria-labelledby', `semester-title-${semester}`);
        const intro = element('div', 'intro');
        const heading = element('div', 'semester-heading');
        const title = element(semester === sorted[0][0] ? 'h1' : 'h2', '', `Semestre ${semester}`);
        title.id = `semester-title-${semester}`;
        heading.append(title, element('span', '', 'Vidéos & PDF'));
        intro.append(heading);
        if (semester === sorted[0][0]) {
        }
        const accordion = element('div', 'accordion course-accordion');
        accordion.id = `accordionS${semester}`;
        accordion.setAttribute('aria-label', `Cours du semestre ${semester}`);
        // Les numéros déterminent l’ordre, indépendamment de celui des lignes du CSV.
        group.sort((a, b) => a.ue_numero.localeCompare(b.ue_numero, 'fr', { numeric: true })
            || Number(a.cours_numero) - Number(b.cours_numero));
        renderUEs(group, accordion);
        section.append(intro, accordion);
        fragment.append(section);
    }
    document.getElementById('course-semesters').replaceChildren(fragment);
}


function renderUEs(courses, accordion) {
    const groups = new Map();
    for (const course of courses) {
        if (!groups.has(course.UE)) groups.set(course.UE, []);
        groups.get(course.UE).push(course);
    }

    const fragment = document.createDocumentFragment();
    let index = 0;
    for (const [ue, group] of groups) {
        const id = `${accordion.id}-ue-${++index}`;
        const item = element('div', 'accordion-item');
        const heading = element('h2', 'accordion-header');
        heading.id = `heading-${id}`;
        const button = element('button', 'accordion-button collapsed', ue);
        button.type = 'button';
        button.setAttribute('data-bs-toggle', 'collapse');
        button.setAttribute('data-bs-target', `#${id}`);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', id);
        heading.append(button);

        const panel = element('div', 'accordion-collapse collapse');
        panel.id = id;
        panel.setAttribute('aria-labelledby', heading.id);
        panel.setAttribute('data-bs-parent', `#${accordion.id}`);
        const body = element('div', 'accordion-body');
        // Conserve les indications de mise à jour de la page d’origine.
        const previousYear = /^S3 UE (1\.2|2\.5)\s*-/.test(ue);
        if (group[0].semestre === '3') body.append(element('strong', 'course-notice', previousYear
            ? '⚠️ Il s’agit des cours de l’année dernière.'
            : '✅ Les cours sont à jour.'));
        const list = element('ul', 'list-group');
        for (const course of group) list.append(renderCourse(course));
        body.append(list);
        panel.append(body);
        item.append(heading, panel);
        fragment.append(item);
    }
    accordion.replaceChildren(fragment);
}

// Les lignes sans UE ni cours représentent les ressources de tout un semestre.
function renderOtherSemesters(text) {
    const fragment = document.createDocumentFragment();
    const sources = readSources(text).filter(source => !source.cours_nom)
        .sort((a, b) => Number(a.semestre) - Number(b.semestre));
    for (const source of sources) {
        const tr = element("tr");
        const heading = element("th", "", `S${source.semestre}`);
        heading.scope = "row";
        tr.append(heading);
        for (const columns of [["video_link_1", "video_link_2", "video_link_1_backup", "video_link_2_backup"], ["pdf_link", "pdf_link_backup"]]) {
            const cell = element("td");
            let count = 0;
            for (const column of columns) {
                if (!source[column]) continue;
                const url = new URL(source[column]);
                if (!["https:", "http:"].includes(url.protocol)) throw new Error("Lien de semestre incorrect.");
                if (count++) cell.append(element("span", "", " · "));
                const link = element("a", "", column.endsWith("backup") ? "Secours" : "Accéder");
                link.href = url.href;
                cell.append(link);
            }
            if (!count) cell.textContent = "Bientôt disponible.";
            tr.append(cell);
        }
        fragment.append(tr);
    }
    document.getElementById("other-semesters").replaceChildren(fragment);
    document.getElementById("accordionOtherSemester").hidden = sources.length === 0;
}

async function loadCourses() {
    const status = document.getElementById('courses-status');
    try {
        const response = await fetch('sources.csv', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const text = await response.text();
        const courses = readCourses(text);
        renderOtherSemesters(text);
        renderCourses(courses);
        status.textContent = courses.length ? '' : 'Aucun cours disponible.';
        status.hidden = courses.length > 0;
    } catch (error) {
        document.getElementById('other-semesters').replaceChildren();
        document.getElementById('course-semesters').replaceChildren();
        status.hidden = false;
        status.setAttribute('role', 'alert');
        status.className = 'alert alert-danger';
        status.textContent = location.protocol === 'file:'
            ? 'Pour charger les cours, ouvrez la page avec un serveur local (par exemple Live Server dans VS Code).'
            : 'Impossible de charger les cours. Vérifiez sources.csv puis rechargez la page.';
        console.error('Chargement des cours :', error);
    }
}

loadCourses();

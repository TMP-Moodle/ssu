/* Les intitulés et les six liens de chaque cours proviennent de sources.csv. */
'use strict';

const COURSE_COLUMNS = [
    'UE', 'cours', 'video_link_1', 'video_link_2',
    'video_link_1_anterieur', 'video_link_2_anterieur', 'pdf_link', 'pdf_link_anterieur',
];
const PREVIOUS_LINK_COLUMNS = COURSE_COLUMNS.slice(2).filter(column => column.endsWith('_anterieur'));
const hasPreviousLinks = sources => sources.some(source => PREVIOUS_LINK_COLUMNS.some(column => source[column]));
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

// Accepte le format français ou ISO, sans décalage lié au fuseau horaire.
function parseCourseDate(value) {
    if (!value) return null;
    const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!french && !iso) throw new Error('Date incorrecte : utilisez JJ/MM/AAAA ou AAAA-MM-JJ.');
    const [, year, month, day] = iso || [null, french[3], french[2], french[1]];
    const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
    if (!Number(year) || Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
        throw new Error('Date de cours inexistante.');
    }
    return { iso: `${year}-${month}-${day}`, label: `${day}/${month}/${year}` };
}

function isCourseDue(isoDate, today = new Date()) {
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return isoDate <= localToday;
}

function courseScheduleStyle(course, isoDate, today = new Date()) {
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const presentiel = Boolean(course.Presentiel?.trim());
    const visio = Boolean(course.Visio?.trim());
    if (isoDate >= todayISO && (presentiel || visio)) {
        return { key: presentiel && visio ? 'cours.date_hybride' : presentiel ? 'cours.date_presentiel' : 'cours.date_visio', className: presentiel ? 'course-date-session' : 'course-date-session course-date-visio' };
    }
    const due = isCourseDue(isoDate, today);
    return { key: due ? 'cours.date_programmee' : 'cours.date_prevue', className: due ? 'course-date-due' : '' };
}

function readSources(text) {
    const [headers, ...rows] = parseCSV(text);
    if (!headers || ['semestre', 'ue_numero', 'ue_nom', 'cours_numero', 'cours_nom', ...COURSE_COLUMNS.slice(2), 'id', 'date', 'Presentiel', 'Visio'].some(column => !headers.includes(column))) {
        throw new Error('Les colonnes attendues sont absentes de sources.csv.');
    }
    const ids = new Set();
    return rows.map((row, index) => {
        if (row.length !== headers.length) {
            throw new Error(`Nombre de champs incorrect à la ligne ${index + 2}.`);
        }
        const course = Object.fromEntries(headers.map((header, i) => [header, row[i].trim()]));

        parseCourseDate(course.date);
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
    const primaryColumn = ['video_link_1', 'video_link_2', 'pdf_link',
        'video_link_1_anterieur', 'video_link_2_anterieur', 'pdf_link_anterieur']
        .find(column => course[column]);
    const primary = course[primaryColumn];
    const title = element(primary ? 'a' : 'span', 'course-title', course.cours);
    if (primary) title.href = primary;
    const heading = element('div', 'course-heading');
    const report = element('a', 'course-report', '⚑');
    const reportCourse = `S${course.semestre} UE ${course.ue_numero} ${course.cours_nom}`;
    report.href = `https://tally.so/r/X554dL?cours=${encodeURIComponent(reportCourse)}`;
    report.target = '_blank';
    report.rel = 'noopener noreferrer';
    report.title = SiteTexts.get('cours.signaler', { cours: course.cours, id: course.id });
    report.setAttribute('aria-label', report.title);
    const courseLabel = element('div', 'course-label');
    courseLabel.append(title);
    heading.append(courseLabel, report);
    item.append(heading);

    const links = element('div', 'course-links');
    const split = Boolean(course.video_link_2 || course.video_link_2_anterieur);
    const labels = [
        ['video_link_1', split ? SiteTexts.get('cours.premiere_partie') : SiteTexts.get('cours.enregistrement')],
        ['video_link_2', SiteTexts.get('cours.seconde_partie')],
        ['video_link_1_anterieur', split ? SiteTexts.get('cours.anterieur_premiere_partie') : SiteTexts.get('cours.video_anterieure')],
        ['video_link_2_anterieur', SiteTexts.get('cours.anterieur_seconde_partie')],
        ['pdf_link', SiteTexts.get('cours.pdf')],
        ['pdf_link_anterieur', SiteTexts.get('cours.pdf_anterieur')],
    ];
    if (!COURSE_COLUMNS.slice(2, 6).some(column => course[column])) {
        links.append(element('span', 'badge bg-danger', SiteTexts.get('cours.sans_enregistrement')));
    }
    for (const [column, label] of labels) {
        if (!course[column]) continue;
        const link = element('a', column.endsWith('_anterieur') ? 'badge link-anterieur' : 'badge bg-secondary', label);
        link.href = course[column];
        links.append(link);
    }
    item.append(links);

    const completion = element('div', 'course-completion');
    const scheduledDate = parseCourseDate(course.date);
    if (scheduledDate) {
        const style = courseScheduleStyle(course, scheduledDate.iso);
        const date = element('time', 'course-date', SiteTexts.get(style.key, { date: scheduledDate.label }));
        date.dateTime = scheduledDate.iso;
        if (style.className) date.classList.add(...style.className.split(' '));
        completion.append(date);
    } else {
        completion.append(element('span', 'course-date', SiteTexts.get('cours.non_programme')));
    }
    const label = element('label', 'form-check');
    const checkbox = element('input', 'form-check-input');
    checkbox.type = 'checkbox';
    checkbox.id = `completed-${course.id}`;
    checkbox.setAttribute('aria-label', SiteTexts.get('cours.termine_accessible', { cours: course.cours }));
    const feedback = element('span', 'completion-feedback text-warning');
    feedback.id = `feedback-${course.id}`;
    feedback.setAttribute('role', 'status');
    checkbox.setAttribute('aria-describedby', feedback.id);
    const key = `${PROGRESS_PREFIX}${course.id}`;

    function showStorageError() {
        feedback.textContent = SiteTexts.get('messages.stockage');
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
    label.append(checkbox, element('span', 'form-check-label', SiteTexts.get('cours.termine')));
    completion.append(label, feedback);
    item.append(completion);
    return item;
}

function coursesByDay(courses, today = new Date()) {
    return [-1, 0, 1].map(offset => {
        const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
        const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        return { offset, courses: courses.filter(course => {
            const scheduled = parseCourseDate(course.date);
            if (course.semestre !== '3' || !scheduled) return false;
            if (offset !== -1) return scheduled.iso === iso;
            if (scheduled.iso >= todayISO) return false;
            const checkbox = document.getElementById(`completed-${course.id}`);
            if (checkbox) return !checkbox.checked;
            try { return localStorage.getItem(`${PROGRESS_PREFIX}${course.id}`) !== 'true'; }
            catch { return true; }
        })
            .sort((a, b) => a.ue_numero.localeCompare(b.ue_numero, 'fr', { numeric: true }) || Number(a.cours_numero) - Number(b.cours_numero)) };
    });
}

function renderDailySchedule(courses) {
    const schedule = element('details', 'daily-schedule');
    schedule.setAttribute('aria-label', SiteTexts.get('planning.titre'));
    const days = coursesByDay(courses);
    const summary = element('summary', 'daily-schedule-summary');
    for (const day of days) {
        const label = SiteTexts.get(day.offset === -1 ? 'planning.rattraper' : day.offset === 1 ? 'planning.demain' : 'planning.aujourdhui');
        const count = SiteTexts.get('planning.nombre_cours', { nombre: day.courses.length });
        const part = element('span', 'daily-schedule-count');
        part.append(element('span', '', label), element('span', '', count));
        summary.append(part);
    }
    schedule.append(summary);
    for (const day of days) {
        const row = element('div', 'daily-schedule-day');
        row.append(element('h3', 'daily-schedule-heading', SiteTexts.get(day.offset === -1 ? 'planning.rattraper' : day.offset === 1 ? 'planning.demain' : 'planning.aujourdhui')));
        const content = element('div', 'daily-schedule-content');
        row.append(content);
        if (!day.courses.length) {
            content.append(element('p', 'daily-schedule-empty', SiteTexts.get(day.offset === -1 ? 'planning.aucun_rattraper' : 'planning.aucun')));
        } else {
            const list = element('ul', 'daily-schedule-list');
            const entries = day.offset === -1
                ? [...day.courses.reduce((counts, course) => counts.set(course.ue_numero, (counts.get(course.ue_numero) || 0) + 1), new Map())]
                    .map(([ue, count]) => ({ ue, label: SiteTexts.get('planning.nombre_cours', { nombre: count }) }))
                : day.courses.map(course => ({ ue: course.ue_numero, label: course.cours_nom }));
            for (const entry of entries) {
                const item = element('li', 'daily-schedule-course');
                item.append(element('span', 'daily-schedule-ue', `UE ${entry.ue}`), element('span', '', entry.label));
                list.append(item);
            }
            content.append(list);
        }
        schedule.append(row);
    }
    return schedule;
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
        const title = element(semester === sorted[0][0] ? 'h1' : 'h2', '', SiteTexts.get('navigation.semestre', { semestre: semester }));
        title.id = `semester-title-${semester}`;
        heading.append(title, element('span', '', SiteTexts.get('navigation.sous_titre')));
        intro.append(heading);
        if (semester === '3') fragment.append(renderDailySchedule(group));
        const accordion = element('div', 'accordion course-accordion');
        accordion.id = `accordionS${semester}`;
        accordion.setAttribute('aria-label', SiteTexts.get('navigation.cours_semestre', { semestre: semester }));
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
        const button = element('button', 'accordion-button collapsed');
        const ueTitle = element('span', 'ue-title');
        ueTitle.append(
            element('span', 'ue-number', `UE ${group[0].ue_numero}`),
            element('span', 'ue-separator', ' — '),
            element('span', 'ue-name', group[0].ue_nom),
        );
        button.append(ueTitle);
        const progress = element('span', 'ue-progress');
        button.append(progress);
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
        if (hasPreviousLinks(group)) {
            body.append(element('p', 'course-notice previous-year-legend', SiteTexts.get('cours.legende_anterieurs')));
        }
        const list = element('ul', 'list-group');
        for (const course of group) list.append(renderCourse(course));
        function updateProgress() {
            const completed = list.querySelectorAll('.form-check-input:checked').length;
            progress.textContent = `${completed}/${group.length}`;
            progress.setAttribute('aria-label', SiteTexts.get('cours.progression', { faits: completed, total: group.length }));
            progress.title = SiteTexts.get('cours.progression', { faits: completed, total: group.length });
        }
        list.addEventListener('change', updateProgress);
        updateProgress();
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
    document.getElementById("other-semesters-legend").hidden = !hasPreviousLinks(sources);
    for (const source of sources) {
        const tr = element("tr");
        const heading = element("th", "", `S${source.semestre}`);
        heading.scope = "row";
        tr.append(heading);
        for (const columns of [["video_link_1", "video_link_2", "video_link_1_anterieur", "video_link_2_anterieur"], ["pdf_link", "pdf_link_anterieur"]]) {
            const cell = element("td");
            let count = 0;
            for (const column of columns) {
                if (!source[column]) continue;
                const url = new URL(source[column]);
                if (!["https:", "http:"].includes(url.protocol)) throw new Error("Lien de semestre incorrect.");
                if (count++) cell.append(element("span", "", " · "));
                const link = element("a", column.endsWith("_anterieur") ? "link-anterieur" : "", column.endsWith("_anterieur") ? SiteTexts.get('cours.anterieur') : SiteTexts.get('cours.acceder'));
                link.href = url.href;
                cell.append(link);
            }
            if (!count) {
                const recordings = columns[0] === 'video_link_1';
                cell.textContent = recordings ? '—' : SiteTexts.get('cours.bientot');
                if (recordings) {
                    cell.title = SiteTexts.get('cours.enregistrements_indisponibles');
                    cell.setAttribute('aria-label', cell.title);
                }
            }
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
        await SiteTexts.ready;
        const response = await fetch('sources.csv', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const text = await response.text();
        const courses = readCourses(text);
        renderOtherSemesters(text);
        renderCourses(courses);
        document.getElementById('course-semesters').addEventListener('change', event => {
            if (!event.target.matches('.form-check-input')) return;
            const previous = document.querySelector('.daily-schedule');
            if (!previous) return;
            const updated = renderDailySchedule(courses);
            updated.open = previous.open;
            previous.replaceWith(updated);
        });
        status.textContent = courses.length ? '' : SiteTexts.get('messages.aucun_cours');
        status.hidden = courses.length > 0;
    } catch (error) {
        document.getElementById('accordionOtherSemester').hidden = true;
        document.getElementById('other-semesters').replaceChildren();
        document.getElementById('course-semesters').replaceChildren();
        if (!SiteTexts.loaded) return; // textes.js affiche l’erreur de configuration.
        status.hidden = false;
        status.setAttribute('role', 'alert');
        status.className = 'alert alert-danger';
        const message = location.protocol === 'file:'
            ? SiteTexts.get('messages.erreur_locale')
            : SiteTexts.get('messages.erreur_cours');
        const fallback = element('a', 'alert-link', SiteTexts.get('messages.consulter_version_simplifiee'));
        fallback.href = 'version-simplifiee.html';
        status.replaceChildren(element('p', 'mb-2', message), fallback);
        console.error('Chargement des cours :', error);
    }
}

loadCourses();

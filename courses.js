/* Les intitulés et les liens de chaque cours proviennent de sources.csv. */
'use strict';

const COURSE_COLUMNS = [
    'UE', 'cours', 'video_link_1', 'video_link_2',
    'video_link_1_anterieur', 'video_link_2_anterieur', 'pdf_link', 'pdf_link_anterieur',
];
const VIDEO_BACKUP_COLUMNS = ['video_link_1_backup', 'video_link_2_backup'];
const PROGRESS_PREFIX = 'tmp-moodle:completed:';
const COURSE_ID_PATTERN = /^(S\d+_UE\d+(?:\.\d+)*_COURS)(\d+(?:ET\d+)*)$/;
const completionControls = new Map();
const progressListeners = new Set();

// Les groupes partagent les clés de suivi des cours individuels, sans état distinct.
function courseComponentIds(id) {
    const match = COURSE_ID_PATTERN.exec(id);
    return match ? [...new Set(match[2].split('ET'))].map(number => `${match[1]}${number}`) : [id];
}

function isCourseCompleted(id) {
    return courseComponentIds(id).every(component => localStorage.getItem(`${PROGRESS_PREFIX}${component}`) === 'true');
}

function setCourseCompleted(id, completed) {
    for (const component of courseComponentIds(id)) {
        const key = `${PROGRESS_PREFIX}${component}`;
        if (completed) localStorage.setItem(key, 'true');
        else localStorage.removeItem(key);
    }
}

function syncCourseProgress() {
    for (const [id, { checkbox, feedback, item }] of completionControls) {
        try {
            checkbox.checked = isCourseCompleted(id);
            item.setAttribute('data-completed', String(checkbox.checked));
        }
        catch { feedback.textContent = SiteTexts.get('messages.stockage'); }
    }
    for (const updateProgress of progressListeners) updateProgress();
}

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
    if (presentiel || visio) {
        return { key: presentiel && visio ? 'cours.date_hybride' : presentiel ? 'cours.date_presentiel' : 'cours.date_visio', className: isoDate < todayISO ? 'course-date-due' : presentiel ? 'course-date-session' : 'course-date-session course-date-visio' };
    }
    const due = isCourseDue(isoDate, today);
    return { key: due ? 'cours.date_programmee' : 'cours.date_prevue', className: due ? 'course-date-due' : 'course-date-upcoming' };
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
        for (const column of [...COURSE_COLUMNS.slice(2), ...VIDEO_BACKUP_COLUMNS]) {
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
        course.cours = course.cours_nom;
        if (!COURSE_ID_PATTERN.test(course.id) || ids.has(course.id)) {
            throw new Error(`Identifiant absent, incorrect ou dupliqué à la ligne ${index + 2}.`);
        }
        ids.add(course.id);
        return course;
    });
}

function readCourses(text) {
    return readSources(text).filter(source => source.cours_nom);
}

function compareCourses(a, b) {
    return a.ue_numero.localeCompare(b.ue_numero, 'fr', { numeric: true })
        || (parseCourseDate(a.date)?.iso || '\uffff').localeCompare(parseCourseDate(b.date)?.iso || '\uffff')
        || Number(a.cours_numero) - Number(b.cours_numero);
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

// Dessiner directement le SVG évite les artefacts des masques CSS sur iOS.
function resourceIcon(kind) {
    const icon = element('span', `resource-icon resource-icon-${kind}`);
    icon.setAttribute('aria-hidden', 'true');
    const shapes = kind === 'video'
        ? '<rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-4v14l-7-4"/>'
        : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>';
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" focusable="false">${shapes}</svg>`;
    return icon;
}

function unavailableResource(kind, textKey) {
    const badge = element('span', 'badge resource-unavailable');
    badge.append(resourceIcon(kind), element('span', 'resource-label', SiteTexts.get(textKey)));
    return badge;
}

function videoLinkColumns(source) {
    const primary = source.video_link_1 || source.video_link_2
        ? ['video_link_1', 'video_link_2']
        : ['video_link_1_anterieur', 'video_link_2_anterieur'];
    return [...primary, ...VIDEO_BACKUP_COLUMNS];
}

function pdfLinkColumns(source) {
    return source.pdf_link ? ['pdf_link'] : ['pdf_link_anterieur'];
}

// Les informations saisies dans le CSV restent toujours prioritaires.
function courseInformation(course, today = new Date()) {
    const information = course.information?.trim();
    if (information) return information;
    if (!(course.Presentiel?.trim() || course.Visio?.trim())
        || course.video_link_1?.trim() || course.pdf_link?.trim()) return '';
    const scheduled = parseCourseDate(course.date);
    if (!scheduled) return '';
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(today);
    const part = type => parts.find(value => value.type === type).value;
    const todayISO = `${part('year')}-${part('month')}-${part('day')}`;
    return SiteTexts.get(scheduled.iso > todayISO ? 'cours.ressources_a_venir' : 'cours.ressources_en_attente');
}

function renderCourse(course) {
    const item = element('li', 'list-group-item');
    item.id = course.id;
    const primaryColumn = ['video_link_1', 'video_link_2', ...VIDEO_BACKUP_COLUMNS, 'pdf_link',
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
    const information = courseInformation(course);
    if (information) {
        courseLabel.append(element('p', 'course-information', information));
    }
    heading.append(courseLabel);
    item.append(heading);

    const links = element('div', 'course-links');
    const videoColumns = videoLinkColumns(course);
    const pdfColumns = pdfLinkColumns(course);
    const split = Boolean(course[videoColumns[1]] || course.video_link_2_backup);
    const labels = [
        ['video_link_1', split ? SiteTexts.get('cours.premiere_partie') : SiteTexts.get('cours.enregistrement')],
        ['video_link_2', SiteTexts.get('cours.seconde_partie')],
        ['video_link_1_backup', SiteTexts.get(split ? 'cours.secours_premiere_partie' : 'cours.video_secours')],
        ['video_link_2_backup', SiteTexts.get('cours.secours_seconde_partie')],
        ['video_link_1_anterieur', split ? SiteTexts.get('cours.anterieur_premiere_partie') : SiteTexts.get('cours.video_anterieure')],
        ['video_link_2_anterieur', SiteTexts.get('cours.anterieur_seconde_partie')],
        ['pdf_link', SiteTexts.get('cours.pdf')],
        ['pdf_link_anterieur', SiteTexts.get('cours.pdf_anterieur')],
    ];
    if (!videoColumns.some(column => course[column])) {
        links.append(unavailableResource('video', 'cours.sans_enregistrement'));
    }
    for (const [column, label] of labels) {
        if (!course[column]) continue;
        if (column.startsWith('video_link_') && !videoColumns.includes(column)) continue;
        if (column.startsWith('pdf_link') && !pdfColumns.includes(column)) continue;
        const link = element('a', column.endsWith('_anterieur') ? 'badge link-anterieur' : 'badge bg-secondary');
        const icon = resourceIcon(column.startsWith('video') ? 'video' : 'document');
        link.append(icon, element('span', 'resource-label', label));
        link.href = course[column];
        links.append(link);
    }
    if (!course.pdf_link && !course.pdf_link_anterieur) {
        links.append(unavailableResource('document', 'cours.sans_pdf'));
    }
    item.append(links);

    const completion = element('div', 'course-completion');
    const schedule = element('div', 'course-schedule');
    schedule.append(report);
    const scheduledDate = parseCourseDate(course.date);
    if (scheduledDate) {
        const style = courseScheduleStyle(course, scheduledDate.iso);
        const date = element('time', 'course-date', SiteTexts.get(style.key, { date: scheduledDate.label }));
        date.dateTime = scheduledDate.iso;
        if (style.className) date.classList.add(...style.className.split(' '));
        schedule.append(date);
    } else {
        schedule.append(element('span', 'course-date', SiteTexts.get('cours.non_programme')));
    }
    completion.append(schedule);
    const label = element('label', 'form-check');
    const checkbox = element('input', 'form-check-input');
    checkbox.type = 'checkbox';
    checkbox.id = `completed-${course.id}`;
    checkbox.setAttribute('aria-label', SiteTexts.get('cours.termine_accessible', { cours: course.cours }));
    const feedback = element('span', 'completion-feedback text-warning');
    feedback.id = `feedback-${course.id}`;
    feedback.setAttribute('role', 'status');
    checkbox.setAttribute('aria-describedby', feedback.id);

    function showStorageError() {
        feedback.textContent = SiteTexts.get('messages.stockage');
    }

    try {
        checkbox.checked = isCourseCompleted(course.id);
    } catch {
        showStorageError();
    }
    item.setAttribute('data-completed', String(checkbox.checked));
    completionControls.set(course.id, { checkbox, feedback, item });
    checkbox.addEventListener('change', () => {
        let saved = false;
        try {
            setCourseCompleted(course.id, checkbox.checked);
            saved = true;
            feedback.textContent = '';
        } catch {
            showStorageError();
        }
        const origin = saved && checkbox.checked ? checkbox : null;
        syncCourseProgress();
        if (origin) launchConfetti(origin);
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
            try { return !isCourseCompleted(course.id); }
            catch { return true; }
        })
            .sort(compareCourses) };
    });
}

// Rejoindre le cours pendant le déploiement de son UE.
function revealScheduledCourse(event, courseId) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(courseId);
    if (!target) return;
    event.preventDefault();
    const panel = target.closest('.accordion-collapse');
    const highlightCourse = () => {
        // Relancer l’animation même si le même cours est sélectionné deux fois.
        target.classList.remove('course-arrival');
        void target.offsetWidth;
        target.classList.add('course-arrival');
        const finishArrival = event => {
            if (event.target !== target || event.animationName !== 'course-arrival') return;
            target.classList.remove('course-arrival');
            target.removeEventListener('animationend', finishArrival);
        };
        target.addEventListener('animationend', finishArrival);
    };
    if (panel && !panel.classList.contains('show')) {
        if (globalThis.bootstrap?.Collapse) {
            bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false }).show();
        } else {
            panel.classList.add('show');
            const button = document.querySelector(`[aria-controls="${panel.id}"]`);
            button?.classList.remove('collapsed');
            button?.setAttribute('aria-expanded', 'true');
        }
    }
    const targetTop = Math.max(16, (document.documentElement.clientHeight - target.getBoundingClientRect().height) / 2);
    animateViewportPosition(target, panel, targetTop, highlightCourse);
}

function renderDailySchedule(courses) {
    const schedule = element('details', 'daily-schedule');
    schedule.open = globalThis.matchMedia?.('(min-width: 761px)').matches ?? false;
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
    const toggle = element('span', 'daily-schedule-toggle');
    const toggleIcon = element('span', 'daily-schedule-toggle-icon');
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggle.append(toggleIcon);
    summary.append(toggle);
    schedule.append(summary);
    for (const day of days) {
        const row = element('div', day.offset === -1 ? 'daily-schedule-day daily-schedule-day-catchup' : 'daily-schedule-day');
        const heading = element('h3', 'daily-schedule-heading', SiteTexts.get(day.offset === -1 ? 'planning.rattraper' : day.offset === 1 ? 'planning.demain' : 'planning.aujourdhui'));
        heading.append(element('span', 'daily-schedule-heading-count', SiteTexts.get('planning.nombre_cours', { nombre: day.courses.length })));
        row.append(heading);
        const content = element('div', 'daily-schedule-content');
        row.append(content);
        if (!day.courses.length) {
            content.append(element('p', 'daily-schedule-empty', SiteTexts.get(day.offset === -1 ? 'planning.aucun_rattraper' : 'planning.aucun')));
        } else {
            const list = element('ul', day.offset === -1 ? 'daily-schedule-list daily-schedule-catchup' : 'daily-schedule-list');
            const entries = day.offset === -1
                ? [...day.courses.reduce((counts, course) => counts.set(course.ue_numero, (counts.get(course.ue_numero) || 0) + 1), new Map())]
                    .map(([ue, count]) => ({ ue, label: SiteTexts.get('planning.nombre_cours', { nombre: count }) }))
                : day.courses.map(course => ({ ue: course.ue_numero, label: course.cours_nom, course }));
            for (const entry of entries) {
                const item = element('li', 'daily-schedule-course');
                const label = element(entry.course ? 'a' : 'span', 'daily-schedule-label', entry.label);
                if (entry.course) {
                    label.href = `#${entry.course.id}`;
                    label.addEventListener('click', event => revealScheduledCourse(event, entry.course.id));
                }
                if (entry.course?.Presentiel?.trim()) {
                    label.append(element('span', 'schedule-mode schedule-mode-presentiel', SiteTexts.get('planning.presentiel')));
                }
                if (entry.course?.Visio?.trim()) {
                    label.append(element('span', 'schedule-mode schedule-mode-visio', SiteTexts.get('planning.visio')));
                }
                item.append(element('span', 'daily-schedule-ue', `UE ${entry.ue}`), label);
                list.append(item);
            }
            content.append(list);
        }
        schedule.append(row);
    }
    return schedule;
}

function renderCourses(courses) {
    completionControls.clear();
    progressListeners.clear();
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
        const progress = element('span', '', `0/${group.length}`);
        heading.append(title, progress);
        function updateProgress() {
            const completed = group.filter(course => completionControls.get(course.id)?.checkbox.checked).length;
            progress.textContent = `${completed}/${group.length}`;
            progress.setAttribute('aria-label', SiteTexts.get('cours.progression', { faits: completed, total: group.length }));
            progress.title = SiteTexts.get('cours.progression', { faits: completed, total: group.length });
        }
        progressListeners.add(updateProgress);
        intro.append(heading);
        if (semester === '3') fragment.append(renderDailySchedule(group));
        const accordion = element('div', 'accordion course-accordion');
        accordion.id = `accordionS${semester}`;
        accordion.setAttribute('aria-label', SiteTexts.get('navigation.cours_semestre', { semestre: semester }));
        // Dans chaque UE : date croissante, puis numéro ; les cours sans date viennent à la fin.
        group.sort(compareCourses);
        renderUEs(group, accordion);
        updateProgress();
        section.append(intro, accordion);
        fragment.append(section);
    }
    document.getElementById('course-semesters').replaceChildren(fragment);
}


let stopUEPositioning = () => {};

function positionOpeningUE(item, panel) {
    stopUEPositioning();
    const top = item.getBoundingClientRect().top;
    const targetTop = document.documentElement.clientHeight * 0.2;
    if (top >= 0 && top <= targetTop) return;
    animateViewportPosition(item, panel, targetTop);
}

function animateViewportPosition(item, panel, targetTop, onArrival) {
    stopUEPositioning();
    const top = item.getBoundingClientRect().top;
    const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const button = panel?.closest('.accordion-item')?.querySelector('.accordion-button');
    // Une trajectoire fixe, de même durée que le déploiement Bootstrap.
    const duration = reducedMotion ? 0 : panel?.classList.contains('collapsing')
        ? parseFloat(getComputedStyle(panel).transitionDuration) * 1000 || 0
        : 400;
    const started = performance.now();
    const interruptions = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    let frame;
    const stop = () => {
        cancelAnimationFrame(frame);
        for (const event of interruptions) window.removeEventListener(event, stop);
        if (stopUEPositioning === stop) stopUEPositioning = () => {};
    };
    stopUEPositioning = stop;
    for (const event of interruptions) window.addEventListener(event, stop, { passive: true });
    const step = time => {
        if (!item.isConnected || (button && button.getAttribute('aria-expanded') !== 'true')) return stop();
        const progress = duration ? Math.min(1, Math.max(0, (time - started) / duration)) : 1;
        const eased = progress * progress * (3 - 2 * progress);
        const desiredTop = top + (targetTop - top) * eased;
        window.scrollBy({
            top: Math.ceil(item.getBoundingClientRect().top - desiredTop),
            behavior: 'instant',
        });
        if (progress === 1) {
            stop();
            onArrival?.();
            return;
        }
        frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
}

// Une gerbe légère près de chaque case cochée.
const activeConfetti = new Set();

function launchConfetti(origin) {
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const rect = origin.getBoundingClientRect();
    const burst = element('div', 'ue-confetti');
    burst.setAttribute('aria-hidden', 'true');
    burst.style.left = `${rect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top + rect.height / 2}px`;
    const colors = ['#58bfa5', '#8d86d9', '#d7ae62', '#df8f9f', '#6daecb'];
    // Budget fixe, y compris lors de coches rapides sur un appareil peu puissant.
    if (activeConfetti.size >= 2) {
        const oldest = activeConfetti.values().next().value;
        oldest.remove();
        activeConfetti.delete(oldest);
    }
    const count = 16;
    for (let i = 0; i < count; i++) {
        const piece = element('span', 'ue-confetti-piece');
        const angle = Math.PI + (i / (count - 1)) * Math.PI;
        const distance = 65 + Math.random() * 100;
        piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
        piece.style.setProperty('--y', `${Math.sin(angle) * distance - 25}px`);
        piece.style.setProperty('--drift', `${Math.cos(angle) * distance * 1.25}px`);
        piece.style.setProperty('--turn', `${Math.random() * 360 - 180}deg`);
        piece.style.setProperty('--delay', `${Math.random() * 90}ms`);
        piece.style.backgroundColor = colors[i % colors.length];
        burst.append(piece);
    }
    activeConfetti.add(burst);
    document.body.append(burst);
    setTimeout(() => {
        burst.remove();
        activeConfetti.delete(burst);
    }, 1800);
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
        button.addEventListener('click', () => {
            // Bootstrap traite le clic en capture et met déjà aria-expanded à jour.
            if (button.getAttribute('aria-expanded') !== 'true') return;
            positionOpeningUE(item, panel);
        });
        const body = element('div', 'accordion-body');
        const list = element('ul', 'list-group');
        for (const course of group) list.append(renderCourse(course));
        function updateProgress() {
            // Une ligne du CSV vaut un cours, même si son ID regroupe plusieurs numéros.
            const completed = list.querySelectorAll('.form-check-input:checked').length;
            progress.textContent = `${completed}/${group.length}`;
            progress.style.setProperty('--ue-completion', completed / group.length);
            progress.setAttribute('aria-label', SiteTexts.get('cours.progression', { faits: completed, total: group.length }));
            progress.title = SiteTexts.get('cours.progression', { faits: completed, total: group.length });
        }
        progressListeners.add(updateProgress);
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
    for (const source of sources) {
        const tr = element("tr");
        const heading = element("th", "", `S${source.semestre}`);
        heading.scope = "row";
        tr.append(heading);
        for (const columns of [videoLinkColumns(source), pdfLinkColumns(source)]) {
            const cell = element("td");
            let count = 0;
            for (const column of columns) {
                if (!source[column]) continue;
                const url = new URL(source[column]);
                if (!["https:", "http:"].includes(url.protocol)) throw new Error("Lien de semestre incorrect.");
                if (count++) cell.append(element("span", "", " · "));
                const link = element("a", column.endsWith("_anterieur") ? "link-anterieur" : "", SiteTexts.get(column.endsWith('_anterieur') ? 'cours.anterieur' : column.endsWith('_backup') ? 'cours.secours' : 'cours.acceder'));
                link.href = url.href;
                cell.append(link);
            }
            if (!count) {
                const recordings = columns[0].startsWith('video_link_');
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
        const response = await fetch(globalThis.SiteAssets?.url('sources.csv') || 'sources.csv', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const text = await response.text();
        const courses = readCourses(text);
        renderOtherSemesters(text);
        renderCourses(courses);
        // Le récapitulatif reste déployé sur ordinateur ; seul le mobile le replie.
        globalThis.matchMedia?.('(min-width: 761px)').addEventListener('change', event => {
            const schedule = document.querySelector('.daily-schedule');
            if (schedule) schedule.open = event.matches;
        });
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
        fallback.href = globalThis.SiteAssets?.url('version-simplifiee.html') || 'version-simplifiee.html';
        status.replaceChildren(element('p', 'mb-2', message), fallback);
        console.error('Chargement des cours :', error);
    }
}

loadCourses();

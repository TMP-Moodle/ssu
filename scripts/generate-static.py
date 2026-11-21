#!/usr/bin/env python3
"""Prépare la page autonome sans JS et le manifeste de version du site."""
import argparse
from datetime import date, datetime
import html
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote, urlsplit
from zoneinfo import ZoneInfo


LINKS = ('video_link_1', 'video_link_2', 'video_link_1_anterieur',
         'video_link_2_anterieur', 'pdf_link', 'pdf_link_anterieur')

BACKUP_LINKS = ('video_link_1_backup', 'video_link_2_backup')


def video_link_columns(source):
    primary = LINKS[:2] if any(source[k] for k in LINKS[:2]) else LINKS[2:4]
    return primary + BACKUP_LINKS


def pdf_link_columns(source):
    return ('pdf_link',) if source['pdf_link'] else ('pdf_link_anterieur',)


VERSION_INPUTS = ('index.html', 'index.css', 'courses.js', 'textes.js',
                  'textes.json', 'derniere-verification.json', 'theme.js', 'sources.json', 'scripts/generate-static.py',
                  'sources-format.js', 'manifest.webmanifest', 'scripts/generate-icons.swift')


def build_version(read, page):
    digest = hashlib.sha256()
    for name in VERSION_INPUTS:
        digest.update(name.encode('utf-8') + b'\0' + read(name).encode('utf-8') + b'\0')
    digest.update(page.encode('utf-8'))
    return json.dumps({'version': digest.hexdigest()[:20]}, indent=2) + '\n'


def parse_course_date(value):
    if not value:
        return None
    if re.fullmatch(r'\d{2}/\d{2}/\d{4}', value):
        day, month, year = value.split('/')
    elif re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        year, month, day = value.split('-')
    else:
        raise ValueError('Date incorrecte : utilisez JJ/MM/AAAA ou AAAA-MM-JJ.')
    scheduled = date(int(year), int(month), int(day))
    return scheduled.isoformat(), f'{day}/{month}/{year}'


def course_schedule_style(row, iso, today):
    presentiel, visio = bool(row['Presentiel'].strip()), bool(row['Visio'].strip())
    if presentiel or visio:
        key = 'date_hybride' if presentiel and visio else 'date_presentiel' if presentiel else 'date_visio'
        css = ('course-date course-date-due' if iso < today else
               'course-date course-date-session' + ('' if presentiel else ' course-date-visio'))
        return css, 'cours.' + key
    due = iso <= today
    return ('course-date course-date-due' if due else 'course-date course-date-upcoming',
            'cours.date_programmee' if due else 'cours.date_prevue')


def resource_icon(kind):
    shapes = ('<rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-4v14l-7-4"/>'
              if kind == 'video' else
              '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>')
    return (f'<span class="resource-icon resource-icon-{kind}" aria-hidden="true">'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" focusable="false">{shapes}</svg></span>')


def course_information(row, today, texts):
    information = row.get('information', '').strip()
    if information:
        return information
    if not (row.get('Presentiel', '').strip() or row.get('Visio', '').strip()):
        return ''
    if row.get('video_link_1', '').strip() or row.get('pdf_link', '').strip():
        return ''
    scheduled = parse_course_date(row.get('date', ''))
    if not scheduled:
        return ''
    key = 'ressources_a_venir' if scheduled[0] > today else 'ressources_en_attente'
    return texts['cours'][key]


def course_order_key(row):
    scheduled = parse_course_date(row['date'])
    return (tuple(map(int, row['ue_numero'].split('.'))),
            scheduled[0] if scheduled else '\uffff', int(row['cours_numero']))


STATIC_CSS = """
* { box-sizing: border-box; }
body { font-size: 16px; line-height: 1.5; }
summary { cursor: pointer; }
summary.accordion-button { display: flex; align-items: center; list-style: none; }
summary.accordion-button::-webkit-details-marker { display: none; }
summary.accordion-button::after { content: ""; flex-shrink: 0; width: 8px; height: 8px; margin-left: auto; margin-right: 3px; border-right: 1.5px solid var(--muted); border-bottom: 1.5px solid var(--muted); transform: rotate(45deg); }
details[open] > summary.accordion-button::after { transform: rotate(225deg); }
@media (max-width: 600px) {
  #accordionOtherSemester > summary.accordion-button::after { width: 8px; height: 8px; margin-right: 4px; }
}
details.accordion-item[open] > summary { background: var(--soft); border-radius: 0; }
.ue-title { margin-left: 0; }
.list-group { padding: 0; margin: 0; list-style: none; }
.course-heading { grid-column: 1; }
.course-title { margin-right: auto; }
.course-links { grid-column: 1 / -1; }
.badge { display: inline-block; line-height: 1.3; text-decoration: none; }
.table { width: 100%; border-collapse: collapse; text-align: left; }
.table th, .table td { border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.intro-description, .course-title, .ue-title, footer p, .table { white-space: pre-wrap; overflow-wrap: anywhere; }
.version-link { font-size: 13px; }
.wordmark { white-space: normal; }
.brand-mark { flex-shrink: 0; }
@media (max-width: 600px) { .site-header { flex-wrap: wrap; } }
@media (prefers-color-scheme: dark) {
  :root { color-scheme: dark; --page: #18181b; --surface: #202023; --ink: #fafafa;
    --muted: #a1a1aa; --line: #38383e; --accent: #fafafa; --soft: #2a2a2f;
    --highlight: #b1adff; --highlight-soft: #302e43;
    --on-accent: #18181b; --ring: #9691e5; --shadow: 0 1px 2px #00000026; }
}
"""


def read_sources(text):
    """Déplie le JSON en modèle interne commun aux fonctions de présentation."""
    def invalid(path):
        raise ValueError(f'sources.json : champ incorrect ({path})')

    def obj(value, path, allowed):
        if not isinstance(value, dict) or set(value) - set(allowed):
            invalid(path)
        return value

    def array(value, path):
        if not isinstance(value, list):
            invalid(path)
        return value

    def string(value, path):
        if not isinstance(value, str):
            invalid(path)
        return value.strip()

    def number(value, path):
        if type(value) is not int or not 1 <= value <= 9007199254740991:
            invalid(path)
        return str(value)

    data = obj(json.loads(text), 'racine', ['semestres'])
    rows, semesters = [], set()
    for semester in array(data.get('semestres'), 'semestres'):
        obj(semester, 'semestre', ['numero', 'ues', 'id', 'ressources', 'champs'])
        sem = number(semester.get('numero'), 'semestre.numero')
        if sem in semesters:
            invalid('semestre.numero dupliqué')
        semesters.add(sem)

        def row(item, ue=None):
            columns = ['semestre', 'ue_numero', 'ue_nom', 'cours_numero', 'cours_nom',
                       'date', 'Presentiel', 'Visio', 'id', 'information']
            for key in LINKS + BACKUP_LINKS:
                columns.extend([key, key + '_date'])
            result = dict.fromkeys(columns, '')
            result['semestre'] = sem
            result['id'] = string(item.get('id'), 'id')
            if ue is not None:
                result.update(ue_numero=string(ue.get('numero'), 'ue.numero'),
                              ue_nom=string(ue.get('nom'), 'ue.nom'),
                              cours_numero=number(item.get('numero'), 'cours.numero'),
                              cours_nom=string(item.get('nom'), 'cours.nom'),
                              date=string(item.get('date', ''), 'cours.date'),
                              information=string(item.get('information', ''), 'cours.information'))
                for key, column in [('presentiel', 'Presentiel'), ('visio', 'Visio')]:
                    if type(item.get(key, False)) is not bool:
                        invalid('cours.' + key)
                    result[column] = 'Oui' if item.get(key) else ''
            resources = obj(item.get('ressources', {}), 'ressources',
                            ['videos', 'videos_anterieures', 'pdf', 'pdf_anterieur'])

            def resource(value, key, backup=False):
                if value is None:
                    return
                obj(value, key, ['url', 'ajoute_le', 'secours'] if backup else ['url', 'ajoute_le'])
                result[key] = string(value.get('url', ''), key + '.url')
                result[key + '_date'] = string(value.get('ajoute_le', ''), key + '.ajoute_le')
                if backup:
                    resource(value.get('secours'), key + '_backup')

            for field in ['videos', 'videos_anterieures']:
                if field not in resources:
                    continue
                videos = array(resources[field], field)
                if len(videos) > 2:
                    invalid(field + ' : deux parties maximum')
                for i, value in enumerate(videos, 1):
                    resource(value, f'video_link_{i}' + ('_anterieur' if field == 'videos_anterieures' else ''), field == 'videos')
            resource(resources.get('pdf'), 'pdf_link')
            resource(resources.get('pdf_anterieur'), 'pdf_link_anterieur')
            if 'champs' in item:
                extra = item['champs']
                if not isinstance(extra, dict):
                    invalid('champs')
                for key, value in extra.items():
                    if key in columns or key in ('__proto__', 'constructor', 'prototype'):
                        invalid('champs.' + key)
                    result[key] = string(value, 'champs.' + key)
            rows.append(result)

        ues = set()
        for ue in array(semester.get('ues'), 'semestre.ues'):
            obj(ue, 'ue', ['numero', 'nom', 'cours'])
            key = string(ue.get('numero'), 'ue.numero')
            if key in ues:
                invalid('ue.numero dupliqué')
            ues.add(key)
            for course in array(ue.get('cours'), 'ue.cours'):
                obj(course, 'cours', ['id', 'numero', 'nom', 'date', 'presentiel', 'visio', 'information', 'ressources', 'champs'])
                row(course, ue)
        if 'ressources' in semester:
            row(semester)
    return rows


def generate(read):
    texts = json.loads(read('textes.json'))
    verification = json.loads(read('derniere-verification.json'))
    if not all(isinstance(verification.get(key), str) for key in ('date', 'heure')):
        raise ValueError('derniere-verification.json : date et heure requises')
    today = datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()

    def t(key, **values):
        value = texts
        for part in key.split('.'):
            value = value[part]
        if not isinstance(value, str):
            raise ValueError(f'Texte incorrect : {key}')
        return html.escape(re.sub(r'\{(\w+)\}', lambda m: str(values.get(m[1], m[0])), value), quote=True)

    def unavailable_resource(kind, key):
        return f'<span class="badge resource-unavailable">{resource_icon(kind)}<span class="resource-label">{t(key)}</span></span>'

    def link(url, label, attrs=''):
        return f'<a href="{html.escape(url, quote=True)}"{attrs}>{label}</a>'

    courses, resources, ids = [], [], set()
    for line, row in enumerate(read_sources(read('sources.json')), 1):
        parse_course_date(row['date'])
        if not re.fullmatch(r'[1-9]\d*', row['semestre']):
            raise ValueError(f'Semestre incorrect à la ligne {line}')
        for column in LINKS + BACKUP_LINKS:
            if row.get(column):
                url = urlsplit(row[column])
                if url.scheme not in ('http', 'https') or not url.netloc:
                    raise ValueError(f'Lien incorrect à la ligne {line}')
        if not any(row[key] for key in ('ue_numero', 'ue_nom', 'cours_numero', 'cours_nom')):
            resources.append(row)
            continue
        if (not re.fullmatch(r'\d+(?:\.\d+)*', row['ue_numero'])
                or not re.fullmatch(r'[1-9]\d*', row['cours_numero'])
                or not row['ue_nom'] or not row['cours_nom']
                or not re.fullmatch(r'S\d+_UE\d+(?:\.\d+)*_COURS\d+(?:ET\d+)*', row['id'])
                or row['id'] in ids):
            raise ValueError(f'UE, cours ou identifiant incorrect à la ligne {line}')
        ids.add(row['id'])
        courses.append(row)

    parts = [f'''<!DOCTYPE html>
<!-- Généré par scripts/generate-static.py ; modifier sources.json, textes.json, derniere-verification.json ou index.css. -->
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{t('site.description')}">
<title>{t('site.nom_simplifie')}</title>
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png?v=violet">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png?v=violet">
<link rel="apple-touch-icon" sizes="180x180" href="icons/apple-touch-icon.png?v=violet">
<link rel="manifest" href="manifest.webmanifest?v=violet">
<meta name="theme-color" content="#18181b">
<style>{read('index.css')}{STATIC_CSS}</style>
</head>
<body>
<header class="site-header">
<a class="wordmark" href="index.html" aria-label="{t('site.accueil')}"><span class="brand-mark" aria-hidden="true">m.</span> {t('site.nom_simplifie')}</a>
<a class="version-link" href="index.html">{t('pied_de_page.version_normale')}</a>
</header>
<main>''']
    semesters = sorted({row['semestre'] for row in courses}, key=int)
    if not courses:
        parts.append(f'<p>{t("messages.aucun_cours")}</p>')
    for semester in semesters:
        tag = 'h1' if semester == semesters[0] else 'h2'
        semester_courses = [row for row in courses if row['semestre'] == semester]
        parts.append(f'''<section aria-labelledby="semestre-{semester}">
<div class="intro"><div class="semester-heading"><{tag} id="semestre-{semester}">{t('navigation.semestre', semestre=semester)}</{tag}><span>0/{len(semester_courses)}</span></div></div>
<div class="course-accordion" aria-label="{t('navigation.cours_semestre', semestre=semester)}">''')
        groups = {}
        ordered = sorted((r for r in courses if r['semestre'] == semester), key=course_order_key)
        for row in ordered:
            groups.setdefault((row['ue_numero'], row['ue_nom']), []).append(row)
        for (number, name), group in groups.items():
            title = (f'<span class="ue-number">UE {html.escape(number)}</span>'
                     f'<span class="ue-separator"> — </span>'
                     f'<span class="ue-name">{html.escape(name)}</span>')
            parts.append(f'<details class="accordion-item"><summary class="accordion-button"><span class="ue-title">{title}</span></summary><div class="accordion-body">')
            if number == '2.5':
                parts.append(f'<p class="ue-resource-note">{t("cours.legende_ue_2_5")}</p>')
            parts.append('<ul class="list-group">')
            for row in group:
                title = row['cours_nom']
                primary_column = next((k for k in (LINKS[0], LINKS[1], *BACKUP_LINKS, LINKS[4], LINKS[2], LINKS[3], LINKS[5]) if row.get(k)), '')
                heading = link(row[primary_column], html.escape(title), ' class="course-title"') if primary_column else f'<span class="course-title">{html.escape(title)}</span>'
                scheduled = parse_course_date(row['date'])
                date_label = f'<span class="course-date">{t("cours.non_programme")}</span>'
                if scheduled:
                    iso, label = scheduled
                    date_class, date_key = course_schedule_style(row, iso, today)
                    date_text = t(date_key, date=label)
                    date_label = f'<time class="{date_class}" datetime="{iso}">{date_text}</time>'
                information = course_information(row, today, texts)
                if information:
                    heading += f'<p class="course-information">{html.escape(information)}</p>'
                heading = f'<div class="course-label">{heading}</div>'
                report_url = 'https://tally.so/r/X554dL?cours=' + quote(f"S{semester} UE {number} {row['cours_nom']}", safe='')
                report_title = t('cours.signaler', cours=title, id=row['id'])
                report = link(report_url, '⚑', f' class="course-report" title="{report_title}" aria-label="{report_title}" target="_blank" rel="noopener noreferrer"')
                parts.append(f'<li class="list-group-item" id="{row["id"]}"><div class="course-heading">{heading}</div><div class="course-schedule">{report}{date_label}</div><div class="course-links">')
                video_columns = video_link_columns(row)
                split = bool(row[video_columns[1]] or row.get('video_link_2_backup'))
                labels = ('premiere_partie' if split else 'enregistrement', 'seconde_partie',
                          'anterieur_premiere_partie' if split else 'video_anterieure', 'anterieur_seconde_partie', 'pdf', 'pdf_anterieur')
                if not any(row.get(k) for k in video_columns):
                    parts.append(unavailable_resource('video', 'cours.sans_enregistrement'))
                resource_labels = list(zip(LINKS, labels))
                resource_labels[2:2] = [(BACKUP_LINKS[0], 'secours_premiere_partie' if split else 'video_secours'),
                                        (BACKUP_LINKS[1], 'secours_seconde_partie')]
                for column, label in resource_labels:
                    if column.startswith('video_link_') and column not in video_columns:
                        continue
                    if column.startswith('pdf_link') and column not in pdf_link_columns(row):
                        continue
                    if row.get(column):
                        css_class = 'badge link-anterieur' if column.endswith('_anterieur') else 'badge'
                        icon = 'video' if column.startswith('video') else 'document'
                        resource_label = f'{resource_icon(icon)}<span class="resource-label">{t("cours." + label)}</span>'
                        parts.append(link(row[column], resource_label, f' class="{css_class}"'))
                if not any(row[k] for k in LINKS[4:]):
                    parts.append(unavailable_resource('document', 'cours.sans_pdf'))
                parts.append('</div></li>')
            parts.append('</ul></div></details>')
        parts.append('</div></section>')
    if resources:
        parts.append(f'''<details class="accordion-item" id="accordionOtherSemester"><summary class="accordion-button">{t('navigation.autres_semestres')}</summary><div class="accordion-body"><table class="table"><thead><tr><th scope="col">{t('navigation.colonne_semestre')}</th><th scope="col">{t('navigation.enregistrements')}</th><th scope="col">{t('navigation.pdf')}</th></tr></thead><tbody>''')
        for row in sorted(resources, key=lambda r: int(r['semestre'])):
            parts.append(f'<tr><th scope="row">S{row["semestre"]}</th>')
            for columns in (video_link_columns(row), pdf_link_columns(row)):
                links = [link(row[k], t('cours.anterieur' if k.endswith('_anterieur') else 'cours.secours' if k.endswith('_backup') else 'cours.acceder'), ' class="link-anterieur"' if k.endswith('_anterieur') else '') for k in columns if row.get(k)]
                if not links and columns[0].startswith('video_link_'):
                    unavailable = t('cours.enregistrements_indisponibles')
                    parts.append(f'<td title="{unavailable}" aria-label="{unavailable}">—</td>')
                else:
                    parts.append('<td>' + (' · '.join(links) or t('cours.bientot')) + '</td>')
            parts.append('</tr>')
        parts.append('</tbody></table></div></details>')
    parts.append(f'''</main>
<footer><p>{t('pied_de_page.signalement')}</p>
<div class="footer-navigation"><a href="index.html">{t('pied_de_page.version_normale')}</a></div>
<details class="site-information"><summary>{t('pied_de_page.titre_a_propos')}</summary><p>{t('pied_de_page.a_propos')}</p><p><a href="https://tally.so/r/xVVJkJ">{t('pied_de_page.reclamation')}</a></p></details>
</footer></body></html>''')
    return '\n'.join(parts) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged', action='store_true', help='Lire les fichiers préparés dans l’index Git')
    args = parser.parse_args()
    root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())

    def read(name):
        if args.staged:
            return subprocess.check_output(['git', 'show', ':' + name], cwd=root).decode('utf-8')
        return (root / name).read_text(encoding='utf-8')

    try:
        page = generate(read)
        manifest = build_version(read, page)
        # Ne remplacer les fichiers qu’une fois toutes les entrées validées.
        for name, content in (('version-simplifiee.html', page), ('version.json', manifest)):
            target = root / name
            temporary = target.with_suffix(target.suffix + '.tmp')
            temporary.write_text(content, encoding='utf-8')
            temporary.replace(target)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f'Préparation du site impossible : {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

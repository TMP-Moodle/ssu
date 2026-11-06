#!/usr/bin/env python3
"""Construit une page autonome sans JS, avec la bibliothèque standard Python."""
import argparse
import csv
import html
import io
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote, urlsplit


LINKS = ('video_link_1', 'video_link_2', 'video_link_1_backup',
         'video_link_2_backup', 'pdf_link', 'pdf_link_backup')
STATIC_CSS = """
/* Une nuance bleu-gris distingue discrètement la version simplifiée. */
:root {
  --page: #f5f7f8; --surface: #fff; --ink: #26343b; --muted: #65727a;
  --line: #dce2e6; --accent: #3c6175; --soft: #eaf0f4;
}
* { box-sizing: border-box; }
body { font-size: 16px; line-height: 1.5; }
summary { cursor: pointer; }
summary.accordion-button { display: list-item; list-style-position: inside; }
details[open] > summary { background: var(--soft); border-radius: 16px 16px 0 0; }
.ue-title { margin-left: 8px; }
.list-group { padding: 0; margin: 0; list-style: none; }
.course-heading { grid-column: 1 / -1; }
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
  :root { color-scheme: dark; --page: #171d21; --surface: #20292f; --ink: #e5edf1;
    --muted: #a9b6bf; --line: #384650; --accent: #a5c8dd; --soft: #2b3b45; }
}
"""


def generate(read):
    texts = json.loads(read('textes.json'))

    def t(key, **values):
        value = texts
        for part in key.split('.'):
            value = value[part]
        if not isinstance(value, str):
            raise ValueError(f'Texte incorrect : {key}')
        return html.escape(re.sub(r'\{(\w+)\}', lambda m: str(values.get(m[1], m[0])), value), quote=True)

    def link(url, label, attrs=''):
        return f'<a href="{html.escape(url, quote=True)}"{attrs}>{label}</a>'

    reader = csv.DictReader(io.StringIO(read('sources.csv').lstrip('\ufeff')))
    required = {'semestre', 'ue_numero', 'ue_nom', 'cours_numero', 'cours_nom', 'id', *LINKS}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError('Colonnes manquantes dans sources.csv')
    courses, resources, ids = [], [], set()
    for line, row in enumerate(reader, 2):
        if None in row or None in row.values():
            raise ValueError(f'Nombre de champs incorrect à la ligne {line}')
        row = {key: value.strip() for key, value in row.items()}
        if not re.fullmatch(r'[1-9]\d*', row['semestre']):
            raise ValueError(f'Semestre incorrect à la ligne {line}')
        for column in LINKS:
            if row[column]:
                url = urlsplit(row[column])
                if url.scheme not in ('http', 'https') or not url.netloc:
                    raise ValueError(f'Lien incorrect à la ligne {line}')
        if not any(row[key] for key in ('ue_numero', 'ue_nom', 'cours_numero', 'cours_nom')):
            resources.append(row)
            continue
        if (not re.fullmatch(r'\d+(?:\.\d+)*', row['ue_numero'])
                or not re.fullmatch(r'[1-9]\d*', row['cours_numero'])
                or not row['ue_nom'] or not row['cours_nom']
                or not re.fullmatch(r'S\d+_UE\d+(?:\.\d+)*_COURS\d+', row['id'])
                or row['id'] in ids):
            raise ValueError(f'UE, cours ou identifiant incorrect à la ligne {line}')
        ids.add(row['id'])
        courses.append(row)

    parts = [f'''<!DOCTYPE html>
<!-- Généré par scripts/generate-static.py ; modifier sources.csv, textes.json ou index.css. -->
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{t('site.description')}">
<title>{t('site.nom_simplifie')}</title>
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
        parts.append(f'''<section aria-labelledby="semestre-{semester}">
<div class="intro"><div class="semester-heading"><{tag} id="semestre-{semester}">{t('navigation.semestre', semestre=semester)}</{tag}><span>{t('navigation.sous_titre')}</span></div></div>
<div class="course-accordion" aria-label="{t('navigation.cours_semestre', semestre=semester)}">''')
        groups = {}
        ordered = sorted((r for r in courses if r['semestre'] == semester),
                         key=lambda r: (tuple(map(int, r['ue_numero'].split('.'))), int(r['cours_numero'])))
        for row in ordered:
            groups.setdefault((row['ue_numero'], row['ue_nom']), []).append(row)
        for (number, name), group in groups.items():
            title = html.escape(f'S{semester} UE {number} - {name}')
            parts.append(f'<details class="accordion-item"><summary class="accordion-button"><span class="ue-title">{title}</span></summary><div class="accordion-body">')
            if semester == '3':
                notice = t('cours.annee_precedente' if number in ('1.2', '2.5') else 'cours.a_jour')
                if notice:
                    parts.append(f'<p class="course-notice">{notice}</p>')
            parts.append('<ul class="list-group">')
            for row in group:
                title = f"{row['cours_numero']}. {row['cours_nom']}"
                primary = next((row[k] for k in (LINKS[0], LINKS[2], LINKS[1], *LINKS[3:]) if row[k]), '')
                heading = link(primary, html.escape(title), ' class="course-title"') if primary else f'<span class="course-title">{html.escape(title)}</span>'
                report_url = 'https://tally.so/r/X554dL?cours=' + quote(f"S{semester} UE {number} {row['cours_nom']}", safe='')
                report_title = t('cours.signaler', cours=title, id=row['id'])
                report = link(report_url, '⚑', f' class="course-report" title="{report_title}" aria-label="{report_title}" target="_blank" rel="noopener noreferrer"')
                parts.append(f'<li class="list-group-item" id="{row["id"]}"><div class="course-heading">{heading}{report}</div><div class="course-links">')
                split = bool(row['video_link_2'] or row['video_link_2_backup'])
                labels = ('premiere_partie' if split else 'enregistrement', 'seconde_partie',
                          'secours_premiere_partie' if split else 'secours_video', 'secours_seconde_partie', 'pdf', 'pdf_secours')
                if not any(row[k] for k in LINKS[:4]):
                    parts.append(f'<span class="badge">{t("cours.sans_enregistrement")}</span>')
                for column, label in zip(LINKS, labels):
                    if row[column]:
                        parts.append(link(row[column], t('cours.' + label), ' class="badge"'))
                parts.append('</div></li>')
            parts.append('</ul></div></details>')
        parts.append('</div></section>')
    if resources:
        parts.append(f'''<details class="accordion-item" id="accordionOtherSemester"><summary class="accordion-button">{t('navigation.autres_semestres')}</summary><div class="accordion-body"><table class="table"><thead><tr><th scope="col">{t('navigation.colonne_semestre')}</th><th scope="col">{t('navigation.enregistrements')}</th><th scope="col">{t('navigation.pdf')}</th></tr></thead><tbody>''')
        for row in sorted(resources, key=lambda r: int(r['semestre'])):
            parts.append(f'<tr><th scope="row">S{row["semestre"]}</th>')
            for columns in (LINKS[:4], LINKS[4:]):
                links = [link(row[k], t('cours.secours' if k.endswith('backup') else 'cours.acceder')) for k in columns if row[k]]
                parts.append('<td>' + (' · '.join(links) or t('cours.bientot')) + '</td>')
            parts.append('</tr>')
        parts.append('</tbody></table></div></details>')
    parts.append(f'''</main>
<footer><p>{t('pied_de_page.signalement')}</p>
<div class="footer-navigation"><a href="https://tally.so/r/xVVJkJ">{t('pied_de_page.reclamation')}</a><a href="index.html">{t('pied_de_page.version_normale')}</a></div>
<details class="site-information"><summary>{t('pied_de_page.titre_a_propos')}</summary><p>{t('pied_de_page.a_propos')}</p></details>
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
        # Ne remplacer le fichier qu’une fois toutes les entrées validées.
        target = root / 'version-simplifiee.html'
        temporary = target.with_suffix('.html.tmp')
        temporary.write_text(page, encoding='utf-8')
        temporary.replace(target)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f'Génération de la version simplifiée impossible : {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

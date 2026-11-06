# Modifier les textes du site

Ouvrez **textes.json**, à la racine du projet. Ce fichier est commun aux deux versions du site. Modifiez le texte à droite des deux-points, en conservant les noms des rubriques et des champs.

| Rubrique | Contenu |
| --- | --- |
| `site` | Nom du site, libellé d’accueil et description de partage |
| `pied_de_page` | Présentation de la plateforme, aide et liens de navigation |
| `navigation` | Titres des semestres et des colonnes |
| `cours` | Avertissements, liens vidéo/PDF, progression et libellés des cours |
| `messages` | Chargement, absence de cours et erreurs |
| `theme` | Boutons des modes clair et sombre |

Par exemple, dans `cours`, modifiez :

```json
"annee_precedente": "⚠️ Il s’agit des cours de l’année dernière."
```

La présentation de la plateforme se trouve dans `pied_de_page.a_propos`.

## Quelques règles

- Gardez les guillemets doubles autour du texte et les virgules entre les champs. Pas de virgule après le dernier champ d’une rubrique.
- Les apostrophes, accents et emojis peuvent être saisis normalement. Pour insérer un guillemet double dans un texte, écrivez `\"`.
- Conservez les éléments entre accolades, comme `{semestre}`, `{cours}`, `{faits}` ou `{total}` : ils sont remplacés automatiquement.
- Les espaces répétés sont conservés à l’affichage. Pour un retour à la ligne, écrivez `\n` dans la valeur JSON (et `\n\n` pour une ligne vide).
- Le texte est affiché tel quel. N’utilisez pas de HTML ni de Markdown (`**` ne met pas en gras).
- Pour masquer l’avertissement d’une UE, utilisez une chaîne vide pour le message concerné.

Enregistrez puis rechargez la page, servie par un serveur web (par exemple Live Server). Pour le site en ligne, déployez le fichier modifié avec le reste du site. Aucun outil de compilation n’est nécessaire.

## Ce qui reste dans d’autres fichiers

Les noms, liens et numéros de cours restent dans **sources.csv**. Les règles déterminant quelles UE affichent l’avertissement de l’année précédente restent dans les scripts des cours. Le fichier de textes change le message, pas ces règles.

Les pages HTML conservent du texte de secours pour l’affichage initial et les navigateurs sans JavaScript. Avec JavaScript actif, `textes.json` remplace ce contenu automatiquement. Le message signalant un fichier de textes illisible reste lui aussi dans le code, pour pouvoir s’afficher même si ce fichier est invalide.

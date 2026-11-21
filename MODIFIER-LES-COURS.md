# Modifier les cours

Le fichier **sources.json** est la source commune du site complet et de la version simplifiée. Il remplace `sources.csv`.

Les données sont rangées dans `semestres`, puis `ues`, puis `cours`. Un semestre et une UE ne sont déclarés qu’une fois : leurs cours partagent leur numéro et leur nom.

## Exemple de cours

```json
{
  "semestres": [
    {
      "numero": 3,
      "ues": [
        {
          "numero": "2.8",
          "nom": "Processus obstructifs",
          "cours": [
            {
              "id": "S3_UE2.8_COURS1",
              "numero": 1,
              "nom": "Titre du cours",
              "date": "22/11/2026",
              "presentiel": false,
              "visio": true,
              "information": "Un message facultatif sous le titre.",
              "ressources": {
                "videos": [
                  {
                    "url": "https://example.com/video",
                    "ajoute_le": "2026-11-22T00:16:00+01:00",
                    "secours": {
                      "url": "https://example.com/video-secours",
                      "ajoute_le": "22/11/2026"
                    }
                  }
                ],
                "pdf": {
                  "url": "https://example.com/document.pdf",
                  "ajoute_le": "22/11/2026"
                }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## Champs à modifier

| Champ | Utilisation |
| --- | --- |
| Semestre `numero` | Nombre entier, par exemple `3` |
| UE `numero` | Texte entre guillemets, par exemple `"2.8"` ou `"2.11"` |
| UE `nom` | Intitulé commun à tous ses cours |
| Cours `id` | Identifiant unique et stable ; conserve la progression des utilisateurs |
| Cours `numero` | Nombre entier utilisé pour départager les cours de même date |
| Cours `nom` | Titre affiché |
| Cours `date` | `JJ/MM/AAAA`, `AAAA-MM-JJ` ou `""` si non programmé |
| `presentiel`, `visio` | `true` pour activer la modalité, `false` pour la désactiver |
| `information` | Message facultatif ; vide ou absent pour laisser le site calculer le message habituel |
| `ressources` | Liens vidéo/PDF et dates d’ajout, regroupés ci-dessous |

Conservez les `id` existants, même si vous changez un titre ou une date. Pour un nouveau cours, utilisez un identifiant comme `S3_UE2.8_COURS9`. Un cours regroupé peut garder `S3_UE2.8_COURS1ET2`.

`date`, `presentiel`, `visio`, `information` et `ressources` peuvent être omis : ils valent respectivement une date vide, `false`, `false`, un texte vide et aucune ressource. Pour un cours sans ressource, `"ressources": {}` convient aussi.

## Ressources

| Rubrique dans `ressources` | Contenu |
| --- | --- |
| `videos` | Liste des vidéos actuelles, première puis seconde partie |
| `videos_anterieures` | Même liste pour l’année précédente |
| `pdf` | PDF actuel |
| `pdf_anterieur` | PDF de l’année précédente |

Chaque ressource contient `url` et, facultativement, `ajoute_le`. Une vidéo actuelle peut aussi contenir `secours`, avec son propre `url` et sa propre date `ajoute_le`.

Les listes vidéo acceptent au maximum deux parties. Si seule la seconde existe, écrivez `"videos": [null, {"url": "https://example.com/partie2"}]`. Un secours seul peut s’écrire `"videos": [{"secours": {"url": "https://example.com/secours"}}]`.

Supprimez la rubrique d’une ressource absente. Les liens actuels masquent les liens de l’année précédente du même type, comme auparavant. Les secours restent proposés.

`ajoute_le` accepte `22/11/2026` ou `2026-11-22` pour minuit à Paris, ou `2026-11-22T00:16:00+01:00` pour préciser l’heure. Le badge « Nouveau » reste visible pendant 72 heures sur la version complète. La version simplifiée n’affiche pas ce badge.

## Ressources communes d’un ancien semestre

Un semestre peut porter directement ses ressources, sans UE ni cours :

```json
{
  "numero": 1,
  "ues": [],
  "id": "S1",
  "ressources": {
    "pdf": { "url": "https://example.com/dossier-semestre1" }
  }
}
```

## Enregistrer et vérifier

Après chaque modification :

```sh
python3 scripts/generate-static.py
```

Cette commande valide les données, régénère **version-simplifiee.html** et actualise **version.json**. Le hook `scripts/pre-commit` effectue aussi cette opération à partir des fichiers sélectionnés pour le commit. Ne modifiez pas directement la page simplifiée.

Servez le site complet avec un serveur web pour le vérifier. La page simplifiée est autonome et fonctionne aussi en ouvrant son fichier sans JavaScript. Déployez ensemble les fichiers du site, dont `sources.json`, `sources-format.js`, la page simplifiée et le manifeste de version.

Gardez les guillemets doubles, les virgules entre éléments et les crochets/accolades. Écrivez `\n` pour un retour à la ligne et `\"` pour un guillemet dans un texte. Aucun HTML ni Markdown n’est interprété dans les messages.

L’administration lit et exporte désormais le JSON. L’import d’un ancien CSV et la récupération des anciens brouillons restent possibles. Les champs personnalisés de l’éditeur sont conservés dans un objet facultatif `champs` sur chaque cours ou ressource de semestre.

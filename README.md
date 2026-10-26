# Mettre à jour les cours

Les deux versions du site chargent les ressources depuis `sources.csv`.
Après une modification, enregistrez et publiez ce fichier sur l’hébergement du site,
puis rechargez la page. Aucune modification du HTML ou du JavaScript n’est nécessaire.

## Ajouter un cours

Ajoutez une ligne et renseignez :

- `semestre` : numéro seul, par exemple `4`.
- `ue_numero` : par exemple `2.8`.
- `ue_nom` : nom de l’UE.
- `cours_numero` : numéro du cours dans l’UE.
- `cours_nom` : titre seul, sans son numéro.
- `id` : identifiant unique et permanent, par exemple `S4_UE2.8_COURS1`.
- Les liens disponibles dans les six colonnes de liens ; laissez les autres vides.

Le semestre et l’UE apparaissent automatiquement dès leur premier cours.
Les semestres, les UE et les cours sont triés par numéro.
Un cours avec seulement une vidéo ou seulement un PDF fonctionne également.
Ne modifiez pas l’identifiant d’un cours existant : la progression est enregistrée avec cet identifiant.

## Ajouter des ressources pour un semestre entier

Renseignez uniquement `semestre` et les liens disponibles. Laissez les champs d’UE,
de cours et `id` vides. La ligne apparaît dans le tableau « Autres semestres »,
même si ce semestre possède aussi des cours détaillés.

Si aucun cours ne reste dans un semestre, sa section disparaît automatiquement.

## Format du fichier

Conservez les en-têtes et l’encodage UTF-8. Le séparateur est la virgule.
Si vous modifiez le CSV comme du texte, entourez de guillemets les valeurs contenant
une virgule et doublez les guillemets à l’intérieur de ces valeurs.
Pour consulter le site localement, utilisez un serveur HTTP, par exemple Live Server dans VS Code.

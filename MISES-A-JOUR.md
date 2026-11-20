# Mises à jour et cache

`index.html` contient un petit chargeur qui demande `version.json` sans cache.
Il utilise cette version dans les URL des scripts, des styles, du CSV, des textes
et des liens vers la page simplifiée. La progression et le choix du thème restent
enregistrés dans le navigateur.

La version est calculée à partir du contenu des fichiers du site. Elle est
régénérée avec la page simplifiée :

```sh
python3 scripts/generate-static.py
```

Le hook `scripts/pre-commit` prépare automatiquement les deux fichiers générés
(`version.json` et `version-simplifiee.html`) à partir des fichiers sélectionnés
pour le commit. Après un nouveau clonage, installer le hook :

```sh
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Déployer ensemble tous les fichiers du commit, y compris `version.json`.
Les onglets visibles vérifient les mises à jour toutes les minutes et lorsqu’ils
reprennent le focus, redeviennent visibles ou retrouvent une connexion.
Une nouvelle version recharge la page avec une URL différente pour éviter
le cache HTML. Une panne réseau ne déclenche pas de rechargement.

Un appareil conservant un ancien HTML antérieur à ce mécanisme doit d’abord
recevoir le nouveau HTML. Pour amorcer la mise à jour, ouvrir l’URL du site
avec `?actualiser=1` (ou `&actualiser=1` si elle contient déjà un paramètre).
Il n’est pas nécessaire d’effacer les données du site ni les cases « Terminé ».

Vérifications : `node --test scripts/test-updates.js` et
`python3 scripts/test-version.py`.

## Badge Nouveau

Chaque champ vidéo ou PDF de `sources.csv` possède une colonne de date
juste à sa droite : `video_link_1_date`, `video_link_2_date`,
`video_link_1_backup_date`, `video_link_2_backup_date`,
`video_link_1_anterieur_date`, `video_link_2_anterieur_date`,
`pdf_link_date` et `pdf_link_anterieur_date`.
Ces colonnes facultatives acceptent `20/11/2026`,
`2026-11-20` (minuit à Paris) ou `2026-11-20T12:23:00+01:00`
(heure précise avec fuseau ; `+02:00` en été). Le badge apparaît sur le lien concerné, de cette
date jusqu’à 72 heures après, borne incluse. Une valeur vide, incorrecte
ou future ne montre aucun badge. Le libellé est dans `cours.nouveau`.

La version principale actualise automatiquement les badges. La version
simplifiée sans JavaScript ne présente aucun badge Nouveau.

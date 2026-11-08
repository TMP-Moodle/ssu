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

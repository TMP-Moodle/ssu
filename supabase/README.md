# Activer les propositions de noms

Le site est préparé localement. Aucune table n’a encore été créée dans le projet distant.

1. Ouvrir https://supabase.com/dashboard/project/ubczgcxqugjrakksjiia/sql/new.
2. Copier tout `naming-setup.sql`, le coller dans SQL Editor puis cliquer **Run**. Le script est transactionnel et peut être relancé. Il crée uniquement le schéma `naming_private` et la fonction publique `naming_action`.
3. Dans **Authentication → Sign In / Providers → Anonymous Sign-Ins**, activer les connexions anonymes puis enregistrer. Selon la version du tableau de bord, rechercher « Anonymous » dans les paramètres Authentication. Les visiteurs n’ont ni email ni mot de passe à saisir.
4. Ouvrir le site avec un serveur HTTP local, cliquer sur le crayon. Les propositions sont actualisées automatiquement toutes les 30 secondes, uniquement lorsque le dialogue est ouvert et l’onglet visible. Le message d’attente doit laisser place à la liste vide. Le déploiement du site suit ensuite le processus habituel ; les fichiers modifiés ne sont pas encore publiés.
5. Tester une proposition puis un vote : le délai de 24 h doit apparaître. Une seconde proposition et un second vote pour le même nom doivent être refusés. Un vote pour un autre nom reste possible. Les vrais essais seront visibles par les visiteurs : choisir un nom pertinent ou le masquer ensuite.

## Règles retenues

- Un nouveau vote positif OU négatif par proposition après 24 heures glissantes. Chaque vote ajoute un point au compteur correspondant ; les anciens votes restent comptabilisés.
- Une nouvelle proposition après 24 heures glissantes. Les noms identiques (casse et espaces normalisés) sont refusés sans consommer le délai.
- Trois clés indépendantes de limitation : utilisateur anonyme Supabase, identifiant navigateur conservé dans un cookie et localStorage, empreinte de l’IP transmise par la passerelle Supabase.
- Les limites sont communes aux utilisateurs qui partagent une IP. Une nouvelle session anonyme peut également être soumise aux limites de création de comptes Supabase.
- Les contrôles et compteurs sont modifiés dans une même transaction, avec verrous ordonnés pour éviter le double vote simultané.

## Sécurité et limites

Les tables sont dans un schéma privé non exposé, avec RLS activée et sans accès direct pour `anon` ou `authenticated`. Seule une fonction interne privilégiée effectue les opérations validées, après vérification de `auth.uid()`. Son relais public est `SECURITY INVOKER`. Aucun rôle visiteur ne peut lire le sel privé, modifier les scores ou obtenir les identifiants des autres visiteurs. Ne pas ajouter `naming_private` à la liste des schémas exposés par la Data API.

L’IP n’est pas stockée en clair dans ces tables. Une empreinte salée est calculée côté serveur. Le mécanisme d’IP suit l’exemple officiel Supabase (`request.headers → x-forwarded-for`, premier élément). Le contrat exact de nettoyage de cet en-tête par tous les proxys n’est pas documenté précisément : cette protection est une mesure anti-abus, pas une preuve d’identité ou une garantie contre un client malveillant. Cookies effacés et changements d’IP restent des possibilités de contournement. Les limites par compte anonyme et cookie s’appliquent indépendamment.

La session Supabase est conservée dans le stockage du navigateur. Le cookie de participation dure un an. Les empreintes expirées peuvent être supprimées manuellement avec la requête de maintenance ci-dessous ; aucune purge automatique n’est configurée.

## Modération depuis SQL Editor

Lister les propositions (le Table Editor permet aussi d’ouvrir le schéma `naming_private`) :

```sql
select id, name, upvotes, downvotes, hidden
from naming_private.proposals order by created_at desc;
```

Masquer un nom, sans effacer son historique (remplacer l’UUID) :

```sql
update naming_private.proposals set hidden = true
where id = 'UUID-DE-LA-PROPOSITION';
```

Remettre `hidden = false` pour le rétablir. Les votes sur une proposition masquée sont refusés. Les noms masqués restent réservés pour éviter leur republication immédiate.

Maintenance facultative des empreintes expirées :

```sql
delete from naming_private.cooldowns where next_at < now() - interval '7 days';
```

## Validation effectuée

- Syntaxe JavaScript et `git diff --check`.
- Script exécuté deux fois dans PostgreSQL local via PGlite ; tests des délais, des IP/cookies communs, de l’indépendance des propositions, des doublons, de l’expiration, des compteurs et des permissions.
- Vérification visuelle locale avec données fictives sur ordinateur et mobile ; vérification du message réel lorsque les connexions anonymes sont désactivées.
- Restent à vérifier après activation : appels RPC sur le vrai projet, en-tête IP de la passerelle et analyse Security Advisor dans le tableau de bord Supabase. Aucune donnée de test n’a été écrite dans la base distante.

Documentation : https://supabase.com/docs/guides/auth/auth-anonymous et https://supabase.com/docs/guides/api/securing-your-api.

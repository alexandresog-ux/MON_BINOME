# AGENTS.md — « Construire une vie à deux »

Contexte pour OpenCode (ou tout agent de code). Lis aussi `CHECKLIST.md` (partie 2 = ton travail) et `supabase/schema.sql`.

## Le projet
PWA en JavaScript (Vite, sans framework) : jeu-questionnaire pour couples, jouable à distance sur deux téléphones.
Chaque partenaire répond séparément aux 96 questions (12 catégories), valide, puis les réponses sont révélées côte à côte, suivies des notes d'alignement et d'un objectif SMART commun. Auteur du contenu : Coach Alexandre Sognon (SOG Digital Studio).
Stack : Vite + vite-plugin-pwa · Supabase (auth, Postgres, Realtime, RLS) · Netlify.

## Règles absolues
1. Ne modifie JAMAIS `supabase/schema.sql` ni les politiques RLS sans le signaler à Alexandre : tout changement doit être relu par Claude avant exécution. Propose le changement dans un fichier `supabase/proposals/AAAA-MM-JJ-sujet.sql`, ne l'applique pas.
2. Jamais de clé `service_role` dans le code, le dépôt ou `.env`. Seule la clé `anon` (publique) est utilisée.
3. Jamais d'`innerHTML`, `outerHTML` ni `insertAdjacentHTML` avec des données : prénoms et réponses viennent des utilisateurs. Utilise `h()` de `src/dom.js` (nœuds texte).
4. Jamais `select('*')` sur `profiles` : la colonne `contact_code` n'est pas lisible. Liste les colonnes : `select('id, display_name')`.
5. Aucun chat libre, aucune recherche d'utilisateurs, aucun annuaire. Le seul moyen de lier deux personnes est le code de contact + acceptation.
6. La confidentialité des réponses est garantie par la RLS, pas par l'interface. Ne « cache » jamais une donnée côté client en comptant sur le front.
7. Ne mets JAMAIS en cache les réponses de Supabase (pas de `runtimeCaching` dans le service worker, pas de localStorage pour des réponses).
8. Un commit par étape cochée dans `CHECKLIST.md`.

## Ton et interface
- Français, tutoiement, ton bienveillant, sans jugement. Aucun « gagnant / perdant », aucun score de « compatibilité ».
- Mobile d'abord : boutons ≥ 48 px, lisible à une main, accessible (labels, contrastes, focus visible).
- Tous les textes dans `src/data/ui.fr.js` (jamais en dur dans les vues). Questions et textes du coach : `src/data/questions.fr.json`.
- Questions `"sensitive": true` : rappeler clairement que « Passer » est possible, sans pénalité.
- Afficher l'avertissement `common.safety_warning` (violence, contrôle, peur) sur l'écran d'accueil et dans les paramètres.

## Structure
```
src/main.js            point d'entrée, rendu selon la session
src/dom.js             helper h() (sûr, sans innerHTML)
src/supabase.js        client Supabase (clé anon)
src/install.js         installation PWA (Android + consigne iPhone)
src/views/             une vue = une fonction renderXxx(root, ctx)
src/data/ui.fr.js      textes de l'interface + errorMessage(code)
src/data/questions.fr.json   12 catégories, 96 questions, textes fixes
supabase/schema.sql    schéma + RLS + RPC (source de vérité)
supabase/tests.sql     tests de sécurité (à relancer après tout changement)
```

## Contrat avec la base (RPC)
Les RPC ne lèvent pas d'erreur métier : elles renvoient `{ ok: false, error: '<code>' }`. Les clés des paramètres doivent porter le même nom que dans SQL.
Affiche `errorMessage(data.error)` (fichier `ui.fr.js`).

| Appel | Paramètres | Retour |
|---|---|---|
| `my_contact_code()` | – | texte (mon code) |
| `regenerate_contact_code()` | – | `{ ok, code }` |
| `send_pair_request` | `{ p_code }` | `{ ok }` (volontairement uniforme) ou `{ ok:false, error }` |
| `list_incoming_requests()` | – | lignes `{ request_id, from_name, created_at, expires_at }` |
| `respond_pair_request` | `{ p_request, p_accept, p_block }` | `{ ok, couple_id? }` |
| `unlink_couple` | `{ p_block }` | `{ ok }` — supprime le couple ET toutes ses données |
| `validate_category` | `{ p_category }` | `{ ok, revealed }` |
| `delete_my_account()` | – | `{ ok }` |
| `keep_alive()` | – | `{ ok, at }` (utilisée par GitHub Actions) |

Codes d'erreur : `non_connecte, deja_en_couple, trop_de_tentatives, trop_de_demandes, code_invalide, demande_introuvable, demande_expiree, pas_de_couple, categorie_invalide, categorie_incomplete`.

## Accès direct aux tables (protégé par RLS)
- Mon couple : `couple_members` (ma ligne donne `couple_id`). Mon partenaire : `profiles` (`select('id, display_name')` renvoie moi + mon partenaire uniquement).
- `answers` : `upsert` avec `onConflict: 'couple_id,user_id,question_id'`. Champs : `couple_id, user_id, category_id, question_id, body` ou `skipped: true` (alors `body: null`). `question_id` au format `c01q01` (catégorie 01 à 12, question 1 à 8). Verrouillé après validation.
- `category_status` : statut « validé » des deux partenaires (jamais leur contenu). Sert à la salle d'attente.
- `alignment` : `score` 1 à 10, possible seulement après révélation ; la note du partenaire n'apparaît que quand les deux ont noté.
- `smart_goals` : `upsert` avec `onConflict: 'couple_id,category_id'` (champs `s_text, m_text, a_text, r_text, deadline`), modifiable par les deux.
- `couple_review` : bilan final, une ligne par couple.
- Une mise à jour bloquée par la RLS ne lève pas d'erreur : elle touche 0 ligne. Vérifie le nombre de lignes retournées.

## Parcours d'une catégorie
1. Répondre ou passer les 8 questions (sauvegarde au fil de l'eau).
2. `validate_category` (exige les 8 lignes). Réponses verrouillées.
3. Salle d'attente tant que le partenaire n'a pas validé (`category_status` + Realtime).
4. Révélation (`revealed: true`) : afficher les réponses côte à côte.
5. Chacun saisit sa note d'alignement ; écart ≥ 3 → message `common.alignment.deep_talk_message`.
6. Objectif SMART commun (`smart_goals`), puis catégorie suivante.

## Temps réel
Tables publiées : `pair_requests, couple_members, category_status, alignment, smart_goals`. Exemple :
```js
supabase.channel('statut-' + coupleId)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'category_status', filter: `couple_id=eq.${coupleId}` },
      () => rafraichir())
  .subscribe();
```
Prévoir la reconnexion et l'état hors ligne ; recharger l'état complet au retour sur l'onglet.

## Pièges connus
- Dans `onAuthStateChange`, ne pas `await` d'appel Supabase directement (risque de blocage) : utiliser `setTimeout`, comme dans `main.js`.
- `onAuthStateChange` renvoie `SIGNED_IN` à chaque retour sur l'onglet : ne re-rendre que si l'utilisateur change (déjà géré).
- iPhone : pas de `beforeinstallprompt`, d'où la consigne dans `installBanner.js`.
- Netlify applique une CSP (voir `netlify.toml`) : tout nouveau domaine appelé (polices, API) doit y être ajouté.

## Commandes
```
npm install
npm run dev       # http://localhost:5173 (accessible sur le réseau local)
npm run build     # dist/
npm run preview
```
Test PWA : utiliser `npm run build && npm run preview` (le service worker ne s'active pas en dev) et Lighthouse.

## Définition de « terminé »
Une case de `CHECKLIST.md` est cochée seulement si elle est testée sur un vrai téléphone (au moins un Android et un iPhone pour les écrans) et si `supabase/tests.sql` passe toujours.

# Dossier du projet — « Construire une vie à deux »

Document de synthèse regroupant tout le projet en un seul endroit.
Dernière mise à jour : 12 novembre 2026.
Auteur du contenu : Coach Alexandre Sognon · SOG Digital Studio · Cotonou, Bénin.

## Sommaire

1. Cahier des charges et décisions
2. État d'avancement
3. Contenu du dépôt
4. README (démarrage et déploiement)
5. AGENTS.md (instructions pour OpenCode)
6. CHECKLIST (Claude et OpenCode)

---

## 1. Cahier des charges et décisions

### Objectif
Transformer le questionnaire PDF « Construire une vie à deux » (12 catégories, 96 questions, objectifs SMART) en un jeu pour couples, jouable à distance sur deux téléphones différents.

### Exigences exprimées
- Jouable à distance, chaque partenaire sur son téléphone, avec mise en correspondance des deux comptes.
- Chaque utilisateur possède un identifiant de contact (code) : personne ne peut contacter qui il veut.
- Application web installable en un clic (PWA).
- Hébergement sur Netlify (ou Vercel).

### Décisions prises
| Sujet | Décision |
|---|---|
| Backend | Supabase, conservé malgré les mises en pause de l'offre gratuite ; contournement par un appel planifié (GitHub Actions) tous les 3 jours |
| Front | JavaScript simple avec Vite, PWA via vite-plugin-pwa |
| Hébergement | Netlify |
| Langue | Français uniquement au départ, textes séparés pour traduire plus tard |
| Partenaires | Un seul partenaire actif par utilisateur |
| Appairage | Code de contact + demande + acceptation obligatoire, limitation des tentatives |
| Confidentialité | Réponses du partenaire visibles seulement quand les deux ont validé la catégorie (appliqué par la base, pas par l'interface) |
| Verrouillage | Une réponse validée ne peut plus être modifiée |
| Déliaison | Délier supprime le couple et toutes ses données |
| Outils de construction | Claude pour les fondations et la sécurité, OpenCode pour les écrans et le travail itératif |

### Points encore à valider
- Délier supprime tout : confirmer ce choix ou prévoir une conservation temporaire.
- Fonction pour débloquer une personne bloquée (non prévue pour l'instant).
- Page de confidentialité et texte de consentement pour les données sensibles.
- Notifications push (optionnel, plus tard).

---

## 2. État d'avancement

| Étape | Statut |
|---|---|
| Questions en JSON (96) | Fait, vérifié par script |
| Schéma SQL, RLS et RPC | Écrit, **pas encore exécuté** |
| Tests SQL de sécurité | Écrits, **à exécuter** dans Supabase |
| Squelette PWA (auth, code de contact, installation) | Écrit, syntaxe vérifiée, **build non testé** |
| Workflow keep-alive, Netlify, AGENTS.md, README | Écrits |
| Écrans du jeu, temps réel, export PDF | À faire (OpenCode) |

Prochaines actions pour Alexandre :
1. Exécuter `supabase/schema.sql` puis `supabase/tests.sql` sur un projet Supabase vierge.
2. Configurer l'authentification (confirmation d'email, CAPTCHA, URL du site).
3. `npm install`, `npm run dev`, créer un compte de test et vérifier l'affichage du code.
4. Déployer sur Netlify et configurer les secrets GitHub du keep-alive.
5. Passer la main à OpenCode (AGENTS.md puis partie 2 de la checklist).

---

## 3. Contenu du dépôt

```
vie-a-deux/
├── README.md              démarrage et déploiement
├── AGENTS.md              instructions pour OpenCode
├── CHECKLIST.md           liste de tâches Claude / OpenCode
├── docs/DOSSIER-PROJET.md ce document
├── package.json, vite.config.js, index.html, netlify.toml
├── .env.example           variables à renseigner (clé anon uniquement)
├── .github/workflows/keep-alive.yml
├── public/icons/          icônes PWA
├── src/                   code de l'application
│   ├── main.js, dom.js, supabase.js, install.js, style.css
│   ├── views/             login, home, bannière d'installation
│   └── data/              ui.fr.js (textes) et questions.fr.json (contenu)
└── supabase/
    ├── schema.sql         schéma, RLS, fonctions
    └── tests.sql          tests de sécurité
```

---

## 4. README

PWA pour couples, basée sur le questionnaire du Coach Alexandre Sognon (12 catégories, 96 questions, objectifs SMART). Jouable à distance sur deux téléphones, avec appairage par code de contact.

### Démarrage

#### 1. Supabase
1. Crée un projet sur supabase.com.
2. SQL Editor : exécute `supabase/schema.sql`, puis `supabase/tests.sql` (doit afficher « TOUS LES TESTS PASSENT »).
3. Authentication : active la confirmation d'email et un CAPTCHA (Attack Protection). Ajoute l'URL du site (Netlify) dans *URL Configuration* (Site URL et Redirect URLs).
4. Project Settings > API : note l'URL et la clé **anon**.

#### 2. En local
```bash
cp .env.example .env     # renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Si `npm install` signale un conflit de versions (vite / vite-plugin-pwa), aligne les versions dans `package.json`.

#### 3. Déploiement Netlify
1. Pousse le dépôt sur GitHub.
2. Netlify > Add new site > Import from Git. Build : `npm run build`, dossier : `dist` (déjà dans `netlify.toml`).
3. Site settings > Environment variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. Redéploie, puis ouvre le site sur un téléphone.

#### 4. Keep-alive (éviter la pause de Supabase)
GitHub > Settings > Secrets and variables > Actions : crée `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
Onglet Actions > keep-alive > *Run workflow* pour tester. Ensuite il s'exécute tous les 3 jours.
Un dépôt public sans activité pendant 60 jours voit ses workflows planifiés désactivés par GitHub : réactive-le si besoin.

### Installer l'application
- **Android (Chrome)** : bouton « Installer » dans l'app, ou menu du navigateur.
- **iPhone (Safari)** : Partager > Sur l'écran d'accueil.

### Suite du travail
Voir `CHECKLIST.md` et `AGENTS.md` (instructions pour OpenCode).

---

## 5. AGENTS.md

Contexte pour OpenCode (ou tout agent de code). Lis aussi `CHECKLIST.md` (partie 2 = ton travail) et `supabase/schema.sql`.

### Le projet
PWA en JavaScript (Vite, sans framework) : jeu-questionnaire pour couples, jouable à distance sur deux téléphones.
Chaque partenaire répond séparément aux 96 questions (12 catégories), valide, puis les réponses sont révélées côte à côte, suivies des notes d'alignement et d'un objectif SMART commun. Auteur du contenu : Coach Alexandre Sognon (SOG Digital Studio).
Stack : Vite + vite-plugin-pwa · Supabase (auth, Postgres, Realtime, RLS) · Netlify.

### Règles absolues
1. Ne modifie JAMAIS `supabase/schema.sql` ni les politiques RLS sans le signaler à Alexandre : tout changement doit être relu par Claude avant exécution. Propose le changement dans un fichier `supabase/proposals/AAAA-MM-JJ-sujet.sql`, ne l'applique pas.
2. Jamais de clé `service_role` dans le code, le dépôt ou `.env`. Seule la clé `anon` (publique) est utilisée.
3. Jamais d'`innerHTML`, `outerHTML` ni `insertAdjacentHTML` avec des données : prénoms et réponses viennent des utilisateurs. Utilise `h()` de `src/dom.js` (nœuds texte).
4. Jamais `select('*')` sur `profiles` : la colonne `contact_code` n'est pas lisible. Liste les colonnes : `select('id, display_name')`.
5. Aucun chat libre, aucune recherche d'utilisateurs, aucun annuaire. Le seul moyen de lier deux personnes est le code de contact + acceptation.
6. La confidentialité des réponses est garantie par la RLS, pas par l'interface. Ne « cache » jamais une donnée côté client en comptant sur le front.
7. Ne mets JAMAIS en cache les réponses de Supabase (pas de `runtimeCaching` dans le service worker, pas de localStorage pour des réponses).
8. Un commit par étape cochée dans `CHECKLIST.md`.

### Ton et interface
- Français, tutoiement, ton bienveillant, sans jugement. Aucun « gagnant / perdant », aucun score de « compatibilité ».
- Mobile d'abord : boutons ≥ 48 px, lisible à une main, accessible (labels, contrastes, focus visible).
- Tous les textes dans `src/data/ui.fr.js` (jamais en dur dans les vues). Questions et textes du coach : `src/data/questions.fr.json`.
- Questions `"sensitive": true` : rappeler clairement que « Passer » est possible, sans pénalité.
- Afficher l'avertissement `common.safety_warning` (violence, contrôle, peur) sur l'écran d'accueil et dans les paramètres.

### Structure
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

### Contrat avec la base (RPC)
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

### Accès direct aux tables (protégé par RLS)
- Mon couple : `couple_members` (ma ligne donne `couple_id`). Mon partenaire : `profiles` (`select('id, display_name')` renvoie moi + mon partenaire uniquement).
- `answers` : `upsert` avec `onConflict: 'couple_id,user_id,question_id'`. Champs : `couple_id, user_id, category_id, question_id, body` ou `skipped: true` (alors `body: null`). `question_id` au format `c01q01` (catégorie 01 à 12, question 1 à 8). Verrouillé après validation.
- `category_status` : statut « validé » des deux partenaires (jamais leur contenu). Sert à la salle d'attente.
- `alignment` : `score` 1 à 10, possible seulement après révélation ; la note du partenaire n'apparaît que quand les deux ont noté.
- `smart_goals` : `upsert` avec `onConflict: 'couple_id,category_id'` (champs `s_text, m_text, a_text, r_text, deadline`), modifiable par les deux.
- `couple_review` : bilan final, une ligne par couple.
- Une mise à jour bloquée par la RLS ne lève pas d'erreur : elle touche 0 ligne. Vérifie le nombre de lignes retournées.

### Parcours d'une catégorie
1. Répondre ou passer les 8 questions (sauvegarde au fil de l'eau).
2. `validate_category` (exige les 8 lignes). Réponses verrouillées.
3. Salle d'attente tant que le partenaire n'a pas validé (`category_status` + Realtime).
4. Révélation (`revealed: true`) : afficher les réponses côte à côte.
5. Chacun saisit sa note d'alignement ; écart ≥ 3 → message `common.alignment.deep_talk_message`.
6. Objectif SMART commun (`smart_goals`), puis catégorie suivante.

### Temps réel
Tables publiées : `pair_requests, couple_members, category_status, alignment, smart_goals`. Exemple :
```js
supabase.channel('statut-' + coupleId)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'category_status', filter: `couple_id=eq.${coupleId}` },
      () => rafraichir())
  .subscribe();
```
Prévoir la reconnexion et l'état hors ligne ; recharger l'état complet au retour sur l'onglet.

### Pièges connus
- Dans `onAuthStateChange`, ne pas `await` d'appel Supabase directement (risque de blocage) : utiliser `setTimeout`, comme dans `main.js`.
- `onAuthStateChange` renvoie `SIGNED_IN` à chaque retour sur l'onglet : ne re-rendre que si l'utilisateur change (déjà géré).
- iPhone : pas de `beforeinstallprompt`, d'où la consigne dans `installBanner.js`.
- Netlify applique une CSP (voir `netlify.toml`) : tout nouveau domaine appelé (polices, API) doit y être ajouté.

### Commandes
```
npm install
npm run dev       # http://localhost:5173 (accessible sur le réseau local)
npm run build     # dist/
npm run preview
```
Test PWA : utiliser `npm run build && npm run preview` (le service worker ne s'active pas en dev) et Lighthouse.

### Définition de « terminé »
Une case de `CHECKLIST.md` est cochée seulement si elle est testée sur un vrai téléphone (au moins un Android et un iPhone pour les écrans) et si `supabase/tests.sql` passe toujours.

---

## 6. CHECKLIST

PWA jouable à distance par deux partenaires, basée sur le questionnaire du Coach Alexandre Sognon (12 catégories, 96 questions, objectifs SMART).

**Stack** : PWA (Vite + JavaScript) · Supabase (auth, base, temps réel, RLS) · Netlify (hébergement) · GitHub Actions (keep-alive)

**Légende** : `[ ]` à faire · `[x]` fait · ⚠️ point de sécurité critique (réponses intimes en jeu)

---

### Règles pour OpenCode (à lire avant toute modification)

1. Ne **jamais** modifier `schema.sql` ni les politiques RLS sans les soumettre à relecture à Claude.
2. Ne **jamais** utiliser la clé `service_role` dans le code front ni la committer. Seule la clé `anon` va dans `.env`.
3. Aucune table lisible publiquement. Aucun annuaire ni recherche d'utilisateurs.
4. Aucun chat libre entre partenaires : seulement les réponses du questionnaire.
5. La révélation des réponses est contrôlée par le **serveur** (RLS), jamais seulement par l'interface.
6. Cocher cette checklist au fur et à mesure et faire un commit par étape.
7. Ton de l'interface : bienveillant, sans jugement, sans « gagnant/perdant » sur les sujets sensibles.

---

### PARTIE 1 — À la charge de Claude (fondations)

#### 1.1 Contenu
- [ ] `questions.fr.json` : 12 catégories, 96 questions, ordre, titres, sous-titres
- [ ] Intitulé de l'objectif SMART de chaque catégorie
- [ ] Textes fixes : règles d'or, avertissement violence/contrôle, conseil final
- [ ] Textes séparés dans un fichier dédié (traduction possible plus tard)

#### 1.2 Base de données (`schema.sql`)
- [ ] Tables : `profiles`, `pair_requests`, `couples`, `answers`, `alignment`, `smart_goals`
- [ ] Code de contact aléatoire et unique, non séquentiel (ex. `SOG-7K3F-92QX`)
- [ ] Contrainte : un seul partenaire actif par utilisateur
- [ ] Contrainte : impossible de s'appairer avec soi-même
- [ ] Fonction : envoyer une demande d'appairage par code
- [ ] Fonction : accepter ou refuser une demande (consentement obligatoire)
- [ ] Limitation des tentatives de saisie de codes (anti-devinage)
- [ ] Fonctions : délier, bloquer, régénérer son code
- [ ] Fonction : supprimer le compte et toutes les données associées

#### 1.3 Sécurité (RLS) ⚠️
- [ ] RLS activé sur **toutes** les tables
- [ ] Chacun lit et écrit uniquement ses propres réponses
- [ ] Réponses du partenaire lisibles **seulement quand les deux ont validé** la catégorie
- [ ] Impossible de lister ou rechercher d'autres utilisateurs
- [ ] Impossible de lire les données d'un autre couple
- [ ] Jeu de tests SQL : lecture trop tôt, lecture d'un autre couple, devinage de codes
- [ ] Relecture des règles RLS avec Alexandre avant toute vraie donnée

#### 1.4 Infrastructure
- [ ] Workflow GitHub Actions keep-alive (appel planifié tous les 3 à 4 jours)
- [ ] `.env.example` (URL Supabase + clé `anon` uniquement) ⚠️
- [ ] `.gitignore` incluant `.env`
- [ ] `netlify.toml` : build, redirection SPA, en-têtes de sécurité

#### 1.5 Squelette PWA
- [ ] Projet Vite en JavaScript, structure des dossiers
- [ ] `manifest.json` et icônes
- [ ] Service worker
- [ ] Bouton « Installer l'app » (Android / Chrome)
- [ ] Message d'installation iPhone (Partager → Sur l'écran d'accueil)
- [ ] Client Supabase, authentification, routage simple
- [ ] `README.md` et `AGENTS.md` (contexte et règles pour OpenCode)

---

### PARTIE 2 — À la charge d'OpenCode (construction)

#### 2.1 Mise en place
- [ ] Créer le projet Supabase
- [ ] Exécuter `schema.sql` et lancer les tests RLS
- [ ] Renseigner `.env` en local, puis les variables d'environnement sur Netlify
- [ ] Initialiser Git, pousser sur GitHub, connecter Netlify au dépôt
- [ ] Ajouter les secrets GitHub et tester le keep-alive manuellement

#### 2.2 Écrans
- [ ] Inscription et connexion
- [ ] Mon code de contact (copier, partager, régénérer)
- [ ] Saisie du code du partenaire
- [ ] Demandes reçues (accepter, refuser)
- [ ] Accueil : carte des 12 catégories avec progression
- [ ] Écran de questions avec option « Passer » sans pénalité
- [ ] Salle d'attente « Ton ou ta partenaire n'a pas encore terminé »
- [ ] Révélation côte à côte des réponses
- [ ] Notes d'alignement 1 à 10 (écart ≥ 3 : conversation approfondie suggérée)
- [ ] Formulaire guidé SMART (S, M, A, R, T + échéance)
- [ ] Tableau de synthèse du couple
- [ ] Bilan final (accords, sujets à approfondir, points non négociables)
- [ ] Export PDF de la synthèse
- [ ] Paramètres : délier, bloquer, supprimer mes données
- [ ] Page de confidentialité et consentement sur les données sensibles

#### 2.3 Temps réel
- [ ] Abonnement Supabase Realtime au statut du partenaire (validé ou non)
- [ ] Gestion de la reconnexion et de l'état hors ligne

#### 2.4 Qualité
- [ ] Interface pensée mobile d'abord, boutons larges
- [ ] Messages d'erreur clairs (code invalide, demande déjà envoyée, etc.)
- [ ] Avertissement visible en cas de violence, de contrôle ou de peur dans la relation
- [ ] Test sur au moins deux vrais téléphones (un Android, un iPhone)
- [ ] Test d'installation de la PWA sur les deux
- [ ] Audit Lighthouse (PWA, performance, accessibilité)

---

### Points de passage obligatoires

1. **Après `schema.sql`** : relecture des règles RLS avant que quiconque saisisse de vraies réponses.
2. **Avant la mise en ligne** : test de bout en bout avec deux comptes (appairage, réponses, révélation, déliaison, suppression).
3. **Pendant le développement** : tout changement de schéma ou de RLS est renvoyé à Claude pour relecture.
4. **Avant d'ouvrir aux vrais couples** : page de confidentialité et consentement validés.

### Ordre conseillé

1. Claude : questions JSON, `schema.sql`, RLS et tests
2. Alexandre : création du projet Supabase, exécution et vérification
3. Claude : squelette PWA, `AGENTS.md`, keep-alive
4. OpenCode : écrans et temps réel
5. Ensemble : tests à deux téléphones, puis déploiement sur Netlify

---

*Projet : Coach Alexandre Sognon · SOG Digital Studio · Cotonou, Bénin*

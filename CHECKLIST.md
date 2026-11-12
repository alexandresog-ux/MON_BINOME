# CHECKLIST — Jeu « Construire une vie à deux »

PWA jouable à distance par deux partenaires, basée sur le questionnaire du Coach Alexandre Sognon (12 catégories, 96 questions, objectifs SMART).

**Stack** : PWA (Vite + JavaScript) · Supabase (auth, base, temps réel, RLS) · Netlify (hébergement) · GitHub Actions (keep-alive)

**Légende** : `[ ]` à faire · `[x]` fait · ⚠️ point de sécurité critique (réponses intimes en jeu)

---

## Règles pour OpenCode (à lire avant toute modification)

1. Ne **jamais** modifier `schema.sql` ni les politiques RLS sans les soumettre à relecture à Claude.
2. Ne **jamais** utiliser la clé `service_role` dans le code front ni la committer. Seule la clé `anon` va dans `.env`.
3. Aucune table lisible publiquement. Aucun annuaire ni recherche d'utilisateurs.
4. Aucun chat libre entre partenaires : seulement les réponses du questionnaire.
5. La révélation des réponses est contrôlée par le **serveur** (RLS), jamais seulement par l'interface.
6. Cocher cette checklist au fur et à mesure et faire un commit par étape.
7. Ton de l'interface : bienveillant, sans jugement, sans « gagnant/perdant » sur les sujets sensibles.

---

## PARTIE 1 — À la charge de Claude (fondations)

### 1.1 Contenu
- [ ] `questions.fr.json` : 12 catégories, 96 questions, ordre, titres, sous-titres
- [ ] Intitulé de l'objectif SMART de chaque catégorie
- [ ] Textes fixes : règles d'or, avertissement violence/contrôle, conseil final
- [ ] Textes séparés dans un fichier dédié (traduction possible plus tard)

### 1.2 Base de données (`schema.sql`)
- [ ] Tables : `profiles`, `pair_requests`, `couples`, `answers`, `alignment`, `smart_goals`
- [ ] Code de contact aléatoire et unique, non séquentiel (ex. `SOG-7K3F-92QX`)
- [ ] Contrainte : un seul partenaire actif par utilisateur
- [ ] Contrainte : impossible de s'appairer avec soi-même
- [ ] Fonction : envoyer une demande d'appairage par code
- [ ] Fonction : accepter ou refuser une demande (consentement obligatoire)
- [ ] Limitation des tentatives de saisie de codes (anti-devinage)
- [ ] Fonctions : délier, bloquer, régénérer son code
- [ ] Fonction : supprimer le compte et toutes les données associées

### 1.3 Sécurité (RLS) ⚠️
- [ ] RLS activé sur **toutes** les tables
- [ ] Chacun lit et écrit uniquement ses propres réponses
- [ ] Réponses du partenaire lisibles **seulement quand les deux ont validé** la catégorie
- [ ] Impossible de lister ou rechercher d'autres utilisateurs
- [ ] Impossible de lire les données d'un autre couple
- [ ] Jeu de tests SQL : lecture trop tôt, lecture d'un autre couple, devinage de codes
- [ ] Relecture des règles RLS avec Alexandre avant toute vraie donnée

### 1.4 Infrastructure
- [ ] Workflow GitHub Actions keep-alive (appel planifié tous les 3 à 4 jours)
- [ ] `.env.example` (URL Supabase + clé `anon` uniquement) ⚠️
- [ ] `.gitignore` incluant `.env`
- [ ] `netlify.toml` : build, redirection SPA, en-têtes de sécurité

### 1.5 Squelette PWA
- [ ] Projet Vite en JavaScript, structure des dossiers
- [ ] `manifest.json` et icônes
- [ ] Service worker
- [ ] Bouton « Installer l'app » (Android / Chrome)
- [ ] Message d'installation iPhone (Partager → Sur l'écran d'accueil)
- [ ] Client Supabase, authentification, routage simple
- [ ] `README.md` et `AGENTS.md` (contexte et règles pour OpenCode)

---

## PARTIE 2 — À la charge d'OpenCode (construction)

### 2.1 Mise en place
- [ ] Créer le projet Supabase
- [ ] Exécuter `schema.sql` et lancer les tests RLS
- [ ] Renseigner `.env` en local, puis les variables d'environnement sur Netlify
- [ ] Initialiser Git, pousser sur GitHub, connecter Netlify au dépôt
- [ ] Ajouter les secrets GitHub et tester le keep-alive manuellement

### 2.2 Écrans
- [ ] Inscription et connexion
- [ ] Mon code de contact (copier, partager, régénérer)
- [x] Saisie du code du partenaire
- [x] Demandes reçues (accepter, refuser)
- [x] Accueil : carte des 12 catégories avec progression
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

### 2.3 Temps réel
- [ ] Abonnement Supabase Realtime au statut du partenaire (validé ou non)
- [ ] Gestion de la reconnexion et de l'état hors ligne

### 2.4 Qualité
- [ ] Interface pensée mobile d'abord, boutons larges
- [ ] Messages d'erreur clairs (code invalide, demande déjà envoyée, etc.)
- [ ] Avertissement visible en cas de violence, de contrôle ou de peur dans la relation
- [ ] Test sur au moins deux vrais téléphones (un Android, un iPhone)
- [ ] Test d'installation de la PWA sur les deux
- [ ] Audit Lighthouse (PWA, performance, accessibilité)

---

## Points de passage obligatoires

1. **Après `schema.sql`** : relecture des règles RLS avant que quiconque saisisse de vraies réponses.
2. **Avant la mise en ligne** : test de bout en bout avec deux comptes (appairage, réponses, révélation, déliaison, suppression).
3. **Pendant le développement** : tout changement de schéma ou de RLS est renvoyé à Claude pour relecture.
4. **Avant d'ouvrir aux vrais couples** : page de confidentialité et consentement validés.

## Ordre conseillé

1. Claude : questions JSON, `schema.sql`, RLS et tests
2. Alexandre : création du projet Supabase, exécution et vérification
3. Claude : squelette PWA, `AGENTS.md`, keep-alive
4. OpenCode : écrans et temps réel
5. Ensemble : tests à deux téléphones, puis déploiement sur Netlify

---

*Projet : Coach Alexandre Sognon · SOG Digital Studio · Cotonou, Bénin*

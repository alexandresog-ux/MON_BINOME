# Construire une vie à deux

PWA pour couples, basée sur le questionnaire du Coach Alexandre Sognon (12 catégories, 96 questions, objectifs SMART). Jouable à distance sur deux téléphones, avec appairage par code de contact.

## Démarrage

### 1. Supabase
1. Crée un projet sur supabase.com.
2. SQL Editor : exécute `supabase/schema.sql`, puis `supabase/tests.sql` (doit afficher « TOUS LES TESTS PASSENT »).
3. Authentication : active la confirmation d'email et un CAPTCHA (Attack Protection). Ajoute l'URL du site (Netlify) dans *URL Configuration* (Site URL et Redirect URLs).
4. Project Settings > API : note l'URL et la clé **anon**.

### 2. En local
```bash
cp .env.example .env     # renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Si `npm install` signale un conflit de versions (vite / vite-plugin-pwa), aligne les versions dans `package.json`.

### 3. Déploiement Netlify
1. Pousse le dépôt sur GitHub.
2. Netlify > Add new site > Import from Git. Build : `npm run build`, dossier : `dist` (déjà dans `netlify.toml`).
3. Site settings > Environment variables : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
4. Redéploie, puis ouvre le site sur un téléphone.

### 4. Keep-alive (éviter la pause de Supabase)
GitHub > Settings > Secrets and variables > Actions : crée `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
Onglet Actions > keep-alive > *Run workflow* pour tester. Ensuite il s'exécute tous les 3 jours.
Un dépôt public sans activité pendant 60 jours voit ses workflows planifiés désactivés par GitHub : réactive-le si besoin.

## Installer l'application
- **Android (Chrome)** : bouton « Installer » dans l'app, ou menu du navigateur.
- **iPhone (Safari)** : Partager > Sur l'écran d'accueil.

## Suite du travail
Voir `CHECKLIST.md` et `AGENTS.md` (instructions pour OpenCode).

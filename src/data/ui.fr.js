// Tous les textes de l'interface. Pour traduire plus tard : dupliquer ce fichier (ui.en.js…).
export const ui = {
  appName: 'Construire une vie à deux',
  tagline: 'Clarifiez vos valeurs, comparez vos visions, bâtissez un projet commun.',
  login: {
    loginTitle: 'Connexion',
    signupTitle: 'Créer mon compte',
    name: 'Ton prénom',
    email: 'Adresse email',
    password: 'Mot de passe (8 caractères minimum)',
    submitLogin: 'Me connecter',
    submitSignup: 'Créer mon compte',
    toSignup: "Pas encore de compte ? S'inscrire",
    toLogin: 'Déjà un compte ? Me connecter',
    checkMail: 'Presque fini ! Ouvre le message que nous venons de t\'envoyer pour confirmer ton adresse, puis reviens te connecter.',
    badCredentials: 'Email ou mot de passe incorrect.',
    notConfirmed: 'Ton adresse email n\'est pas encore confirmée. Vérifie ta boîte mail.',
    generic: 'Une erreur est survenue. Réessaie dans un instant.'
  },
  home: {
    title: 'Bienvenue',
    codeLabel: 'Ton code de contact. Donne-le uniquement à ton ou ta partenaire.',
    copy: 'Copier',
    copied: 'Code copié.',
    share: 'Partager',
    regenerate: 'Changer mon code',
    regenerateConfirm: 'Ton ancien code ne fonctionnera plus et les demandes en attente seront annulées. Continuer ?',
    regenerated: 'Nouveau code généré.',
    logout: 'Me déconnecter',
    shareText: (code) => `Voici mon code pour jouer à « Construire une vie à deux » : ${code}`
  },
  install: {
    android: 'Installe l\'application sur ton téléphone.',
    button: 'Installer',
    ios: 'Pour installer : touche « Partager » puis « Sur l\'écran d\'accueil ».'
  },
  setup: {
    title: 'Configuration manquante',
    text: 'Copie .env.example vers .env et renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, puis relance.'
  },
  // Codes d'erreur renvoyés par les fonctions RPC de supabase/schema.sql
  errors: {
    non_connecte: 'Ta session a expiré. Reconnecte-toi.',
    deja_en_couple: 'Tu es déjà lié(e) à un(e) partenaire.',
    trop_de_tentatives: 'Trop de tentatives. Réessaie dans une heure.',
    trop_de_demandes: 'Trop de demandes envoyées aujourd\'hui. Réessaie demain.',
    code_invalide: 'Ce code n\'est pas valide. Vérifie-le avec ton ou ta partenaire.',
    demande_introuvable: 'Cette demande n\'existe pas.',
    demande_expiree: 'Cette demande a expiré. Demande à ton ou ta partenaire d\'en envoyer une nouvelle.',
    pas_de_couple: 'Tu n\'as pas encore de partenaire lié(e).',
    categorie_invalide: 'Catégorie inconnue.',
    categorie_incomplete: 'Réponds (ou passe) toutes les questions avant de valider.',
    generic: 'Une erreur est survenue. Réessaie dans un instant.'
  }
};

export const errorMessage = (code) => ui.errors[code] ?? ui.errors.generic;

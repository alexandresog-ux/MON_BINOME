// Tous les textes de l'interface. Pour traduire plus tard : dupliquer ce fichier (ui.en.js…).
export const ui = {
  // Nom de l'application (nom court : manifest.short_name / apple-mobile-web-app-title).
  appName: 'MON BINÔME',
  // Le questionnaire du coach reste un contenu à part : affiché en sous-titre.
  questionnaireSubtitle: 'Construire une vie à deux',
  questionnaireByline: 'Questionnaire du Coach Alexandre Sognon · SOG Digital Studio',
  tagline: 'Clarifiez vos valeurs, comparez vos visions, bâtissez un projet commun.',
  common: {
    loading: 'Chargement…'
  },
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
    generic: 'Une erreur est survenue. Réessaie dans un instant.',
    consentText: 'J\'ai 18 ans ou plus, et j\'ai lu la politique de confidentialité. '
      + 'J\'accepte que mes réponses soient enregistrées pour faire fonctionner MON BINÔME. '
      + 'Mon ou ta partenaire ne les verra qu\'après que nous aurons tous les deux validé une catégorie.',
    consentRequired: 'Coche la case ci-dessus pour créer ton compte.',
    privacyLink: 'Lire la politique de confidentialité'
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
    settings: 'Paramètres',
    unlinkedNotice: 'Ton ou ta partenaire a délié le couple.',
    shareText: (code) => `Voici mon code pour rejoindre MON BINÔME : ${code}`,
    buildInfo: (version, commit) => `Version ${version} · commit ${commit}`
  },
  pairing: {
    title: 'Joue à deux',
    myCode: 'Mon code de contact',
    sendTitle: 'Inviter mon ou ma partenaire',
    intro: 'Entre le code que ton ou ta partenaire t\'a envoyé pour te rejoindre.',
    codeLabel: 'Le code de ton ou ta partenaire',
    codePlaceholder: 'SOG-XXXX-XXXX',
    send: 'Envoyer la demande',
    sent: 'Demande envoyée ! Attends que ton ou ta partenaire l\'accepte.',
    requestsTitle: 'Demandes reçues',
    requestsEmpty: 'Aucune demande reçue pour le moment.',
    requestFrom: (name) => `${name} souhaite te rejoindre.`,
    accept: 'Accepter',
    decline: 'Refuser',
    block: 'Refuser et bloquer',
    blockConfirm: (name) => `Refuser la demande de ${name} et le/la bloquer ? Vous ne pourrez plus vous envoyer de demandes l'un et l'autre.`,
    declined: 'Demande refusée.',
    linked: 'C\'est lié ! Vous pouvez commencer le questionnaire ensemble.'
  },
  categories: {
    title: 'Vos 12 catégories',
    intro: 'Réponds chacun de ton côté. La comparaison des réponses vient une fois que vous avez tous les deux validé une catégorie.',
    retry: 'Réessayer',
    openLabel: (title) => `Ouvrir la catégorie : ${title}`,
    suggest: 'Prochaine étape suggérée',
    status: {
      todo: 'À commencer',
      progress: (n, total) => `${n} sur ${total} réponses enregistrées`,
      waiting: 'En attente de ton ou ta partenaire',
      partnerDone: 'Ton ou ta partenaire a déjà terminé : à toi de jouer !',
      goalTodo: 'Objectif à écrire',
      goalDoing: 'Objectif en cours',
      goalDone: 'Objectif défini'
    }
  },
  waiting: {
    title: 'Ton ou ta partenaire n\'a pas encore terminé',
    intro: 'Ta catégorie est validée : tes réponses sont verrouillées. Dès que chacun(e) a validé de son côté, vous pourrez découvrir vos réponses côte à côte.',
    mineOk: 'Toi : catégorie validée.',
    partnerPending: 'Ton ou ta partenaire : en cours de réponse…',
    waitingFor: 'On attend ton ou ta partenaire. Tu peux fermer l\'écran, l\'état se met à jour tout seul.',
    refresh: 'Actualiser',
    reconnecting: 'Reconnexion en cours…',
    reconnectFailed: 'La connexion au temps réel est perdue. Appuie sur « Actualiser » de temps en temps.',
    offline: 'Tu es hors ligne : l\'écran se mettra à jour dès que la connexion revient.',
    notValidated: 'Ta catégorie n\'est plus marquée comme validée. Retourne aux catégories.'
  },
  reveal: {
    title: 'Vos réponses côte à côte',
    notRevealed: 'Cette catégorie n\'est pas encore révélée : vous devez tous les deux avoir validé.',
    unlinked: 'Votre couple n\'existe plus. Retour à l\'accueil.',
    arriving: 'Les réponses arrivent…',
    loadFailed: 'Impossible de charger vos réponses pour le moment.',
    retry: 'Réessayer',
    sensitiveIntro: 'Certaines questions de cette catégorie sont sensibles. Chacun(e) a répondu librement : on lit avec bienveillance, sans juger, et on peut faire une pause à tout moment.',
    rulesTitle: 'Nos règles d\'or',
    mine: 'Moi',
    theirs: 'Ton ou ta partenaire',
    skipped: 'Passée',
    continue: 'Continuer'
  },
  alignment: {
    title: 'Tes notes d\'alignement',
    legendMin: '1 = pas du tout',
    legendMax: '10 = tout à fait',
    recorded: 'Ta note est enregistrée. Elle sera comparée dès que ton ou ta partenaire aura donné la sienne.',
    locked: 'Vos notes sont verrouillées, vous les avez toutes les deux données.',
    encouragement: 'Vous êtes proches sur ce thème : une belle base pour en parler et avancer ensemble.',
    saveError: 'Enregistrement impossible. Réessaie.',
    notRevealed: 'Cette catégorie n\'est pas encore révélée : vous devez tous les deux avoir validé.',
    unlinked: 'Votre couple n\'existe plus. Retour à l\'accueil.',
    refresh: 'Actualiser',
    retry: 'Réessayer',
    continue: 'Continuer',
    continueGoal: 'Continuer vers notre objectif',
    me: 'Toi',
    theirs: 'Ton ou ta partenaire',
    scoreLabel: (n) => `Note ${n} sur 10`
  },
  smart: {
    intro: 'Un objectif commun par catégorie : chacun(e) écrit de son côté, l\'écran se met à jour tout seul.',
    notRevealed: 'Cette catégorie n\'est pas encore révélée : vous devez tous les deux avoir validé.',
    unlinked: 'Votre couple n\'existe plus. Retour à l\'accueil.',
    refresh: 'Actualiser',
    retry: 'Réessayer',
    saved: 'Enregistré',
    saveError: 'Enregistrement impossible. Réessaie.',
    refused: 'Écriture refusée pour le moment. Tes textes restent affichés : réessaie dans un instant.',
    conflict: 'Ton ou ta partenaire vient de modifier l\'objectif. Nous avons rechargé sa version : reprends ta saisie quand tu veux.',
    deadlineLabel: 'Notre échéance (date où nous faisons le point ensemble)',
    deadlinePast: 'Choisis une date à partir d\'aujourd\'hui.',
    counter: (n) => `${n} / 2000`,
    lastBy: (name) => `Dernière modification par ${name}.`,
    lastUnknown: 'Dernière modification enregistrée.',
    completeTitle: 'Objectif complet',
    complete: 'Vos 4 réponses et votre échéance sont enregistrées. Vous pouvez les modifier quand vous voulez.',
    completeNext: 'Catégorie suivante',
    seeAnswers: 'Voir nos réponses'
  },
  synthesis: {
    title: 'Notre synthèse',
    tableTitle: 'Vos 12 catégories',
    unlinked: 'Votre couple n\'existe plus. Retour à l\'accueil.',
    retry: 'Réessayer',
    colCategory: 'Catégorie',
    colStatus: 'Statut',
    colGoal: 'Objectif SMART',
    colComplete: 'Objectif complet',
    status: {
      todo: 'À commencer',
      waiting: 'En attente de ton ou ta partenaire',
      partnerFirst: 'À valider de ton côté',
      revealed: 'Révélée'
    },
    none: '—',
    deadline: (date) => `Échéance : ${date}`,
    completeYes: 'Oui',
    completeNo: 'Non',
    reviewTitle: 'Notre bilan final',
    reviewIntro: 'Vous écrivez ce bilan ensemble : vous pouvez tous les deux le modifier.',
    goalsTitle: 'Nos objectifs',
    dateHint: 'La date de votre prochain point commun (aujourd\'hui ou plus tard).',
    counter: (n) => `${n} / 3000`,
    saved: 'Enregistré',
    saveError: 'Enregistrement impossible. Réessaie.',
    refused: 'Écriture refusée pour le moment. Tes textes restent affichés : réessaie dans un instant.',
    conflict: 'Ton ou ta partenaire vient de modifier le bilan. Nous avons rechargé sa version.',
    datePast: 'Choisis une date à partir d\'aujourd\'hui.',
    refresh: 'Actualiser',
    lastBy: (name) => `Dernière modification par ${name}.`,
    lastUnknown: 'Dernière modification enregistrée.',
    editedOn: (date) => `Édité le ${date}`,
    exportPdf: 'Enregistrer en PDF',
    exportConfirm: 'Ce document contient vos notes et vos objectifs. Gardez-le entre vous.',
    printFoot: 'Document confidentiel, réservé à votre couple'
  },
  questions: {
    backToCategories: 'Retour aux catégories',
    notFound: 'Cette catégorie n\'existe pas.',
    retry: 'Réessayer',
    lockedTitle: 'Réponses verrouillées',
    locked: 'Tu as déjà validé cette catégorie : tes réponses ne peuvent plus être modifiées.',
    waitPartner: 'La comparaison arrive dès que ton ou ta partenaire aura validé.',
    partnerDone: 'Ton ou ta partenaire a déjà validé cette catégorie.',
    progress: (n, total) => `Question ${n} sur ${total}`,
    jumpLabel: 'Aller directement à une question',
    jumpCurrent: (n) => `Question ${n} : celle-ci`,
    jumpTodo: (n) => `Question ${n} : à traiter`,
    jumpDone: (n) => `Question ${n} : traitée`,
    answerLabel: 'Ta réponse',
    placeholder: 'Écris ici, avec tes mots…',
    sensitiveHint: 'Question sensible : « Passer » est possible, sans pénalité et sans justification.',
    skipConfirm: 'Passer efface le texte que tu as saisi pour cette question (il ne sera pas partagé). Continuer ?',
    skippedBadge: 'Passée',
    skip: 'Passer',
    resume: 'Reprendre ma réponse',
    answerLater: 'Répondre plus tard',
    saved: 'Réponse enregistrée.',
    saveError: 'La sauvegarde a échoué. Réessaie.',
    prev: 'Précédent',
    next: 'Suivant',
    validate: 'Valider la catégorie',
    validateWith: (done, total) => `Valider la catégorie (${done} sur ${total} traitées)`,
    validateHint: 'Après validation, tes réponses sont verrouillées.'
  },
  install: {
    android: 'Installe l\'application sur ton téléphone.',
    button: 'Installer',
    ios: 'Pour installer : touche « Partager » puis « Sur l\'écran d\'accueil ».'
  },
  update: {
    text: 'Une nouvelle version est disponible.',
    refresh: 'Actualiser'
  },
  setup: {
    title: 'Configuration manquante',
    text: 'Copie .env.example vers .env et renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY, puis relance.'
  },
  // Écran Paramètres : confirmations TOUJOURS dans la page (jamais window.confirm).
  settings: {
    title: 'Paramètres',
    back: 'Retour à l\'accueil',
    confirm: {
      cancel: 'Annuler',
      label: (word) => `Écris ${word} pour confirmer`,
      wrong: (word) => `La saisie ne correspond pas : écris ${word} pour confirmer.`
    },
    profile: {
      title: 'Mon profil',
      label: 'Ton prénom',
      save: 'Enregistrer',
      saved: 'Prénom mis à jour.',
      error: 'Mise à jour impossible. Réessaie.',
      empty: 'Entre un prénom.'
    },
    privacy: {
      title: 'Confidentialité',
      text: 'Ce que nous enregistrons, qui peut lire tes réponses et comment tout effacer.',
      link: 'Lire la politique de confidentialité'
    },
    safety: {
      title: 'Sécurité'
    },
    unlink: {
      title: 'Délier le couple',
      text: 'Délier supprime le couple et efface définitivement toutes vos réponses, vos notes, vos objectifs '
        + 'et votre bilan, pour tous les deux.',
      blockLabel: 'Bloquer aussi mon ou ma partenaire : nous ne pourrons plus nous envoyer de demandes.',
      action: 'Délier',
      confirmTitle: 'Confirmer la déliaison',
      confirmText: 'Toutes vos données communes seront supprimées définitivement, pour tous les deux.',
      confirmOk: 'Confirmer',
      word: 'DÉLIER',
      success: 'Vous êtes délié(e). Toutes vos données communes ont été supprimées.'
    },
    blocks: {
      title: 'Comptes bloqués',
      intro: 'Les personnes bloquées ne peuvent plus t\'envoyer de demandes de liaison.',
      empty: 'Aucun compte bloqué.',
      blockedOn: (date) => `Bloqué le ${date}`,
      unblock: 'Débloquer',
      confirmTitle: 'Débloquer ce compte',
      confirmText: (name) => `${name} pourra de nouveau t\'envoyer des demandes de liaison.`,
      confirmOk: 'Confirmer',
      success: 'Compte débloqué.'
    },
    delete: {
      title: 'Supprimer mon compte',
      text: 'La suppression efface définitivement ton compte, votre couple et toutes vos données. '
        + 'Cette action est irréversible.',
      action: 'Supprimer mon compte',
      confirmTitle: 'Confirmer la suppression',
      confirmText: 'Ton compte et toutes vos données seront supprimés définitivement.',
      confirmOk: 'Supprimer définitivement',
      word: 'SUPPRIMER',
      success: 'Ton compte a été supprimé.'
    },
    about: {
      title: 'À propos'
    }
  },
  privacy: {
    title: 'Politique de confidentialité',
    back: 'Retour à l\'accueil'
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

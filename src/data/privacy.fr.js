// Politique de confidentialité de MON BINÔME — conversion fidèle de
// docs/politique-de-confidentialite.md (brouillon interne, sans son bloc de
// commentaires HTML). Affichée par src/views/privacy.js : page statique, sans
// session, sans aucune donnée d'utilisateur.
//
// Formes de contenu :
//   { p: [...] }                paragraphe (segments : texte ou { b: 'gras' })
//   { ul: [ [...], ... ] }      liste à puces
//   { table: { head, rows } }   tableau (les | du Markdown deviennent des cellules)
//   flag: 'inactivityPurgeActive'  bloc affiché seulement si PRIVACY_FLAGS.le flag est vrai

// Drapeaux d'affichage. La suppression après 2 mois d'inactivité (§6) n'est
// PAS encore codée : la ligne reste masquée tant que le drapeau est faux.
export const PRIVACY_FLAGS = {
  inactivityPurgeActive: false
};

// Version du texte = date de mise en ligne. Aussi envoyée à l'inscription
// (consent_version dans options.data de signUp — cf. src/views/login.js).
export const PRIVACY_VERSION = '2026-11-16';

// Date du jour au format JJ/MM/AAAA (remplace [DATE] du brouillon).
export function privacyDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export const privacy = {
  title: 'Politique de confidentialité',
  version: (date) => `Version du ${date}. Questionnaire « Construire une vie à deux » du Coach Alexandre Sognon.`,
  intro: [
    'MON BINÔME t\'aide à répondre, à deux, à des questions sur ta vie de couple. '
    + 'Tes réponses sont très personnelles : cette page t\'explique, simplement et honnêtement, '
    + 'ce que nous gardons, qui peut le lire et comment tout effacer.'
  ],
  sections: [
    {
      n: '1',
      title: 'Qui est responsable de ce service ?',
      blocks: [
        { p: 'Alexandre Sognon, SOG Digital Studio, Cotonou (Bénin).' },
        { p: ['Contact pour toute question ou demande : ', { b: 'leadersognon1er@gmail.com' }, '.'] }
      ]
    },
    {
      n: '2',
      title: 'Ce que nous enregistrons',
      blocks: [
        {
          table: {
            head: ['Donnée', 'Pourquoi'],
            rows: [
              [['Ton adresse email et ton mot de passe (ce dernier n\'est jamais lisible, il est protégé par notre service d\'authentification)'],
                ['Créer ton compte et te connecter']],
              [['Ton prénom'], ['L\'afficher à ton ou ta partenaire']],
              [['Ton code de contact (ex. SOG-XXXX-XXXX)'],
                ['Te lier à ton ou ta partenaire, et à personne d\'autre sans ton accord']],
              [['Les demandes de liaison envoyées et reçues'],
                ['Faire fonctionner la liaison (elles expirent au bout de 24 heures)']],
              [['Tes réponses aux questions, ou le fait que tu les as passées'],
                ['Faire fonctionner le questionnaire']],
              [['Tes notes d\'alignement et les objectifs écrits ensemble'],
                ['Faire fonctionner le questionnaire']],
              [['Des données techniques (adresse IP, type d\'appareil, journaux d\'erreurs)'],
                ['Sécurité et bon fonctionnement, conservées par nos hébergeurs']]
            ]
          }
        },
        { p: 'Nous n\'utilisons aucune publicité, aucun traceur publicitaire, et nous ne vendons ni ne louons aucune donnée.' }
      ]
    },
    {
      n: '3',
      title: 'Qui peut lire tes réponses ?',
      blocks: [
        {
          table: {
            head: ['Qui', 'Ce qu\'il peut voir'],
            rows: [
              [[{ b: 'Toi' }], ['Tes propres réponses, à tout moment']],
              [[{ b: 'Ton ou ta partenaire' }],
                ['Tes réponses d\'une catégorie ', { b: 'uniquement quand vous avez tous les deux validé' },
                  ' cette catégorie. Avant cela, il ou elle ne voit rien']],
              [[{ b: 'Le responsable du service' }],
                ['Techniquement, il peut accéder à la base de données via le tableau de bord de notre hébergeur. '
                  + 'Il s\'interdit de lire les réponses, sauf ', { b: 'obligation légale' },
                  ' (demande officielle d\'une autorité compétente).']],
              [[{ b: 'Nos hébergeurs' }, ' (section 5)'],
                ['Ils stockent les données pour nous. Ils ne les utilisent pas pour eux-mêmes, '
                  + 'mais leurs systèmes y ont accès techniquement']],
              [[{ b: 'Toute autre personne' }],
                ['Rien. Personne ne peut te chercher, te contacter ou te trouver sans connaître ton code de contact']]
            ]
          }
        },
        { p: ['Tes réponses ne sont ', { b: 'pas chiffrées de bout en bout' },
          ' : elles sont protégées pendant leur transmission (HTTPS) et par les mesures de sécurité '
          + 'de nos hébergeurs, mais nous ne pouvons pas promettre qu\'elles soient illisibles pour nous.'] }
      ]
    },
    {
      n: '4',
      title: 'Pourquoi nous les utilisons, et sur quelle base',
      blocks: [
        { p: ['Nous utilisons tes données uniquement pour te fournir MON BINÔME. Certaines réponses '
          + 'peuvent toucher à la santé, à la vie intime, aux croyances ou à l\'argent. Nous ne te demandons '
          + 'de les écrire que si ', { b: 'tu le souhaites' },
          ' : tu peux passer n\'importe quelle question, sans justification et sans pénalité. '
          + 'En créant ton compte, tu acceptes ce traitement ; tu peux retirer ton accord à tout moment '
          + 'en supprimant ton compte.'] }
      ]
    },
    {
      n: '5',
      title: 'Où sont stockées tes données ?',
      blocks: [
        {
          table: {
            head: ['Service', 'Rôle', 'Lieu'],
            rows: [
              [['Supabase'], ['Base de données, comptes, envoi des emails'], ['Union européenne (Stockholm, Suède)']],
              [['Netlify'], ['Hébergement du site'], ['Réseau mondial de serveurs']],
              [['GitHub'], ['Code du site (ne contient aucune donnée d\'utilisateur)'], ['—']]
            ]
          }
        },
        { p: 'Ces services peuvent se trouver hors du Bénin. En utilisant MON BINÔME, tu acceptes que tes données soient traitées chez eux.' }
      ]
    },
    {
      n: '6',
      title: 'Combien de temps les gardons-nous ?',
      blocks: [
        {
          ul: [
            ['Tant que ton compte existe, et tant que tu es lié(e) à ton ou ta partenaire.'],
            [{ b: 'Si vous vous déliez' }, ', toutes les réponses, notes et objectifs du couple sont ',
              { b: 'supprimés définitivement' }, ', pour les deux. Rien n\'est conservé.'],
            [{ b: 'Si tu supprimes ton compte' },
              ', ton compte et tout ce qui concerne ton couple sont supprimés définitivement.'],
            {
              flag: 'inactivityPurgeActive',
              li: [{ b: 'Inactivité' },
                ': si ni toi ni ton ou ta partenaire n\'avez ouvert l\'application pendant plus de ',
                { b: '2 mois' },
                ', le compte et les données du couple peuvent être supprimés définitivement. '
                + 'Si tu n\'es pas lié(e), ton compte est supprimé après 2 mois sans ouverture.']
            },
            ['Les journaux techniques de nos hébergeurs sont conservés selon leurs propres règles.']
          ]
        },
        { p: 'Les sauvegardes éventuelles de nos hébergeurs peuvent conserver une copie quelque temps après une suppression.' }
      ]
    },
    {
      n: '7',
      title: 'Tes droits',
      blocks: [
        { p: 'Tu peux à tout moment :' },
        {
          ul: [
            [{ b: 'accéder' }, ' à tes données et demander une copie ;'],
            [{ b: 'corriger' }, ' ton prénom, ou tes réponses tant qu\'elles ne sont pas validées ;'],
            [{ b: 'supprimer' }, ' ton compte et tes données, depuis l\'application (Paramètres) ou en écrivant à ',
              { b: 'leadersognon1er@gmail.com' }, ' ;'],
            [{ b: 't\'opposer' }, ' au traitement ou retirer ton accord ;'],
            [{ b: 'te délier' }, ' de ton ou ta partenaire quand tu veux, avec effacement des données communes.']
          ]
        },
        { p: 'Nous répondons dans un délai raisonnable. Si tu estimes que tes droits ne sont pas respectés, '
          + 'tu peux t\'adresser à l\'autorité béninoise de protection des données (APDP).' }
      ]
    },
    {
      n: '8',
      title: 'Sécurité',
      blocks: [
        { p: ['Les échanges sont protégés par HTTPS. L\'accès aux réponses est contrôlé par des règles strictes '
          + 'dans la base de données, que nous testons : personne ne peut lire les réponses d\'un autre couple. '
          + 'Aucun système n\'est sûr à 100 % : si nous constatons une fuite de données qui te concerne, ',
          { b: 'nous t\'en informerons rapidement' }, '.'] }
      ]
    },
    {
      n: '9',
      title: 'Ton navigateur',
      blocks: [
        { p: 'MON BINÔME garde dans ton navigateur les informations nécessaires pour te laisser connecté(e), '
          + 'ainsi que les fichiers de l\'application pour qu\'elle s\'ouvre vite. Nous n\'y stockons pas tes réponses '
          + 'et n\'utilisons aucun cookie publicitaire ni outil de mesure d\'audience.' }
      ]
    },
    {
      n: '10',
      title: 'Âge',
      blocks: [
        { p: ['MON BINÔME est réservé aux personnes de ', { b: '18 ans ou plus' }, '.'] }
      ]
    },
    {
      n: '11',
      title: 'Ce que MON BINÔME n\'est pas',
      blocks: [
        { p: ['Ce n\'est ni une thérapie ni un conseil médical, juridique ou religieux. ',
          { b: 'En cas de violence, de contrôle ou de peur dans ta relation, n\'utilise pas ce questionnaire : '
            + 'demande de l\'aide à un professionnel ou à une personne de confiance.' }] }
      ]
    },
    {
      n: '12',
      title: 'Modifications',
      blocks: [
        { p: 'Si cette politique change de façon importante, nous te le dirons dans l\'application avant qu\'elle s\'applique.' }
      ]
    }
  ]
};

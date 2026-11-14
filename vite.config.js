import { createRequire } from 'node:module';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');
// Netlify injecte COMMIT_REF (commit du build) dans l'environnement.
const commitRef = String(process.env.COMMIT_REF || 'local').slice(0, 7);

export default defineConfig({
  // Constantes de build, affichées en pied de l'accueil.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __COMMIT_REF__: JSON.stringify(commitRef)
  },
  plugins: [
    VitePWA({
      // prompt : le service worker signale une nouvelle version, c'est
      // l'utilisateur qui décide de l'appliquer (jamais de rechargement seul).
      registerType: 'prompt',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'Construire une vie à deux',
        short_name: 'Vie à deux',
        description: 'Questionnaire pour couples : valeurs, vision, projet commun et objectifs SMART.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff4e6',
        theme_color: '#7a2e4d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // On ne met en cache QUE les fichiers statiques de l'app.
      // Jamais les appels à Supabase (données sensibles) : pas de runtimeCaching.
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        // Jamais d'activation toute seule (skipWaiting) : elle est déclenchée
        // au clic sur « Actualiser ». clientsClaim permet à la nouvelle version
        // de reprendre la page, qui se recharge alors avec les bons fichiers.
        skipWaiting: false,
        clientsClaim: true
      }
    })
  ]
});

import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { supabase, supabaseReady } from './supabase.js';
import { h } from './dom.js';
import { ui } from './data/ui.fr.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderQuestions } from './views/questions.js';
import { renderWaiting } from './views/waiting.js';
import { installBanner } from './views/installBanner.js';
import { updateBanner } from './views/updateBanner.js';

const root = document.getElementById('app');

let currentSession = null;
let route = { name: 'home' };
// Hooks de sortie d'écran (désabonnement Realtime, listeners…).
let leaveHooks = [];

async function render() {
  for (const hook of leaveHooks.splice(0)) {
    try { hook(); } catch (err) { console.error(err); }
  }
  root.replaceChildren();
  const main = h('main', { class: 'wrap' });
  root.append(main);
  if (!currentSession) {
    route = { name: 'home' };
    renderLogin(main, { supabase });
    return;
  }
  const ctx = {
    supabase, session: currentSession, navigate,
    onLeave: (fn) => { leaveHooks.push(fn); }
  };
  try {
    if (route.name === 'questions') await renderQuestions(main, ctx, route.categoryId);
    else if (route.name === 'wait') await renderWaiting(main, ctx, route.categoryId);
    else await renderHome(main, ctx, route.notice);
  } catch (err) {
    console.error(err);
    main.append(h('section', { class: 'card' }, h('p', {}, ui.errors.generic)));
  }
}

function navigate(next = {}) {
  route = { name: 'home', ...next };
  render();
}

// --- Mise à jour de la PWA -------------------------------------------
// Mode « prompt » : le service worker signale une nouvelle version, on la
// propose par une bannière. Aucun rechargement automatique : l'utilisateur
// peut être en train d'écrire, c'est lui qui décide de cliquer.
let updateBox = null;
let updateRunning = false;
const updateSW = registerSW({
  onNeedRefresh: () => { if (updateBox) updateBox.hidden = false; }
});

async function applyUpdate(ev) {
  if (updateRunning) return;
  updateRunning = true;
  if (ev?.currentTarget) ev.currentTarget.disabled = true;
  // 1. Termine d'abord la sauvegarde automatique en cours (aucun texte perdu).
  const flushes = [];
  window.dispatchEvent(new CustomEvent('app:before-reload', {
    detail: { flush: (p) => flushes.push(Promise.resolve(p)) }
  }));
  await Promise.allSettled(flushes);
  // 2. Active la nouvelle version du service worker.
  try { await updateSW(); } catch { /* le rechargement suffit */ }
  // 3. Recharge avec les nouveaux fichiers (demandé par l'utilisateur).
  setTimeout(() => window.location.reload(), 1500);
}

updateBox = updateBanner(applyUpdate);
document.body.append(installBanner(), updateBox);

if (!supabaseReady) {
  root.append(h('main', { class: 'wrap' },
    h('section', { class: 'card' }, h('h1', {}, ui.setup.title), h('p', {}, ui.setup.text))));
} else {
  // On ne re-rend que si l'utilisateur change (supabase-js renvoie SIGNED_IN
  // à chaque retour sur l'onglet, ce qui effacerait les formulaires).
  let currentUid;
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user?.id ?? null;
    if (uid === currentUid) return;
    currentUid = uid;
    currentSession = session ?? null;
    route = { name: 'home' };
    // setTimeout : ne jamais appeler supabase (await) directement dans ce callback (risque de blocage).
    setTimeout(() => render(), 0);
  });
}

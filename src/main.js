import './style.css';
import { supabase, supabaseReady } from './supabase.js';
import { h } from './dom.js';
import { ui } from './data/ui.fr.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { installBanner } from './views/installBanner.js';

const root = document.getElementById('app');

async function render(session) {
  root.replaceChildren();
  const main = h('main', { class: 'wrap' });
  root.append(main);
  if (!session) renderLogin(main, { supabase });
  else await renderHome(main, { supabase, session });
}

document.body.append(installBanner());

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
    // setTimeout : ne jamais appeler supabase (await) directement dans ce callback (risque de blocage).
    setTimeout(() => render(session), 0);
  });
}

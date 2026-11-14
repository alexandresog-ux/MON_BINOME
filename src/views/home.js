import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';
import { renderPairing } from './pairing.js';
import { renderCategories } from './categories.js';

// Constantes injectées par vite.config.js (define) — version et commit déployés.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const COMMIT_REF = typeof __COMMIT_REF__ === 'string' ? __COMMIT_REF__ : 'local';

// Accueil : appairage tant qu'aucun partenaire n'est lié, sinon les catégories.
export async function renderHome(root, ctx, notice) {
  const { supabase, session } = ctx;
  const t = ui.home;

  // ⚠️ Toujours lister les colonnes de profiles (contact_code n'est pas lisible).
  const [profile, member] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('id', session.user.id).maybeSingle(),
    supabase.from('couple_members').select('couple_id').eq('user_id', session.user.id).maybeSingle()
  ]);
  const displayName = profile.data?.display_name ?? '';

  if (notice) root.append(h('p', { class: 'msg', role: 'status' }, notice));

  if (!member.data?.couple_id) await renderPairing(root, ctx, { displayName });
  else await renderCategories(root, ctx, { coupleId: member.data.couple_id, displayName });

  // Avertissement de sécurité toujours visible sur l'accueil.
  root.append(
    h('section', { class: 'card warn' }, h('p', {}, content.common.safety_warning)),
    h('p', { class: 'center' },
      h('button', { class: 'link', type: 'button', onclick: () => supabase.auth.signOut() }, t.logout)),
    // Version et commit déployés : sert à vérifier que la page affichée est
    // bien celle du dernier déploiement.
    h('p', { class: 'muted version center' }, t.buildInfo(APP_VERSION, COMMIT_REF))
  );
}

import { h } from '../dom.js';
import { ui, errorMessage } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';
import { renderPairing } from './pairing.js';

// Accueil : appairage tant qu'aucun partenaire n'est lié, sinon le jeu.
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
  else renderCode(root, ctx, displayName);

  // Avertissement de sécurité toujours visible sur l'accueil.
  root.append(
    h('section', { class: 'card warn' }, h('p', {}, content.common.safety_warning)),
    h('p', { class: 'center' },
      h('button', { class: 'link', type: 'button', onclick: () => supabase.auth.signOut() }, t.logout))
  );
}

// Écran provisoire une fois lié(e) : sera remplacé par la carte des catégories
// (CHECKLIST.md, 2.2 « Accueil »).
function renderCode(root, ctx, displayName) {
  const { supabase } = ctx;
  const t = ui.home;
  const title = h('h1', {}, displayName ? `${t.title}, ${displayName}` : t.title);
  const codeEl = h('p', { class: 'code', 'aria-live': 'polite' }, '…');
  const msg = h('p', { class: 'msg', role: 'status' });
  let currentCode = '';

  const setCode = (code) => { currentCode = code; codeEl.textContent = code; };

  const copyBtn = h('button', {
    class: 'btn', type: 'button',
    onclick: async () => {
      try { await navigator.clipboard.writeText(currentCode); msg.textContent = t.copied; }
      catch { msg.textContent = ui.errors.generic; }
    }
  }, t.copy);

  const shareBtn = navigator.share
    ? h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => navigator.share({ text: t.shareText(currentCode) }).catch(() => {})
      }, t.share)
    : null;

  const regenBtn = h('button', {
    class: 'link', type: 'button',
    onclick: async () => {
      if (!window.confirm(t.regenerateConfirm)) return;
      const { data, error } = await supabase.rpc('regenerate_contact_code');
      if (error || !data?.ok) { msg.textContent = errorMessage(data?.error); return; }
      setCode(data.code);
      msg.textContent = t.regenerated;
    }
  }, t.regenerate);

  root.append(
    h('section', { class: 'card' },
      title,
      h('p', { class: 'muted' }, t.codeLabel),
      codeEl,
      h('div', { class: 'row' }, copyBtn, shareBtn),
      msg,
      regenBtn)
  );

  supabase.rpc('my_contact_code').then(({ data, error }) => {
    if (error || !data) msg.textContent = ui.errors.generic;
    else setCode(data);
  });
}

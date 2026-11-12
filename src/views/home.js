import { h } from '../dom.js';
import { ui, errorMessage } from '../data/ui.fr.js';

// Écran d'accueil provisoire : prouve que l'auth, la RLS et les RPC fonctionnent.
// TODO(OpenCode) : remplacer par la carte des 12 catégories (voir CHECKLIST.md, 2.2).
export async function renderHome(root, { supabase, session }) {
  const t = ui.home;
  const title = h('h1', {}, t.title);
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

  const logoutBtn = h('button', {
    class: 'link', type: 'button',
    onclick: () => supabase.auth.signOut()
  }, t.logout);

  root.append(
    h('section', { class: 'card' },
      title,
      h('p', { class: 'muted' }, t.codeLabel),
      codeEl,
      h('div', { class: 'row' }, copyBtn, shareBtn),
      msg,
      regenBtn
    ),
    h('p', { class: 'center' }, logoutBtn)
  );

  // ⚠️ Toujours lister les colonnes de profiles (contact_code n'est pas lisible).
  const [profile, code] = await Promise.all([
    supabase.from('profiles').select('id, display_name').eq('id', session.user.id).single(),
    supabase.rpc('my_contact_code')
  ]);
  if (profile.data?.display_name) title.textContent = `${t.title}, ${profile.data.display_name}`;
  if (code.error || !code.data) msg.textContent = ui.errors.generic;
  else setCode(code.data);
}

import { h } from '../dom.js';
import { ui, errorMessage } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Constantes injectées par vite.config.js (define) — version et commit déployés.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const COMMIT_REF = typeof __COMMIT_REF__ === 'string' ? __COMMIT_REF__ : 'local';

// Date JJ/MM/AAAA à partir d'un horodatage ISO.
const dayOf = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Panneau de confirmation DANS la page — jamais window.confirm. `word` = saisie
// obligatoire (DÉLIER / SUPPRIMER), null = simple confirmation à deux boutons.
// Gère le focus (le champ à l'ouverture, le bouton d'origine à la fermeture),
// Échap pour annuler, et vide toujours le champ : une saisie de confirmation
// n'est jamais stockée nulle part (ni message, ni état, ni appels RPC).
function makeConfirm(t, { title, text, word, okLabel, onOk }) {
  const msg = h('p', { class: 'msg', role: 'status' });
  const input = word
    ? h('input', {
        type: 'text', required: true, autocomplete: 'off',
        autocapitalize: 'characters', spellcheck: 'false', maxlength: 30
      })
    : null;
  const okBtn = h('button', { class: 'btn', type: 'submit' }, okLabel);
  const cancelBtn = h('button', { class: 'btn secondary', type: 'button' }, t.confirm.cancel);
  let opener = null;

  const form = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      if (word && (!input || input.value.trim().toUpperCase() !== word)) {
        msg.textContent = t.confirm.wrong(word);
        return;
      }
      if (input) input.value = '';
      okBtn.disabled = true;
      cancelBtn.disabled = true;
      await onOk(msg, okBtn, cancelBtn);
    }
  },
    word ? h('label', { class: 'field' }, h('span', {}, t.confirm.label(word)), input) : null,
    h('div', { class: 'row' }, okBtn, cancelBtn),
    msg);

  const panel = h('div', { class: 'card confirm', role: 'alertdialog', 'aria-label': title, hidden: true },
    h('h3', {}, title),
    h('p', {}, text),
    form);
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  cancelBtn.addEventListener('click', close);

  function open(from) {
    opener = from ?? null;
    msg.textContent = '';
    panel.hidden = false;
    if (input) { input.value = ''; input.focus(); } else okBtn.focus();
  }
  function close() {
    panel.hidden = true;
    if (input) input.value = '';
    opener?.focus?.();
  }
  return { panel, open, close };
}

// Paramètres : profil, confidentialité, sécurité, déliaison, blocages,
// suppression du compte et à propos. Les actions destructrices demandent une
// confirmation en page avec un mot à écrire ; le mot n'est jamais transmis.
export async function renderSettings(root, ctx) {
  const { supabase, session, navigate } = ctx;
  const t = ui.settings;
  const uid = session.user.id;

  root.append(h('header', { class: 'hero' },
    h('h1', {}, t.title),
    h('p', { class: 'center' },
      h('button', { class: 'link', type: 'button', onclick: () => navigate({ name: 'home' }) }, t.back))));

  // 1 — Mon profil (le prénom est la seule donnée modifiable ici).
  const nameInput = h('input', {
    type: 'text', required: true, maxlength: 40, autocomplete: 'given-name'
  });
  const profileMsg = h('p', { class: 'msg', role: 'status' });
  const saveBtn = h('button', { class: 'btn', type: 'submit' }, t.profile.save);
  const profileForm = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      saveBtn.disabled = true;
      profileMsg.textContent = '';
      const value = nameInput.value.trim();
      if (!value) { profileMsg.textContent = t.profile.empty; saveBtn.disabled = false; return; }
      // ⚠️ .select() après l'update : une mise à jour bloquée par la RLS ne
      // lève pas d'erreur, elle touche 0 ligne — on le vérifie.
      const { data, error } = await supabase.from('profiles')
        .update({ display_name: value })
        .eq('id', uid)
        .select('id');
      if (error || !data?.length) profileMsg.textContent = t.profile.error;
      else profileMsg.textContent = t.profile.saved;
      saveBtn.disabled = false;
    }
  },
    h('label', { class: 'field' }, h('span', {}, t.profile.label), nameInput),
    saveBtn,
    profileMsg);
  root.append(h('section', { class: 'card' }, h('h2', {}, t.profile.title), profileForm));

  // 2 — Confidentialité : renvoie vers la page dédiée (lisible sans session).
  root.append(h('section', { class: 'card' },
    h('h2', {}, t.privacy.title),
    h('p', {}, t.privacy.text),
    h('button', { class: 'btn secondary', type: 'button', onclick: () => navigate({ name: 'privacy' }) },
      t.privacy.link)));

  // 3 — Sécurité : l'avertissement du questionnaire, toujours visible ici.
  root.append(h('section', { class: 'card warn' },
    h('h2', {}, t.safety.title),
    h('p', {}, content.common.safety_warning)));

  // 4 — Délier le couple (avec blocage optionnel) : seulement s'il existe un
  // couple. Sans couple, la section affiche un message sobre à la place.
  const { data: member } = await supabase.from('couple_members')
    .select('couple_id')
    .eq('user_id', uid)
    .maybeSingle();
  if (member?.couple_id) {
    const unlinkMsg = h('p', { class: 'msg', role: 'status' });
    const blockChk = h('input', { type: 'checkbox' });
    const unlinkConfirm = makeConfirm(t, {
      title: t.unlink.confirmTitle,
      text: t.unlink.confirmText,
      word: t.unlink.word,
      okLabel: t.unlink.confirmOk,
      onOk: async (msgEl, okBtn, cancelBtn) => {
        const { data, error } = await supabase.rpc('unlink_couple', { p_block: blockChk.checked });
        if (error || !data?.ok) {
          msgEl.textContent = error ? ui.errors.generic : errorMessage(data?.error);
          okBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }
        // Ta propre déliaison : pas de faux « il ou elle a délié » sur l'accueil.
        if (ctx.state) ctx.state.seenCouple = false;
        navigate({ name: 'home', notice: t.unlink.success });
      }
    });
    const unlinkBtn = h('button', {
      class: 'btn danger', type: 'button',
      onclick: () => unlinkConfirm.open(unlinkBtn)
    }, t.unlink.action);
    root.append(h('section', { class: 'card' },
      h('h2', {}, t.unlink.title),
      h('p', {}, t.unlink.text),
      h('label', { class: 'check' }, blockChk, h('span', {}, t.unlink.blockLabel)),
      unlinkBtn,
      unlinkMsg,
      unlinkConfirm.panel));
  } else {
    root.append(h('p', { class: 'muted center' }, t.unlink.noCouple));
  }

  // 5 — Comptes bloqués : uniquement via les RPC (la table blocks n'est
  // jamais lue directement).
  const blocksMsg = h('p', { class: 'msg', role: 'status' });
  const blocksList = h('div', {});
  root.append(h('section', { class: 'card' },
    h('h2', {}, t.blocks.title),
    h('p', { class: 'muted' }, t.blocks.intro),
    blocksList,
    blocksMsg));

  async function loadBlocks() {
    blocksList.replaceChildren(h('p', { class: 'muted' }, ui.common.loading));
    const { data, error } = await supabase.rpc('list_my_blocks');
    if (error || !Array.isArray(data)) {
      blocksList.replaceChildren(h('p', { class: 'msg' }, ui.errors.generic));
      return;
    }
    if (!data.length) {
      blocksList.replaceChildren(h('p', { class: 'muted' }, t.blocks.empty));
      return;
    }
    blocksList.replaceChildren(...data.map(blockRow));
  }

  function blockRow(row) {
    const msg = h('p', { class: 'msg', role: 'status' });
    const confirm = makeConfirm(t, {
      title: t.blocks.confirmTitle,
      text: t.blocks.confirmText(row.display_name),
      word: null,
      okLabel: t.blocks.confirmOk,
      onOk: async (msgEl, okBtn, cancelBtn) => {
        const { data, error } = await supabase.rpc('unblock_user', { p_blocked: row.blocked_id });
        if (error || !data?.ok) {
          msgEl.textContent = error ? ui.errors.generic : errorMessage(data?.error);
          okBtn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }
        blocksMsg.textContent = t.blocks.success;
        await loadBlocks();
      }
    });
    const unblockBtn = h('button', {
      class: 'btn small secondary', type: 'button',
      onclick: () => confirm.open(unblockBtn)
    }, t.blocks.unblock);
    return h('div', { class: 'card request' },
      h('p', {}, row.display_name),
      h('p', { class: 'muted' }, t.blocks.blockedOn(dayOf(row.created_at))),
      unblockBtn,
      msg,
      confirm.panel);
  }

  // 6 — Supprimer mon compte (le mot n'est jamais transmis : ni RPC, ni message).
  const deleteMsg = h('p', { class: 'msg', role: 'status' });
  const deleteConfirm = makeConfirm(t, {
    title: t.delete.confirmTitle,
    text: t.delete.confirmText,
    word: t.delete.word,
    okLabel: t.delete.confirmOk,
    onOk: async (msgEl, okBtn, cancelBtn) => {
      const { data, error } = await supabase.rpc('delete_my_account');
      if (error || !data?.ok) {
        msgEl.textContent = error ? ui.errors.generic : errorMessage(data?.error);
        okBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }
      msgEl.textContent = t.delete.success;
      // Fin de session : main.js renvoie vers l'écran de connexion.
      await supabase.auth.signOut();
    }
  });
  const deleteBtn = h('button', {
    class: 'btn danger', type: 'button',
    onclick: () => deleteConfirm.open(deleteBtn)
  }, t.delete.action);
  root.append(h('section', { class: 'card danger' },
    h('h2', {}, t.delete.title),
    h('p', {}, t.delete.text),
    deleteBtn,
    deleteMsg,
    deleteConfirm.panel));

  // 7 — À propos (version déployée + déconnexion).
  root.append(h('section', { class: 'card' },
    h('h2', {}, t.about.title),
    h('p', { class: 'muted' }, ui.questionnaireByline),
    h('p', { class: 'muted version' }, ui.home.buildInfo(APP_VERSION, COMMIT_REF)),
    h('p', { class: 'center' },
      h('button', { class: 'btn secondary', type: 'button', onclick: () => supabase.auth.signOut() },
        ui.home.logout))));

  // Chargements initiaux : mon prénom (préremplissage) et mes blocages.
  const { data: profile } = await supabase.from('profiles')
    .select('id, display_name')
    .eq('id', uid)
    .maybeSingle();
  nameInput.value = profile?.display_name ?? '';
  await loadBlocks();
}

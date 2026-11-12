import { h } from '../dom.js';
import { ui, errorMessage } from '../data/ui.fr.js';

// Appairage : mon code à donner, la saisie du code du partenaire, les demandes reçues.
export async function renderPairing(root, ctx, info = {}) {
  const { supabase, navigate } = ctx;
  const t = ui.pairing;
  const ht = ui.home;

  const codeEl = h('p', { class: 'code', 'aria-live': 'polite' }, '…');
  const codeMsg = h('p', { class: 'msg', role: 'status' });
  const sendMsg = h('p', { class: 'msg', role: 'status' });
  const listEl = h('div', { class: 'requests' });
  let currentCode = '';

  const setCode = (code) => { currentCode = code; codeEl.textContent = code; };

  const copyBtn = h('button', {
    class: 'btn', type: 'button',
    onclick: async () => {
      try { await navigator.clipboard.writeText(currentCode); codeMsg.textContent = ht.copied; }
      catch { codeMsg.textContent = ui.errors.generic; }
    }
  }, ht.copy);

  const shareBtn = navigator.share
    ? h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => navigator.share({ text: ht.shareText(currentCode) }).catch(() => {})
      }, ht.share)
    : null;

  const regenBtn = h('button', {
    class: 'link', type: 'button',
    onclick: async () => {
      if (!window.confirm(ht.regenerateConfirm)) return;
      const { data, error } = await supabase.rpc('regenerate_contact_code');
      if (error || !data?.ok) { codeMsg.textContent = errorMessage(data?.error); return; }
      setCode(data.code);
      codeMsg.textContent = ht.regenerated;
    }
  }, ht.regenerate);

  const codeInput = h('input', {
    type: 'text', required: true, maxlength: 20, autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', placeholder: t.codePlaceholder
  });
  const sendBtn = h('button', { class: 'btn', type: 'submit' }, t.send);
  const sendForm = h('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      sendBtn.disabled = true;
      sendMsg.textContent = '';
      const { data, error } = await supabase.rpc('send_pair_request', { p_code: codeInput.value.trim() });
      if (error) sendMsg.textContent = ui.errors.generic;
      else if (!data?.ok) sendMsg.textContent = errorMessage(data?.error);
      else { sendMsg.textContent = t.sent; codeInput.value = ''; }
      sendBtn.disabled = false;
    }
  },
    h('label', { class: 'field' }, h('span', {}, t.codeLabel), codeInput),
    sendBtn,
    sendMsg
  );

  root.append(
    h('header', { class: 'hero' },
      h('h1', {}, t.title),
      info.displayName ? h('p', { class: 'muted' }, `${ht.title}, ${info.displayName}`) : null),
    h('section', { class: 'card' },
      h('h2', {}, t.myCode),
      h('p', { class: 'muted' }, ht.codeLabel),
      codeEl,
      h('div', { class: 'row' }, copyBtn, shareBtn),
      codeMsg,
      regenBtn),
    h('section', { class: 'card' }, h('h2', {}, t.sendTitle), h('p', { class: 'muted' }, t.intro), sendForm),
    h('section', { class: 'card' }, h('h2', {}, t.requestsTitle), listEl)
  );

  // ⚠️ contact_code n'est jamais lisible par SELECT : uniquement my_contact_code().
  const [code, requests] = await Promise.all([
    supabase.rpc('my_contact_code'),
    supabase.rpc('list_incoming_requests')
  ]);
  if (code.error || !code.data) codeMsg.textContent = ui.errors.generic;
  else setCode(code.data);
  paintRequests(requests);

  function paintRequests({ data, error }) {
    if (error || !Array.isArray(data)) {
      listEl.replaceChildren(h('p', { class: 'muted' }, error ? ui.errors.generic : t.requestsEmpty));
      return;
    }
    if (!data.length) {
      listEl.replaceChildren(h('p', { class: 'muted' }, t.requestsEmpty));
      return;
    }
    listEl.replaceChildren(...data.map(requestCard));
  }

  function requestCard(row) {
    const msg = h('p', { class: 'msg', role: 'status' });
    const acceptBtn = h('button', { class: 'btn small', type: 'button' }, t.accept);
    const declineBtn = h('button', { class: 'btn small secondary', type: 'button' }, t.decline);
    const blockBtn = h('button', { class: 'link', type: 'button' }, t.block);

    const respond = async (accept, block, buttons) => {
      buttons.forEach((b) => { b.disabled = true; });
      msg.textContent = '';
      const { data, error } = await supabase.rpc('respond_pair_request', {
        p_request: row.request_id, p_accept: accept, p_block: block
      });
      if (error || !data?.ok) {
        msg.textContent = error ? ui.errors.generic : errorMessage(data.error);
        buttons.forEach((b) => { b.disabled = false; });
        return;
      }
      if (accept) { navigate({ name: 'home', notice: t.linked }); return; }
      msg.textContent = t.declined;
      const { data: rows, error: listError } = await supabase.rpc('list_incoming_requests');
      paintRequests({ data: rows, error: listError });
    };

    acceptBtn.addEventListener('click', () => respond(true, false, [acceptBtn, declineBtn]));
    declineBtn.addEventListener('click', () => respond(false, false, [acceptBtn, declineBtn]));
    blockBtn.addEventListener('click', () => {
      if (!window.confirm(t.blockConfirm(row.from_name))) return;
      respond(false, true, [acceptBtn, declineBtn, blockBtn]);
    });

    return h('div', { class: 'card request' },
      h('p', {}, t.requestFrom(row.from_name)),
      h('div', { class: 'row' }, acceptBtn, declineBtn),
      blockBtn,
      msg);
  }
}

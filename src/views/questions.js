import { h } from '../dom.js';
import { ui, errorMessage } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Écran de questions d'une seule catégorie : saisie au fil de l'eau, « Passer »
// sans pénalité, puis validation (verrouillage définitif des réponses).
export async function renderQuestions(root, ctx, categoryId) {
  const { supabase, session, navigate } = ctx;
  const t = ui.questions;
  const uid = session.user.id;
  const cat = content.categories.find((c) => c.id === Number(categoryId));

  let ready = false;
  let index = 0;
  let timer = null;

  const flushCurrent = async () => {
    if (!ready) return true;
    clearTimeout(timer);
    return sync(cat.questions[index].id);
  };
  const backBtn = h('button', {
    class: 'link', type: 'button',
    onclick: async () => { await flushCurrent(); navigate({ name: 'home' }); }
  }, t.backToCategories);

  if (!cat) {
    root.append(
      h('header', { class: 'hero' }, h('h1', {}, ui.appName)),
      h('section', { class: 'card' }, h('p', {}, t.notFound)),
      h('p', { class: 'center' }, backBtn));
    return;
  }

  const body = h('div', {});
  root.append(
    h('div', { class: 'topnav' }, backBtn),
    h('header', { class: 'hero' },
      h('h1', {}, cat.title),
      h('p', { class: 'muted' }, cat.subtitle)),
    body);
  body.append(h('p', { class: 'muted' }, ui.common.loading));

  // --- Chargement -----------------------------------------------------
  const { data: member, error: memberError } = await supabase
    .from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
  if (memberError || !member?.couple_id) {
    body.replaceChildren(h('section', { class: 'card' },
      h('p', {}, memberError ? ui.errors.generic : ui.errors.pas_de_couple)));
    return;
  }
  const coupleId = member.couple_id;

  const [answersRes, statusRes] = await Promise.all([
    supabase.from('answers').select('question_id, body, skipped')
      .eq('couple_id', coupleId).eq('user_id', uid).eq('category_id', cat.id),
    supabase.from('category_status').select('user_id, validated_at')
      .eq('couple_id', coupleId).eq('category_id', cat.id)
  ]);
  if (answersRes.error || statusRes.error) {
    body.replaceChildren(
      h('section', { class: 'card' }, h('p', {}, ui.errors.generic)),
      h('p', { class: 'center' },
        h('button', {
          class: 'link', type: 'button',
          onclick: () => navigate({ name: 'questions', categoryId: cat.id })
        }, t.retry)));
    return;
  }

  const myValidated = (statusRes.data ?? []).some((r) => r.user_id === uid && r.validated_at);
  const partnerValidated = (statusRes.data ?? []).some((r) => r.user_id !== uid && r.validated_at);

  if (myValidated) {
    body.replaceChildren(h('section', { class: 'card' },
      h('h2', {}, t.lockedTitle),
      h('p', {}, t.locked),
      h('p', { class: 'muted' }, partnerValidated ? t.revealed : t.waitPartner)));
    return;
  }

  // --- Brouillons -----------------------------------------------------
  const drafts = new Map();
  for (const q of cat.questions) {
    drafts.set(q.id, { body: '', skipped: false, editing: false, dirty: false, hasRow: false });
  }
  for (const row of answersRes.data ?? []) {
    const d = drafts.get(row.question_id);
    if (!d) continue;
    d.body = row.body ?? '';
    d.skipped = Boolean(row.skipped);
    d.hasRow = true;
  }

  const statusMsg = h('p', { class: 'msg', role: 'status' });
  const partnerNote = partnerValidated ? h('p', { class: 'msg' }, t.partnerDone) : null;

  // Sauvegarde d'une question : un seul upsert (onConflict couple/user/question).
  // Une mise à jour bloquée par la RLS ne renvoie pas d'erreur : on vérifie la ligne.
  async function sync(qid) {
    const d = drafts.get(qid);
    if (!d.dirty) return true;
    clearTimeout(timer);
    timer = null;
    const text = d.body.trim();
    let payload;
    if (d.skipped) {
      // Contrainte SQL : body doit être null quand skipped. « Passer » n'enregistre
      // donc aucune réponse — un texte tapé avant de passer n'est jamais partagé.
      payload = { skipped: true, body: null };
    } else if (!text) {
      // Sans texte : une ligne existante devient « passée », sinon rien à écrire.
      if (!d.hasRow) { d.dirty = false; return true; }
      payload = { skipped: true, body: null };
    } else {
      payload = { skipped: false, body: text };
    }

    const explicitSkip = d.skipped;
    const { data, error } = await supabase.from('answers').upsert({
      couple_id: coupleId,
      user_id: uid,
      category_id: cat.id,
      question_id: qid,
      body: payload.body,
      skipped: payload.skipped
    }, { onConflict: 'couple_id,user_id,question_id' }).select('question_id');
    if (error || !data?.length) {
      statusMsg.textContent = t.saveError;
      return false;
    }
    d.dirty = false;
    d.hasRow = true;
    d.skipped = payload.skipped;
    if (payload.skipped) {
      // Rien n'est conservé dans la base : l'affichage doit le refléter.
      d.body = '';
      // Champ vidé tout seul : on reste éditable pour éviter un verrouillage surprise.
      d.editing = !explicitSkip;
    } else {
      d.editing = false;
    }
    statusMsg.textContent = t.saved;
    return true;
  }

  async function validate() {
    clearTimeout(timer);
    validateBtn.disabled = true;
    statusMsg.textContent = '';
    for (const q of cat.questions) {
      const saved = await sync(q.id);
      if (!saved) { validateBtn.disabled = false; return; }
    }
    const done = cat.questions.filter((q) => {
      const d = drafts.get(q.id);
      return Boolean(d.body.trim()) || d.skipped;
    }).length;
    if (done < cat.questions.length) {
      statusMsg.textContent = errorMessage('categorie_incomplete');
      validateBtn.disabled = false;
      return;
    }
    const { data, error } = await supabase.rpc('validate_category', { p_category: cat.id });
    if (error || !data?.ok) {
      statusMsg.textContent = error ? ui.errors.generic : errorMessage(data?.error);
      validateBtn.disabled = false;
      return;
    }
    navigate({ name: 'home', notice: data.revealed ? t.revealed : t.waitPartner });
  }

  const validateBtn = h('button', { class: 'btn', type: 'button', onclick: validate }, t.validate);

  // --- Rendu d'une question ------------------------------------------
  function draw() {
    const q = cat.questions[index];
    const d = drafts.get(q.id);
    const isLast = index === cat.questions.length - 1;
    const passed = d.skipped && !d.editing;

    const ta = h('textarea', {
      rows: 6, maxlength: 4000, placeholder: t.placeholder, disabled: passed
    });
    ta.value = d.body;
    ta.addEventListener('input', () => {
      d.body = ta.value;
      // Rédiger annule un « passée » posé automatiquement (champ vidé puis repris).
      if (d.body.trim() && d.skipped) d.skipped = false;
      d.dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => sync(q.id), 800);
    });

    const toggleBtn = passed
      ? h('button', {
          class: 'link', type: 'button',
          onclick: async () => {
            clearTimeout(timer);
            if (d.body.trim()) { d.skipped = false; d.dirty = true; }
            d.editing = true;
            draw();
            await sync(q.id);
          }
        }, d.body.trim() ? t.resume : t.answerLater)
      : h('button', {
          class: 'link', type: 'button',
          onclick: async () => {
            clearTimeout(timer);
            if (d.body.trim() && !window.confirm(t.skipConfirm)) return;
            d.skipped = true;
            d.editing = false;
            d.dirty = true;
            await sync(q.id);
            draw();
          }
        }, t.skip);

    const prevBtn = h('button', {
      class: 'btn secondary', type: 'button', disabled: index === 0,
      onclick: async () => {
        clearTimeout(timer);
        const saved = await sync(q.id);
        if (!saved) return;
        index -= 1;
        draw();
      }
    }, t.prev);

    const nextBtn = isLast ? null : h('button', {
      class: 'btn', type: 'button',
      onclick: async () => {
        clearTimeout(timer);
        const saved = await sync(q.id);
        if (!saved) return;
        index += 1;
        draw();
      }
    }, t.next);

    body.replaceChildren(
      h('section', { class: 'card' },
        partnerNote,
        h('p', { class: 'progress' }, t.progress(index + 1, cat.questions.length)),
        h('div', { class: 'bar', 'aria-hidden': 'true' },
          h('span', { style: `width:${Math.round(((index + 1) / cat.questions.length) * 100)}%` })),
        h('label', { class: 'field' }, h('span', {}, t.answerLabel), ta),
        passed ? h('p', {}, h('span', { class: 'badge' }, t.skippedBadge)) : null,
        q.sensitive ? h('p', { class: 'muted hint' }, t.sensitiveHint) : null,
        statusMsg,
        toggleBtn,
        h('div', { class: 'row' }, prevBtn, nextBtn),
        isLast ? validateBtn : null,
        isLast ? h('p', { class: 'muted hint' }, t.validateHint) : null)
    );
    ready = true;
  }

  draw();
}

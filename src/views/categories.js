import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Accueil une fois lié(e) : les 12 catégories avec progression et statut du couple.
export async function renderCategories(root, ctx, info = {}) {
  const { supabase, session, navigate } = ctx;
  const t = ui.categories;
  const uid = session.user.id;
  const { coupleId, displayName } = info;

  const list = h('div', { class: 'categories' });
  root.append(
    h('header', { class: 'hero' },
      h('h1', {}, displayName ? `${ui.home.title}, ${displayName}` : t.title),
      h('p', { class: 'muted' }, t.intro)),
    list
  );

  await load();

  async function load() {
    list.replaceChildren(h('p', { class: 'muted' }, ui.common.loading));
    // ⚠️ Mes réponses uniquement (RLS + filtre). Statut : les deux partenaires.
    const [statusRes, answersRes] = await Promise.all([
      supabase.from('category_status').select('category_id, user_id, validated_at').eq('couple_id', coupleId),
      supabase.from('answers').select('category_id, question_id')
        .eq('couple_id', coupleId).eq('user_id', uid)
    ]);
    if (statusRes.error || answersRes.error) {
      list.replaceChildren(
        h('p', { class: 'msg' }, ui.errors.generic),
        h('button', { class: 'link', type: 'button', onclick: load }, t.retry));
      return;
    }

    const answeredCount = new Map();
    for (const row of answersRes.data ?? []) {
      answeredCount.set(row.category_id, (answeredCount.get(row.category_id) ?? 0) + 1);
    }
    const validatedByMe = new Set();
    const validatedByPartner = new Set();
    for (const row of statusRes.data ?? []) {
      if (!row.validated_at) continue;
      if (row.user_id === uid) validatedByMe.add(row.category_id);
      else validatedByPartner.add(row.category_id);
    }

    list.replaceChildren(...content.categories.map((cat) => {
      const answered = answeredCount.get(cat.id) ?? 0;
      const total = cat.questions.length;
      const iValidated = validatedByMe.has(cat.id);
      const partnerValidated = validatedByPartner.has(cat.id);

      let statusText;
      if (iValidated && partnerValidated) statusText = t.status.both;
      else if (iValidated) statusText = t.status.waiting;
      else if (partnerValidated) statusText = t.status.partnerDone;
      else if (answered > 0) statusText = t.status.progress(answered, total);
      else statusText = t.status.todo;

      const bar = answered > 0 && !iValidated
        ? h('div', { class: 'bar', 'aria-hidden': 'true' },
            h('span', { style: `width:${Math.round((answered / total) * 100)}%` }))
        : null;

      const clickable = !iValidated;
      const props = { class: clickable ? 'card category clickable' : 'card category' };
      if (clickable) {
        props.onclick = () => navigate({ name: 'questions', categoryId: cat.id });
        props['aria-label'] = t.openLabel(cat.title);
      }
      return h(clickable ? 'button' : 'div', props,
        h('span', { class: 'category-title' }, cat.title),
        h('span', { class: 'category-sub muted' }, cat.subtitle),
        h('span', { class: 'category-status' }, statusText),
        bar);
    }));
  }
}

import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';
import { isGoalComplete, isGoalEmpty } from '../goal.js';

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
    list,
    // Notre synthèse : le bilan du couple, en fin de parcours comme en cours.
    h('p', { class: 'center' },
      h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => navigate({ name: 'synthesis' })
      }, ui.synthesis.title))
  );

  await load();

  async function load() {
    list.replaceChildren(h('p', { class: 'muted' }, ui.common.loading));
    // ⚠️ Mes réponses uniquement (RLS + filtre). Statut : les deux partenaires.
    // L'objectif se lit par couple (la RLS ne le rend qu'après révélation).
    const [statusRes, answersRes, goalRes] = await Promise.all([
      supabase.from('category_status').select('category_id, user_id, validated_at').eq('couple_id', coupleId),
      supabase.from('answers').select('category_id, question_id')
        .eq('couple_id', coupleId).eq('user_id', uid),
      supabase.from('smart_goals').select('category_id, s_text, m_text, a_text, r_text, deadline')
        .eq('couple_id', coupleId)
    ]);
    if (statusRes.error || answersRes.error || goalRes.error) {
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
    const revealed = new Set();
    for (const row of statusRes.data ?? []) {
      if (!row.validated_at) continue;
      if (row.user_id === uid) validatedByMe.add(row.category_id);
      else validatedByPartner.add(row.category_id);
    }
    for (const cat of content.categories) {
      if (validatedByMe.has(cat.id) && validatedByPartner.has(cat.id)) revealed.add(cat.id);
    }
    const goalByCat = new Map();
    for (const row of goalRes.data ?? []) goalByCat.set(row.category_id, row);

    // Prochaine étape suggérée : le premier objectif révélé non terminé qui
    // suit le dernier terminé (aucun verrou : toutes les cartes restent
    // ouvrables, c'est une suggestion, pas une obligation).
    let lastDone = -1;
    const unfinished = [];
    for (const cat of content.categories) {
      if (!revealed.has(cat.id)) continue;
      if (isGoalComplete(goalByCat.get(cat.id))) lastDone = cat.id;
      else unfinished.push(cat.id);
    }
    const suggest = unfinished.find((id) => id > lastDone) ?? unfinished[0] ?? null;

    list.replaceChildren(...content.categories.map((cat) => {
      const answered = answeredCount.get(cat.id) ?? 0;
      const total = cat.questions.length;
      const iValidated = validatedByMe.has(cat.id);
      const partnerValidated = validatedByPartner.has(cat.id);
      const isRevealed = revealed.has(cat.id);

      let statusText;
      // Une fois révélée, la carte parle de l'objectif commun (SMART).
      if (isRevealed) {
        const goal = goalByCat.get(cat.id) ?? null;
        statusText = isGoalEmpty(goal)
          ? t.status.goalTodo
          : (isGoalComplete(goal) ? t.status.goalDone : t.status.goalDoing);
      }
      else if (iValidated) statusText = t.status.waiting;
      else if (partnerValidated) statusText = t.status.partnerDone;
      else if (answered > 0) statusText = t.status.progress(answered, total);
      else statusText = t.status.todo;

      const bar = answered > 0 && !iValidated
        ? h('div', { class: 'bar', 'aria-hidden': 'true' },
            h('span', { style: `width:${Math.round((answered / total) * 100)}%` }))
        : null;

      // Cliquable toujours : répondre, salle d'attente, ou l'objectif commun
      // dès que la catégorie est révélée.
      const target = isRevealed
        ? { name: 'smart', categoryId: cat.id }
        : (!iValidated
            ? { name: 'questions', categoryId: cat.id }
            : (partnerValidated ? { name: 'reveal', categoryId: cat.id } : { name: 'wait', categoryId: cat.id }));
      const done = isRevealed && isGoalComplete(goalByCat.get(cat.id));
      const classes = ['card', 'category'];
      if (target) classes.push('clickable');
      if (done) classes.push('is-done');
      const props = { class: classes.join(' ') };
      if (target) {
        props.onclick = () => navigate(target);
        props['aria-label'] = t.openLabel(cat.title);
      }
      return h(target ? 'button' : 'div', props,
        h('span', { class: 'category-title' }, cat.title),
        h('span', { class: 'category-sub muted' }, cat.subtitle),
        h('span', { class: 'category-status' }, statusText),
        bar,
        suggest === cat.id ? h('span', { class: 'badge suggest' }, t.suggest) : null);
    }));
  }
}

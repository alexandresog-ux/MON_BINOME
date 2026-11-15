import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Révélation : les réponses des deux partenaires, côte à côte.
// Condition d'accès : category_status porte un validated_at non nul pour les
// DEUX partenaires — c'est la base qui décide, jamais l'état local ni l'URL.
// Les réponses sont lues par couple + catégorie UNIQUEMENT : aucun filtre user_id
// côté interface (la RLS rend les réponses du partenaire seulement après révélation).
export async function renderReveal(root, ctx, categoryId) {
  const { supabase, session, navigate } = ctx;
  const t = ui.reveal;
  const uid = session.user.id;
  const catId = Number(categoryId);
  const cat = content.categories.find((c) => c.id === catId);

  let done = false;
  let mounted = false;
  let attempts = 0;
  let timer = null;

  function cleanup() {
    if (done) return;
    done = true;
    clearTimeout(timer);
  }
  if (typeof ctx.onLeave === 'function') ctx.onLeave(cleanup);

  function go(route) {
    cleanup();
    navigate(route);
  }

  const backBtn = h('button', {
    class: 'link', type: 'button', onclick: () => go({ name: 'home' })
  }, ui.questions.backToCategories);

  if (!cat) {
    root.append(
      h('div', { class: 'reveal' },
        h('div', { class: 'topnav' }, backBtn),
        h('header', { class: 'hero' }, h('h1', {}, ui.appName)),
        h('section', { class: 'card' }, h('p', {}, ui.questions.notFound))));
    return;
  }

  const body = h('div', {});
  // Tant que la condition de révélation n'est pas vérifiée, on n'affiche PAS
  // l'écran : seulement un chargement, puis éventuellement un renvoi à l'accueil.
  root.append(h('section', { class: 'card' }, h('p', {}, ui.common.loading)));

  function mountShell() {
    if (mounted) return;
    mounted = true;
    root.replaceChildren(
      h('div', { class: 'reveal' },
        h('div', { class: 'topnav' }, backBtn),
        h('header', { class: 'hero' },
          h('h1', {}, t.title),
          h('p', { class: 'muted' }, cat.title)),
        body));
    body.append(h('p', { class: 'muted' }, ui.common.loading));
  }

  function showError(message) {
    body.replaceChildren(
      h('section', { class: 'card' }, h('p', {}, message)),
      h('p', { class: 'center' },
        h('button', {
          class: 'link', type: 'button',
          onclick: () => { attempts = 0; load(); }
        }, t.retry)));
  }

  // Statut « révélé » mais une seule moitié revenue : on recharge. On n'affiche
  // jamais une moitié d'écran.
  function scheduleReload() {
    if (done) return;
    attempts += 1;
    if (attempts > 5) { showError(t.loadFailed); return; }
    body.replaceChildren(h('section', { class: 'card' }, h('p', {}, t.arriving)));
    timer = setTimeout(() => { if (!done) load(); }, 1500);
  }

  function answerBlock(name, row) {
    const empty = !row || row.skipped || !String(row.body ?? '').trim();
    return h('div', { class: 'answer' },
      h('p', { class: 'answer-who' }, name),
      empty
        ? h('p', { class: 'answer-skipped' }, h('span', { class: 'badge' }, t.skipped))
        : h('p', { class: 'answer-text' }, row.body));
  }

  function draw(mineRows, theirRows, myName, partnerName) {
    const sensitive = cat.questions.some((q) => q.sensitive);
    const kids = [];
    if (sensitive) {
      kids.push(h('section', { class: 'card warn' }, h('p', {}, t.sensitiveIntro)));
    }
    kids.push(
      h('section', { class: 'card' },
        h('h2', {}, t.rulesTitle),
        h('ul', { class: 'rules' }, content.common.golden_rules.map((r) => h('li', {}, r)))));
    for (const q of cat.questions) {
      kids.push(h('article', { class: 'card reveal-q' },
        h('h2', {}, q.text),
        h('div', { class: 'reveal-pair' },
          answerBlock(myName, mineRows.get(q.id)),
          answerBlock(partnerName, theirRows.get(q.id)))));
    }
    // Lot 4 fera suivre l'objectif SMART : pour l'instant on passe aux notes.
    kids.push(h('p', { class: 'center' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => go({ name: 'alignment', categoryId: catId })
      }, t.continue)));
    body.replaceChildren(...kids);
    attempts = 0;
  }

  async function load() {
    if (done) return;
    clearTimeout(timer);

    // 1. Mon couple. Un détachement pendant que l'écran est ouvert ramène à l'accueil.
    const { data: member, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
    if (done) return;
    if (memberError) { mountShell(); showError(ui.errors.generic); return; }
    if (!member?.couple_id) { go({ name: 'home', notice: t.unlinked }); return; }
    const coupleId = member.couple_id;

    // 2. Les DEUX validations, lues dans category_status (jamais leur contenu).
    const { data: statusRows, error: statusError } = await supabase
      .from('category_status').select('user_id, validated_at')
      .eq('couple_id', coupleId).eq('category_id', catId);
    if (done) return;
    if (statusError) { mountShell(); showError(ui.errors.generic); return; }
    const rows = statusRows ?? [];
    const mineOk = rows.some((r) => r.user_id === uid && r.validated_at);
    const theirsOk = rows.some((r) => r.user_id !== uid && r.validated_at);
    if (!mineOk || !theirsOk) { go({ name: 'home', notice: t.notRevealed }); return; }

    mountShell();

    // 3. Prénoms : liste explicite des colonnes (jamais select('*')).
    const { data: people, error: peopleError } = await supabase
      .from('profiles').select('id, display_name');
    if (done) return;
    if (peopleError) { showError(ui.errors.generic); return; }
    const names = new Map((people ?? []).map((p) => [p.id, p.display_name]));
    const partnerId = (people ?? []).map((p) => p.id).find((id) => id !== uid) ?? null;
    const myName = names.get(uid) || t.mine;
    const partnerName = (partnerId && names.get(partnerId)) || t.theirs;

    // 4. Les réponses : couple + catégorie. Aucun filtre user_id : la séparation
    //    se fait en mémoire, sur les lignes revenues.
    const { data: answers, error: answersError } = await supabase
      .from('answers').select('question_id, user_id, body, skipped')
      .eq('couple_id', coupleId).eq('category_id', catId);
    if (done) return;
    if (answersError) { showError(ui.errors.generic); return; }

    const byUser = new Map();
    for (const row of answers ?? []) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Map());
      byUser.get(row.user_id).set(row.question_id, row);
    }
    const mineRows = byUser.get(uid);
    const otherId = [...byUser.keys()].find((id) => id !== uid);
    const theirRows = otherId ? byUser.get(otherId) : null;
    if (!mineRows || !theirRows) { scheduleReload(); return; }

    draw(mineRows, theirRows, myName, partnerName);
  }

  await load();
}

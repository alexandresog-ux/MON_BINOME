import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Notes d'alignement (1 à 10) : chacun note après la révélation des réponses.
// On lit `alignment` par couple + catégorie SANS filtre user_id : c'est la RLS
// qui décide (la note du partenaire n'apparaît que quand les deux lignes existent),
// on sépare ensuite par user_id dans le code. Aucun cache local des notes.
export async function renderAlignment(root, ctx, categoryId) {
  const { supabase, session, navigate } = ctx;
  const t = ui.alignment;
  const label = content.common.alignment.label;
  const gap = content.common.alignment.deep_talk_gap;
  const uid = session.user.id;
  const catId = Number(categoryId);
  const cat = content.categories.find((c) => c.id === catId);

  let done = false;
  let mounted = false;
  let coupleId = null;
  let channel = null;
  let ticker = null;
  const cleanups = [];

  function cleanup() {
    if (done) return;
    done = true;
    clearInterval(ticker);
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    if (channel) {
      const ch = channel;
      channel = null;
      try { supabase.removeChannel(ch); } catch (err) { console.error(err); }
    }
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
    root.append(h('div', { class: 'align' },
      h('div', { class: 'topnav' }, backBtn),
      h('header', { class: 'hero' }, h('h1', {}, ui.appName)),
      h('section', { class: 'card' }, h('p', {}, ui.questions.notFound))));
    return;
  }

  // La comparaison n'apparaît qu'avec les DEUX lignes revenues par la base.
  const info = h('p', { class: 'msg', role: 'status' });
  const status = h('p', { class: 'msg', role: 'status' });
  const body = h('div', {});
  root.append(h('section', { class: 'card' }, h('p', {}, ui.common.loading)));

  function mountShell() {
    if (mounted) return;
    mounted = true;
    // .align élargit la colonne (voir style.css) : 10 boutons sur une ligne,
    // deux rangées sur mobile, sans débordement.
    root.replaceChildren(
      h('div', { class: 'align' },
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
        h('button', { class: 'link', type: 'button', onclick: () => load() }, t.retry)));
  }

  function scoreCard(name, score) {
    return h('div', { class: 'score-card' },
      h('p', { class: 'who' }, name),
      h('p', { class: 'val' }, String(score)));
  }

  const pickScore = (ev) => Number((ev?.currentTarget ?? ev?.target)?.textContent);

  function draw(mine, theirs, myName, partnerName) {
    const mineScore = mine ? Number(mine.score) : null;
    const compared = Boolean(mine && theirs);
    const grid = h('div', { class: 'score-grid', role: 'group', 'aria-label': label },
      Array.from({ length: 10 }, (_, i) => i + 1).map((n) => h('button', {
        class: `score${mineScore === n ? ' current' : ''}`,
        type: 'button',
        disabled: compared,
        'aria-pressed': mineScore === n ? 'true' : 'false',
        'aria-label': t.scoreLabel(n),
        onclick: async (ev) => { await save(pickScore(ev)); }
      }, String(n))));

    const kids = [
      h('section', { class: 'card' },
        h('h2', { class: 'align-label' }, label),
        h('div', { class: 'legend' }, h('span', {}, t.legendMin), h('span', {}, t.legendMax)),
        grid,
        info,
        status)
    ];
    if (compared) {
      const diff = Math.abs(Number(mine.score) - Number(theirs.score));
      kids.push(h('section', { class: 'card' },
        h('div', { class: 'align-pair' },
          scoreCard(myName, mine.score),
          scoreCard(partnerName, theirs.score)),
        h('p', {}, diff >= gap ? content.common.alignment.deep_talk_message : t.encouragement)));
    }
    kids.push(h('div', { class: 'row' },
      h('button', { class: 'btn secondary', type: 'button', onclick: () => load() }, t.refresh),
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => go(mine ? { name: 'smart', categoryId: catId } : { name: 'home' })
      }, mine ? t.continueGoal : t.continue)));
    body.replaceChildren(...kids);
    info.textContent = !compared && mine ? t.recorded : '';
  }

  async function save(score) {
    if (done || !coupleId) return;
    // Validation côté client : entier de 1 à 10, sinon rien n'est envoyé.
    if (!Number.isInteger(score) || score < 1 || score > 10) return;
    status.textContent = '';
    let res;
    try {
      res = await supabase.from('alignment').upsert({
        couple_id: coupleId,
        user_id: uid,
        category_id: catId,
        score
      }, { onConflict: 'couple_id,user_id,category_id' }).select('score');
    } catch {
      res = { data: null, error: { code: '42501' } };
    }
    if (done) return;
    const { data, error } = res ?? {};
    if (error && error.code !== '42501') { status.textContent = t.saveError; return; }
    // Refus de la base : 42501 ou 0 ligne retournée = les deux notes sont verrouillées.
    if (error?.code === '42501' || !data?.length) {
      status.textContent = t.locked;
      await load();
      return;
    }
    await load();
  }

  function startChannel() {
    if (done || channel || !coupleId) return;
    const ch = supabase.channel('align-' + coupleId);
    channel = ch;
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'alignment', filter: `couple_id=eq.${coupleId}` },
      () => { load(); })
      .subscribe((st) => {
        if (done || channel !== ch) return;
        if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          channel = null;
          try { supabase.removeChannel(ch); } catch (err) { console.error(err); }
        }
      });
  }

  async function load() {
    if (done) return;

    // 1. Mon couple : un détachement pendant l'écran ramène à l'accueil.
    const { data: member, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
    if (done) return;
    if (memberError) { mountShell(); showError(ui.errors.generic); return; }
    if (!member?.couple_id) { go({ name: 'home', notice: t.unlinked }); return; }
    coupleId = member.couple_id;

    // 2. La catégorie doit être révélée (les deux validations) pour noter.
    const { data: statusRows, error: statusError } = await supabase
      .from('category_status').select('user_id, validated_at')
      .eq('couple_id', coupleId).eq('category_id', catId);
    if (done) return;
    if (statusError) { mountShell(); showError(ui.errors.generic); return; }
    const seen = statusRows ?? [];
    const mineOk = seen.some((r) => r.user_id === uid && r.validated_at);
    const theirsOk = seen.some((r) => r.user_id !== uid && r.validated_at);
    if (!mineOk || !theirsOk) { go({ name: 'home', notice: t.notRevealed }); return; }

    mountShell();

    // 3. Les notes (couple + catégorie, sans filtre user_id) et les prénoms.
    const [alignRes, peopleRes] = await Promise.all([
      supabase.from('alignment').select('category_id, user_id, score')
        .eq('couple_id', coupleId).eq('category_id', catId),
      supabase.from('profiles').select('id, display_name')
    ]);
    if (done) return;
    if (alignRes.error || peopleRes.error) { showError(ui.errors.generic); return; }

    const rows = alignRes.data ?? [];
    const mine = rows.find((r) => r.user_id === uid) ?? null;
    const theirs = rows.find((r) => r.user_id !== uid) ?? null;
    const people = peopleRes.data ?? [];
    const names = new Map(people.map((p) => [p.id, p.display_name]));
    const partnerId = people.map((p) => p.id).find((id) => id !== uid) ?? null;
    draw(mine, theirs, names.get(uid) || t.me, (partnerId && names.get(partnerId)) || t.theirs);

    startChannel();
  }

  // Rechargement complet à chaque événement Realtime : on ne se fie jamais au
  // contenu de l'événement, seulement à ce que la base renvoie.
  const onVisible = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', onVisible);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
  // Filet de sécurité : Realtime peut manquer un événement.
  ticker = setInterval(() => { if (!done) load(); }, 20000);

  await load();
}

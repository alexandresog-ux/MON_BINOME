import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';

// Salle d'attente : j'ai validé, mon partenaire non.
// On ne lit QUE category_status (validé ou non, jamais le contenu) : le reste
// est décidé par la RLS au moment de la révélation.
export async function renderWaiting(root, ctx, categoryId) {
  const { supabase, session, navigate } = ctx;
  const t = ui.waiting;
  const uid = session.user.id;
  const catId = Number(categoryId);
  const cat = content.categories.find((c) => c.id === catId);

  const msg = h('p', { class: 'msg', role: 'status' });
  const mineEl = h('p', { class: 'statusline ok' });
  const partnerEl = h('p', { class: 'statusline' });

  if (!cat) {
    root.append(
      h('header', { class: 'hero' }, h('h1', {}, ui.appName)),
      h('section', { class: 'card' }, h('p', {}, ui.questions.notFound)),
      h('p', { class: 'center' },
        h('button', { class: 'link', type: 'button', onclick: () => navigate({ name: 'home' }) },
          ui.questions.backToCategories)));
    return;
  }

  const refreshBtn = h('button', { class: 'btn secondary', type: 'button', onclick: () => recheck() }, t.refresh);
  const backBtn = h('button', { class: 'link', type: 'button', onclick: () => go({ name: 'home' }) },
    ui.questions.backToCategories);

  root.append(
    h('div', { class: 'topnav' }, backBtn),
    h('header', { class: 'hero' },
      h('h1', {}, t.title),
      h('p', { class: 'muted' }, cat.title)),
    h('section', { class: 'card' },
      h('p', {}, t.intro),
      mineEl,
      partnerEl,
      msg,
      refreshBtn));

  msg.textContent = ui.common.loading;

  let coupleId = null;
  let channel = null;
  let retry = 0;
  let done = false;
  const cleanups = [];

  function cleanup() {
    if (done) return;
    done = true;
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
    if (channel) {
      const ch = channel;
      channel = null;
      try { supabase.removeChannel(ch); } catch (err) { console.error(err); }
    }
  }
  // Débranché à chaque changement d'écran (main.js appelle les hooks de sortie).
  if (typeof ctx.onLeave === 'function') ctx.onLeave(cleanup);

  function go(route) {
    cleanup();
    navigate(route);
  }

  async function recheck() {
    if (done || !coupleId) return;
    if (!navigator.onLine) { msg.textContent = t.offline; }
    // 0 ligne retournée par la RLS = pas d'erreur : on lit donc explicitement le statut.
    const { data, error } = await supabase.from('category_status')
      .select('user_id, validated_at')
      .eq('couple_id', coupleId).eq('category_id', catId);
    if (done) return;
    if (error) { msg.textContent = ui.errors.generic; return; }
    const rows = data ?? [];
    const mine = rows.some((r) => r.user_id === uid && r.validated_at);
    const theirs = rows.some((r) => r.user_id !== uid && r.validated_at);
    if (!mine) { go({ name: 'home', notice: t.notValidated }); return; }
    if (theirs) { go({ name: 'home', notice: t.bothValidated }); return; }
    mineEl.textContent = t.mineOk;
    partnerEl.textContent = t.partnerPending;
    msg.textContent = navigator.onLine ? t.waitingFor : t.offline;
  }

  function startChannel() {
    if (done || channel || !coupleId) return;
    const ch = supabase.channel('statut-' + coupleId);
    channel = ch;
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'category_status', filter: `couple_id=eq.${coupleId}` },
      () => { recheck(); })
      .subscribe((status) => {
        if (done || channel !== ch) return;
        if (status === 'SUBSCRIBED') { retry = 0; recheck(); return; }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          dropAndRetry(status);
        }
      });
  }

  function dropAndRetry(status) {
    if (done || !channel) return;
    const ch = channel;
    channel = null;
    try { supabase.removeChannel(ch); } catch (err) { console.error(err); }
    if (retry >= 5) { msg.textContent = t.reconnectFailed; return; }
    retry += 1;
    msg.textContent = t.reconnecting;
    setTimeout(() => {
      if (done) return;
      startChannel();
      recheck();
    }, Math.min(1000 * retry, 8000));
  }

  const onVisible = () => { if (document.visibilityState === 'visible') recheck(); };
  const onOffline = () => { msg.textContent = t.offline; };
  const onOnline = () => { retry = 0; startChannel(); recheck(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  cleanups.push(() => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
  });

  const { data: member, error: memberError } = await supabase
    .from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
  if (done) return;
  if (memberError || !member?.couple_id) {
    msg.textContent = memberError ? ui.errors.generic : ui.errors.pas_de_couple;
    return;
  }
  coupleId = member.couple_id;

  startChannel();
  await recheck();
}

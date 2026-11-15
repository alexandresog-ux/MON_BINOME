import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';
import {
  GOAL_TEXT_KEYS, GOAL_FIELD_KEYS, GOAL_COLS, GOAL_SELECT, isGoalComplete
} from '../goal.js';

// Date du jour au format des champs <input type="date"> (locale, pas UTC).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Objectif SMART commun d'une catégorie : les 4 lettres (S, M, A, R) puis
// l'échéance. Chacun écrit de son côté, l'écran se resynchronise tout seul.
//
// Règles de saisie :
//  - aucun texte n'est jamais perdu : brouillon conservé à chaque rechargement ;
//  - un champ focalisé n'est jamais réécrit (le curseur ne bouge pas) ;
//  - une mise à jour porte le filtre `updated_at` (chaîne brute de la base) :
//    0 ligne = soit une écriture refusée, soit une modification concurrente de
//    ton ou ta partenaire (on recharge sa version, sans écraser ton brouillon).
export async function renderSmart(root, ctx, categoryId) {
  const { supabase, session, navigate } = ctx;
  const t = ui.smart;
  const uid = session.user.id;
  const catId = Number(categoryId);
  const cat = content.categories.find((c) => c.id === catId);

  let done = false;
  let mounted = false;
  let formBuilt = false;
  let coupleId = null;
  let hasRow = false;
  // Chaîne telle que renvoyée par la base : jamais convertie en Date (les
  // microsecondes doivent arriver intactes dans le filtre updated_at).
  let rowUpdatedAt = null;
  let focusKey = null;
  let channel = null;
  let ticker = null;
  let msgKind = null;
  let chain = Promise.resolve();
  const fields = new Map();   // clé -> { el, value, base, timer, count, held }
  const pending = new Map();  // clé -> valeur serveur vue pendant la saisie
  const names = new Map();
  const cleanups = [];

  const statusMsg = h('p', { class: 'msg', role: 'status' });
  const metaEl = h('p', { class: 'muted hint' });
  const completeBox = h('div', {});
  const body = h('div', {});
  const formCard = h('section', { class: 'card' });

  function cleanup() {
    if (done) return;
    // Dernier enregistrement des brouillons (aucune saisie perdue en quittant).
    void flush();
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

  // Toute sortie d'écran termine d'abord la sauvegarde en cours.
  async function leaveTo(route) {
    await flushAll();
    go(route);
  }

  function setMsg(text, kind = null) {
    if (done) return;
    statusMsg.textContent = text;
    msgKind = text ? kind : null;
  }

  function nextRoute() {
    return catId >= content.categories.length
      ? { name: 'home' }
      : { name: 'smart', categoryId: catId + 1 };
  }

  const backBtn = h('button', {
    class: 'link', type: 'button', onclick: () => leaveTo({ name: 'home' })
  }, ui.questions.backToCategories);

  if (!cat) {
    root.append(h('div', { class: 'goal' },
      h('div', { class: 'topnav' }, backBtn),
      h('header', { class: 'hero' }, h('h1', {}, ui.appName)),
      h('section', { class: 'card' }, h('p', {}, ui.questions.notFound))));
    return;
  }

  root.append(h('section', { class: 'card' }, h('p', {}, ui.common.loading)));

  function mountShell() {
    if (mounted) return;
    mounted = true;
    root.replaceChildren(
      h('div', { class: 'goal' },
        h('div', { class: 'topnav' },
          backBtn,
          h('button', {
            class: 'link', type: 'button',
            onclick: () => leaveTo({ name: 'reveal', categoryId: catId })
          }, t.seeAnswers)),
        h('header', { class: 'hero' },
          h('h1', {}, cat.smart_prompt),
          h('p', { class: 'muted' }, cat.title)),
        body));
    body.append(h('p', { class: 'muted' }, ui.common.loading));
  }

  function showError(message) {
    if (done) return;
    // Le formulaire est déjà là (et peut contenir des brouillons) : on ne le
    // remplace pas, on signale l'erreur et on laisse la sauvegarde reprendre.
    if (formBuilt) { setMsg(message, 'error'); return; }
    body.replaceChildren(
      h('section', { class: 'card' }, h('p', {}, message)),
      h('p', { class: 'center' },
        h('button', { class: 'link', type: 'button', onclick: () => load() }, t.retry)));
  }

  // --- Formulaire -----------------------------------------------------
  function applyCount(f) {
    if (f.count) f.count.textContent = t.counter(f.value.length);
  }

  function bind(f, key) {
    f.el.addEventListener('focus', () => { focusKey = key; });
    f.el.addEventListener('blur', () => {
      if (focusKey !== key) return;
      focusKey = null;
      // Valeur serveur observée pendant la saisie : on la reprend maintenant
      // que le champ n'est plus focalisé.
      if (!pending.has(key)) return;
      const fresh = pending.get(key);
      pending.delete(key);
      const wasClean = f.value === f.base;
      f.base = fresh;
      if (wasClean) { f.value = fresh; f.el.value = fresh; applyCount(f); }
      if (f.value === f.base) f.held = false;
    });
    f.el.addEventListener('input', () => {
      const raw = f.el.value;
      if (key === 'deadline' && raw && raw < todayISO()) {
        // Échéance passée : rien n'est retenu, rien n'est envoyé.
        setMsg(t.deadlinePast, 'past');
        f.el.value = f.value;
        return;
      }
      if (msgKind === 'past') setMsg('');
      f.value = raw;
      f.held = false;
      applyCount(f);
      clearTimeout(f.timer);
      f.timer = setTimeout(() => { void flush(); }, 800);
    });
  }

  function buildForm() {
    if (formBuilt) return;
    formBuilt = true;
    const kids = [h('p', {}, t.intro)];
    for (const key of GOAL_TEXT_KEYS) {
      const letter = content.common.smart[key.toUpperCase()];
      const ta = h('textarea', { rows: 4, maxlength: 2000 });
      const count = h('span', { class: 'counter' }, t.counter(0));
      kids.push(h('label', { class: 'field' },
        h('span', {}, `${key.toUpperCase()} — ${letter.name}`),
        ta,
        h('span', { class: 'hint' }, letter.prompt),
        count));
      const f = { el: ta, value: '', base: '', timer: null, count, held: false };
      fields.set(key, f);
      bind(f, key);
    }
    const date = h('input', { type: 'date', min: todayISO() });
    fields.set('deadline', { el: date, value: '', base: '', timer: null, count: null, held: false });
    bind(fields.get('deadline'), 'deadline');
    kids.push(
      h('label', { class: 'field' },
        h('span', {}, t.deadlineLabel),
        date,
        h('span', { class: 'hint' }, content.common.smart.T.prompt)),
      statusMsg,
      metaEl,
      completeBox,
      h('div', { class: 'row' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () => load() }, t.refresh)));
    formCard.replaceChildren(...kids);
    body.replaceChildren(formCard);
  }

  function drawMeta(row) {
    if (done) return;
    if (!row) { metaEl.textContent = ''; return; }
    const name = row.updated_by ? names.get(row.updated_by) : null;
    metaEl.textContent = name ? t.lastBy(name) : t.lastUnknown;
  }

  function drawComplete(row) {
    if (done) return;
    const kids = [];
    if (isGoalComplete(row)) {
      kids.push(
        h('h2', {}, t.completeTitle),
        h('p', {}, t.complete),
        h('button', {
          class: 'btn', type: 'button', onclick: () => leaveTo(nextRoute())
        }, t.completeNext));
    }
    completeBox.replaceChildren(...kids);
  }

  // Resynchronisation depuis la base : on ne touche jamais à un champ focalisé
  // ni à un champ dont le texte diverge de la valeur serveur (brouillon).
  function applyRow(row) {
    for (const key of GOAL_FIELD_KEYS) {
      const f = fields.get(key);
      if (!f) continue;
      const fresh = row ? String(row[GOAL_COLS[key]] ?? '') : '';
      if (key === focusKey) {
        if (fresh !== f.base) pending.set(key, fresh); else pending.delete(key);
        continue;
      }
      pending.delete(key);
      const wasClean = f.value === f.base;
      f.base = fresh;
      if (wasClean) { f.value = fresh; f.el.value = fresh; applyCount(f); }
      if (f.value === f.base) f.held = false;
    }
    hasRow = Boolean(row);
    rowUpdatedAt = row ? row.updated_at : null;
    drawMeta(row);
    drawComplete(row);
  }

  // --- Écritures ------------------------------------------------------
  const flush = () => {
    chain = chain.then(() => doFlush(0)).catch(() => {});
    return chain;
  };
  const flushAll = async () => { await flush(); };

  async function fetchGoal() {
    if (!coupleId) return { row: null };
    const { data, error } = await supabase.from('smart_goals')
      .select(GOAL_SELECT).eq('couple_id', coupleId).eq('category_id', catId).maybeSingle();
    if (error) return { row: null };
    return { row: data ?? null };
  }

  // Un seul enregistrement à la fois (chaîne de promesses) : les champs
  // sales sont écrits ensemble, avec le timestamp de la dernière lecture.
  async function doFlush(attempt, onlyKeys) {
    if (!coupleId) return;
    const sent = [];
    for (const [key, f] of fields) {
      if (f.timer) { clearTimeout(f.timer); f.timer = null; }
      if (onlyKeys && !onlyKeys.includes(key)) continue;
      // `held` = conflit signalé : le brouillon attend la saisie suivante.
      if (f.held) continue;
      if (f.value === f.base) continue;
      if (key === 'deadline' && f.value && f.value < todayISO()) {
        setMsg(t.deadlinePast, 'past');
        continue;
      }
      sent.push({ key, value: f.value, baseAt: f.base });
    }
    if (!sent.length) return;

    const patch = { couple_id: coupleId, category_id: catId };
    for (const s of sent) {
      patch[GOAL_COLS[s.key]] = s.key === 'deadline' ? (s.value || null) : s.value;
    }
    const stampAt = rowUpdatedAt;

    let res;
    try {
      res = hasRow
        ? await supabase.from('smart_goals').update(patch)
            .eq('couple_id', coupleId).eq('category_id', catId)
            .eq('updated_at', stampAt).select(GOAL_SELECT)
        : await supabase.from('smart_goals').upsert(patch, {
            onConflict: 'couple_id,category_id', ignoreDuplicates: true
          }).select(GOAL_SELECT);
    } catch {
      res = { data: null, error: { code: '42501' } };
    }
    if (!coupleId) return;

    const { data, error } = res ?? {};
    if (error) {
      // 42501 : les politiques ont refusé l'écriture. On recharge, sans rien
      // perdre de ce qui est affiché (les brouillons restent en mémoire).
      if (error.code === '42501') { setMsg(t.refused, 'refused'); await load(); }
      else setMsg(t.saveError, 'error');
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    if (rows.length) {
      applyRow(rows[0]);
      setMsg(t.saved, 'saved');
      return;
    }

    // 0 ligne : rien n'a été écrit. On relit pour distinguer un refus des
    // politiques (la ligne n'a pas bougé) d'une modification concurrente.
    const row = (await fetchGoal()).row;
    if (!row || (hasRow && row.updated_at === stampAt)) {
      setMsg(t.refused, 'refused');
      await load();
      return;
    }
    // Modification concurrente : on recharge la version du serveur en gardant
    // les brouillons. Trois cas par champ écrit :
    //  - la valeur est déjà en base (rien à faire) ;
    //  - ton ou ta partenaire n'a pas touché ce champ (on réessaie une fois) ;
    //  - il l'a touché : conflit signalé, le brouillon attend ta saisie suivante.
    const retryable = [];
    const conflictKeys = [];
    for (const s of sent) {
      const fresh = String(row[GOAL_COLS[s.key]] ?? '');
      if (fresh === s.value) continue;
      if (fresh === s.baseAt) retryable.push(s.key);
      else conflictKeys.push(s.key);
    }
    applyRow(row);
    for (const key of conflictKeys) {
      const f = fields.get(key);
      if (f) f.held = true;
    }
    if (conflictKeys.length) setMsg(t.conflict, 'conflict');
    if (retryable.length) {
      if (attempt === 0) await doFlush(1, retryable);
      else setMsg(t.conflict, 'conflict');
    }
  }

  // --- Temps réel -----------------------------------------------------
  function startChannel() {
    if (done || channel || !coupleId) return;
    const ch = supabase.channel('smart-' + coupleId);
    channel = ch;
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'smart_goals', filter: `couple_id=eq.${coupleId}` },
      () => { load(); })
      .subscribe((st) => {
        if (done || channel !== ch) return;
        if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          channel = null;
          try { supabase.removeChannel(ch); } catch (err) { console.error(err); }
        }
      });
  }

  // --- Chargement -----------------------------------------------------
  async function load() {
    if (done) return;

    // 1. Mon couple : un détachement pendant l'écran ramène à l'accueil.
    const { data: member, error: memberError } = await supabase
      .from('couple_members').select('couple_id').eq('user_id', uid).maybeSingle();
    if (done) return;
    if (memberError) { mountShell(); showError(ui.errors.generic); return; }
    if (!member?.couple_id) { go({ name: 'home', notice: t.unlinked }); return; }
    coupleId = member.couple_id;

    // 2. La catégorie doit être révélée (les deux validations) AVANT toute
    //    lecture de l'objectif : jamais d'écran ni de requête sinon.
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

    // 3. L'objectif (couple + catégorie) et les prénoms.
    const [goalRes, peopleRes] = await Promise.all([
      supabase.from('smart_goals').select(GOAL_SELECT)
        .eq('couple_id', coupleId).eq('category_id', catId).maybeSingle(),
      supabase.from('profiles').select('id, display_name')
    ]);
    if (done) return;
    if (goalRes.error || peopleRes.error) { showError(ui.errors.generic); return; }

    names.clear();
    for (const p of peopleRes.data ?? []) names.set(p.id, p.display_name);

    buildForm();
    applyRow(goalRes.data ?? null);
    startChannel();
  }

  // Rechargement complet à chaque événement Realtime : on ne se fie jamais au
  // contenu de l'événement, seulement à ce que la base renvoie.
  const onVisible = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', onVisible);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
  // Filet de sécurité : Realtime peut manquer un événement.
  ticker = setInterval(() => { if (!done) load(); }, 20000);

  // Avant un rechargement demandé par l'utilisateur (bannière « nouvelle
  // version »), on termine la sauvegarde en cours : rien n'est perdu.
  const beforeReload = (ev) => { ev.detail?.flush?.(flushAll()); };
  window.addEventListener('app:before-reload', beforeReload);
  cleanups.push(() => window.removeEventListener('app:before-reload', beforeReload));

  await load();
}

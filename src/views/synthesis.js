import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import content from '../data/questions.fr.json';
import { isGoalComplete, isGoalEmpty, GOAL_TEXT_KEYS, GOAL_COLS } from '../goal.js';

// Bilan final du couple (table couple_review) : 4 textes (3000 car. max) puis
// la date du prochain point. Même écriture à deux que l'écran SMART :
// création par upsert { ignoreDuplicates }, concurrence optimiste sur
// updated_at conservé comme chaîne brute, brouillons jamais perdus.
const REVIEW_TEXT_KEYS = [
  'top_agreements', 'topics_to_explore', 'shared_non_negotiables', 'disputed_non_negotiables'
];
const REVIEW_FIELD_KEYS = [...REVIEW_TEXT_KEYS, 'next_review_date'];
const REVIEW_SELECT = 'couple_id, top_agreements, topics_to_explore, shared_non_negotiables,'
  + ' disputed_non_negotiables, next_review_date, updated_by, updated_at';

// Date du jour au format des champs <input type="date"> (locale, pas UTC).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayFR() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
// ISO « 2026-06-15 » → « 15/06/2026 » pour l'affichage.
function dateFR(iso) {
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
}

// Notre synthèse : le tableau des 12 catégories (statut, notes des DEUX
// partenaires, objectif SMART, complétude), le bilan final et l'export PDF.
// Lectures : couple_id UNIQUEMENT (category_status, alignment, smart_goals,
// couple_review) — c'est la RLS qui décide. Aucune lecture de la table
// answers : ni le contenu des réponses à l'écran, ni dans l'impression.
export async function renderSynthesis(root, ctx) {
  const { supabase, session, navigate } = ctx;
  const t = ui.synthesis;
  const uid = session.user.id;

  let done = false;
  let mounted = false;
  let formBuilt = false;
  let drawn = false;
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
  let mineName = '';
  let partnerName = '';
  const fields = new Map();   // clé -> { el, value, base, timer, count, held }
  const pending = new Map();  // clé -> valeur serveur vue pendant la saisie
  const names = new Map();
  const cleanups = [];

  const statusMsg = h('p', { class: 'msg', role: 'status' });
  const metaEl = h('p', { class: 'muted hint no-print' });
  const tableCard = h('section', { class: 'card' });
  const goalsCard = h('section', { class: 'card goals-card' });
  const formCard = h('section', { class: 'card' });
  const printBox = h('div', { class: 'print-only' });
  const heroWho = h('p', { class: 'muted' });
  const body = h('div', {});

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

  const backBtn = h('button', {
    class: 'link', type: 'button', onclick: () => leaveTo({ name: 'home' })
  }, ui.questions.backToCategories);

  root.append(h('section', { class: 'card' }, h('p', {}, ui.common.loading)));

  function mountShell() {
    if (mounted) return;
    mounted = true;
    root.replaceChildren(
      h('div', { class: 'synthesis' },
        h('div', { class: 'topnav' }, backBtn),
        h('header', { class: 'hero' },
          h('p', { class: 'print-only print-brand' }, ui.appName),
          h('h1', {}, t.title),
          h('p', { class: 'muted' }, ui.questionnaireSubtitle),
          heroWho),
        body));
    body.append(h('p', { class: 'muted' }, ui.common.loading));
  }

  function showError(message) {
    if (done) return;
    // Le bilan est déjà là (et peut contenir des brouillons) : on ne le
    // remplace pas, on signale l'erreur et on laisse la sauvegarde reprendre.
    if (formBuilt) { setMsg(message, 'error'); return; }
    body.replaceChildren(
      h('section', { class: 'card' }, h('p', {}, message)),
      h('p', { class: 'center' },
        h('button', { class: 'link', type: 'button', onclick: () => load() }, t.retry)));
  }

  // --- Tableau des 12 catégories --------------------------------------
  function drawTable(statusRows, alignRows, goalRows) {
    const head = h('tr', {},
      h('th', { scope: 'col' }, t.colCategory),
      h('th', { scope: 'col' }, t.colStatus),
      h('th', { scope: 'col' }, mineName),
      h('th', { scope: 'col' }, partnerName),
      h('th', { scope: 'col' }, t.colGoal),
      h('th', { scope: 'col' }, t.colComplete));

    const rows = content.categories.map((cat) => {
      const seen = statusRows.filter((r) => r.category_id === cat.id && r.validated_at);
      const mineOk = seen.some((r) => r.user_id === uid);
      const theirsOk = seen.some((r) => r.user_id !== uid);
      const status = mineOk && theirsOk ? t.status.revealed
        : mineOk ? t.status.waiting
          : theirsOk ? t.status.partnerFirst
            : t.status.todo;

      // Notes : UNIQUEMENT ce que la base renvoie. La RLS ne rend la ligne du
      // partenaire que quand les deux lignes existent ; sinon « — ».
      const notes = alignRows.filter((r) => r.category_id === cat.id);
      const mine = notes.find((r) => r.user_id === uid) ?? null;
      const theirs = notes.find((r) => r.user_id !== uid) ?? null;
      const mineCell = mine ? String(mine.score) : t.none;
      const theirsCell = theirs ? String(theirs.score) : t.none;

      const goal = goalRows.find((r) => r.category_id === cat.id) ?? null;
      const sText = String(goal?.s_text ?? '').trim();
      const complete = isGoalComplete(goal) ? t.completeYes : t.completeNo;

      return h('tr', {},
        h('th', { scope: 'row' }, cat.title),
        h('td', {}, status),
        h('td', {}, mineCell),
        h('td', {}, theirsCell),
        h('td', {},
          sText || t.none,
          goal?.deadline ? h('div', { class: 'muted' }, t.deadline(dateFR(goal.deadline))) : null),
        h('td', {}, complete));
    });

    tableCard.replaceChildren(
      h('h2', {}, t.tableTitle),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'synth-table' },
          h('thead', {}, head),
          h('tbody', {}, rows))));
  }

  // --- Section « Nos objectifs » ---------------------------------------
  // Sous le tableau, à l'écran ET dans l'impression : chaque catégorie dont
  // l'objectif est défini ou en cours, avec S, M, A, R en entier et l'échéance.
  // Jamais de questionnaire ici : uniquement smart_goals (lu par couple).
  function drawGoals(goalRows) {
    const items = [];
    for (const cat of content.categories) {
      const goal = goalRows.find((r) => r.category_id === cat.id) ?? null;
      if (goal && !isGoalEmpty(goal)) items.push({ cat, goal });
    }
    if (!items.length) { goalsCard.replaceChildren(); return; }
    goalsCard.replaceChildren(
      h('h2', {}, t.goalsTitle),
      ...items.map(({ cat, goal }) => h('div', { class: 'goal-block' },
        h('h3', {}, cat.title),
        ...GOAL_TEXT_KEYS.map((key) => {
          const letter = content.common.smart[key.toUpperCase()];
          return h('p', { class: 'goal-line' },
            h('strong', {}, `${key.toUpperCase()} — ${letter.name} : `),
            String(goal[GOAL_COLS[key]] ?? ''));
        }),
        goal.deadline
          ? h('p', { class: 'goal-line' }, t.deadline(dateFR(goal.deadline)))
          : null)));
  }

  // --- Formulaire du bilan --------------------------------------------
  function applyCount(f) {
    if (f.count) f.count.textContent = t.counter(f.value.length);
  }

  // Miroir d'impression : le PDF montre le contenu du bilan même quand les
  // champs de saisie sont masqués par la feuille de style d'impression.
  function syncPrint() {
    printBox.replaceChildren(...REVIEW_FIELD_KEYS.map((key) => {
      const f = fields.get(key);
      const raw = f ? f.value : '';
      const value = raw
        ? (key === 'next_review_date' ? dateFR(raw) : raw)
        : t.none;
      return h('p', { class: 'print-field' },
        h('strong', {}, content.common.final_review[key]),
        h('br', {}),
        h('span', {}, value));
    }));
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
      syncPrint();
    });
    f.el.addEventListener('input', () => {
      const raw = f.el.value;
      if (key === 'next_review_date' && raw && raw < todayISO()) {
        // Date passée : rien n'est retenu, rien n'est envoyé.
        setMsg(t.datePast, 'past');
        f.el.value = f.value;
        return;
      }
      if (msgKind === 'past') setMsg('');
      f.value = raw;
      f.held = false;
      applyCount(f);
      syncPrint();
      clearTimeout(f.timer);
      f.timer = setTimeout(() => { void flush(); }, 800);
    });
  }

  function buildForm() {
    if (formBuilt) return;
    formBuilt = true;
    const fieldsWrap = h('div', { class: 'review-fields' });
    for (const key of REVIEW_TEXT_KEYS) {
      const ta = h('textarea', { rows: 4, maxlength: 3000 });
      const count = h('span', { class: 'counter' }, t.counter(0));
      fieldsWrap.append(h('label', { class: 'field' },
        h('span', {}, content.common.final_review[key]),
        ta,
        count));
      const f = { el: ta, value: '', base: '', timer: null, count, held: false };
      fields.set(key, f);
      bind(f, key);
    }
    const date = h('input', { type: 'date', min: todayISO() });
    fieldsWrap.append(h('label', { class: 'field' },
      h('span', {}, content.common.final_review.next_review_date),
      date,
      h('span', { class: 'hint' }, t.dateHint)));
    fields.set('next_review_date', {
      el: date, value: '', base: '', timer: null, count: null, held: false
    });
    bind(fields.get('next_review_date'), 'next_review_date');

    formCard.replaceChildren(
      h('h2', {}, t.reviewTitle),
      h('p', {}, t.reviewIntro),
      fieldsWrap,
      statusMsg,
      metaEl,
      printBox,
      h('div', { class: 'row no-print' },
        h('button', { class: 'btn secondary', type: 'button', onclick: () => load() }, t.refresh)));
    syncPrint();
  }

  function drawMeta(row) {
    if (done) return;
    if (!row) { metaEl.textContent = ''; return; }
    const name = row.updated_by ? names.get(row.updated_by) : null;
    metaEl.textContent = name ? t.lastBy(name) : t.lastUnknown;
  }

  // Resynchronisation depuis la base : on ne touche jamais à un champ focalisé
  // ni à un champ dont le texte diverge de la valeur serveur (brouillon).
  function applyRow(row) {
    for (const key of REVIEW_FIELD_KEYS) {
      const f = fields.get(key);
      if (!f) continue;
      const fresh = row ? String(row[key] ?? '') : '';
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
    syncPrint();
  }

  // --- Écritures ------------------------------------------------------
  const flush = () => {
    chain = chain.then(() => doFlush(0)).catch(() => {});
    return chain;
  };
  const flushAll = async () => { await flush(); };

  async function fetchReview() {
    if (!coupleId) return { row: null };
    const { data, error } = await supabase.from('couple_review')
      .select(REVIEW_SELECT).eq('couple_id', coupleId).maybeSingle();
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
      // `held` = conflit signalé : le brouillon attend ta saisie suivante.
      if (f.held) continue;
      if (f.value === f.base) continue;
      if (key === 'next_review_date' && f.value && f.value < todayISO()) {
        setMsg(t.datePast, 'past');
        continue;
      }
      sent.push({ key, value: f.value, baseAt: f.base });
    }
    if (!sent.length) return;

    const patch = { couple_id: coupleId };
    for (const s of sent) {
      patch[s.key] = s.key === 'next_review_date' ? (s.value || null) : s.value;
    }
    const stampAt = rowUpdatedAt;

    let res;
    try {
      res = hasRow
        ? await supabase.from('couple_review').update(patch)
            .eq('couple_id', coupleId)
            .eq('updated_at', stampAt).select(REVIEW_SELECT)
        : await supabase.from('couple_review').upsert(patch, {
            onConflict: 'couple_id', ignoreDuplicates: true
          }).select(REVIEW_SELECT);
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
      // La base renvoie la ligne avec son updated_at : on le reprend
      // immédiatement pour ne jamais provoquer de faux conflit au prochain
      // enregistrement (2e, 3e sauvegarde…).
      applyRow(rows[0]);
      setMsg(t.saved, 'saved');
      return;
    }

    // 0 ligne : rien n'a été écrit. On relit pour distinguer un refus des
    // politiques (la ligne n'a pas bougé) d'une modification concurrente.
    const row = (await fetchReview()).row;
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
      const fresh = String(row[s.key] ?? '');
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

  // --- Export PDF ------------------------------------------------------
  // window.print() seul : aucune bibliothèque, aucun appel réseau. La feuille
  // @media print (style.css) masque navigation, boutons et bannières.
  // Le titre du document devient celui du PDF ; afterprint le restaure,
  // même quand l'impression est annulée.
  let titleBeforePrint = null;
  function restoreTitle() {
    if (titleBeforePrint === null) return;
    document.title = titleBeforePrint;
    titleBeforePrint = null;
  }
  function doExport() {
    if (!window.confirm(t.exportConfirm)) return;
    syncPrint();
    titleBeforePrint = document.title;
    document.title = `${ui.appName} - ${t.title} - ${todayISO()}`;
    window.print();
  }

  // --- Temps réel ------------------------------------------------------
  function startChannel() {
    if (done || channel || !coupleId) return;
    const ch = supabase.channel('review-' + coupleId);
    channel = ch;
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'couple_review', filter: `couple_id=eq.${coupleId}` },
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

    // 2. Tout se lit par couple UNIQUEMENT : sans filtre user_id (la RLS
    //    décide de ce qui est visible), et jamais la table answers.
    const [peopleRes, statusRes, alignRes, goalRes, reviewRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name'),
      supabase.from('category_status').select('category_id, user_id, validated_at')
        .eq('couple_id', coupleId),
      supabase.from('alignment').select('category_id, user_id, score')
        .eq('couple_id', coupleId),
      supabase.from('smart_goals').select('category_id, s_text, m_text, a_text, r_text, deadline')
        .eq('couple_id', coupleId),
      supabase.from('couple_review').select(REVIEW_SELECT)
        .eq('couple_id', coupleId).maybeSingle()
    ]);
    if (done) return;
    if (peopleRes.error || statusRes.error || alignRes.error
      || goalRes.error || reviewRes.error) {
      mountShell();
      showError(ui.errors.generic);
      return;
    }

    // 3. Prénoms : liste explicite des colonnes (jamais select('*')).
    const people = peopleRes.data ?? [];
    names.clear();
    for (const p of people) names.set(p.id, p.display_name);
    const partnerId = people.map((p) => p.id).find((id) => id !== uid) ?? null;
    mineName = names.get(uid) || ui.reveal.mine;
    partnerName = (partnerId && names.get(partnerId)) || ui.reveal.theirs;

    mountShell();
    if (!drawn) {
      drawn = true;
      body.replaceChildren(tableCard, goalsCard, formCard,
        h('p', { class: 'center no-print' },
          h('button', { class: 'btn', type: 'button', onclick: doExport }, t.exportPdf)),
        h('section', { class: 'card' }, h('p', {}, content.common.final_advice)),
        h('p', { class: 'print-only print-foot' }, t.printFoot));
    }
    heroWho.textContent = `${mineName} & ${partnerName} · ${t.editedOn(todayFR())}`;
    drawTable(statusRes.data ?? [], alignRes.data ?? [], goalRes.data ?? []);
    drawGoals(goalRes.data ?? []);
    buildForm();
    applyRow(reviewRes.data ?? null);
    startChannel();
  }

  // Rechargement complet à chaque événement Realtime : on ne se fie jamais au
  // contenu de l'événement, seulement à ce que la base renvoie.
  const onVisible = () => { if (document.visibilityState === 'visible') load(); };
  document.addEventListener('visibilitychange', onVisible);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
  // Impression terminée (ou annulée) : le titre de l'onglet redevient normal.
  const onAfterPrint = () => restoreTitle();
  window.addEventListener('afterprint', onAfterPrint);
  cleanups.push(() => {
    window.removeEventListener('afterprint', onAfterPrint);
    restoreTitle();
  });
  // Filet de sécurité : Realtime peut manquer un événement.
  ticker = setInterval(() => { if (!done) load(); }, 20000);

  // Avant un rechargement demandé par l'utilisateur (bannière « nouvelle
  // version »), on termine la sauvegarde en cours : rien n'est perdu.
  const beforeReload = (ev) => { ev.detail?.flush?.(flushAll()); };
  window.addEventListener('app:before-reload', beforeReload);
  cleanups.push(() => window.removeEventListener('app:before-reload', beforeReload));

  await load();
}

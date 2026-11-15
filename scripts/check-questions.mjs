// Banc d'essai : vérifie que chaque catégorie expose bien ses 8 questions à l'écran.
// Mini-DOM + stub Supabase, aucun réseau, aucune base réelle.
// Usage : node scripts/check-questions.mjs
import { createServer } from 'vite';

// --- Mini-DOM -------------------------------------------------------
class MiniNode {}
class MiniText extends MiniNode {
  constructor(data) { super(); this.data = String(data); }
  get textContent() { return this.data; }
}
class MiniEl extends MiniNode {
  constructor(tag) {
    super();
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attrs = {};
    this.listeners = {};
    this._class = '';
    this.value = '';
    this.disabled = false;
  }
  get className() { return this._class; }
  set className(v) { this._class = v; }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'disabled') this.disabled = true;
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  append(...kids) {
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      this.childNodes.push(k);
    }
  }
  replaceChildren(...kids) { this.childNodes = []; this.append(...kids); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = [new MiniText(v)]; }
}
globalThis.Node = MiniNode;
// Mini-document : createElement/createTextNode + les listeners dont les vues
// ont besoin (visibilitychange pour la resynchronisation d'écran).
const docListeners = {};
globalThis.document = {
  createElement: (t) => new MiniEl(t),
  createTextNode: (t) => new MiniText(t),
  visibilityState: 'visible',
  addEventListener(type, fn) { (docListeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    docListeners[type] = (docListeners[type] ?? []).filter((f) => f !== fn);
  }
};
// Mini-window : addEventListener/removeEventListener/dispatchEvent réels, pour
// tester l'événement « app:before-reload » (sauvegarde avant un rechargement).
const winListeners = {};
globalThis.window = {
  confirm: () => true,
  location: { reload() {} },
  addEventListener(type, fn) { (winListeners[type] ??= []).push(fn); },
  removeEventListener(type, fn) {
    winListeners[type] = (winListeners[type] ?? []).filter((f) => f !== fn);
  },
  dispatchEvent(ev) {
    for (const fn of [...(winListeners[ev.type] ?? [])]) fn(ev);
    return true;
  }
};

// --- Arbre ----------------------------------------------------------
function walk(el, out = []) {
  if (!(el instanceof MiniEl)) return out;
  out.push(el);
  for (const c of el.childNodes) walk(c, out);
  return out;
}
const buttons = (root) => walk(root).filter((e) => e.tagName === 'BUTTON');
const click = async (el) => {
  if (!el) throw new Error('bouton introuvable');
  for (const fn of el.listeners.click ?? []) await fn({ target: el });
};
const byText = (root, tag, text) =>
  walk(root).find((e) => e.tagName === tag && e.textContent.trim() === text);
const byTextStart = (root, tag, prefix) =>
  walk(root).find((e) => e.tagName === tag && e.textContent.trim().startsWith(prefix));

// Saisie simulée sur un champ (input, focus, blur) et petits outils de lecture.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const type = async (el, value) => {
  if (!el) throw new Error('champ introuvable');
  el.value = value;
  for (const fn of el.listeners.input ?? []) await fn({ target: el });
};
const focusEl = (el) => { for (const fn of el.listeners.focus ?? []) fn({ target: el }); };
const blurEl = (el) => { for (const fn of el.listeners.blur ?? []) fn({ target: el }); };
const textareas = (root) => walk(root).filter((e) => e.tagName === 'TEXTAREA');
const dateInput = (root) =>
  walk(root).find((e) => e.tagName === 'INPUT' && e.getAttribute('type') === 'date');
// Écritures envoyées à smart_goals (les lectures sont exclues).
const goalWrites = (supabase) =>
  supabase.queries.filter((q) => q.table === 'smart_goals' && q.op !== 'select');
// Termine les écritures en attente comme le fait la bannière « nouvelle version ».
const flushWindow = async () => {
  const flushes = [];
  window.dispatchEvent({
    type: 'app:before-reload',
    detail: { flush: (p) => flushes.push(Promise.resolve(p)) }
  });
  await Promise.allSettled(flushes);
};

// --- Stub Supabase --------------------------------------------------
// opts.status : lignes rendues par `category_status` ; opts.people : lignes
// rendues par `profiles` ; opts.couple : couple_id rendu par `couple_members`
// (null = délié). `queries` trace chaque lecture pour vérifier ce qui est lu.
function makeSupabase(opts = {}) {
  const rows = [];
  const log = [];
  const queries = [];
  const channels = [];
  const rpcs = [];
  const status = opts.status ?? [];
  const people = opts.people ?? [];
  const alignRows = [...(opts.alignment ?? [])];
  const goalRows = [...(opts.goalRow ? [opts.goalRow] : [])];
  const MY_ID = 'user-1';
  // Horodatages de la table smart_goals (trigger : now() à chaque écriture).
  let stampN = 0;
  const stamp = () => `2026-06-15T12:00:00.${String(stampN++).padStart(6, '0')}+00:00`;
  const resolve = (s) => {
    queries.push({ table: s.table, op: s.op, filters: { ...s.filters }, payload: s.payload, opts: s.opts });
    if (s.table === 'couple_members') {
      const coupleId = opts.couple === undefined ? 'couple-1' : opts.couple;
      return Promise.resolve({ data: coupleId ? [{ couple_id: coupleId }] : [], error: null });
    }
    if (s.table === 'category_status') return Promise.resolve({ data: status, error: null });
    if (s.table === 'profiles') return Promise.resolve({ data: people, error: null });
    if (s.table === 'alignment') {
      if (s.op === 'upsert') {
        // opts.refuse simule un upsert refusé par les politiques RLS.
        if (opts.refuse === 'error') {
          return Promise.resolve({ data: [], error: { code: '42501', message: 'row-level security policy' } });
        }
        if (opts.refuse === 'empty') return Promise.resolve({ data: [], error: null });
        const p = s.payload;
        if (!Number.isInteger(p.score) || p.score < 1 || p.score > 10) {
          return Promise.resolve({ data: null, error: { code: '23514', message: 'alignment_score_check' } });
        }
        const i = alignRows.findIndex((r) => r.user_id === p.user_id && r.category_id === p.category_id);
        const row = { couple_id: p.couple_id, user_id: p.user_id, category_id: p.category_id, score: p.score };
        if (i >= 0) alignRows[i] = row; else alignRows.push(row);
        return Promise.resolve({ data: [row], error: null });
      }
      // Politique alignment_select : mes lignes toujours ; celles du partenaire
      // seulement quand les deux lignes de la catégorie existent (RLS).
      const scoped = alignRows.filter((r) =>
        Object.entries(s.filters).every(([k, v]) => r[k] === v));
      const revealed = scoped.length === 2;
      return Promise.resolve({
        data: scoped.filter((r) => r.user_id === MY_ID || revealed),
        error: null
      });
    }
    if (s.table === 'smart_goals') {
      // Filtres posés par la vue : couple, catégorie, et updated_at (chaîne
      // brute) pour l'optimistic concurrency de la mise à jour.
      const match = (r, f) => (!('couple_id' in f) || r.couple_id === f.couple_id)
        && (!('category_id' in f) || r.category_id === f.category_id)
        && (!('updated_at' in f) || r.updated_at === f.updated_at);
      if (s.op === 'update') {
        if (opts.refuseGoal === 'error') {
          return Promise.resolve({ data: null, error: { code: '42501', message: 'row-level security policy' } });
        }
        const row = goalRows.find((r) => match(r, s.filters));
        // updated_at périmé : 0 ligne, comme PostgREST le renverrait.
        if (!row) return Promise.resolve({ data: [], error: null });
        // RLS qui refuse bien que la ligne corresponde : rien n'est écrit.
        if (opts.refuseGoal === 'empty') return Promise.resolve({ data: [], error: null });
        Object.assign(row, s.payload, { updated_at: stamp(), updated_by: MY_ID });
        return Promise.resolve({ data: [{ ...row }], error: null });
      }
      if (s.op === 'upsert') {
        if (opts.refuseGoal === 'error') {
          return Promise.resolve({ data: null, error: { code: '42501', message: 'row-level security policy' } });
        }
        const row = goalRows.find((r) =>
          r.couple_id === s.payload.couple_id && r.category_id === s.payload.category_id);
        if (row) {
          // ignoreDuplicates : la ligne du partenaire existe, 0 ligne renvoyée.
          if (s.opts?.ignoreDuplicates) return Promise.resolve({ data: [], error: null });
          Object.assign(row, s.payload, { updated_at: stamp(), updated_by: MY_ID });
          return Promise.resolve({ data: [{ ...row }], error: null });
        }
        if (opts.refuseGoal === 'empty') return Promise.resolve({ data: [], error: null });
        const created = { ...s.payload, updated_at: stamp(), updated_by: MY_ID };
        goalRows.push(created);
        return Promise.resolve({ data: [{ ...created }], error: null });
      }
      return Promise.resolve({
        data: goalRows.filter((r) => match(r, s.filters)).map((r) => ({ ...r })),
        error: null
      });
    }
    if (s.table === 'answers') {
      if (s.op === 'upsert') {
        const p = s.payload;
        const i = rows.findIndex((r) => r.question_id === p.question_id);
        const row = { ...p, updated_at: new Date().toISOString() };
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
        log.push(p.question_id);
        return Promise.resolve({ data: [{ question_id: p.question_id }], error: null });
      }
      const data = rows.filter((r) =>
        Object.entries(s.filters).every(([k, v]) => r[k] === v));
      return Promise.resolve({ data, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };
  const from = (table) => {
    const s = { table, op: 'select', payload: null, filters: {} };
    const q = {
      select() { return q; },
      eq(col, val) { s.filters[col] = val; return q; },
      upsert(payload, upsertOpts) {
        s.op = 'upsert'; s.payload = payload; s.opts = upsertOpts ?? null; return q;
      },
      update(payload) { s.op = 'update'; s.payload = payload; return q; },
      maybeSingle() {
        return resolve(s).then((r) => ({ data: r.data?.[0] ?? null, error: r.error }));
      },
      then(ok, err) { return resolve(s).then(ok, err); }
    };
    return q;
  };
  return {
    from,
    rpc(name) {
      rpcs.push(name);
      if (name === 'validate_category') {
        return Promise.resolve({ data: { ok: true, revealed: false }, error: null });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    },
    // Canal Realtime : la vue s'abonne, les tests déclenchent les callbacks
    // via `fire(table)` pour vérifier la resynchronisation d'écran.
    channel(name) {
      const ch = {
        name, handlers: [],
        on(type, cfg, cb) { ch.handlers.push({ cfg, cb }); return ch; },
        subscribe() { return ch; }
      };
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) {
      const i = channels.indexOf(ch);
      if (i >= 0) channels.splice(i, 1);
    },
    fire(table) {
      for (const ch of channels) {
        for (const hd of ch.handlers) {
          if (hd.cfg.table === table) hd.cb({ table, eventType: 'UPDATE' });
        }
      }
    },
    rows, goalRows, log, queries, rpcs
  };
}

// --- Jeu ------------------------------------------------------------
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error'
});
const { renderQuestions } = await server.ssrLoadModule('/src/views/questions.js');
const { renderReveal } = await server.ssrLoadModule('/src/views/reveal.js');
const { renderAlignment } = await server.ssrLoadModule('/src/views/alignment.js');
const { renderSmart } = await server.ssrLoadModule('/src/views/smart.js');
const { createActivity } = await server.ssrLoadModule('/src/activity.js');
const { ui } = await server.ssrLoadModule('/src/data/ui.fr.js');
const content = (await server.ssrLoadModule('/src/data/questions.fr.json')).default;

const t = ui.questions;
let failures = 0;
const fail = (msg) => { failures += 1; console.error('  ÉCHEC : ' + msg); };
const ok = (msg) => console.log('  ok  : ' + msg);

async function renderCategory(cat, supabase, navigateLog = []) {
  const root = new MiniEl('div');
  const ctx = {
    supabase,
    session: { user: { id: 'user-1' } },
    navigate: (r) => navigateLog.push(r),
    onLeave: () => {}
  };
  await renderQuestions(root, ctx, cat.id);
  return root;
}

// Élément qui porte réellement l'énoncé à l'écran (h2.question).
const questionEl = (root) =>
  walk(root).find((e) => String(e.className ?? '').split(' ').includes('question'));

// Rendu de l'écran de révélation. `leave` annule les rechargements programmés.
async function renderRevealView(supabase, categoryId) {
  const root = new MiniEl('div');
  const navigateLog = [];
  let leave = () => {};
  const ctx = {
    supabase,
    session: { user: { id: 'user-1' } },
    navigate: (r) => navigateLog.push(r),
    onLeave: (fn) => { leave = fn; }
  };
  await renderReveal(root, ctx, categoryId);
  return { root, navigateLog, leave };
}

// Rendu de l'écran de notes d'alignement (ticker Realtime/20 s inclus).
async function renderAlignmentView(supabase, categoryId) {
  const root = new MiniEl('div');
  const navigateLog = [];
  let leave = () => {};
  const ctx = {
    supabase,
    session: { user: { id: 'user-1' } },
    navigate: (r) => navigateLog.push(r),
    onLeave: (fn) => { leave = fn; }
  };
  await renderAlignment(root, ctx, categoryId);
  return { root, navigateLog, leave };
}

// Rendu de l'écran de l'objectif SMART commun (ticker Realtime/20 s inclus).
async function renderSmartView(supabase, categoryId) {
  const root = new MiniEl('div');
  const navigateLog = [];
  let leave = () => {};
  const ctx = {
    supabase,
    session: { user: { id: 'user-1' } },
    navigate: (r) => navigateLog.push(r),
    onLeave: (fn) => { leave = fn; }
  };
  await renderSmart(root, ctx, categoryId);
  return { root, navigateLog, leave };
}

const PEOPLE = [
  { id: 'user-1', display_name: 'Alex' },
  { id: 'user-2', display_name: 'Sam' }
];
const VALIDATED_BOTH = [
  { couple_id: 'couple-1', user_id: 'user-1', category_id: 1, validated_at: '2026-01-01T00:00:00Z' },
  { couple_id: 'couple-1', user_id: 'user-2', category_id: 1, validated_at: '2026-01-02T00:00:00Z' }
];

// Remplit les réponses des deux utilisateurs. `skip` = index (0-based) de la
// question passée, -1 = aucune ; `theirs = null` = aucune ligne du partenaire.
function fillAnswers(supabase, cat, mine, theirs) {
  cat.questions.forEach((q, i) => {
    const mineSkip = Boolean(mine) && i === mine.skip;
    supabase.rows.push({
      couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, question_id: q.id,
      body: mineSkip ? null : `Ma réponse ${i + 1}`,
      skipped: mineSkip
    });
    if (!theirs) return;
    const theirSkip = i === theirs.skip;
    supabase.rows.push({
      couple_id: 'couple-1', user_id: 'user-2', category_id: cat.id, question_id: q.id,
      body: theirSkip ? null : `Sa réponse ${i + 1}`,
      skipped: theirSkip
    });
  });
}

console.log('\n== 1. Énoncé affiché = exactement celui de l\'index courant (12 × 8) ==');
for (const cat of content.categories) {
  const supabase = makeSupabase();
  const root = await renderCategory(cat, supabase);
  const displayed = [];
  for (let i = 0; i < 8; i += 1) {
    const attendu = cat.questions[i].text;
    const el = questionEl(root);
    if (!el) {
      fail(`cat ${cat.id} q${i + 1} : aucun énoncé rendu dans le DOM`);
    } else if (el.textContent !== attendu) {
      fail(`cat ${cat.id} q${i + 1} : énoncé affiché « ${String(el.textContent).slice(0, 50)}… »`
        + ` au lieu de « ${attendu.slice(0, 50)}… »`);
    } else {
      displayed.push(el.textContent);
    }
    if (!byText(root, 'P', t.progress(i + 1, 8))) fail(`cat ${cat.id} q${i + 1} : compteur incorrect`);
    if (!walk(root).find((e) => e.tagName === 'TEXTAREA')) fail(`cat ${cat.id} q${i + 1} : pas de champ de réponse`);

    await click(byText(root, 'BUTTON', t.skip));
    if (i < 7) {
      // Navigation alternée : pastille numérotée (pairs) puis « Suivant » (impairs).
      const chips = walk(root).filter((e) => e.tagName === 'BUTTON' && String(e.className).includes('chip'));
      const useChip = i % 2 === 0;
      const target = useChip ? chips[i + 1] : byText(root, 'BUTTON', t.next);
      if (!target) {
        fail(`cat ${cat.id} q${i + 1} : ${useChip ? 'pastille numérotée' : 'bouton « Suivant »'} absent`);
        break;
      }
      await click(target);
      const suivant = questionEl(root);
      if (suivant && suivant.textContent === attendu && cat.questions[i + 1].text !== attendu) {
        fail(`cat ${cat.id} : énoncé figé sur q${i + 1} après navigation`);
      }
    }
  }
  const uniq = new Set(displayed);
  if (uniq.size !== 8) {
    fail(`cat ${cat.id} : ${8 - uniq.size} énoncé(s) identique(s) affiché(s) sur les 8`);
  }
  const expected = cat.questions.map((q) => q.id);
  const got = supabase.rows.map((r) => r.question_id);
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`cat ${cat.id} : enregistré [${got}] au lieu de [${expected}]`);
  } else if (uniq.size === 8) {
    ok(`cat ${cat.id} : 8 énoncés distincts et exacts à chaque index`);
  }
  if (!byTextStart(root, 'BUTTON', t.validate)) fail(`cat ${cat.id} : bouton « ${t.validate} » absent`);
}

console.log('\n== 2. Position de départ : première question non traitée ==');
{
  const supabase = makeSupabase();
  supabase.rows.push(
    { couple_id: 'couple-1', user_id: 'user-1', category_id: 1, question_id: 'c01q01', body: null, skipped: true },
    { couple_id: 'couple-1', user_id: 'user-1', category_id: 1, question_id: 'c01q02', body: 'Ma réponse', skipped: false }
  );
  const root = await renderCategory(content.categories[0], supabase);
  if (byText(root, 'P', t.progress(3, 8))) ok('reprise sur la question 3 (2 traitées)');
  else fail(`attendu « ${t.progress(3, 8)} », obtenu « ${
    walk(root).find((e) => e.tagName === 'P' && e.className.includes('progress'))?.textContent} »`);
  const el = questionEl(root);
  if (!el || el.textContent !== content.categories[0].questions[2].text) {
    fail(`reprise : énoncé affiché « ${el?.textContent?.slice(0, 50)}… » au lieu de l'énoncé de la question 3`);
  } else ok('reprise : énoncé exact de la question 3 affiché');
}

console.log('\n== 3. L\'index ne revient pas à 0 après une sauvegarde automatique ==');
{
  const supabase = makeSupabase();
  const root = await renderCategory(content.categories[0], supabase);
  await click(byText(root, 'BUTTON', t.next));
  const textarea = walk(root).find((e) => e.tagName === 'TEXTAREA');
  textarea.value = 'Une réponse tapée';
  for (const fn of textarea.listeners.input ?? []) await fn({ target: textarea });
  await new Promise((r) => setTimeout(r, 1200)); // laisse passer le debounce de 800 ms
  const still = byText(root, 'P', t.progress(2, 8));
  if (still) ok('question 2 conservée après la sauvegarde automatique');
  else fail('retour à la question 1 après la sauvegarde automatique');
  if (supabase.rows.some((r) => r.question_id === 'c01q02' && r.body === 'Une réponse tapée')) {
    ok('réponse de la question 2 enregistrée');
  } else fail('réponse de la question 2 non enregistrée');
  const el = questionEl(root);
  if (!el || el.textContent !== content.categories[0].questions[1].text) {
    fail(`après sauvegarde auto : énoncé « ${el?.textContent?.slice(0, 50)}… » au lieu de celui de la question 2`);
  } else ok('après sauvegarde auto : énoncé de la question 2 conservé');

  // « Précédent » doit aussi changer l'énoncé.
  await click(byText(root, 'BUTTON', t.prev));
  const back = questionEl(root);
  if (!back || back.textContent !== content.categories[0].questions[0].text) {
    fail(`après « Précédent » : énoncé « ${back?.textContent?.slice(0, 50)}… » au lieu de celui de la question 1`);
  } else ok('« Précédent » : énoncé de la question 1 affiché');
}

console.log('\n== 4. Dernière question : validation avec le décompte ==');
{
  const supabase = makeSupabase();
  for (let i = 1; i <= 6; i += 1) {
    supabase.rows.push({
      couple_id: 'couple-1', user_id: 'user-1', category_id: 1,
      question_id: `c01q0${i}`, body: `r${i}`, skipped: false
    });
  }
  const root = await renderCategory(content.categories[0], supabase);
  const chips = walk(root).filter((e) => e.tagName === 'BUTTON' && String(e.className).includes('chip'));
  if (chips.length !== 8) {
    fail(`attendu 8 pastilles de navigation, obtenu ${chips.length}`);
  } else {
    ok('8 pastilles : accès direct à chaque question');
    await click(chips[7]); // saut direct sur la question 8
  }
  const btn = byTextStart(root, 'BUTTON', t.validate);
  if (!btn) fail('bouton de validation absent sur la dernière question');
  else if (!/6 sur 8/.test(btn.textContent)) fail(`décompte absent : « ${btn.textContent} »`);
  else ok(`« ${btn.textContent} »`);
}

console.log('\n== 5. Avant un rechargement demandé : la sauvegarde en cours est terminée ==');
{
  const supabase = makeSupabase();
  const root = await renderCategory(content.categories[0], supabase);
  const textarea = walk(root).find((e) => e.tagName === 'TEXTAREA');
  textarea.value = 'Texte encore non sauvegardé';
  for (const fn of textarea.listeners.input ?? []) await fn({ target: textarea });
  // Le debounce de 800 ms n'a pas encore joué : rien n'est en base.
  if (supabase.rows.length === 0) ok('réponse tapée mais pas encore enregistrée (debounce)');
  else fail(`réponse déjà en base avant le rechargement : [${supabase.rows.map((r) => r.question_id)}]`);

  const flushes = [];
  window.dispatchEvent({
    type: 'app:before-reload',
    detail: { flush: (p) => flushes.push(Promise.resolve(p)) }
  });
  await Promise.allSettled(flushes);
  const first = content.categories[0].questions[0].id;
  if (supabase.rows.some((r) => r.question_id === first && r.body === 'Texte encore non sauvegardé')) {
    ok('sauvegarde terminée avant le rechargement');
  } else {
    fail(`sauvegarde non terminée avant le rechargement (lignes : [${supabase.rows.map((r) => r.question_id)}])`);
  }
}

console.log('\n== 6. Révélation : bloquée tant que les deux n\'ont pas validé ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE,
    status: [VALIDATED_BOTH[0]] // seul mon validated_at : la révélation n'est pas ouverte
  });
  // Les réponses du partenaire sont pourtant présentes : elles ne doivent
  // ni être lues, ni apparaître.
  fillAnswers(supabase, cat, { skip: -1 }, { skip: -1 });
  const { root, navigateLog, leave } = await renderRevealView(supabase, cat.id);

  if (root.textContent.includes('Sa réponse 1')) {
    fail('révélation : réponse du partenaire affichée avant la révélation');
  } else ok('aucune réponse du partenaire affichée avant la révélation');

  const read = supabase.queries.find((q) => q.table === 'answers' && q.op === 'select');
  if (read) fail('révélation : les réponses ont été lues alors que la catégorie n\'est pas révélée');
  else ok('aucune lecture des réponses avant la révélation');

  if (navigateLog.some((r) => r.name === 'home')) ok('renvoi vers l\'accueil');
  else fail('la révélation aurait dû renvoyer vers l\'accueil tant qu\'elle n\'est pas ouverte');
  leave();
}

console.log('\n== 7. Révélation : 8 questions, deux réponses, deux prénoms, « passée » ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  fillAnswers(supabase, cat, { skip: 2 }, { skip: 4 }); // q3 pour moi, q5 pour le partenaire
  const { root, navigateLog, leave } = await renderRevealView(supabase, cat.id);

  const statements = new Set(cat.questions.map((q) => q.text));
  const shown = walk(root).filter((e) => e.tagName === 'H2' && statements.has(e.textContent));
  if (shown.length !== 8) fail(`attendu 8 questions affichées, obtenu ${shown.length}`);
  else ok('les 8 questions de la catégorie sont affichées');

  const text = root.textContent;
  if (text.includes('Alex') && text.includes('Sam')) ok('les deux prénoms sont affichés');
  else fail('prénoms manquants sur la révélation');
  if (text.includes('Ma réponse 1') && text.includes('Sa réponse 1')) {
    ok('les réponses des deux partenaires sont affichées');
  } else fail('réponses manquantes sur la révélation');

  const badges = walk(root).filter((e) =>
    e.tagName === 'SPAN' && String(e.className).includes('badge') && e.textContent === ui.reveal.skipped);
  if (badges.length !== 2) fail(`attendu 2 badges « ${ui.reveal.skipped} », obtenu ${badges.length}`);
  else ok('questions passées : badge « passée » sans texte');
  if (text.includes('Ma réponse 3') || text.includes('Sa réponse 5')) {
    fail('le texte d\'une question passée ne doit pas apparaître');
  } else ok('aucun texte pour les questions passées');

  const read = supabase.queries.find((q) => q.table === 'answers' && q.op === 'select');
  if (!read) fail('aucune lecture des réponses');
  else if ('user_id' in read.filters) fail(`réponses filtrées par user_id : ${JSON.stringify(read.filters)}`);
  else if (read.filters.couple_id !== 'couple-1' || read.filters.category_id !== cat.id) {
    fail(`filtres de lecture inattendus : ${JSON.stringify(read.filters)}`);
  } else ok('réponses lues par couple + catégorie, sans filtre user_id');

  if (ui.reveal.sensitiveIntro && text.includes(ui.reveal.sensitiveIntro)) {
    fail('message « questions sensibles » affiché sur une catégorie sans question sensible');
  } else ok('pas de message « questions sensibles » là où il n\'y en a pas');
  if (text.includes(content.common.golden_rules[0])) ok('rappel des règles d\'or visible');
  else fail('rappel des règles d\'or absent');

  const next = byText(root, 'BUTTON', ui.reveal.continue);
  if (!next) fail(`bouton « ${ui.reveal.continue} » absent`);
  else {
    await click(next);
    const routed = navigateLog.find((r) => r.name === 'alignment');
    if (routed && routed.categoryId === cat.id) ok('« Continuer » mène à l\'écran d\'alignement');
    else fail(`« Continuer » mène à ${JSON.stringify(navigateLog)} au lieu de l'alignement`);
  }
  leave();
}

console.log('\n== 7b. Révélation : catégorie avec questions sensibles ==');
{
  const cat = content.categories.find((c) => c.questions.some((q) => q.sensitive));
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH.map((r) => ({ ...r, category_id: cat.id })) });
  fillAnswers(supabase, cat, { skip: -1 }, { skip: -1 });
  const { root, leave } = await renderRevealView(supabase, cat.id);
  const text = root.textContent;
  if (!text.includes(ui.reveal.sensitiveIntro)) fail('message « questions sensibles » absent');
  else ok('message « questions sensibles » affiché avant les réponses');
  if (text.indexOf(ui.reveal.sensitiveIntro) > text.indexOf(cat.questions[0].text)) {
    fail('le message sensible doit précéder les réponses');
  } else ok('le message sensible précède les réponses');
  leave();
}

console.log('\n== 8. Révélation : statut révélé mais une seule moitié → chargement ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  fillAnswers(supabase, cat, { skip: -1 }, null); // aucune ligne du partenaire
  const { root, leave } = await renderRevealView(supabase, cat.id);
  const text = root.textContent;

  if (text.includes('Ma réponse 1') || text.includes('Sa réponse 1')) {
    fail('affichage partiel : une moitié d\'écran est rendue');
  } else ok('aucune moitié d\'écran affichée');
  if (text.includes(ui.reveal.arriving)) ok('état de chargement affiché (rechargement)');
  else fail('état de chargement absent sur des données incomplètes');
  leave();
}

console.log('\n== 9. Alignement : une seule note donnée, rien sur le partenaire ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE,
    status: VALIDATED_BOTH,
    // RLS : je n'ai que ma ligne, celle du partenaire n'existe pas encore.
    alignment: [{ couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: 7 }]
  });
  const { root, leave } = await renderAlignmentView(supabase, cat.id);
  const text = root.textContent;

  if (text.includes(ui.alignment.recorded)) ok('« Ta note est enregistrée… » affiché');
  else fail('message « Ta note est enregistrée… » absent');

  if (text.includes('Sam')) fail('le partenaire est nommé alors que la comparaison n\'est pas possible');
  else ok('aucune information sur le partenaire');

  if (/pas encore noté/i.test(text)) fail('le message laisse entendre que le partenaire n\'a pas encore noté');
  else ok('aucun jugement sur la note du partenaire');

  const read = supabase.queries.find((q) => q.table === 'alignment' && q.op === 'select');
  if (!read) fail('aucune lecture des notes');
  else if ('user_id' in read.filters) fail(`notes filtrées par user_id : ${JSON.stringify(read.filters)}`);
  else ok('notes lues par couple + catégorie, sans filtre user_id');

  const current = walk(root).find((e) => e.tagName === 'BUTTON' && String(e.className).includes('current'));
  if (!current || current.textContent !== '7') fail('ma note (7) n\'est pas sélectionnée');
  else ok('ma note (7) reste affichée et modifiable');
  leave();
}

console.log('\n== 10. Alignement : les deux notes et les deux prénoms ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE,
    status: VALIDATED_BOTH,
    alignment: [
      { couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: 8 },
      { couple_id: 'couple-1', user_id: 'user-2', category_id: cat.id, score: 7 }
    ]
  });
  const { root, leave } = await renderAlignmentView(supabase, cat.id);
  const text = root.textContent;
  const whos = walk(root).filter((e) => String(e.className).split(' ').includes('who'));
  const vals = walk(root).filter((e) => String(e.className).split(' ').includes('val'));
  const got = whos.map((e) => e.textContent).join('|');
  if (got !== 'Alex|Sam') fail(`prénoms [${got}] au lieu de [Alex|Sam]`);
  else ok('les deux prénoms affichés côte à côte');
  if (vals.map((e) => e.textContent).join('|') !== '8|7') {
    fail(`notes [${vals.map((e) => e.textContent).join('|')}] au lieu de [8|7]`);
  } else ok('les deux notes affichées côte à côte (8 et 7)');

  if (/compatibilit|gagnant|perdant|mauvais/i.test(text)) {
    fail('vocabulaire de compétition ou de jugement dans la comparaison');
  } else ok('ton neutre : aucune note de « compatibilité », ni gagnant/perdant');
  leave();
}

console.log('\n== 11. Alignement : écart de 3 (invitation) ou de 2 (encouragement) ==');
{
  const cat = content.categories[0];
  const build = (a, b) => makeSupabase({
    people: PEOPLE,
    status: VALIDATED_BOTH,
    alignment: [
      { couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: a },
      { couple_id: 'couple-1', user_id: 'user-2', category_id: cat.id, score: b }
    ]
  });

  const big = await renderAlignmentView(build(7, 4), cat.id);
  if (big.root.textContent.includes(content.common.alignment.deep_talk_message)) {
    ok('écart de 3 : invitation à la conversation approfondie affichée');
  } else fail('écart de 3 : message d\'invitation absent');
  big.leave();

  const small = await renderAlignmentView(build(7, 5), cat.id);
  if (small.root.textContent.includes(content.common.alignment.deep_talk_message)) {
    fail('écart de 2 : message d\'invitation affiché à tort');
  } else ok('écart de 2 : pas de message d\'invitation');
  if (small.root.textContent.includes(ui.alignment.encouragement)) {
    ok('écart de 2 : encouragement affiché');
  } else fail('écart de 2 : encouragement absent');
  small.leave();
}

console.log('\n== 12. Alignement : note invalide = rien n\'est envoyé à la base ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE,
    status: VALIDATED_BOTH,
    alignment: [{ couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: 6 }]
  });
  const { root, leave } = await renderAlignmentView(supabase, cat.id);
  const btns = walk(root).filter((e) => e.tagName === 'BUTTON' && String(e.className).includes('score'));
  if (btns.length !== 10) fail(`attendu 10 boutons de note, obtenu ${btns.length}`);
  else {
    ok('10 boutons de note');
    // On force une valeur invalide dans le bouton (DOM trafiqué) : la validation
    // côté client doit refuser l'envoi, la base ne doit jamais la voir.
    for (const bad of ['0', '11', '3.5', 'pas-un-nombre']) {
      btns[0].textContent = bad;
      await click(btns[0]);
    }
    const sent = supabase.queries.filter((q) => q.table === 'alignment' && q.op === 'upsert');
    if (sent.length) {
      fail(`note invalide envoyée à la base : [${sent.map((q) => q.payload?.score)}]`);
    } else ok('0, 11, 3.5, texte : rien n\'est envoyé à la base');
  }
  leave();
}

console.log('\n== 13. Alignement : upsert refusé → verrouillage, sans exception ==');
{
  const cat = content.categories[0];
  const notes = [
    { couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: 5 },
    { couple_id: 'couple-1', user_id: 'user-2', category_id: cat.id, score: 5 }
  ];
  // 'error' = 42501 ; 'empty' = 0 ligne retournée (les deux cas du contrat).
  for (const refuse of ['error', 'empty']) {
    const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH, alignment: notes, refuse });
    const { root, leave } = await renderAlignmentView(supabase, cat.id);
    const btn = walk(root).find((e) => e.tagName === 'BUTTON' && String(e.className).includes('score'));
    let threw = null;
    // L'état local peut être périmé (boutons encore actifs) : la base tranche.
    try { await click(btn); } catch (err) { threw = err; }
    if (threw) fail(`upsert refusé (${refuse}) : exception non gérée — ${threw.message}`);
    else if (!root.textContent.includes(ui.alignment.locked)) {
      fail(`upsert refusé (${refuse}) : message de verrouillage absent`);
    } else ok(`upsert refusé (${refuse}) : message de verrouillage affiché`);
    leave();
  }
}

console.log('\n== 14. Objectif : création (debounce 800 ms) avec ignoreDuplicates ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  const { root, leave } = await renderSmartView(supabase, cat.id);

  const tas = textareas(root);
  if (tas.length !== 4) fail(`attendu 4 champs de texte (S, M, A, R), obtenu ${tas.length}`);
  else ok('4 champs de texte : S, M, A, R');
  if (!dateInput(root)) fail('champ d\'échéance absent');
  else ok('champ d\'échéance (date) présent');

  await type(tas[0], 'Notre valeur partagée : la patience');
  if (goalWrites(supabase).length) fail('écriture immédiate : le debounce de 800 ms n\'a pas joué');
  else ok('debounce : rien n\'est envoyé avant les 800 ms');
  await sleep(1200);

  const create = supabase.queries.find((q) => q.table === 'smart_goals' && q.op === 'upsert');
  if (!create) fail('aucune création envoyée alors qu\'aucune ligne n\'existait');
  else if (!create.opts?.ignoreDuplicates) fail(`upsert sans ignoreDuplicates : ${JSON.stringify(create.opts)}`);
  else ok('création envoyée avec onConflict + ignoreDuplicates');

  const row = supabase.goalRows.find((r) => r.category_id === cat.id);
  if (!row || row.s_text !== 'Notre valeur partagée : la patience') fail('la ligne d\'objectif n\'a pas été créée');
  else ok('ligne d\'objectif créée avec mon texte S');
  if (root.textContent.includes(ui.smart.saved)) ok('message « Enregistré » affiché');
  else fail('message « Enregistré » absent après la sauvegarde');
  leave();
}

console.log('\n== 15. Avant un rechargement : écriture terminée + filtre updated_at brut ==');
{
  const cat = content.categories[0];
  const RAW = '2026-03-04T05:06:07.123456+00:00';
  const supabase = makeSupabase({
    people: PEOPLE, status: VALIDATED_BOTH,
    goalRow: {
      couple_id: 'couple-1', category_id: cat.id,
      s_text: 'Déjà écrit', m_text: null, a_text: null, r_text: null, deadline: null,
      updated_by: 'user-2', updated_at: RAW
    }
  });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const [sTa, mTa] = textareas(root);
  if (!sTa || !mTa) fail('formulaire incomplet');
  else {
    if (sTa.value !== 'Déjà écrit') fail(`texte S existant non affiché : « ${sTa.value} »`);
    else ok('texte S déjà en base affiché');

    await type(mTa, 'Un indicateur par semaine');
    if (goalWrites(supabase).length) fail('écriture avant le rechargement demandé');
    else ok('brouillon non encore envoyé (debounce)');

    await flushWindow();
    const upd = supabase.queries.find((q) => q.table === 'smart_goals' && q.op === 'update');
    if (!upd) fail('aucune mise à jour envoyée avant le rechargement');
    else if (upd.filters.updated_at !== RAW) {
      fail(`filtre updated_at transformé : ${upd.filters.updated_at}`);
    } else if (!upd.filters.updated_at.includes('.123456')) {
      fail('microsecondes perdues dans le filtre updated_at');
    } else ok(`filtre updated_at = chaîne brute « ${RAW} »`);

    const row = supabase.goalRows[0];
    if (row.m_text !== 'Un indicateur par semaine') fail('mon texte M non enregistré');
    else if (row.s_text !== 'Déjà écrit') fail('mon écriture a effacé le texte S du partenaire');
    else ok('seul mon champ M a changé, leur texte S est intact');
    if (root.textContent.includes(ui.smart.saved)) ok('« Enregistré » affiché après l\'écriture');
    else fail('message « Enregistré » absent');
  }
  leave();
}

console.log('\n== 16. Conflit sur le même champ : signalé, brouillon gardé ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE, status: VALIDATED_BOTH,
    goalRow: {
      couple_id: 'couple-1', category_id: cat.id,
      s_text: 'Texte initial', m_text: null, a_text: null, r_text: null, deadline: null,
      updated_by: 'user-1', updated_at: '2026-03-04T05:06:07.123456+00:00'
    }
  });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const [sTa] = textareas(root);
  await type(sTa, 'Mon texte à moi');

  // Ton ou ta partenaire enregistre le MÊME champ juste avant moi.
  supabase.goalRows[0].s_text = 'Leur texte à eux';
  supabase.goalRows[0].updated_by = 'user-2';
  supabase.goalRows[0].updated_at = '2026-07-07T07:07:07.999999+00:00';

  await flushWindow();

  if (root.textContent.includes(ui.smart.conflict)) ok('conflit signalé : « Nous avons rechargé sa version »');
  else fail('message de conflit absent');
  if (sTa.value !== 'Mon texte à moi') fail(`brouillon perdu : « ${sTa.value} »`);
  else ok('mon brouillon est conservé à l\'écran');
  if (supabase.goalRows[0].s_text !== 'Leur texte à eux') fail('leur texte a été écrasé');
  else ok('leur version reste en base');
  const writes = goalWrites(supabase);
  if (writes.length !== 1) fail(`réessai silencieux : ${writes.length} écritures au lieu d'une seule`);
  else ok('aucune réessai silencieux après le conflit');

  // Quitter l'écran tente un dernier enregistrement : le brouillon en conflit
  // doit rester bloqué (il attend ma prochaine saisie sur CE champ).
  leave();
  await sleep(20);
  if (supabase.goalRows[0].s_text !== 'Leur texte à eux') {
    fail('le brouillon en conflit a été écrit en quittant l\'écran');
  } else ok('le brouillon en conflit n\'est jamais écrit, même en quittant');
}

console.log('\n== 17. Création simultanée : S de l\'un + M de l\'autre coexistent ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const [sTa, mTa] = textareas(root);
  await type(sTa, 'Mon S');
  // Ton ou ta partenaire crée la ligne (son M) pendant que j'écris le mien.
  supabase.goalRows.push({
    couple_id: 'couple-1', category_id: cat.id,
    s_text: null, m_text: 'Son M', a_text: null, r_text: null, deadline: null,
    updated_by: 'user-2', updated_at: '2026-07-07T07:07:07.999999+00:00'
  });

  await flushWindow();

  const row = supabase.goalRows.find((r) => r.category_id === cat.id);
  if (!row) fail('la ligne d\'objectif a disparu');
  else if (row.s_text !== 'Mon S' || row.m_text !== 'Son M') {
    fail(`les deux textes doivent coexister : s_text=${JSON.stringify(row.s_text)}, m_text=${JSON.stringify(row.m_text)}`);
  } else ok('les deux textes coexistent en base : mon S et son M');
  if (root.textContent.includes(ui.smart.conflict)) fail('conflit affiché alors que les champs diffèrent');
  else ok('aucun conflit : deux champs différents écrits côte à côte');
  if (mTa.value !== 'Son M') fail(`son M n'apparaît pas à l'écran : « ${mTa.value} »`);
  else ok('son M est affiché de mon côté');
  const ops = goalWrites(supabase).map((q) => q.op);
  if (JSON.stringify(ops) !== '["upsert","update"]') fail(`écritures [${ops}] au lieu de [upsert, update]`);
  else ok('création en conflit puis mise à jour de retry réussie');
  leave();
}

console.log('\n== 18. Objectif complet : confirmation et catégorie suivante ==');
{
  const cat = content.categories[0];
  const complete = {
    couple_id: 'couple-1', category_id: cat.id,
    s_text: 'a', m_text: 'b', a_text: 'c', r_text: 'd', deadline: '2027-06-01',
    updated_by: 'user-1', updated_at: '2026-03-04T05:06:07.123456+00:00'
  };

  const full = await renderSmartView(
    makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH, goalRow: complete }), cat.id);
  if (!byText(full.root, 'H2', ui.smart.completeTitle)) fail('objectif complet : titre absent');
  else ok('objectif complet : confirmation affichée');
  const next = byText(full.root, 'BUTTON', ui.smart.completeNext);
  if (!next) fail('objectif complet : bouton « Catégorie suivante » absent');
  else {
    await click(next);
    const routed = full.navigateLog.find((r) => r.name === 'smart' && r.categoryId === cat.id + 1);
    if (routed) ok('« Catégorie suivante » mène à la catégorie suivante');
    else fail(`« Catégorie suivante » mène à ${JSON.stringify(full.navigateLog)}`);
  }
  full.leave();

  // Les 4 textes sans échéance : incomplet.
  const noDate = await renderSmartView(
    makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH, goalRow: { ...complete, deadline: null } }), cat.id);
  if (byText(noDate.root, 'BUTTON', ui.smart.completeNext)) {
    fail('complet affiché alors qu\'il manque l\'échéance');
  } else ok('4 textes sans échéance : pas encore complet');
  noDate.leave();

  // Un texte d'espaces ne compte pas comme une réponse.
  const blank = await renderSmartView(
    makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH, goalRow: { ...complete, s_text: '    ' } }), cat.id);
  if (byText(blank.root, 'BUTTON', ui.smart.completeNext)) {
    fail('complet affiché avec un texte d\'espaces');
  } else ok('un texte d\'espaces ne compte pas : objectif incomplet');
  blank.leave();

  // Dernière catégorie : la suite, c'est l'accueil.
  const lastCat = content.categories[content.categories.length - 1];
  const last = await renderSmartView(makeSupabase({
    people: PEOPLE,
    status: VALIDATED_BOTH.map((r) => ({ ...r, category_id: lastCat.id })),
    goalRow: { ...complete, category_id: lastCat.id }
  }), lastCat.id);
  const lastBtn = byText(last.root, 'BUTTON', ui.smart.completeNext);
  if (!lastBtn) fail('dernière catégorie : bouton suivant absent');
  else {
    await click(lastBtn);
    if (last.navigateLog.some((r) => r.name === 'home')) {
      ok('dernière catégorie : « Catégorie suivante » ramène à l\'accueil');
    } else fail(`dernière catégorie : ${JSON.stringify(last.navigateLog)} au lieu de l'accueil`);
  }
  last.leave();
}

console.log('\n== 19. Échéance passée : rien n\'est envoyé ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const date = dateInput(root);
  if (!date) fail('champ d\'échéance absent');
  else {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (date.getAttribute('min') !== today) fail(`min du champ : ${date.getAttribute('min')} au lieu de ${today}`);
    else ok(`échéance : date minimale = aujourd'hui (${today})`);

    await type(date, '2020-01-01');
    if (!root.textContent.includes(ui.smart.deadlinePast)) fail('avertissement d\'échéance passée absent');
    else ok('avertissement affiché pour une échéance passée');
    if (date.value !== '') fail(`l'échéance passée reste affichée : « ${date.value} »`);
    else ok('l\'échéance passée n\'est pas retenue');

    await flushWindow();
    const writes = goalWrites(supabase);
    if (writes.length) fail(`échéance passée envoyée à la base : ${JSON.stringify(writes.map((q) => q.payload))}`);
    else ok('aucune écriture envoyée pour une échéance passée');
  }
  leave();
}

console.log('\n== 19b. Échéance devenue passée entre la saisie et l\'écriture ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const date = dateInput(root);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await type(date, iso(tomorrow)); // valide au moment de la saisie
  if (goalWrites(supabase).length) fail('écriture immédiate malgré le debounce');
  else ok('échéance de demain acceptée à la saisie');

  // La nuit tombe : trois jours plus tard, cette échéance est dans le passé.
  const RealDate = Date;
  try {
    globalThis.Date = class extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(RealDate.now() + 3 * 86400000);
      }
      static now() { return RealDate.now(); }
    };
    await flushWindow();
  } finally {
    globalThis.Date = RealDate;
  }

  const writes = goalWrites(supabase);
  if (writes.length) fail(`échéance devenue passée envoyée : ${JSON.stringify(writes.map((q) => q.payload))}`);
  else ok('échéance devenue passée avant l\'écriture : rien n\'est envoyé');
  if (!root.textContent.includes(ui.smart.deadlinePast)) fail('avertissement absent au moment de l\'écriture');
  else ok('avertissement affiché au moment de l\'écriture');
  leave();
}

console.log('\n== 20. Objectif : catégorie non révélée → aucun écran, aucune lecture ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE,
    status: [VALIDATED_BOTH[0]], // seul mon validated_at : pas de révélation
    goalRow: {
      couple_id: 'couple-1', category_id: cat.id,
      s_text: 'a', m_text: 'b', a_text: 'c', r_text: 'd', deadline: '2027-06-01',
      updated_by: 'user-1', updated_at: '2026-03-04T05:06:07.123456+00:00'
    }
  });
  const { root, navigateLog, leave } = await renderSmartView(supabase, cat.id);

  if (textareas(root).length) fail('formulaire affiché alors que la catégorie n\'est pas révélée');
  else ok('aucun formulaire affiché avant la révélation');
  const read = supabase.queries.find((q) => q.table === 'smart_goals');
  if (read) fail(`objectif lu avant la révélation : ${JSON.stringify(read)}`);
  else ok('aucune lecture de smart_goals avant la révélation');
  if (navigateLog.some((r) => r.name === 'home')) ok('renvoi vers l\'accueil');
  else fail('l\'écran aurait dû renvoyer vers l\'accueil');
  leave();
}

console.log('\n== 21. Realtime : texte du partenaire affiché, champ focalisé intact ==');
{
  const cat = content.categories[0];
  const supabase = makeSupabase({
    people: PEOPLE, status: VALIDATED_BOTH,
    goalRow: {
      couple_id: 'couple-1', category_id: cat.id,
      s_text: null, m_text: null, a_text: null, r_text: null, deadline: null,
      updated_by: 'user-1', updated_at: '2026-03-04T05:06:07.123456+00:00'
    }
  });
  const { root, leave } = await renderSmartView(supabase, cat.id);
  const [sTa, mTa] = textareas(root);
  focusEl(sTa);
  await type(sTa, 'Mon brouillon');

  // Il écrit son M pendant que je reste focalisé(e) sur mon S.
  supabase.goalRows[0].m_text = 'Son M';
  supabase.goalRows[0].updated_at = '2026-07-07T07:07:07.111111+00:00';
  supabase.fire('smart_goals');
  await sleep(60);
  if (mTa.value !== 'Son M') fail(`son M n'est pas apparu : « ${mTa.value} »`);
  else ok('son texte M apparaît sur mon écran');
  if (sTa.value !== 'Mon brouillon') fail(`mon champ focalisé a été écrasé : « ${sTa.value} »`);
  else ok('mon champ focalisé conserve mon brouillon');

  // Il touche à MON champ : mon brouillon doit survivre aussi.
  supabase.goalRows[0].s_text = 'Son S';
  supabase.goalRows[0].updated_at = '2026-07-07T07:07:07.222222+00:00';
  supabase.fire('smart_goals');
  await sleep(60);
  if (sTa.value !== 'Mon brouillon') fail(`brouillon écrasé par l'événement Realtime : « ${sTa.value} »`);
  else ok('l\'événement Realtime n\'écrase jamais le champ focalisé');

  // Champ focalisé SANS brouillon : rien ne bouge tant que je regarde le champ,
  // la valeur serveur est reprise au moment où je le quitte.
  focusEl(mTa);
  supabase.goalRows[0].m_text = 'Leur M v2';
  supabase.goalRows[0].updated_at = '2026-07-07T07:07:07.333333+00:00';
  supabase.fire('smart_goals');
  await sleep(60);
  if (mTa.value !== 'Son M') fail(`champ focalisé réécrit pendant la saisie : « ${mTa.value} »`);
  else ok('champ focalisé sans brouillon : contenu intact pendant la saisie');
  blurEl(mTa);
  await sleep(10);
  if (mTa.value !== 'Leur M v2') fail(`pas de resynchronisation après le blur : « ${mTa.value} »`);
  else ok('après avoir quitté le champ, la valeur du partenaire reprend sa place');
  leave();
}

console.log('\n== 22. Alignement : « Continuer vers notre objectif » ==');
{
  const cat = content.categories[0];
  // Avec ma note : on continue vers l'objectif SMART de la catégorie.
  const withNote = makeSupabase({
    people: PEOPLE, status: VALIDATED_BOTH,
    alignment: [{ couple_id: 'couple-1', user_id: 'user-1', category_id: cat.id, score: 7 }]
  });
  const a = await renderAlignmentView(withNote, cat.id);
  const goalBtn = byText(a.root, 'BUTTON', ui.alignment.continueGoal);
  if (!goalBtn) fail(`bouton « ${ui.alignment.continueGoal} » absent`);
  else {
    await click(goalBtn);
    const routed = a.navigateLog.find((r) => r.name === 'smart');
    if (routed && routed.categoryId === cat.id) ok('après ma note, on continue vers l\'objectif SMART');
    else fail(`direction inattendue : ${JSON.stringify(a.navigateLog)}`);
  }
  a.leave();

  // Sans ma note : on retourne simplement à l'accueil.
  const noNote = makeSupabase({ people: PEOPLE, status: VALIDATED_BOTH });
  const b = await renderAlignmentView(noNote, cat.id);
  const backBtn = byText(b.root, 'BUTTON', ui.alignment.continue);
  if (!backBtn) fail(`bouton « ${ui.alignment.continue} » absent avant ma note`);
  else {
    await click(backBtn);
    if (b.navigateLog.some((r) => r.name === 'home')) ok('sans ma note : retour à l\'accueil');
    else fail(`sans ma note : ${JSON.stringify(b.navigateLog)} au lieu de l'accueil`);
  }
  b.leave();
}

console.log('\n== 23. Suivi d\'activité : ouverture, retour d\'onglet, retour réseau ==');
{
  // Ouverture sans session : aucun appel.
  const noSession = createActivity();
  const sb0 = makeSupabase();
  let sessionOn = false;
  const docL = {}; const winL = {};
  const fakeDoc = {
    visibilityState: 'hidden',
    addEventListener(type, fn) { (docL[type] ??= []).push(fn); }
  };
  const fakeWin = {
    addEventListener(type, fn) { (winL[type] ??= []).push(fn); }
  };
  noSession.start({ supabase: sb0, hasSession: () => sessionOn, doc: fakeDoc, win: fakeWin });
  if (sb0.rpcs.length !== 0) {
    fail(`ouverture sans session : ${sb0.rpcs.length} appel(s) à touch_activity`);
  }
  // Session présente : le retour d'onglet appelle une première fois…
  sessionOn = true;
  fakeDoc.visibilityState = 'visible';
  for (const fn of docL.visibilitychange ?? []) fn();
  if (sb0.rpcs.length !== 1 || sb0.rpcs[0] !== 'touch_activity') {
    fail(`retour d\'onglet : ${JSON.stringify(sb0.rpcs)} au lieu d\'un appel à touch_activity`);
  } else {
    // …puis le retour du réseau, dans la même demi-heure : plus rien (30 min).
    for (const fn of winL.online ?? []) fn();
    if (sb0.rpcs.length !== 1) {
      fail(`deux ouvertures rapprochées : ${sb0.rpcs.length} appels au lieu d\'1`);
    } else {
      ok('un seul appel à touch_activity sur deux ouvertures rapprochées (limite 30 min)');
    }
  }

  // Une instance neuve (30 min écoulées) : le retour du réseau appelle bien.
  const later = createActivity();
  const sb1 = makeSupabase();
  let lateSession = false;
  const doc2 = {}; const win2 = {};
  const fakeDoc2 = {
    visibilityState: 'visible',
    addEventListener(type, fn) { (doc2[type] ??= []).push(fn); }
  };
  const fakeWin2 = {
    addEventListener(type, fn) { (win2[type] ??= []).push(fn); }
  };
  later.start({ supabase: sb1, hasSession: () => lateSession, doc: fakeDoc2, win: fakeWin2 });
  lateSession = true;
  for (const fn of win2.online ?? []) fn();
  if (sb1.rpcs.length === 1 && sb1.rpcs[0] === 'touch_activity') {
    ok('retour du réseau : l\'écoute « online » déclenche touch_activity');
  } else {
    fail(`retour du réseau : ${JSON.stringify(sb1.rpcs)} au lieu d\'un appel à touch_activity`);
  }
}

console.log('\n== 24. Suivi d\'activité : aucun appel sans session ==');
{
  const activity = createActivity();
  const supabase = makeSupabase();
  const a = activity.touch(supabase, () => false);
  const b = activity.touch(supabase, null);
  if (a || b || supabase.rpcs.length !== 0) {
    fail(`sans session : ${supabase.rpcs.length} appel(s) tenté(s) (touch a renvoyé ${a}, ${b})`);
  } else {
    ok('aucun appel sans session (y compris sans fonction de session)');
  }
  if (!activity.touch(supabase, () => true)) fail('avec session : appel non tenté');
  else if (supabase.rpcs.length !== 1) fail(`avec session : ${JSON.stringify(supabase.rpcs)}`);
  else ok('avec session : touch_activity appelé une fois');
}

console.log('\n== 25. touch_activity : échec silencieux, le rendu continue ==');
{
  // La fonction n'existe pas : l\'exception ne doit pas sortir de touch().
  const supabase = makeSupabase();
  supabase.rpc = () => { throw new Error('function public.touch_activity() does not exist'); };
  const activity = createActivity();
  let threw = false;
  try { activity.touch(supabase, () => true); } catch { threw = true; }
  if (threw) fail('touch_activity : exception propagée alors que la fonction n\'existe pas');
  else ok('fonction absente (exception) : rien ne sort de touch_activity');

  // Réseau qui rejette : aucun rejet de promesse non géré.
  const rejets = [];
  const onRej = (err) => rejets.push(err);
  process.on('unhandledRejection', onRej);
  const sb2 = makeSupabase();
  sb2.rpc = () => Promise.reject(new Error('function public.touch_activity() does not exist'));
  createActivity().touch(sb2, () => true);
  await sleep(30);
  process.removeListener('unhandledRejection', onRej);
  if (rejets.length) fail(`touch_activity : ${rejets.length} rejet(s) de promesse non géré(s)`);
  else ok('réseau qui rejette : promesse gérée, aucun rejet non géré');

  // Le rendu du jeu reprend avec le même client dont la RPC est cassée.
  const root = await renderCategory(content.categories[0], supabase);
  if (questionEl(root)) ok('échec silencieux : le rendu des questions continue normalement');
  else fail('le rendu est interrompu après l\'échec de touch_activity');
}

await server.close();
console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

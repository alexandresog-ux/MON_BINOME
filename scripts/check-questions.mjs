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
globalThis.document = {
  createElement: (t) => new MiniEl(t),
  createTextNode: (t) => new MiniText(t)
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

// --- Stub Supabase --------------------------------------------------
function makeSupabase() {
  const rows = [];
  const log = [];
  const resolve = (s) => {
    if (s.table === 'couple_members') {
      return Promise.resolve({ data: [{ couple_id: 'couple-1' }], error: null });
    }
    if (s.table === 'category_status') return Promise.resolve({ data: [], error: null });
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
      upsert(payload) { s.op = 'upsert'; s.payload = payload; return q; },
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
      if (name === 'validate_category') {
        return Promise.resolve({ data: { ok: true, revealed: false }, error: null });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    },
    rows, log
  };
}

// --- Jeu ------------------------------------------------------------
const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error'
});
const { renderQuestions } = await server.ssrLoadModule('/src/views/questions.js');
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

await server.close();
console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

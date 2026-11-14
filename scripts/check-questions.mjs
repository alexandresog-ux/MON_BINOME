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
globalThis.window = { confirm: () => true, addEventListener() {}, removeEventListener() {} };

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

console.log('\n== 1. Chaque catégorie expose ses 8 questions ==');
for (const cat of content.categories) {
  const supabase = makeSupabase();
  const root = await renderCategory(cat, supabase);
  const seen = [];
  for (let i = 1; i <= 8; i += 1) {
    const label = t.progress(i, 8);
    if (!byText(root, 'P', label)) fail(`cat ${cat.id} : « ${label} » absente`);
    const textarea = walk(root).find((e) => e.tagName === 'TEXTAREA');
    if (!textarea) fail(`cat ${cat.id} q${i} : pas de champ de réponse`);
    const text = cat.questions[i - 1].text;
    if (!walk(root).some((e) => e.textContent.includes(text))) {
      fail(`cat ${cat.id} q${i} : texte de la question non affiché`);
    }
    await click(byText(root, 'BUTTON', t.skip));
    if (i < 8) await click(byText(root, 'BUTTON', t.next));
  }
  const expected = cat.questions.map((q) => q.id);
  const got = supabase.rows.map((r) => r.question_id);
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`cat ${cat.id} : enregistré [${got}] au lieu de [${expected}]`);
  } else {
    ok(`cat ${cat.id} : 8 questions visitées et enregistrées`);
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
  const chips = walk(root).filter((e) => e.tagName === 'BUTTON' && e.className.includes('chip'));
  if (chips.length !== 8) fail(`attendu 8 pastilles de navigation, obtenu ${chips.length}`);
  else ok('8 pastilles : accès direct à chaque question');
  await click(chips[7]); // saut direct sur la question 8
  const btn = byTextStart(root, 'BUTTON', t.validate);
  if (!btn) fail('bouton de validation absent sur la dernière question');
  else if (!/6 sur 8/.test(btn.textContent)) fail(`décompte absent : « ${btn.textContent} »`);
  else ok(`« ${btn.textContent} »`);
}

await server.close();
console.log(failures === 0 ? '\nTOUS LES TESTS PASSENT\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);

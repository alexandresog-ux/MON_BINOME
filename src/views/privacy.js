import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import { privacy, PRIVACY_FLAGS, privacyDate } from '../data/privacy.fr.js';

// Un segment : texte simple ou { b: 'gras' } — toujours des nœuds texte (h()).
const seg = (part) => (typeof part === 'string' ? part : h('strong', {}, part.b));
// Liste de segments : accepte une chaîne, un segment gras ou un tableau.
const segs = (...parts) => parts.flat().map(seg);

// Un bloc de la politique : paragraphe, liste à puces ou tableau. Le champ
// `flag` (paragraphe, tableau ou puce de liste) n'affiche le bloc que si le
// drapeau correspondant est vrai dans PRIVACY_FLAGS.
const flagOk = (block) => !block.flag || Boolean(PRIVACY_FLAGS[block.flag]);

function blockEl(block) {
  if (!flagOk(block)) return null;
  if (block.table) {
    const { head, rows } = block.table;
    return h('table', { class: 'privacy-table' },
      h('thead', {}, h('tr', {}, ...head.map((c) => h('th', { scope: 'col' }, ...segs(c))))),
      h('tbody', {}, ...rows.map((row) =>
        h('tr', {}, ...row.map((cell) => h('td', {}, ...segs(cell)))))));
  }
  if (block.ul) {
    const items = block.ul
      .map((item) => (Array.isArray(item) ? { li: item } : item))
      .filter(flagOk);
    return h('ul', { class: 'privacy-list' }, ...items.map((item) => h('li', {}, ...segs(item.li))));
  }
  return h('p', {}, ...segs(block.p));
}

// Politique de confidentialité : lisible SANS session (depuis l'écran de
// connexion comme depuis les Paramètres). Page 100 % statique : aucun appel à
// Supabase, aucune donnée d'utilisateur. Aucun contenu utilisateur ne peut donc
// jamais atterrir ici (les textes sont nœuds texte via h()).
export function renderPrivacy(root, { navigate } = {}) {
  const date = privacyDate();
  root.append(
    h('header', { class: 'hero' },
      h('h1', {}, privacy.title),
      h('p', { class: 'muted' }, privacy.version(date))),
    h('p', {}, ...privacy.intro.map(seg)),
    ...privacy.sections.map((section) => h('section', { class: 'card' },
      h('h2', {}, `${section.n}. ${section.title}`),
      ...section.blocks.map(blockEl).filter(Boolean))),
    h('p', { class: 'center' },
      h('button', { class: 'link', type: 'button', onclick: () => navigate?.({ name: 'home' }) }, ui.privacy.back))
  );
}

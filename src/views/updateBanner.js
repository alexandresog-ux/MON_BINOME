import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';

// Bannière « nouvelle version » : le service worker la signale, on la propose,
// on ne recharge JAMAIS à l'initiative de l'app (l'utilisateur peut être en
// train d'écrire). À créer UNE seule fois (voir main.js).
export function updateBanner(onRefresh) {
  const t = ui.update;
  return h('aside', { class: 'update', hidden: true },
    h('span', {}, t.text),
    h('button', { class: 'btn small', type: 'button', onclick: onRefresh }, t.refresh));
}

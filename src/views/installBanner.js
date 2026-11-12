import { h } from '../dom.js';
import { ui } from '../data/ui.fr.js';
import { canPromptInstall, isIOS, isStandalone, onInstallStateChange, promptInstall } from '../install.js';

// À créer UNE seule fois (voir main.js).
export function installBanner() {
  const box = h('aside', { class: 'install', hidden: true });

  function update() {
    box.replaceChildren();
    if (isStandalone()) { box.hidden = true; return; }
    if (canPromptInstall()) {
      box.hidden = false;
      box.append(
        h('span', {}, ui.install.android),
        h('button', { class: 'btn small', type: 'button', onclick: () => promptInstall() }, ui.install.button)
      );
    } else if (isIOS()) {
      box.hidden = false;
      box.append(h('span', {}, ui.install.ios));
    } else {
      box.hidden = true;
    }
  }

  onInstallStateChange(update);
  update();
  return box;
}

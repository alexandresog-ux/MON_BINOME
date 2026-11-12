// Installation de la PWA : bouton Android/Chrome + consigne pour iPhone/Safari.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canPromptInstall = () => deferredPrompt !== null;

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome === 'accepted';
}

export function onInstallStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

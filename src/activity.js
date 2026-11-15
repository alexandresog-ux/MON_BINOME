// Suivi d'activité : la RPC touch_activity() dit à la base que le couple est
// en vie. Une instance = un compteur : au plus un appel toutes les 30 minutes,
// que ce soit à l'ouverture de l'application, au retour de l'onglet au premier
// plan (visibilitychange) ou au retour du réseau (online). Échec silencieux :
// aucune attente, aucune exception propagée — le jeu continue même si la
// fonction n'existe pas côté base.

const GAP_MS = 30 * 60 * 1000;

export function createActivity() {
  let lastTouch = 0;

  // hasSession : () => boolean. Sans session, aucun appel n'est tenté.
  // Renvoie true seulement si un appel a réellement été envoyé.
  function touch(supabase, hasSession) {
    if (typeof hasSession !== 'function' || !hasSession()) return false;
    const now = Date.now();
    if (now - lastTouch < GAP_MS) return false;
    lastTouch = now;
    if (!supabase || typeof supabase.rpc !== 'function') return false;
    try {
      const pending = supabase.rpc('touch_activity');
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch { /* fonction absente ou réseau indisponible : on ignore */ }
    return true;
  }

  // Les écouteurs du retour d'onglet et du retour réseau ; l'ouverture est
  // couverte par l'appel initial ci-dessous (et, dans main.js, par l'événement
  // d'authentification qui arrive par setTimeout). doc/win sont injectables
  // pour les tests.
  function start({ supabase, hasSession, doc = document, win = window } = {}) {
    const fire = () => { touch(supabase, hasSession); };
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') fire();
    });
    win.addEventListener('online', fire);
    fire();
  }

  return { touch, start };
}

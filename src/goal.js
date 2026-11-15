// Règles communes de l'objectif SMART d'une catégorie : les 4 lettres (S, M, A, R)
// et l'échéance (T). Ces règles servent à l'écran d'écriture ET à l'accueil, afin
// que « objectif complet » veuille dire exactement la même chose des deux côtés.

// Les 4 textes libres (l'échéance est un champ à part, de type date).
export const GOAL_TEXT_KEYS = ['s', 'm', 'a', 'r'];
// L'ordre d'affichage : les 4 lettres puis l'échéance.
export const GOAL_FIELD_KEYS = [...GOAL_TEXT_KEYS, 'deadline'];
// Clé d'interface → colonne de la table smart_goals.
export const GOAL_COLS = { s: 's_text', m: 'm_text', a: 'a_text', r: 'r_text', deadline: 'deadline' };
// Colonnes lues (liste explicite : jamais select('*')).
export const GOAL_SELECT = 'category_id, s_text, m_text, a_text, r_text, deadline, updated_by, updated_at';

// Objectif complet : les 4 textes non vides (après trim) ET une échéance.
export function isGoalComplete(row) {
  if (!row) return false;
  const written = GOAL_TEXT_KEYS.every((key) => String(row[GOAL_COLS[key]] ?? '').trim());
  return written && Boolean(row.deadline);
}

// Objectif vide : rien du tout → « à écrire ».
export function isGoalEmpty(row) {
  if (!row) return true;
  const nothing = !GOAL_TEXT_KEYS.some((key) => String(row[GOAL_COLS[key]] ?? '').trim());
  return nothing && !row.deadline;
}

-- ---------------------------------------------------------------------
-- Proposition — 2026-11-16 — Écran Paramètres (LOT 6)
-- NE PAS EXÉCUTER sans relecture : ce fichier est une proposition rangée
-- dans supabase/proposals/, il n'est PAS appliqué automatiquement.
--
-- Besoin : « Comptes bloqués » dans les Paramètres. La table public.blocks
-- n'a ni SELECT ni UPDATE pour les comptes connectés (cf. schema.sql) et on
-- ne lira JAMAIS directement côté client : on passe par ces deux fonctions
-- en SECURITY DEFINER, conformément au contrat RPC du projet (retours
-- { ok } ou lignes). Les textes d'erreur réutilisent les codes existants.
--
-- Après exécution : relancer supabase/tests.sql.
-- ---------------------------------------------------------------------

-- Lister les comptes que J'AI bloqués (jamais l'inverse, jamais la table
-- en lecture directe). Une ligne par blocage, avec le prénom bloqué.
create or replace function public.list_my_blocks()
returns table (blocked_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.blocked_id, p.display_name, b.created_at
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

-- Débloquer un compte que J'AI bloqué. 0 ligne touchée = code d'erreur
-- (la même discipline que les autres RPC : jamais d'erreur métier levée).
create or replace function public.unblock_user(p_blocked uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  if p_blocked is null then return jsonb_build_object('ok', false, 'error', 'demande_introuvable'); end if;
  delete from public.blocks where blocker_id = me and blocked_id = p_blocked;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'demande_introuvable'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.list_my_blocks(), public.unblock_user(uuid)
  to authenticated;

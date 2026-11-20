-- =====================================================================
-- 002_consentement_orphelins.sql — MON BINÔME
-- À exécuter dans Supabase SQL Editor APRÈS 001_inactivite_deblocage.sql.
-- Puis exécuter, dans cet ordre : 002_tests.sql, tests.sql, 001_tests.sql
-- (les deux derniers ont été mis à jour : leurs faux comptes portent maintenant
-- les champs de consentement, sinon la base les refuserait).
--
-- ⚠️ Non exécuté dans l'environnement où il a été écrit : lance les tests
--    et corrige toute erreur AVANT d'ouvrir l'application au public.
--
-- Contenu
--  1. Consentement obligatoire : une inscription est REFUSÉE par la base si
--     user_metadata ne contient pas adult_confirmed = true et un consent_version
--     valide. La case à cocher de l'interface n'est plus contournable en
--     appelant directement l'API d'inscription.
--     Le consentement (version + date) est conservé dans profiles ;
--     ces colonnes ne sont lisibles par personne côté application.
--  2. Couple orphelin : dès qu'un couple compte moins de 2 membres (suppression
--     d'un compte par le tableau de bord, par exemple), le couple et toutes ses
--     données sont supprimés automatiquement.
--
-- Conséquence à connaître : « Add user » / « Invite user » dans le tableau de
-- bord Supabase échoueront (pas de consentement). Les comptes de test créés
-- à la main en SQL doivent inclure les deux champs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Consentement
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz;

-- Aucun GRANT sur ces colonnes : elles restent illisibles pour les utilisateurs.
-- Les comptes déjà existants gardent consent_version = null.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_version text := v_meta ->> 'consent_version';
begin
  if coalesce(v_meta ->> 'adult_confirmed', '') <> 'true'
     or v_version is null
     or v_version !~ '^[0-9A-Za-z._-]{1,32}$' then
    raise exception 'consentement_requis: confirmation d''age et consentement obligatoires';
  end if;

  insert into public.profiles (id, display_name, consent_version, consent_at)
  values (
    new.id,
    left(coalesce(nullif(btrim(v_meta ->> 'display_name'), ''), 'Utilisateur'), 40),
    v_version,
    now()
  );
  return new;
end;
$$;

-- Le déclencheur on_auth_user_created (schema.sql) appelle déjà handle_new_user() :
-- le remplacement de la fonction suffit.

-- ---------------------------------------------------------------------
-- 2. Couples orphelins
-- ---------------------------------------------------------------------
create or replace function public.cleanup_lonely_couple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.couple_members where couple_id = old.couple_id) < 2 then
    delete from public.couples where id = old.couple_id;   -- cascade : réponses, notes, objectifs, bilan
  end if;
  return null;
end;
$$;

drop trigger if exists couple_members_cleanup on public.couple_members;
create trigger couple_members_cleanup
  after delete on public.couple_members
  for each row execute function public.cleanup_lonely_couple();

-- ---------------------------------------------------------------------
-- Privilèges : ces fonctions ne sont appelées que par les déclencheurs
-- ---------------------------------------------------------------------
revoke all on function public.handle_new_user()       from public, anon, authenticated;
revoke all on function public.cleanup_lonely_couple() from public, anon, authenticated;

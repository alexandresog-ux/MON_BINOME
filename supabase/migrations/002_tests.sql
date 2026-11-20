-- =====================================================================
-- 002_tests.sql — vérifie la migration 002 (consentement, couples orphelins)
--
-- À exécuter dans Supabase SQL Editor APRÈS 002_consentement_orphelins.sql.
-- Crée des faux utilisateurs dans une transaction puis fait ROLLBACK.
--
--  - Succès : la dernière requête affiche « TOUS LES TESTS PASSENT ».
--  - Échec  : une erreur « ÉCHEC : ... » indique le test raté. Lance alors `rollback;`.
-- =====================================================================

begin;

create function pg_temp.login(p uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
          json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $f$;

create function pg_temp.admin() returns void language plpgsql as $f$
begin
  execute 'reset role';
end $f$;

create function pg_temp.check_(cond boolean, label text) returns void language plpgsql as $f$
begin
  if cond is distinct from true then
    raise exception 'ÉCHEC : %', label;
  end if;
end $f$;

do $test$
declare
  u1 constant uuid := '00000000-0000-0000-0000-0000000000e1';
  u2 constant uuid := '00000000-0000-0000-0000-0000000000e2';
  u3 constant uuid := '00000000-0000-0000-0000-0000000000e3';
  u4 constant uuid := '00000000-0000-0000-0000-0000000000e4';
  x  constant uuid := '00000000-0000-0000-0000-0000000000f0';
  c1 uuid; c2 uuid; res jsonb;
begin
  perform pg_temp.admin();

  ---------------------------------------------------------------
  -- A. Consentement obligatoire
  ---------------------------------------------------------------
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', 'x1@test3.local', '{"display_name":"Sans"}', now(), now());
    raise exception 'ÉCHEC : inscription acceptée sans consentement';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', 'x2@test3.local',
            '{"display_name":"Mineur","adult_confirmed":false,"consent_version":"2026-11-16"}', now(), now());
    raise exception 'ÉCHEC : inscription acceptée avec adult_confirmed = false';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', 'x3@test3.local',
            '{"display_name":"SansVersion","adult_confirmed":true}', now(), now());
    raise exception 'ÉCHEC : inscription acceptée sans consent_version';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (x, 'authenticated', 'authenticated', 'x4@test3.local',
            '{"display_name":"Bidon","adult_confirmed":true,"consent_version":"<script>alert(1)</script>"}', now(), now());
    raise exception 'ÉCHEC : consent_version invalide accepté';
  exception when raise_exception then
    if sqlerrm like 'ÉCHEC%' then raise; end if;
  end;

  perform pg_temp.check_(
    (select count(*) from public.profiles where id = x) = 0
    and (select count(*) from auth.users where id = x) = 0,
    'aucun compte créé par les inscriptions refusées');

  -- Inscriptions valides (booléen JSON et chaîne « true » acceptés)
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values
    (u1, 'authenticated', 'authenticated', 'e1@test3.local',
     '{"display_name":"E1","adult_confirmed":true,"consent_version":"2026-11-16"}', now(), now()),
    (u2, 'authenticated', 'authenticated', 'e2@test3.local',
     '{"display_name":"E2","adult_confirmed":"true","consent_version":"2026-11-16"}', now(), now()),
    (u3, 'authenticated', 'authenticated', 'e3@test3.local',
     '{"display_name":"E3","adult_confirmed":true,"consent_version":"2026-11-16"}', now(), now()),
    (u4, 'authenticated', 'authenticated', 'e4@test3.local',
     '{"display_name":"E4","adult_confirmed":true,"consent_version":"2026-11-16"}', now(), now());

  perform pg_temp.check_(
    (select count(*) from public.profiles where id in (u1, u2, u3, u4)) = 4,
    'inscriptions valides acceptées');
  perform pg_temp.check_(
    (select consent_version from public.profiles where id = u1) = '2026-11-16'
    and (select consent_at from public.profiles where id = u1) is not null,
    'version et date de consentement enregistrées');
  perform pg_temp.check_(
    (select display_name from public.profiles where id = u1) = 'E1',
    'le prénom est toujours enregistré');

  perform pg_temp.login(u1);
  begin
    perform consent_version from public.profiles;
    raise exception 'ÉCHEC : consent_version lisible par l''utilisateur';
  exception when insufficient_privilege then null;
  end;
  begin
    perform consent_at from public.profiles;
    raise exception 'ÉCHEC : consent_at lisible par l''utilisateur';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.admin();

  ---------------------------------------------------------------
  -- B. Couple orphelin : un compte disparaît -> le couple et ses données aussi
  ---------------------------------------------------------------
  insert into public.couples default values returning id into c1;
  insert into public.couple_members (couple_id, user_id) values (c1, u1), (c1, u2);
  insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
  values (c1, u1, 1, 'c01q01', true), (c1, u2, 1, 'c01q01', true);
  insert into public.alignment (couple_id, user_id, category_id, score) values (c1, u1, 1, 7);
  insert into public.smart_goals (couple_id, category_id, s_text) values (c1, 1, 'test');

  -- Suppression « sauvage » d'un compte (comme depuis le tableau de bord)
  delete from auth.users where id = u1;

  perform pg_temp.check_((select count(*) from public.couples where id = c1) = 0,
                         'le couple orphelin est supprimé');
  perform pg_temp.check_((select count(*) from public.couple_members where couple_id = c1) = 0,
                         'les membres du couple sont retirés');
  perform pg_temp.check_(
    (select count(*) from public.answers where couple_id = c1) = 0
    and (select count(*) from public.alignment where couple_id = c1) = 0
    and (select count(*) from public.smart_goals where couple_id = c1) = 0,
    'réponses, notes et objectifs supprimés avec le couple');
  perform pg_temp.check_((select count(*) from public.profiles where id = u2) = 1,
                         'le partenaire garde son compte');
  perform pg_temp.login(u2);
  perform pg_temp.check_(public.my_couple_id() is null, 'le partenaire n''est plus lié à un couple fantôme');
  perform pg_temp.admin();

  ---------------------------------------------------------------
  -- C. Les parcours existants fonctionnent toujours
  ---------------------------------------------------------------
  insert into public.couples default values returning id into c2;
  insert into public.couple_members (couple_id, user_id) values (c2, u3), (c2, u4);
  insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
  values (c2, u3, 1, 'c01q01', true);

  perform pg_temp.login(u3);
  res := public.unlink_couple(true);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'unlink_couple fonctionne');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from public.couples where id = c2) = 0
    and (select count(*) from public.answers where couple_id = c2) = 0,
    'déliaison : couple et données supprimés');
  perform pg_temp.check_(
    (select count(*) from public.profiles where id in (u3, u4)) = 2,
    'déliaison : les deux comptes existent toujours');
  perform pg_temp.check_(
    (select count(*) from public.blocks where blocker_id = u3 and blocked_id = u4) = 1,
    'déliaison : blocage enregistré');

  -- Suppression de compte par la fonction prévue
  insert into public.couples default values returning id into c2;
  insert into public.couple_members (couple_id, user_id) values (c2, u3), (c2, u4);
  perform pg_temp.login(u3);
  res := public.delete_my_account();
  perform pg_temp.check_((res ->> 'ok')::boolean, 'delete_my_account fonctionne');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from auth.users where id = u3) = 0
    and (select count(*) from public.couples where id = c2) = 0
    and (select count(*) from public.profiles where id = u4) = 1,
    'suppression de compte : compte et couple supprimés, partenaire conservé');
end
$test$;

rollback;

select 'TOUS LES TESTS PASSENT' as resultat;

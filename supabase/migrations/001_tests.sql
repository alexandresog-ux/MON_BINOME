-- =====================================================================
-- 001_tests.sql — vérifie la migration 001 (activité, purge, déblocage)
--
-- À exécuter dans Supabase SQL Editor APRÈS 001_inactivite_deblocage.sql.
-- Crée 8 faux utilisateurs dans une transaction puis fait ROLLBACK.
--
--  - Succès : la dernière requête affiche « TOUS LES TESTS PASSENT ».
--  - Échec  : une erreur « ÉCHEC : ... » indique le test raté. Lance alors `rollback;`.
--
-- Garde-fou : si ta base contient déjà des comptes inactifs depuis plus de
-- 2 mois, le test s'arrête avant toute suppression (même annulée).
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

-- Utilisateurs U1 à U8 (prénoms « U1 » à « U8 »)
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', 't' || n || '@test2.local',
       jsonb_build_object('display_name', 'U' || n, 'adult_confirmed', true, 'consent_version', 'test'), now(), now()
from generate_series(1, 8) n;

do $test$
declare
  u1 constant uuid := '00000000-0000-0000-0000-000000000001';
  u2 constant uuid := '00000000-0000-0000-0000-000000000002';
  u3 constant uuid := '00000000-0000-0000-0000-000000000003';
  u4 constant uuid := '00000000-0000-0000-0000-000000000004';
  u5 constant uuid := '00000000-0000-0000-0000-000000000005';
  u6 constant uuid := '00000000-0000-0000-0000-000000000006';
  u7 constant uuid := '00000000-0000-0000-0000-000000000007';
  u8 constant uuid := '00000000-0000-0000-0000-000000000008';
  c1 uuid; c2 uuid; code1 text; res jsonb;
begin
  ---------------------------------------------------------------
  -- A. Suivi d'activité
  ---------------------------------------------------------------
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from public.profiles
      where id in (u1, u2, u3, u4, u5, u6, u7, u8) and last_active_at >= now() - interval '1 minute') = 8,
    'les nouveaux profils démarrent avec une activité récente');

  update public.profiles set last_active_at = now() - interval '30 minutes' where id = u1;
  perform pg_temp.login(u1);
  res := public.touch_activity();
  perform pg_temp.check_((res ->> 'ok')::boolean, 'touch_activity répond ok');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select last_active_at from public.profiles where id = u1) = now() - interval '30 minutes',
    'pas de mise à jour si activité de moins d''une heure');

  update public.profiles set last_active_at = now() - interval '2 hours' where id = u1;
  perform pg_temp.login(u1);
  perform public.touch_activity();
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select last_active_at from public.profiles where id = u1) = now(),
    'mise à jour si activité de plus d''une heure');

  perform pg_temp.login(u1);
  begin
    perform last_active_at from public.profiles;
    raise exception 'ÉCHEC : last_active_at lisible par l''utilisateur';
  exception when insufficient_privilege then null;
  end;

  ---------------------------------------------------------------
  -- B. Déblocage
  ---------------------------------------------------------------
  perform pg_temp.admin();
  insert into public.blocks (blocker_id, blocked_id) values (u1, u2);

  perform pg_temp.login(u1);
  begin
    perform 1 from public.blocks;
    raise exception 'ÉCHEC : la table blocks est lisible directement';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.check_((select count(*) from public.list_my_blocks()) = 1, 'U1 voit son blocage');
  perform pg_temp.check_((select display_name from public.list_my_blocks()) = 'U2', 'prénom de la personne bloquée');
  code1 := public.my_contact_code();

  perform pg_temp.login(u2);
  perform pg_temp.check_((select count(*) from public.list_my_blocks()) = 0, 'U2 ne voit pas qu''il est bloqué');
  res := public.send_pair_request(code1);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'réponse uniforme quand on est bloqué');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from public.pair_requests where requester_id = u2 and recipient_id = u1) = 0,
    'aucune demande créée vers qui nous a bloqué');

  perform pg_temp.login(u2);
  res := public.unblock_user(u1);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'unblock_user répond ok même sans blocage');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from public.blocks where blocker_id = u1 and blocked_id = u2) = 1,
    'U2 ne peut pas supprimer le blocage de U1');

  perform pg_temp.login(u1);
  res := public.unblock_user(u2);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'U1 débloque U2');
  perform pg_temp.check_((select count(*) from public.list_my_blocks()) = 0, 'liste vide après déblocage');

  perform pg_temp.login(u2);
  res := public.send_pair_request(code1);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'U2 peut de nouveau envoyer une demande');
  perform pg_temp.admin();
  perform pg_temp.check_(
    (select count(*) from public.pair_requests
      where requester_id = u2 and recipient_id = u1 and status = 'pending') = 1,
    'la demande est créée après déblocage');

  ---------------------------------------------------------------
  -- C. Suppression des comptes inactifs
  --    Couple 1 (U3, U4) : tous deux inactifs        -> supprimé
  --    Couple 2 (U5, U6) : U5 inactif, U6 actif      -> conservé (les deux comptes)
  --    U7 non lié, inactif                           -> supprimé
  --    U8 non lié, actif                             -> conservé
  ---------------------------------------------------------------
  perform pg_temp.admin();
  insert into public.couples default values returning id into c1;
  insert into public.couple_members (couple_id, user_id) values (c1, u3), (c1, u4);
  insert into public.couples default values returning id into c2;
  insert into public.couple_members (couple_id, user_id) values (c2, u5), (c2, u6);
  insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
  values (c1, u3, 1, 'c01q01', true);

  update public.profiles set last_active_at = now() - interval '3 months' where id in (u3, u4, u5, u7);

  -- Droits : personne d'autre que le propriétaire ne peut appeler la purge
  perform pg_temp.login(u8);
  begin
    perform public.purge_inactive_accounts(true);
    raise exception 'ÉCHEC : un utilisateur peut appeler la purge';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform public.purge_inactive_accounts(true);
    raise exception 'ÉCHEC : anon peut appeler la purge';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.touch_activity();
    raise exception 'ÉCHEC : anon peut appeler touch_activity';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.unblock_user(u1);
    raise exception 'ÉCHEC : anon peut appeler unblock_user';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.admin();

  -- Comptage (sans suppression, valeur par défaut)
  res := public.purge_inactive_accounts();
  perform pg_temp.check_((res ->> 'dry_run')::boolean, 'dry_run par défaut');
  if (res ->> 'couples')::int <> 1 or (res ->> 'accounts')::int <> 3 then
    raise exception 'ÉCHEC : comptage inattendu (couples=%, comptes=%). Si la base contient déjà des comptes inactifs, ce test ne doit pas aller plus loin.',
      res ->> 'couples', res ->> 'accounts';
  end if;
  perform pg_temp.check_(
    (select count(*) from public.profiles where id in (u3, u4, u5, u6, u7, u8)) = 6,
    'le comptage ne supprime rien');

  -- Suppression réelle (annulée par le rollback final)
  res := public.purge_inactive_accounts(false);
  perform pg_temp.check_(not (res ->> 'dry_run')::boolean, 'purge réelle');
  perform pg_temp.check_(
    (select count(*) from public.profiles where id in (u3, u4, u7)) = 0
    and (select count(*) from auth.users where id in (u3, u4, u7)) = 0,
    'comptes inactifs supprimés (couple 1 et compte non lié)');
  perform pg_temp.check_((select count(*) from public.couples where id = c1) = 0, 'couple inactif supprimé');
  perform pg_temp.check_((select count(*) from public.answers where couple_id = c1) = 0, 'données du couple supprimées');
  perform pg_temp.check_(
    (select count(*) from public.profiles where id in (u5, u6, u8)) = 3,
    'comptes actifs et partenaire d''un actif conservés');
  perform pg_temp.check_(
    (select count(*) from public.couples where id = c2) = 1
    and (select count(*) from public.couple_members where couple_id = c2) = 2,
    'couple avec un seul partenaire actif conservé');
end
$test$;

rollback;

select 'TOUS LES TESTS PASSENT' as resultat;

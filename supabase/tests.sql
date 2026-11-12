-- =====================================================================
-- tests.sql — vérifie la sécurité (RLS) et le parcours d'appairage
--
-- À exécuter dans Supabase SQL Editor APRÈS schema.sql.
-- Le script crée 4 faux utilisateurs dans une transaction puis fait
-- ROLLBACK : rien n'est conservé.
--
--  - Succès : la dernière requête affiche « TOUS LES TESTS PASSENT ».
--  - Échec  : une erreur « ÉCHEC : ... » indique le test raté.
--            Lance alors `rollback;` pour fermer la transaction.
--
-- ⚠️ Ne mets PAS de vraies données avant que tous les tests passent.
-- =====================================================================

begin;

-- Utilitaires temporaires (disparaissent à la fin de la session)
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

-- Faux utilisateurs : Alice (A), Bruno (B), Clara (C, étrangère), David (D, force brute)
insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@test.local', '{"display_name":"Alice"}', now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@test.local', '{"display_name":"Bruno"}', now(), now()),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c@test.local', '{"display_name":"Clara"}', now(), now()),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'd@test.local', '{"display_name":"David"}', now(), now());

do $test$
declare
  ua constant uuid := '00000000-0000-0000-0000-0000000000a1';
  ub constant uuid := '00000000-0000-0000-0000-0000000000b2';
  uc constant uuid := '00000000-0000-0000-0000-0000000000c3';
  ud constant uuid := '00000000-0000-0000-0000-0000000000d4';
  code_a text; code_b text; code_c text;
  res jsonb; n int; i int; req uuid;
begin
  ---------------------------------------------------------------
  -- 1. Profils et codes de contact
  ---------------------------------------------------------------
  perform pg_temp.admin();
  perform pg_temp.check_((select count(*) from public.profiles where id in (ua, ub, uc, ud)) = 4,
                         'profils créés automatiquement à l''inscription');

  perform pg_temp.login(ua);
  begin
    perform contact_code from public.profiles;
    raise exception 'ÉCHEC : contact_code lisible directement par SELECT';
  exception when insufficient_privilege then null;
  end;
  code_a := public.my_contact_code();
  perform pg_temp.check_(code_a ~ '^SOG-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'format du code de contact');
  perform pg_temp.login(ub); code_b := public.my_contact_code();
  perform pg_temp.login(uc); code_c := public.my_contact_code();
  perform pg_temp.check_(code_a <> code_b and code_b <> code_c and code_a <> code_c, 'codes distincts');

  -- Pas d'annuaire : C ne voit que son propre profil
  perform pg_temp.check_((select count(*) from public.profiles) = 1, 'aucun annuaire : C ne voit que lui-même');

  ---------------------------------------------------------------
  -- 2. Anti-devinage
  ---------------------------------------------------------------
  perform pg_temp.login(ud);
  for i in 1..5 loop
    res := public.send_pair_request('SOG-ZZZZ-ZZZ' || i);
    perform pg_temp.check_(res ->> 'error' = 'code_invalide', 'code invalide n°' || i);
  end loop;
  res := public.send_pair_request(code_a);
  perform pg_temp.check_(res ->> 'error' = 'trop_de_tentatives',
                         'blocage après 5 échecs (même avec un code valide)');

  ---------------------------------------------------------------
  -- 3. Appairage avec consentement
  ---------------------------------------------------------------
  perform pg_temp.login(uc);
  res := public.send_pair_request(code_c);
  perform pg_temp.check_(res ->> 'error' = 'code_invalide', 'impossible de s''appairer avec soi-même');

  perform pg_temp.login(ua);
  res := public.send_pair_request(lower(replace(code_b, '-', ' ')));
  perform pg_temp.check_((res ->> 'ok')::boolean, 'demande envoyée (code saisi en minuscules avec espaces)');
  perform pg_temp.check_((select count(*) from public.pair_requests) = 1, 'A voit sa demande envoyée');

  perform pg_temp.login(ub);
  perform pg_temp.check_((select count(*) from public.list_incoming_requests()) = 1, 'B reçoit 1 demande');
  perform pg_temp.check_((select from_name from public.list_incoming_requests()) = 'Alice', 'prénom du demandeur');
  select request_id into req from public.list_incoming_requests();

  perform pg_temp.login(uc);
  res := public.respond_pair_request(req, true);
  perform pg_temp.check_(res ->> 'error' = 'demande_introuvable', 'C ne peut pas répondre à la demande de B');

  perform pg_temp.login(ub);
  res := public.respond_pair_request(req, true);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'B accepte la demande');

  perform pg_temp.login(ua);
  perform pg_temp.check_(public.my_couple_id() is not null, 'A a un couple');
  perform pg_temp.check_((select count(*) from public.profiles) = 2, 'A voit seulement lui + son partenaire');
  perform pg_temp.login(uc);
  perform pg_temp.check_((select count(*) from public.couples) = 0, 'C ne voit aucun couple');

  ---------------------------------------------------------------
  -- 4. Réponses : confidentialité avant révélation
  ---------------------------------------------------------------
  perform pg_temp.login(ub);
  res := public.validate_category(1::smallint);
  perform pg_temp.check_(res ->> 'error' = 'categorie_incomplete', 'validation refusée si catégorie incomplète');

  perform pg_temp.login(ua);
  begin
    insert into public.answers (couple_id, user_id, category_id, question_id, body)
    values (public.my_couple_id(), ub, 1, 'c01q01', 'usurpation');
    raise exception 'ÉCHEC : A a pu écrire une réponse au nom de B';
  exception when insufficient_privilege then null;
  end;

  for i in 1..8 loop
    if i = 1 then
      insert into public.answers (couple_id, user_id, category_id, question_id, body)
      values (public.my_couple_id(), ua, 1, 'c01q01', 'secret de A');
    else
      insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
      values (public.my_couple_id(), ua, 1, format('c01q%s', lpad(i::text, 2, '0')), true);
    end if;
  end loop;
  res := public.validate_category(1::smallint);
  perform pg_temp.check_((res ->> 'ok')::boolean and not (res ->> 'revealed')::boolean,
                         'A valide, pas encore révélé');

  perform pg_temp.login(ub);
  perform pg_temp.check_((select count(*) from public.answers where user_id = ua) = 0,
                         'B ne voit PAS les réponses de A (A a validé, pas B)');
  for i in 1..8 loop
    if i = 1 then
      insert into public.answers (couple_id, user_id, category_id, question_id, body)
      values (public.my_couple_id(), ub, 1, 'c01q01', 'secret de B');
    else
      insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
      values (public.my_couple_id(), ub, 1, format('c01q%s', lpad(i::text, 2, '0')), true);
    end if;
  end loop;
  perform pg_temp.check_((select count(*) from public.answers where user_id = ua) = 0,
                         'B ne voit toujours pas A avant sa propre validation');
  res := public.validate_category(1::smallint);
  perform pg_temp.check_((res ->> 'revealed')::boolean, 'révélation quand les deux ont validé');
  perform pg_temp.check_((select count(*) from public.answers where user_id = ua) = 8, 'B voit les 8 réponses de A');
  perform pg_temp.login(ua);
  perform pg_temp.check_((select count(*) from public.answers where user_id = ub) = 8, 'A voit les 8 réponses de B');
  perform pg_temp.login(uc);
  perform pg_temp.check_((select count(*) from public.answers) = 0, 'C ne voit aucune réponse');

  -- Verrouillage après validation
  perform pg_temp.login(ua);
  update public.answers set body = 'modifié', skipped = false where user_id = ua and question_id = 'c01q01';
  get diagnostics n = row_count;
  perform pg_temp.check_(n = 0, 'réponse verrouillée après validation');

  -- Catégorie 2 : A seul valide -> rien n'est révélé à B
  for i in 1..8 loop
    insert into public.answers (couple_id, user_id, category_id, question_id, skipped)
    values (public.my_couple_id(), ua, 2, format('c02q%s', lpad(i::text, 2, '0')), true);
  end loop;
  perform public.validate_category(2::smallint);
  perform pg_temp.login(ub);
  perform pg_temp.check_((select count(*) from public.answers where user_id = ua and category_id = 2) = 0,
                         'catégorie 2 non révélée (B n''a pas validé)');

  ---------------------------------------------------------------
  -- 5. Notes d'alignement
  ---------------------------------------------------------------
  perform pg_temp.login(ua);
  begin
    insert into public.alignment (couple_id, user_id, category_id, score)
    values (public.my_couple_id(), ua, 2, 7);
    raise exception 'ÉCHEC : note saisie avant révélation de la catégorie';
  exception when insufficient_privilege then null;
  end;
  insert into public.alignment (couple_id, user_id, category_id, score)
  values (public.my_couple_id(), ua, 1, 7);
  perform pg_temp.login(ub);
  perform pg_temp.check_((select count(*) from public.alignment where user_id = ua) = 0,
                         'note de A invisible tant que B n''a pas noté');
  insert into public.alignment (couple_id, user_id, category_id, score)
  values (public.my_couple_id(), ub, 1, 4);
  perform pg_temp.check_((select count(*) from public.alignment where user_id = ua) = 1,
                         'notes visibles quand les deux ont noté');

  ---------------------------------------------------------------
  -- 6. Objectif SMART partagé
  ---------------------------------------------------------------
  perform pg_temp.login(ua);
  insert into public.smart_goals (couple_id, category_id, s_text, deadline)
  values (public.my_couple_id(), 1, 'Dîner sans téléphone', current_date + 30);
  begin
    insert into public.smart_goals (couple_id, category_id, s_text)
    values (public.my_couple_id(), 2, 'trop tôt');
    raise exception 'ÉCHEC : objectif créé sur une catégorie non révélée';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.login(ub);
  update public.smart_goals set m_text = '3 fois par semaine' where category_id = 1;
  get diagnostics n = row_count;
  perform pg_temp.check_(n = 1, 'B peut compléter l''objectif commun');
  perform pg_temp.login(uc);
  perform pg_temp.check_((select count(*) from public.smart_goals) = 0, 'C ne voit aucun objectif');

  ---------------------------------------------------------------
  -- 7. Délier + blocage : toutes les données disparaissent
  ---------------------------------------------------------------
  perform pg_temp.login(ua);
  res := public.unlink_couple(true);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'A délie et bloque');
  perform pg_temp.login(ub);
  perform pg_temp.check_(public.my_couple_id() is null, 'B n''a plus de couple');
  perform pg_temp.admin();
  perform pg_temp.check_((select count(*) from public.answers where user_id in (ua, ub)) = 0,
                         'réponses supprimées après déliaison');
  perform pg_temp.check_((select count(*) from public.smart_goals) = 0
                     and (select count(*) from public.alignment) = 0,
                         'objectifs et notes supprimés après déliaison');

  perform pg_temp.login(ub);
  res := public.send_pair_request(code_a);
  perform pg_temp.check_((res ->> 'ok')::boolean, 'réponse uniforme même si bloqué');
  perform pg_temp.admin();
  perform pg_temp.check_((select count(*) from public.pair_requests where status = 'pending') = 0,
                         'aucune demande créée vers qui nous a bloqué');

  ---------------------------------------------------------------
  -- 8. Accès anonyme et suppression de compte
  ---------------------------------------------------------------
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform id from public.profiles;
    raise exception 'ÉCHEC : anon peut lire profiles';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.my_contact_code();
    raise exception 'ÉCHEC : anon peut appeler my_contact_code';
  exception when insufficient_privilege then null;
  end;
  res := public.keep_alive();
  perform pg_temp.check_((res ->> 'ok')::boolean, 'keep_alive accessible avec la clé anon');

  perform pg_temp.login(uc);
  res := public.delete_my_account();
  perform pg_temp.check_((res ->> 'ok')::boolean, 'suppression de compte');
  perform pg_temp.admin();
  perform pg_temp.check_((select count(*) from public.profiles where id = uc) = 0
                     and (select count(*) from auth.users where id = uc) = 0,
                         'profil et compte supprimés');
end
$test$;

rollback;

select 'TOUS LES TESTS PASSENT' as resultat;

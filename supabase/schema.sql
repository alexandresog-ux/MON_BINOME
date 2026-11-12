-- =====================================================================
-- schema.sql — « Construire une vie à deux »
-- Supabase (PostgreSQL). À exécuter en entier dans SQL Editor.
--
-- ⚠️  Ce fichier n'a PAS pu être exécuté dans l'environnement où il a été
--     écrit. Lance-le sur un projet Supabase vierge, puis exécute tests.sql
--     et corrige toute erreur AVANT de saisir de vraies réponses.
--
-- DÉCISIONS DE CONCEPTION (à valider avec Alexandre)
--  1. Toutes les écritures sensibles passent par des fonctions RPC
--     (security definer). Les tables n'ont pas de politique d'écriture
--     directe, sauf answers / alignment / smart_goals / couple_review.
--  2. Les RPC retournent un jsonb {ok, error, ...} et ne lèvent pas
--     d'exception (une exception annulerait l'enregistrement des tentatives
--     ratées utilisées pour la limitation).
--  3. Délier = supprimer le couple ET toutes ses données (réponses,
--     notes, objectifs). Le front doit demander une confirmation claire.
--  4. Une réponse validée est verrouillée (pas de modification après avoir
--     vu celle du partenaire).
--  5. Les codes de contact ne sont jamais lisibles par SELECT : on passe par
--     my_contact_code(). Conséquence pour le front : ne JAMAIS faire
--     select('*') sur profiles, toujours lister les colonnes.
--
-- À CONFIGURER CÔTÉ SUPABASE (Authentication)
--  - Activer la confirmation d'email.
--  - Activer un CAPTCHA (Auth > Attack Protection) : sans lui, créer de
--    faux comptes contournerait la limite de tentatives par compte.
--  - La clé service_role ne doit jamais apparaître dans le front.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Génération du code de contact (ex. SOG-7K3F-92QX)
--    Alphabet de 31 caractères sans I, L, O, 0, 1 (évite les confusions).
--    31^8 ≈ 8,5 × 10^11 combinaisons.
-- ---------------------------------------------------------------------
create or replace function public.generate_contact_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  raw text;
  code text;
  i int;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    raw := '';
    for i in 0..7 loop
      raw := raw || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    end loop;
    code := 'SOG-' || substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
    exit when not exists (select 1 from public.profiles where contact_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  contact_code text not null unique default public.generate_contact_code(),
  created_at   timestamptz not null default now()
);
create unique index profiles_code_norm_idx
  on public.profiles ((replace(contact_code, '-', '')));

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.code_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index code_attempts_user_time_idx on public.code_attempts (user_id, attempted_at);

create table public.pair_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);
create unique index pair_requests_one_pending_idx
  on public.pair_requests (requester_id, recipient_id) where status = 'pending';
create index pair_requests_recipient_idx on public.pair_requests (recipient_id, status);

create table public.couples (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- unique (user_id) = un seul partenaire actif par utilisateur
create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (couple_id, user_id),
  unique (user_id)
);

create table public.category_status (
  couple_id    uuid not null references public.couples (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  category_id  smallint not null check (category_id between 1 and 12),
  validated_at timestamptz,
  primary key (couple_id, user_id, category_id)
);

create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id smallint not null check (category_id between 1 and 12),
  question_id text not null,
  body        text,
  skipped     boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (couple_id, user_id, question_id),
  check (question_id ~ '^c(0[1-9]|1[0-2])q0[1-8]$'),
  check (substring(question_id from 2 for 2)::smallint = category_id),
  check (
    (skipped and body is null)
    or (not skipped and body is not null and char_length(body) between 1 and 4000)
  )
);
create index answers_couple_cat_idx on public.answers (couple_id, category_id);

create table public.alignment (
  couple_id   uuid not null references public.couples (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id smallint not null check (category_id between 1 and 12),
  score       smallint not null check (score between 1 and 10),
  updated_at  timestamptz not null default now(),
  primary key (couple_id, user_id, category_id)
);

create table public.smart_goals (
  couple_id   uuid not null references public.couples (id) on delete cascade,
  category_id smallint not null check (category_id between 1 and 12),
  s_text      text check (char_length(s_text) <= 2000),
  m_text      text check (char_length(m_text) <= 2000),
  a_text      text check (char_length(a_text) <= 2000),
  r_text      text check (char_length(r_text) <= 2000),
  deadline    date,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (couple_id, category_id)
);

create table public.couple_review (
  couple_id                uuid primary key references public.couples (id) on delete cascade,
  top_agreements           text check (char_length(top_agreements) <= 3000),
  topics_to_explore        text check (char_length(topics_to_explore) <= 3000),
  shared_non_negotiables   text check (char_length(shared_non_negotiables) <= 3000),
  disputed_non_negotiables text check (char_length(disputed_non_negotiables) <= 3000),
  next_review_date         date,
  updated_by               uuid references public.profiles (id) on delete set null,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_updated_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger answers_touch   before insert or update on public.answers
  for each row execute function public.touch_updated_at();
create trigger alignment_touch before insert or update on public.alignment
  for each row execute function public.touch_updated_at();
create trigger smart_goals_touch before insert or update on public.smart_goals
  for each row execute function public.touch_updated_by();
create trigger couple_review_touch before insert or update on public.couple_review
  for each row execute function public.touch_updated_by();

-- Création automatique du profil à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Utilisateur'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. Fonctions d'aide pour les politiques RLS (security definer = pas de
--    récursion RLS). Chacune ne répond que pour le couple de l'appelant.
-- ---------------------------------------------------------------------
create or replace function public.my_couple_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select couple_id from public.couple_members where user_id = (select auth.uid());
$$;

create or replace function public.my_partner_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select user_id from public.couple_members
  where couple_id = (select couple_id from public.couple_members where user_id = (select auth.uid()))
    and user_id <> (select auth.uid());
$$;

-- L'utilisateur donné a-t-il validé la catégorie ? (couple de l'appelant uniquement)
create or replace function public.category_validated(p_couple uuid, p_user uuid, p_cat smallint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_couple = (select public.my_couple_id())
     and exists (
       select 1 from public.category_status
       where couple_id = p_couple and user_id = p_user and category_id = p_cat
         and validated_at is not null
     );
$$;

-- Les DEUX partenaires ont-ils validé la catégorie ? => révélation des réponses
create or replace function public.category_revealed(p_couple uuid, p_cat smallint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_couple = (select public.my_couple_id())
     and (
       select count(*) from public.category_status
       where couple_id = p_couple and category_id = p_cat and validated_at is not null
     ) = 2;
$$;

-- Les DEUX partenaires ont-ils donné leur note d'alignement ?
create or replace function public.alignment_revealed(p_couple uuid, p_cat smallint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_couple = (select public.my_couple_id())
     and (
       select count(*) from public.alignment
       where couple_id = p_couple and category_id = p_cat
     ) = 2;
$$;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.blocks          enable row level security;
alter table public.code_attempts   enable row level security;
alter table public.pair_requests   enable row level security;
alter table public.couples         enable row level security;
alter table public.couple_members  enable row level security;
alter table public.category_status enable row level security;
alter table public.answers         enable row level security;
alter table public.alignment       enable row level security;
alter table public.smart_goals     enable row level security;
alter table public.couple_review   enable row level security;

-- blocks et code_attempts : RLS actif, AUCUNE politique = inaccessibles au client.

-- profiles : mon profil + celui de mon partenaire (colonnes limitées par GRANT)
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id = (select public.my_partner_id()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- pair_requests : lecture de mes demandes (envoyées ou reçues), écriture via RPC
create policy pair_requests_select on public.pair_requests for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- couples / couple_members : lecture de mon couple uniquement
create policy couples_select on public.couples for select to authenticated
  using (id = (select public.my_couple_id()));
create policy couple_members_select on public.couple_members for select to authenticated
  using (couple_id = (select public.my_couple_id()));

-- category_status : je vois le statut (validé ou non) des deux, jamais le contenu
create policy category_status_select on public.category_status for select to authenticated
  using (couple_id = (select public.my_couple_id()));

-- answers : les miennes toujours ; celles du partenaire seulement si les deux ont validé
create policy answers_select on public.answers for select to authenticated
  using (
    user_id = (select auth.uid())
    or (couple_id = (select public.my_couple_id())
        and public.category_revealed(couple_id, category_id))
  );
create policy answers_insert on public.answers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and not public.category_validated(couple_id, user_id, category_id)
  );
create policy answers_update on public.answers for update to authenticated
  using (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and not public.category_validated(couple_id, user_id, category_id)
  )
  with check (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and not public.category_validated(couple_id, user_id, category_id)
  );

-- alignment : saisie possible seulement après révélation des réponses ;
-- la note du partenaire n'est visible que quand les deux ont noté.
create policy alignment_select on public.alignment for select to authenticated
  using (
    user_id = (select auth.uid())
    or (couple_id = (select public.my_couple_id())
        and public.alignment_revealed(couple_id, category_id))
  );
create policy alignment_insert on public.alignment for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and public.category_revealed(couple_id, category_id)
  );
create policy alignment_update on public.alignment for update to authenticated
  using (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and not public.alignment_revealed(couple_id, category_id)
  )
  with check (
    user_id = (select auth.uid())
    and couple_id = (select public.my_couple_id())
    and not public.alignment_revealed(couple_id, category_id)
  );

-- smart_goals : modifiables à deux, après révélation de la catégorie
create policy smart_goals_select on public.smart_goals for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy smart_goals_insert on public.smart_goals for insert to authenticated
  with check (
    couple_id = (select public.my_couple_id())
    and public.category_revealed(couple_id, category_id)
  );
create policy smart_goals_update on public.smart_goals for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (
    couple_id = (select public.my_couple_id())
    and public.category_revealed(couple_id, category_id)
  );

-- couple_review : bilan final partagé
create policy couple_review_select on public.couple_review for select to authenticated
  using (couple_id = (select public.my_couple_id()));
create policy couple_review_insert on public.couple_review for insert to authenticated
  with check (couple_id = (select public.my_couple_id()));
create policy couple_review_update on public.couple_review for update to authenticated
  using (couple_id = (select public.my_couple_id()))
  with check (couple_id = (select public.my_couple_id()));

-- ---------------------------------------------------------------------
-- 6. Fonctions RPC (appelées par le front avec supabase.rpc)
-- ---------------------------------------------------------------------

-- Mon code de contact (la colonne n'est pas lisible directement)
create or replace function public.my_contact_code()
returns text
language sql stable security definer set search_path = ''
as $$
  select contact_code from public.profiles where id = (select auth.uid());
$$;

-- Régénérer mon code : annule les demandes en attente reçues
create or replace function public.regenerate_contact_code()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_code text;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  update public.profiles set contact_code = public.generate_contact_code()
   where id = me returning contact_code into v_code;
  update public.pair_requests set status = 'cancelled', responded_at = now()
   where recipient_id = me and status = 'pending';
  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

-- Envoyer une demande d'appairage à partir d'un code.
-- Réponses volontairement uniformes : on ne révèle jamais si un compte existe
-- (sauf code inconnu), est bloqué ou est déjà en couple.
create or replace function public.send_pair_request(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_norm text;
  v_target uuid;
  v_fails int;
  v_recent int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  if public.my_couple_id() is not null then
    return jsonb_build_object('ok', false, 'error', 'deja_en_couple');
  end if;

  select count(*) into v_fails from public.code_attempts
   where user_id = me and attempted_at > now() - interval '1 hour';
  if v_fails >= 5 then
    return jsonb_build_object('ok', false, 'error', 'trop_de_tentatives');
  end if;

  select count(*) into v_recent from public.pair_requests
   where requester_id = me and created_at > now() - interval '24 hours';
  if v_recent >= 10 then
    return jsonb_build_object('ok', false, 'error', 'trop_de_demandes');
  end if;

  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select id into v_target from public.profiles
   where replace(contact_code, '-', '') = v_norm;

  if v_target is null or v_target = me then
    insert into public.code_attempts (user_id) values (me);
    return jsonb_build_object('ok', false, 'error', 'code_invalide');
  end if;

  -- Cas silencieux : même réponse « ok » pour ne rien divulguer
  if exists (
       select 1 from public.blocks
        where (blocker_id = v_target and blocked_id = me)
           or (blocker_id = me and blocked_id = v_target)
     )
     or exists (select 1 from public.couple_members where user_id = v_target)
  then
    return jsonb_build_object('ok', true);
  end if;

  update public.pair_requests set status = 'expired', responded_at = now()
   where requester_id = me and recipient_id = v_target
     and status = 'pending' and expires_at <= now();

  if exists (
       select 1 from public.pair_requests
        where requester_id = me and recipient_id = v_target and status = 'pending'
     )
  then
    return jsonb_build_object('ok', true);
  end if;

  insert into public.pair_requests (requester_id, recipient_id) values (me, v_target);
  return jsonb_build_object('ok', true);
end;
$$;

-- Demandes reçues (avec le prénom du demandeur)
create or replace function public.list_incoming_requests()
returns table (request_id uuid, from_name text, created_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select r.id, p.display_name, r.created_at, r.expires_at
    from public.pair_requests r
    join public.profiles p on p.id = r.requester_id
   where r.recipient_id = (select auth.uid())
     and r.status = 'pending'
     and r.expires_at > now()
   order by r.created_at desc;
$$;

-- Accepter ou refuser (avec blocage optionnel en cas de refus)
create or replace function public.respond_pair_request(
  p_request uuid, p_accept boolean, p_block boolean default false
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r public.pair_requests%rowtype;
  v_couple uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;

  select * into r from public.pair_requests
   where id = p_request and recipient_id = me for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'demande_introuvable');
  end if;
  if r.status <> 'pending' or r.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'demande_expiree');
  end if;

  if not p_accept then
    update public.pair_requests set status = 'declined', responded_at = now() where id = r.id;
    if p_block then
      insert into public.blocks (blocker_id, blocked_id) values (me, r.requester_id)
      on conflict do nothing;
    end if;
    return jsonb_build_object('ok', true);
  end if;

  begin
    insert into public.couples default values returning id into v_couple;
    insert into public.couple_members (couple_id, user_id)
      values (v_couple, me), (v_couple, r.requester_id);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'deja_en_couple');
  end;

  update public.pair_requests set status = 'accepted', responded_at = now() where id = r.id;
  update public.pair_requests set status = 'cancelled', responded_at = now()
   where status = 'pending' and id <> r.id
     and (requester_id in (me, r.requester_id) or recipient_id in (me, r.requester_id));

  return jsonb_build_object('ok', true, 'couple_id', v_couple);
end;
$$;

-- Délier : supprime le couple et TOUTES ses données (cascade)
create or replace function public.unlink_couple(p_block boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_couple uuid;
  v_partner uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  v_couple := public.my_couple_id();
  if v_couple is null then return jsonb_build_object('ok', false, 'error', 'pas_de_couple'); end if;
  v_partner := public.my_partner_id();

  if p_block and v_partner is not null then
    insert into public.blocks (blocker_id, blocked_id) values (me, v_partner)
    on conflict do nothing;
  end if;

  delete from public.couples where id = v_couple;
  return jsonb_build_object('ok', true);
end;
$$;

-- Valider une catégorie (exige les 8 questions répondues ou passées)
create or replace function public.validate_category(p_category smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_couple uuid := public.my_couple_id();
  v_n int;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  if v_couple is null then return jsonb_build_object('ok', false, 'error', 'pas_de_couple'); end if;
  if p_category is null or p_category not between 1 and 12 then
    return jsonb_build_object('ok', false, 'error', 'categorie_invalide');
  end if;

  select count(*) into v_n from public.answers
   where couple_id = v_couple and user_id = me and category_id = p_category;
  if v_n < 8 then
    return jsonb_build_object('ok', false, 'error', 'categorie_incomplete');
  end if;

  insert into public.category_status (couple_id, user_id, category_id, validated_at)
  values (v_couple, me, p_category, now())
  on conflict (couple_id, user_id, category_id) do update
    set validated_at = coalesce(public.category_status.validated_at, excluded.validated_at);

  return jsonb_build_object('ok', true, 'revealed', public.category_revealed(v_couple, p_category));
end;
$$;

-- Supprimer mon compte : supprime aussi le couple et ses données
create or replace function public.delete_my_account()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_couple uuid;
begin
  if me is null then return jsonb_build_object('ok', false, 'error', 'non_connecte'); end if;
  v_couple := public.my_couple_id();
  if v_couple is not null then
    delete from public.couples where id = v_couple;
  end if;
  delete from auth.users where id = me;
  return jsonb_build_object('ok', true);
end;
$$;

-- Keep-alive : appel léger planifié (GitHub Actions) pour éviter la mise en
-- pause du projet + petit nettoyage. Aucune donnée n'est retournée.
create or replace function public.keep_alive()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  update public.pair_requests set status = 'expired', responded_at = now()
   where status = 'pending' and expires_at <= now();
  delete from public.code_attempts where attempted_at < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'at', now());
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Privilèges : tout fermer, puis ouvrir au strict nécessaire
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Tables (limitées en plus par RLS). profiles : colonnes explicites, SANS contact_code.
grant select (id, display_name, created_at) on public.profiles to authenticated;
grant update (display_name)                 on public.profiles to authenticated;
grant select                  on public.pair_requests, public.couples,
                                 public.couple_members, public.category_status to authenticated;
grant select, insert, update  on public.answers, public.alignment,
                                 public.smart_goals, public.couple_review to authenticated;

-- Fonctions utilisées par les politiques RLS
grant execute on function
  public.my_couple_id(), public.my_partner_id(),
  public.category_validated(uuid, uuid, smallint),
  public.category_revealed(uuid, smallint),
  public.alignment_revealed(uuid, smallint)
  to authenticated;

-- RPC appelables par un utilisateur connecté
grant execute on function
  public.my_contact_code(), public.regenerate_contact_code(),
  public.send_pair_request(text), public.list_incoming_requests(),
  public.respond_pair_request(uuid, boolean, boolean),
  public.unlink_couple(boolean), public.validate_category(smallint),
  public.delete_my_account()
  to authenticated;

-- Keep-alive : appelable sans connexion (clé anon)
grant execute on function public.keep_alive() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Temps réel (salle d'attente, acceptation, révélation)
--    Realtime applique la RLS : un client ne reçoit que les lignes autorisées.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pair_requests', 'couple_members', 'category_status', 'alignment', 'smart_goals']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then
      null;
    end;
  end loop;
end;
$$;

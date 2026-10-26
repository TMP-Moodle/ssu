-- À exécuter dans SQL Editor. Aucun secret ni accès direct aux tables côté navigateur.
begin;
create schema if not exists naming_private;
revoke all on schema naming_private from public, anon, authenticated;
create table if not exists naming_private.settings (
 singleton boolean primary key default true check (singleton), secret text not null
);
insert into naming_private.settings values (true, gen_random_uuid()::text) on conflict do nothing;
create table if not exists naming_private.proposals (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 2 and 60),
 created_at timestamptz not null default now(),
 hidden boolean not null default false,
 upvotes integer not null default 0 check (upvotes >= 0),
 downvotes integer not null default 0 check (downvotes >= 0)
);
create unique index if not exists naming_unique_name on naming_private.proposals (lower(name));
create table if not exists naming_private.cooldowns (
 identity_hash text not null, scope text not null,
 next_at timestamptz not null, last_vote integer,
 primary key (identity_hash, scope)
);
create index if not exists naming_cooldown_expiry on naming_private.cooldowns(next_at);
alter table naming_private.settings enable row level security;
alter table naming_private.proposals enable row level security;
alter table naming_private.cooldowns enable row level security;
revoke all on all tables in schema naming_private from public, anon, authenticated;

-- Fonction privilégiée interne : identité Supabase obligatoire, entrées validées,
-- aucune identité/IP renvoyée et aucune écriture directe autorisée aux visiteurs.
create or replace function naming_private.handle(
 p_action text, p_browser uuid, p_name text default null,
 p_proposal uuid default null, p_vote integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
 v_ip text := trim(split_part(coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1));
 v_secret text; v_keys text[]; v_key text; v_scope text;
 v_next timestamptz; v_now timestamptz; v_name text; v_rows jsonb; v_id uuid;
begin
 if v_uid is null then raise exception 'Authentification requise'; end if;
 if p_browser is null then raise exception 'Identifiant navigateur requis'; end if;
 select secret into strict v_secret from naming_private.settings where singleton;
 v_keys := array[
  encode(sha256(convert_to(v_secret || ':user:' || v_uid::text, 'UTF8')), 'hex'),
  encode(sha256(convert_to(v_secret || ':cookie:' || p_browser::text, 'UTF8')), 'hex')
 ];
 if v_ip <> '' then
  v_keys := array_append(v_keys, encode(sha256(convert_to(v_secret || ':ip:' || v_ip, 'UTF8')), 'hex'));
 end if;
 if p_action = 'list' then
  select coalesce(jsonb_agg(x.data order by x.created_at desc), '[]'::jsonb) into v_rows from (
   select p.created_at, jsonb_build_object(
    'id', p.id, 'name', p.name, 'created_at', p.created_at,
    'upvotes', p.upvotes, 'downvotes', p.downvotes,
    'next_at', (select max(c.next_at) from naming_private.cooldowns c
      where c.identity_hash = any(v_keys) and c.scope = 'vote:' || p.id::text and c.next_at > now()),
    'last_vote', (select c.last_vote from naming_private.cooldowns c
      where c.identity_hash = v_keys[1] and c.scope = 'vote:' || p.id::text)
   ) as data from naming_private.proposals p where not p.hidden
  ) x;
  select max(next_at) into v_next from naming_private.cooldowns
   where identity_hash = any(v_keys) and scope = 'propose' and next_at > now();
  return jsonb_build_object('ok', true, 'proposals', v_rows, 'proposal_next_at', v_next, 'server_time', clock_timestamp());
 end if;
 if p_action not in ('propose', 'vote') or p_action is null then raise exception 'Action invalide'; end if;
 if v_ip = '' then return jsonb_build_object('ok', false, 'message', 'Impossible de vérifier votre réseau. Réessayez plus tard.'); end if;
 if p_action = 'propose' then
  v_name := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) not between 2 and 60 or v_name ~ '[[:cntrl:]]' then
   return jsonb_build_object('ok', false, 'message', 'Choisissez un nom de 2 à 60 caractères.');
  end if;
  v_scope := 'propose';
 else
  if p_vote is null or p_vote not in (-1, 1) or p_proposal is null then raise exception 'Vote invalide'; end if;
  v_scope := 'vote:' || p_proposal::text;
 end if;
 -- Ordre stable des verrous : protège aussi contre les requêtes simultanées.
 for v_key in select unnest(v_keys) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(v_key || ':' || v_scope, 0));
 end loop;
 v_now := clock_timestamp();
 select max(next_at) into v_next from naming_private.cooldowns
  where identity_hash = any(v_keys) and scope = v_scope;
 if v_next > v_now then
  return jsonb_build_object('ok', false, 'message', 'Votre prochaine participation sera possible après le délai de 24 h.', 'next_at', v_next);
 end if;
 if p_action = 'propose' then
  insert into naming_private.proposals(name) values(v_name)
   on conflict (lower(name)) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'message', 'Ce nom a déjà été proposé.'); end if;
 else
  update naming_private.proposals set
   upvotes = upvotes + case when p_vote = 1 then 1 else 0 end,
   downvotes = downvotes + case when p_vote = -1 then 1 else 0 end
   where id = p_proposal and not hidden returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'message', 'Cette proposition n’est plus disponible.'); end if;
 end if;
 insert into naming_private.cooldowns(identity_hash, scope, next_at, last_vote)
  select k, v_scope, v_now + interval '24 hours', p_vote from unnest(v_keys) k
  on conflict (identity_hash, scope) do update set next_at = excluded.next_at, last_vote = excluded.last_vote;
 return jsonb_build_object('ok', true, 'next_at', v_now + interval '24 hours');
end;
$$;
revoke all on function naming_private.handle(text, uuid, text, uuid, integer) from public, anon, authenticated;
grant usage on schema naming_private to authenticated;
grant execute on function naming_private.handle(text, uuid, text, uuid, integer) to authenticated;
create or replace function public.naming_action(
 p_action text, p_browser uuid, p_name text default null,
 p_proposal uuid default null, p_vote integer default null
) returns jsonb language sql security invoker set search_path = '' as $$
 select naming_private.handle(p_action, p_browser, p_name, p_proposal, p_vote);
$$;
revoke all on function public.naming_action(text, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.naming_action(text, uuid, text, uuid, integer) to authenticated;
notify pgrst, 'reload schema';
commit;

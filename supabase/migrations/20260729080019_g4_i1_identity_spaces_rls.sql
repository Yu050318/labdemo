create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  account_status text not null default 'active'
    check (account_status in ('active', 'pending_deletion', 'purging')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'personal'
    check (kind = 'personal'),
  name text not null check (length(btrim(name)) between 1 and 120),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz
);

create unique index spaces_one_active_personal_per_owner_idx
  on public.spaces (owner_user_id)
  where kind = 'personal' and deleted_at is null;

create table public.space_memberships (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  status text not null default 'active'
    check (status in ('active', 'removed')),
  created_at timestamptz not null default statement_timestamp(),
  primary key (space_id, user_id)
);

create index space_memberships_user_id_idx
  on public.space_memberships (user_id);

create unique index space_memberships_one_active_owner_idx
  on public.space_memberships (space_id)
  where role = 'owner' and status = 'active';

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  space_id uuid not null unique references public.spaces (id) on delete cascade,
  timezone text not null check (length(timezone) between 1 and 255),
  summary_enabled boolean not null default true,
  summary_local_time time not null default time '21:00',
  protocol_display_preference text not null default 'standard_full'
    check (protocol_display_preference = 'standard_full'),
  next_summary_at timestamptz,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create function private.bump_preferences_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function private.set_updated_at();

create trigger user_preferences_bump_revision
before update on public.user_preferences
for each row execute function private.bump_preferences_revision();

create function private.is_active_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles as profile
      where profile.user_id = p_user_id
        and profile.account_status = 'active'
    );
$$;

create function private.is_active_space_member(
  p_space_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.user_profiles as profile
      join public.space_memberships as membership
        on membership.user_id = profile.user_id
      join public.spaces as space
        on space.id = membership.space_id
      where profile.user_id = p_user_id
        and profile.account_status = 'active'
        and membership.space_id = p_space_id
        and membership.status = 'active'
        and space.deleted_at is null
    );
$$;

create function private.bootstrap_personal_space(p_timezone text)
returns table (
  space_id uuid,
  preferences_id uuid,
  already_existed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_account_status text;
  current_space_id uuid;
  current_preferences_id uuid;
  had_space boolean := false;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = current_user_id
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'A verified email is required.';
  end if;

  if p_timezone is null or not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = p_timezone
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid IANA timezone is required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select profile.account_status
    into current_account_status
  from public.user_profiles as profile
  where profile.user_id = current_user_id;

  if current_account_status is null then
    insert into public.user_profiles (user_id)
    values (current_user_id);
  elsif current_account_status <> 'active' then
    raise exception using
      errcode = '42501',
      message = 'The account is not active.';
  end if;

  select space.id
    into current_space_id
  from public.spaces as space
  where space.owner_user_id = current_user_id
    and space.kind = 'personal'
    and space.deleted_at is null;

  had_space := current_space_id is not null;

  if not had_space then
    insert into public.spaces (name, owner_user_id)
    values ('个人空间', current_user_id)
    returning id into current_space_id;

    insert into public.space_memberships (
      space_id,
      user_id,
      role,
      status
    )
    values (
      current_space_id,
      current_user_id,
      'owner',
      'active'
    );
  elsif not exists (
    select 1
    from public.space_memberships as membership
    where membership.space_id = current_space_id
      and membership.user_id = current_user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception using
      errcode = '55000',
      message = 'The personal space membership is not active.';
  end if;

  select preferences.id
    into current_preferences_id
  from public.user_preferences as preferences
  where preferences.user_id = current_user_id
    and preferences.space_id = current_space_id;

  if current_preferences_id is null then
    insert into public.user_preferences (
      user_id,
      space_id,
      timezone
    )
    values (
      current_user_id,
      current_space_id,
      p_timezone
    )
    returning id into current_preferences_id;
  end if;

  return query
  select current_space_id, current_preferences_id, had_space;
end;
$$;

create function public.bootstrap_personal_space(timezone text)
returns table (
  "spaceId" uuid,
  "preferencesId" uuid,
  "alreadyExisted" boolean
)
language sql
security invoker
set search_path = ''
as $$
  select
    result.space_id,
    result.preferences_id,
    result.already_existed
  from private.bootstrap_personal_space($1) as result;
$$;

alter table public.user_profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_memberships enable row level security;
alter table public.user_preferences enable row level security;

create policy user_profiles_select_own_active
on public.user_profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_active_account((select auth.uid()))
);

create policy spaces_select_active_member
on public.spaces
for select
to authenticated
using (
  private.is_active_space_member(id, (select auth.uid()))
);

create policy space_memberships_select_own_active
on public.space_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_active_account((select auth.uid()))
  and private.is_active_space_member(space_id, (select auth.uid()))
);

create policy user_preferences_select_own_active
on public.user_preferences
for select
to authenticated
using (
  user_id = (select auth.uid())
  and private.is_active_account((select auth.uid()))
  and private.is_active_space_member(space_id, (select auth.uid()))
);

revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.spaces from public, anon, authenticated;
revoke all on table public.space_memberships from public, anon, authenticated;
revoke all on table public.user_preferences from public, anon, authenticated;

grant select on table public.user_profiles to authenticated;
grant select on table public.spaces to authenticated;
grant select on table public.space_memberships to authenticated;
grant select on table public.user_preferences to authenticated;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.bump_preferences_revision() from public, anon, authenticated;
revoke all on function private.is_active_account(uuid) from public, anon, authenticated;
revoke all on function private.is_active_space_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.bootstrap_personal_space(text) from public, anon, authenticated;
revoke all on function public.bootstrap_personal_space(text) from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_active_account(uuid) to authenticated;
grant execute on function private.is_active_space_member(uuid, uuid) to authenticated;
grant execute on function private.bootstrap_personal_space(text) to authenticated;
grant execute on function public.bootstrap_personal_space(text) to authenticated;

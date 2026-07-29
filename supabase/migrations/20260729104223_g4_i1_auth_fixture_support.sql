create function private.is_g4_i1_fixture_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = p_user_id
      and auth_user.raw_app_meta_data ->> 'labflow_fixture' = 'g4_i1_b'
  );
$$;

create function private.g4_i1_test_set_account_status(
  p_user_id uuid,
  p_account_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_g4_i1_fixture_user(p_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Only tagged G4-I1 fixture users may be changed.';
  end if;

  if p_account_status not in ('active', 'pending_deletion', 'purging') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported fixture account status.';
  end if;

  update public.user_profiles
  set account_status = p_account_status
  where user_id = p_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Fixture profile was not found.';
  end if;
end;
$$;

create function private.g4_i1_test_set_membership_status(
  p_user_id uuid,
  p_membership_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_g4_i1_fixture_user(p_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Only tagged G4-I1 fixture users may be changed.';
  end if;

  if p_membership_status not in ('active', 'removed') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported fixture membership status.';
  end if;

  update public.space_memberships
  set status = p_membership_status
  where user_id = p_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Fixture membership was not found.';
  end if;
end;
$$;

create function private.g4_i1_test_fixture_snapshot(p_user_ids uuid[])
returns table (
  user_id uuid,
  profile_count bigint,
  space_count bigint,
  membership_count bigint,
  preferences_count bigint,
  account_status text,
  membership_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_ids is null
     or cardinality(p_user_ids) = 0
     or exists (
       select 1
       from unnest(p_user_ids) as requested_user(user_id)
       where not private.is_g4_i1_fixture_user(requested_user.user_id)
     ) then
    raise exception using
      errcode = '42501',
      message = 'Snapshot input must contain only tagged G4-I1 fixture users.';
  end if;

  return query
  select
    requested_user.user_id,
    (
      select count(*)
      from public.user_profiles as profile
      where profile.user_id = requested_user.user_id
    ),
    (
      select count(*)
      from public.spaces as space
      where space.owner_user_id = requested_user.user_id
        and space.kind = 'personal'
        and space.deleted_at is null
    ),
    (
      select count(*)
      from public.space_memberships as membership
      where membership.user_id = requested_user.user_id
    ),
    (
      select count(*)
      from public.user_preferences as preferences
      where preferences.user_id = requested_user.user_id
    ),
    (
      select profile.account_status
      from public.user_profiles as profile
      where profile.user_id = requested_user.user_id
    ),
    (
      select membership.status
      from public.space_memberships as membership
      where membership.user_id = requested_user.user_id
      order by membership.created_at desc
      limit 1
    )
  from unnest(p_user_ids) as requested_user(user_id);
end;
$$;

create function private.g4_i1_test_bootstrap_then_fail(p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if not private.is_g4_i1_fixture_user(current_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Rollback probe is limited to tagged G4-I1 fixture users.';
  end if;

  perform *
  from private.bootstrap_personal_space(p_timezone);

  raise exception 'G4-I1 fixture rollback probe';
end;
$$;

create function public.g4_i1_test_set_account_status(
  user_id uuid,
  account_status text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.g4_i1_test_set_account_status($1, $2);
$$;

create function public.g4_i1_test_set_membership_status(
  user_id uuid,
  membership_status text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.g4_i1_test_set_membership_status($1, $2);
$$;

create function public.g4_i1_test_fixture_snapshot(user_ids uuid[])
returns table (
  user_id uuid,
  profile_count bigint,
  space_count bigint,
  membership_count bigint,
  preferences_count bigint,
  account_status text,
  membership_status text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.g4_i1_test_fixture_snapshot($1);
$$;

create function public.g4_i1_test_bootstrap_then_fail(timezone text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.g4_i1_test_bootstrap_then_fail($1);
$$;

revoke all on function private.is_g4_i1_fixture_user(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.g4_i1_test_set_account_status(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function private.g4_i1_test_set_membership_status(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function private.g4_i1_test_fixture_snapshot(uuid[])
from public, anon, authenticated, service_role;
revoke all on function private.g4_i1_test_bootstrap_then_fail(text)
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_set_account_status(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_set_membership_status(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_fixture_snapshot(uuid[])
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_bootstrap_then_fail(text)
from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.is_g4_i1_fixture_user(uuid) to service_role;
grant execute on function private.g4_i1_test_set_account_status(uuid, text) to service_role;
grant execute on function private.g4_i1_test_set_membership_status(uuid, text) to service_role;
grant execute on function private.g4_i1_test_fixture_snapshot(uuid[]) to service_role;
grant execute on function public.g4_i1_test_set_account_status(uuid, text) to service_role;
grant execute on function public.g4_i1_test_set_membership_status(uuid, text) to service_role;
grant execute on function public.g4_i1_test_fixture_snapshot(uuid[]) to service_role;

grant execute on function private.is_g4_i1_fixture_user(uuid) to authenticated;
grant execute on function private.g4_i1_test_bootstrap_then_fail(text) to authenticated;
grant execute on function public.g4_i1_test_bootstrap_then_fail(text) to authenticated;

grant select on table public.user_profiles to service_role;
grant select on table public.spaces to service_role;
grant select on table public.space_memberships to service_role;
grant select on table public.user_preferences to service_role;

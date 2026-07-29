-- Close QA-G4-I1-B-PRE-01 and add fixture-only probes for a physically
-- missing membership row. These helpers are temporary G4 acceptance support
-- and must be removed before G5 production release.

revoke execute on function private.is_g4_i1_fixture_user(uuid)
from authenticated;

create function private.g4_i1_test_remove_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if not private.is_g4_i1_fixture_user(p_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Membership removal is limited to tagged G4-I1 fixture users.';
  end if;

  delete from public.space_memberships as membership
  using public.spaces as space
  where membership.user_id = p_user_id
    and membership.space_id = space.id
    and space.owner_user_id = p_user_id
    and space.kind = 'personal'
    and space.deleted_at is null;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Exactly one fixture membership must exist before removal.';
  end if;
end;
$$;

create function private.g4_i1_test_restore_membership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fixture_space_id uuid;
begin
  if not private.is_g4_i1_fixture_user(p_user_id) then
    raise exception using
      errcode = '42501',
      message = 'Membership restoration is limited to tagged G4-I1 fixture users.';
  end if;

  select space.id
    into fixture_space_id
  from public.spaces as space
  where space.owner_user_id = p_user_id
    and space.kind = 'personal'
    and space.deleted_at is null;

  if fixture_space_id is null then
    raise exception using
      errcode = '55000',
      message = 'Fixture personal space was not found.';
  end if;

  insert into public.space_memberships (
    space_id,
    user_id,
    role,
    status
  )
  values (
    fixture_space_id,
    p_user_id,
    'owner',
    'active'
  );
end;
$$;

create function public.g4_i1_test_remove_membership(user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.g4_i1_test_remove_membership($1);
$$;

create function public.g4_i1_test_restore_membership(user_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.g4_i1_test_restore_membership($1);
$$;

revoke all on function private.g4_i1_test_remove_membership(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.g4_i1_test_restore_membership(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_remove_membership(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.g4_i1_test_restore_membership(uuid)
from public, anon, authenticated, service_role;

grant execute on function private.g4_i1_test_remove_membership(uuid)
to service_role;
grant execute on function private.g4_i1_test_restore_membership(uuid)
to service_role;
grant execute on function public.g4_i1_test_remove_membership(uuid)
to service_role;
grant execute on function public.g4_i1_test_restore_membership(uuid)
to service_role;

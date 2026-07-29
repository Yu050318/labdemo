-- Read-only G4-I1 database contract checks.
-- Run against project ref ogvqegmgcuwlynczasop with an administrative test connection.

begin;

do $$
declare
  target_tables constant text[] := array[
    'user_profiles',
    'spaces',
    'space_memberships',
    'user_preferences'
  ];
begin
  if (
    select count(*) <> cardinality(target_tables)
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (target_tables)
      and relation.relkind = 'r'
  ) then
    raise exception 'G4-I1 target table set is incomplete';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (target_tables)
      and not relation.relrowsecurity
  ) then
    raise exception 'RLS is disabled on a G4-I1 target table';
  end if;

  if exists (
    select 1
    from unnest(target_tables) as target(table_name)
    where pg_catalog.has_table_privilege(
      'anon',
      format('public.%I', target.table_name),
      'SELECT,INSERT,UPDATE,DELETE'
    )
  ) then
    raise exception 'anon has a direct G4-I1 table privilege';
  end if;

  if exists (
    select 1
    from unnest(target_tables) as target(table_name)
    where pg_catalog.has_table_privilege(
      'authenticated',
      format('public.%I', target.table_name),
      'INSERT,UPDATE,DELETE'
    )
  ) then
    raise exception 'authenticated has a direct G4-I1 write privilege';
  end if;

  if (
    select count(*) <> 4
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any (target_tables)
      and cmd = 'SELECT'
      and roles = array['authenticated'::name]
  ) then
    raise exception 'authenticated SELECT policy set is incomplete';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.prosecdef
      and not exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
  ) then
    raise exception 'A private SECURITY DEFINER has a mutable search_path';
  end if;

  if pg_catalog.has_function_privilege(
    'public',
    'public.bootstrap_personal_space(text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.bootstrap_personal_space(text)',
    'EXECUTE'
  ) then
    raise exception 'bootstrap RPC is executable without authentication';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.bootstrap_personal_space(text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute the bootstrap RPC';
  end if;

  if not exists (
    select 1
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = 'user_preferences'
      and trigger_name = 'user_preferences_validate_timezone'
  ) then
    raise exception 'The user_preferences IANA timezone trigger is missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{}', true);

do $$
begin
  if exists (select 1 from public.user_profiles)
     or exists (select 1 from public.spaces)
     or exists (select 1 from public.space_memberships)
     or exists (select 1 from public.user_preferences) then
    raise exception 'A session without auth.uid() can read G4-I1 data';
  end if;

  begin
    perform *
    from public.bootstrap_personal_space('Asia/Shanghai');
    raise exception 'bootstrap accepted a session without auth.uid()';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

rollback;

select version, name
from supabase_migrations.schema_migrations
where name in (
  'g4_i1_identity_spaces_rls',
  'g4_i1_enforce_iana_timezone'
)
order by version;

-- Read-only G4-I1/B fixture-support checks.
-- Target project: ogvqegmgcuwlynczasop.

begin;

do $$
declare
  service_only_functions constant regprocedure[] := array[
    'public.g4_i1_test_set_account_status(uuid,text)'::regprocedure,
    'public.g4_i1_test_set_membership_status(uuid,text)'::regprocedure,
    'public.g4_i1_test_fixture_snapshot(uuid[])'::regprocedure
  ];
  rollback_probe constant regprocedure :=
    'public.g4_i1_test_bootstrap_then_fail(text)'::regprocedure;
begin
  if exists (
    select 1
    from unnest(service_only_functions) as target(function_oid)
    where pg_catalog.has_function_privilege(
      'public',
      target.function_oid,
      'EXECUTE'
    )
       or pg_catalog.has_function_privilege(
         'anon',
         target.function_oid,
         'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated',
         target.function_oid,
         'EXECUTE'
       )
       or not pg_catalog.has_function_privilege(
         'service_role',
         target.function_oid,
         'EXECUTE'
       )
  ) then
    raise exception 'A service-only fixture RPC has an invalid EXECUTE ACL';
  end if;

  if pg_catalog.has_function_privilege(
    'public',
    rollback_probe,
    'EXECUTE'
  )
     or pg_catalog.has_function_privilege(
       'anon',
       rollback_probe,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       rollback_probe,
       'EXECUTE'
     ) then
    raise exception 'The fixture rollback probe has an invalid EXECUTE ACL';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and (
        procedure.proname like 'g4_i1_test_%'
        or procedure.proname = 'is_g4_i1_fixture_user'
      )
      and not exists (
        select 1
        from unnest(procedure.proconfig) as setting
        where setting = 'search_path=""'
      )
  ) then
    raise exception 'A G4-I1/B function has a mutable search_path';
  end if;

  begin
    perform private.g4_i1_test_set_account_status(
      '00000000-0000-4000-8000-000000000001'::uuid,
      'pending_deletion'
    );
    raise exception 'Fixture state mutation accepted an untagged UUID';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

rollback;

select version, name
from supabase_migrations.schema_migrations
where name = 'g4_i1_auth_fixture_support';

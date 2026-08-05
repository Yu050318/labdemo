-- Read-only G4-I2-B task command semantic checks.
-- Run in a clean local database after applying I1 (4), I2-A (1) and I2-B (2)
-- migrations. The whole script runs inside one transaction and rolls back.

begin;

-- Fixture users A/B and their personal spaces (postgres role).
insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'g4i2b.a@local.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'g4i2b.b@local.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', now(), now(), now());

insert into public.user_profiles (user_id, display_name, account_status)
values
  ('11111111-1111-4111-8111-111111111111', 'Fixture A', 'active'),
  ('33333333-3333-4333-8333-333333333333', 'Fixture B', 'active');

insert into public.spaces (id, kind, name, owner_user_id)
values
  ('22222222-2222-4222-8222-222222222222', 'personal', 'A personal space', '11111111-1111-4111-8111-111111111111'),
  ('44444444-4444-4444-8444-444444444444', 'personal', 'B personal space', '33333333-3333-4333-8333-333333333333');

insert into public.space_memberships (space_id, user_id, role, status)
values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'owner', 'active');

insert into public.user_preferences (user_id, space_id, timezone)
values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Asia/Shanghai'),
  ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', 'Asia/Shanghai');

-- Terminal-state fixtures inserted directly as postgres (bypasses RLS).
insert into public.experiment_tasks (
  id, space_id, title, execution_state, planned_local_date, day_part,
  planned_timezone, notes, cancellation_reason, created_by
)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '22222222-2222-4222-8222-222222222222', 'Completed fixture', 'completed', '2026-08-04', 'morning', 'Asia/Shanghai', null, null, '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '22222222-2222-4222-8222-222222222222', 'Cancelled fixture', 'cancelled', '2026-08-04', 'morning', 'Asia/Shanghai', null, 'no longer needed', '11111111-1111-4111-8111-111111111111');

insert into public.experiment_tasks (
  id, space_id, title, execution_state, planned_local_date, day_part,
  planned_timezone, created_by, deleted_at, purge_after
)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', '22222222-2222-4222-8222-222222222222', 'Deleted fixture', 'not_started',
  '2026-08-05', 'morning', 'Asia/Shanghai', '11111111-1111-4111-8111-111111111111',
  now(), now() + interval '30 days'
);

-- =====================================================================
-- A: create_experiment_task
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
  task_id uuid;
  saved_title text;
begin
  -- Baseline create with exact times; DB derives UTC instants.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    clientOccurredAt => '2026-08-05T00:30:00+00:00'::timestamptz,
    title => 'Morning bench run',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => 'Prepare tubes',
    protocolVersionId => null,
    confirmTimeOverlap => false
  );

  if not (result ->> 'ok')::boolean then
    raise exception 'create_experiment_task failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 1 then
    raise exception 'create must return revision 1: %', result::text;
  end if;
  if (result #>> '{data,plannedStartAt}')::timestamptz
     <> '2026-08-05T01:00:00+00:00'::timestamptz then
    raise exception 'unexpected plannedStartAt: %', result::text;
  end if;
  if (result #>> '{data,plannedEndAt}')::timestamptz
     <> '2026-08-05T02:00:00+00:00'::timestamptz then
    raise exception 'unexpected plannedEndAt: %', result::text;
  end if;

  task_id := (result #>> '{data,taskId}')::uuid;
  if task_id is null then
    raise exception 'create did not return a taskId: %', result::text;
  end if;
  perform set_config('g4i2b.task1', task_id::text, true);

  -- Idempotent retry: same mutationId + same payload returns stored result.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    clientOccurredAt => '2026-08-05T00:31:00+00:00'::timestamptz,
    title => 'Morning bench run',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => 'Prepare tubes',
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if (result #>> '{data,taskId}')::uuid <> task_id then
    raise exception 'idempotent retry changed taskId: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 1 then
    raise exception 'idempotent retry changed revision: %', result::text;
  end if;

  -- Same mutationId, different payload: IDEMPOTENCY_KEY_REUSED.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
    clientOccurredAt => '2026-08-05T00:32:00+00:00'::timestamptz,
    title => 'Different title',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if (result ->> 'ok')::boolean or result #>> '{error,code}' <> 'IDEMPOTENCY_KEY_REUSED' then
    raise exception 'expected IDEMPOTENCY_KEY_REUSED: %', result::text;
  end if;

  -- Adjacent exact interval (10:00-11:00) does not overlap 09:00-10:00.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid,
    clientOccurredAt => '2026-08-05T00:33:00+00:00'::timestamptz,
    title => 'Morning adjacent',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '10:00',
    plannedLocalEndTime => '11:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'adjacent interval must not challenge: %', result::text;
  end if;

  -- Whole-day-part window without exact times must challenge.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
    clientOccurredAt => '2026-08-05T00:34:00+00:00'::timestamptz,
    title => 'Morning full window',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'TIME_OVERLAP_CONFIRMATION_REQUIRED' then
    raise exception 'expected overlap challenge: %', result::text;
  end if;
  if result ->> 'requestId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' then
    raise exception 'overlap challenge must return requestId: %', result::text;
  end if;
  if result #>> '{error,conflicts,0,taskId}' is null
     or result #>> '{error,conflicts,0,title}' <> 'Morning bench run'
     or result #>> '{error,conflicts,0,overlapStart}' <> '09:00'
     or result #>> '{error,conflicts,0,overlapEnd}' <> '10:00' then
    raise exception 'overlap summary must include task identity and actual segment: %', result::text;
  end if;

  -- Same mutationId + confirmTimeOverlap=true commits exactly once.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
    clientOccurredAt => '2026-08-05T00:35:00+00:00'::timestamptz,
    title => 'Morning full window',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => true
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'confirmed overlap create failed: %', result::text;
  end if;
  if result ->> 'requestId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3' then
    raise exception 'create success must return requestId: %', result::text;
  end if;

  -- Partial overlap must challenge too.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid,
    clientOccurredAt => '2026-08-05T00:36:00+00:00'::timestamptz,
    title => 'Morning partial',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:30',
    plannedLocalEndTime => '10:30',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'TIME_OVERLAP_CONFIRMATION_REQUIRED' then
    raise exception 'expected partial overlap challenge: %', result::text;
  end if;
  if not (result #> '{error,conflicts}') @>
    '[{"title":"Morning bench run","overlapStart":"09:30","overlapEnd":"10:00"}]'::jsonb then
    raise exception 'partial overlap summary has wrong actual segment: %', result::text;
  end if;

  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'::uuid,
    clientOccurredAt => '2026-08-05T00:37:00+00:00'::timestamptz,
    title => 'Morning partial',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:30',
    plannedLocalEndTime => '10:30',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => true
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'confirmed partial overlap create failed: %', result::text;
  end if;

  -- Single exact time keeps optional semantics (point interval, no challenge).
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'::uuid,
    clientOccurredAt => '2026-08-05T00:38:00+00:00'::timestamptz,
    title => 'Morning point',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'single-time create failed: %', result::text;
  end if;
  if (result #>> '{data,plannedStartAt}')::timestamptz is null
     or (result #>> '{data,plannedEndAt}')::timestamptz is not null then
    raise exception 'single-time instant derivation is wrong: %', result::text;
  end if;
end;
$$;

-- marker-A

-- =====================================================================

do $$
declare
  result jsonb;
begin
  -- end <= start: VALIDATION_FAILED with zero side effects.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,
    clientOccurredAt => '2026-08-05T00:40:00+00:00'::timestamptz,
    title => 'Morning invalid equal',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '10:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'end==start must fail validation: %', result::text;
  end if;
  if result ->> 'requestId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
     or result #>> '{error,fieldErrors,plannedLocalEndTime}' is null then
    raise exception 'validation failure contract is incomplete: %', result::text;
  end if;

  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'::uuid,
    clientOccurredAt => '2026-08-05T00:41:00+00:00'::timestamptz,
    title => 'Morning invalid order',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '11:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'end<start must fail validation: %', result::text;
  end if;

  -- Invalid IANA timezone.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'::uuid,
    clientOccurredAt => '2026-08-05T00:42:00+00:00'::timestamptz,
    title => 'Bad timezone',
    plannedLocalDate => '2026-08-06',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Mars/Olympus',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'invalid timezone must fail validation: %', result::text;
  end if;

  -- DST gap round-trip must be rejected (US spring forward 2026-03-08).
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'::uuid,
    clientOccurredAt => '2026-03-08T00:42:00+00:00'::timestamptz,
    title => 'DST gap',
    plannedLocalDate => '2026-03-08',
    dayPart => 'morning',
    plannedLocalTime => '02:30',
    plannedLocalEndTime => null,
    plannedTimezone => 'America/New_York',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'DST-gap local time must fail validation: %', result::text;
  end if;

  -- I3 protocol association is out of scope: non-null protocolVersionId.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab0'::uuid,
    clientOccurredAt => '2026-08-05T00:43:00+00:00'::timestamptz,
    title => 'Protocol task',
    plannedLocalDate => '2026-08-05',
    dayPart => 'afternoon',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => '99999999-9999-4999-8999-999999999999'::uuid,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'protocolVersionId must be rejected in I2-B: %', result::text;
  end if;

  -- Whitespace-only and over-length titles.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1'::uuid,
    clientOccurredAt => '2026-08-05T00:44:00+00:00'::timestamptz,
    title => '   ',
    plannedLocalDate => '2026-08-05',
    dayPart => 'afternoon',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'whitespace title must fail validation: %', result::text;
  end if;
  if result #>> '{error,fieldErrors,title}' is null
     or result ->> 'requestId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1' then
    raise exception 'title validation must return fieldErrors and requestId: %', result::text;
  end if;

  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2'::uuid,
    clientOccurredAt => '2026-08-05T00:45:00+00:00'::timestamptz,
    title => repeat('x', 201),
    plannedLocalDate => '2026-08-05',
    dayPart => 'afternoon',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception '201-char title must fail validation: %', result::text;
  end if;
end;
$$;

-- No session: AUTH_REQUIRED and no side effects.
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  result jsonb;
begin
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab3'::uuid,
    clientOccurredAt => '2026-08-05T00:46:00+00:00'::timestamptz,
    title => 'No session task',
    plannedLocalDate => '2026-08-05',
    dayPart => 'afternoon',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'AUTH_REQUIRED' then
    raise exception 'no-session create must return AUTH_REQUIRED: %', result::text;
  end if;
end;
$$;

-- Anonymous role has no RPC EXECUTE at all.
set local role anon;
do $$
begin
  begin
    perform public.create_experiment_task(
      mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      clientOccurredAt => '2026-08-05T00:47:00+00:00'::timestamptz,
      title => 'Anon task',
      plannedLocalDate => '2026-08-05',
      dayPart => 'afternoon',
      plannedLocalTime => null,
      plannedLocalEndTime => null,
      plannedTimezone => 'Asia/Shanghai',
      notes => null,
      protocolVersionId => null,
      confirmTimeOverlap => false
    );
    raise exception 'anon must not execute create_experiment_task';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

-- B creates in B's personal space; A's same-date tasks do not interfere.
set local role authenticated;
select set_config('request.jwt.claims', '{sub:33333333-3333-4333-8333-333333333333,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

do $$
declare
  result jsonb;
begin
  result := public.create_experiment_task(
    mutationId => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'::uuid,
    clientOccurredAt => '2026-08-05T00:48:00+00:00'::timestamptz,
    title => 'B morning task',
    plannedLocalDate => '2026-08-05',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => '10:00',
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'B create in own space failed: %', result::text;
  end if;
end;
$$;

-- Receipt and row checks for the baseline create (postgres role).
set local role postgres;

do $$
declare
  baseline_id uuid := current_setting('g4i2b.task1', true)::uuid;
  receipt_row record;
  task_row record;
  hash_value text;
begin
  select * into task_row
  from public.experiment_tasks
  where id = baseline_id;
  if task_row.id is null then
    raise exception 'baseline task was not created';
  end if;
  if task_row.revision <> 1 or task_row.created_by <> '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'baseline task row is inconsistent: %', to_jsonb(task_row)::text;
  end if;

  select * into receipt_row
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid;
  if receipt_row.mutation_id is null then
    raise exception 'committed receipt is missing';
  end if;
  if receipt_row.rpc_name <> 'create_experiment_task'
     or receipt_row.result_code <> 'committed'
     or receipt_row.result_revision <> 1
     or receipt_row.entity_type <> 'task'
     or receipt_row.entity_id <> baseline_id
     or receipt_row.committed_at is null then
    raise exception 'receipt fields are inconsistent: %', to_jsonb(receipt_row)::text;
  end if;
  if length(receipt_row.request_hash) <> 64
     or receipt_row.request_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'request_hash must be a 64-char hex digest';
  end if;

  -- Same key/hash retry produced no second task and no second receipt.
  if (select count(*) from public.experiment_tasks where title = 'Morning bench run') <> 1 then
    raise exception 'idempotent retry duplicated the task';
  end if;
  if (select count(*) from private.mutation_receipts
      where mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid) <> 1 then
    raise exception 'idempotent retry duplicated the receipt';
  end if;

  -- The challenge-then-confirm mutation has exactly one committed receipt.
  if (select count(*) from private.mutation_receipts
      where mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid) <> 1 then
    raise exception 'confirmed overlap create receipt is missing';
  end if;

  -- Pure validation failures wrote no receipts at all.
  if exists (
    select 1
    from private.mutation_receipts
    where mutation_id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab0'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab1'::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab2'::uuid
    )
  ) then
    raise exception 'a rejected create wrote a mutation receipt';
  end if;
end;
$$;
-- =====================================================================
-- B: update_experiment_task (challenge, commit, idempotency, stale conflict)
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
  task_id uuid := current_setting('g4i2b.task1', true)::uuid;
begin
  -- Overlapping update without confirmation must challenge and write nothing.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6'::uuid,
    clientOccurredAt => '2026-08-05T01:00:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    patch => jsonb_build_object(
      'title', 'Morning bench run updated',
      'notes', 'Updated notes',
      'confirmTimeOverlap', false
    )
  );
  if result #>> '{error,code}' <> 'TIME_OVERLAP_CONFIRMATION_REQUIRED' then
    raise exception 'update must challenge unconfirmed overlap: %', result::text;
  end if;
  if result ->> 'requestId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6' then
    raise exception 'update challenge must return requestId: %', result::text;
  end if;

  -- Same mutationId with confirmation commits exactly once.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6'::uuid,
    clientOccurredAt => '2026-08-05T01:01:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    patch => jsonb_build_object(
      'title', 'Morning bench run updated',
      'notes', 'Updated notes',
      'confirmTimeOverlap', true
    )
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'confirmed update failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 2 then
    raise exception 'update must bump revision to 2: %', result::text;
  end if;
  if (result #>> '{data,executionState}') <> 'not_started' then
    raise exception 'update changed executionState unexpectedly: %', result::text;
  end if;

  -- Idempotent retry returns the stored payload.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6'::uuid,
    clientOccurredAt => '2026-08-05T01:02:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    patch => jsonb_build_object(
      'title', 'Morning bench run updated',
      'notes', 'Updated notes',
      'confirmTimeOverlap', true
    )
  );
  if (result #>> '{data,revision}')::int <> 2 then
    raise exception 'idempotent update retry changed revision: %', result::text;
  end if;

  -- Stale expectedRevision registers an open conflict and a receipt.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab7'::uuid,
    clientOccurredAt => '2026-08-05T01:03:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    patch => jsonb_build_object('notes', 'stale notes')
  );
  if result #>> '{error,code}' <> 'CONFLICT' then
    raise exception 'stale update must return CONFLICT: %', result::text;
  end if;
  if (result #>> '{error,currentRevision}')::int <> 2 then
    raise exception 'conflict must carry currentRevision 2: %', result::text;
  end if;
  if result #>> '{error,conflictId}' is null then
    raise exception 'conflict must carry conflictId: %', result::text;
  end if;
end;
$$;
-- =====================================================================
-- C: cancel_experiment_task (Unicode matrix, state consistency)
-- =====================================================================
do $$
declare
  result jsonb;
  task_id uuid;
  all_ws text;
begin
  -- task2: all-whitespace is rejected; U+200B-only is valid and verbatim.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac1'::uuid,
    clientOccurredAt => '2026-08-06T00:30:00+00:00'::timestamptz,
    title => 'Cancel matrix two',
    plannedLocalDate => '2026-08-06',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'task2 create failed: %', result::text;
  end if;
  task_id := (result #>> '{data,taskId}')::uuid;
  perform set_config('g4i2b.task2', task_id::text, true);

  -- The 26 frozen trim code points, all-whitespace only.
  all_ws := E' \t\n\r\f' || chr(11) || chr(133) || chr(160) || chr(5760)
    || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
    || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201)
    || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279);

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab8'::uuid,
    clientOccurredAt => '2026-08-06T00:31:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    reason => all_ws
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'all-whitespace reason must fail validation: %', result::text;
  end if;

  -- U+200B is not in the trim set: a lone U+200B is a valid reason.
  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab9'::uuid,
    clientOccurredAt => '2026-08-06T00:32:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    reason => chr(8203)
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'U+200B-only reason must commit: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 2
     or (result #>> '{data,executionState}') <> 'cancelled' then
    raise exception 'cancel commit revision/state is wrong: %', result::text;
  end if;

  -- Re-cancel on a terminal state is rejected and writes nothing.
  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac2'::uuid,
    clientOccurredAt => '2026-08-06T00:33:00+00:00'::timestamptz,
    expectedRevision => 2,
    taskId => task_id,
    reason => 'again'
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 're-cancel must be rejected: %', result::text;
  end if;
end;
$$;
do $$
declare
  result jsonb;
  task_id uuid;
begin
  -- task3: only leading/trailing trim-set characters are removed; interior
  -- newlines are preserved verbatim.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac3'::uuid,
    clientOccurredAt => '2026-08-07T00:30:00+00:00'::timestamptz,
    title => 'Cancel matrix three',
    plannedLocalDate => '2026-08-07',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'task3 create failed: %', result::text;
  end if;
  task_id := (result #>> '{data,taskId}')::uuid;
  perform set_config('g4i2b.task3', task_id::text, true);

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaca'::uuid,
    clientOccurredAt => '2026-08-07T00:31:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    reason => chr(160) || E'\talpha\nbeta\r' || chr(8195)
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'mixed-whitespace cancel failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 2 then
    raise exception 'task3 cancel revision wrong: %', result::text;
  end if;
end;
$$;

do $$
declare
  result jsonb;
  task_id uuid;
begin
  -- task4: 501 characters fail validation; 500 characters commit.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac4'::uuid,
    clientOccurredAt => '2026-08-08T00:30:00+00:00'::timestamptz,
    title => 'Cancel matrix four',
    plannedLocalDate => '2026-08-08',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'task4 create failed: %', result::text;
  end if;
  task_id := (result #>> '{data,taskId}')::uuid;
  perform set_config('g4i2b.task4', task_id::text, true);

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacc'::uuid,
    clientOccurredAt => '2026-08-08T00:31:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    reason => repeat('x', 501)
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception '501-char reason must fail validation: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacb'::uuid,
    clientOccurredAt => '2026-08-08T00:32:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => task_id,
    reason => repeat('x', 500)
  );
  if not (result ->> 'ok')::boolean then
    raise exception '500-char reason must commit: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 2 then
    raise exception 'task4 cancel revision wrong: %', result::text;
  end if;
end;
$$;
do $$
declare
  result jsonb;
  task_id uuid;
begin
  -- task5: stale expectedRevision on a live task registers an open conflict.
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac5'::uuid,
    clientOccurredAt => '2026-08-09T00:30:00+00:00'::timestamptz,
    title => 'Cancel matrix five',
    plannedLocalDate => '2026-08-09',
    dayPart => 'morning',
    plannedLocalTime => '09:00',
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'task5 create failed: %', result::text;
  end if;
  task_id := (result #>> '{data,taskId}')::uuid;
  perform set_config('g4i2b.task5', task_id::text, true);

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacd'::uuid,
    clientOccurredAt => '2026-08-09T00:31:00+00:00'::timestamptz,
    expectedRevision => 2,
    taskId => task_id,
    reason => 'stale cancel'
  );
  if result #>> '{error,code}' <> 'CONFLICT' then
    raise exception 'stale cancel must return CONFLICT: %', result::text;
  end if;
  if (result #>> '{error,currentRevision}')::int <> 1 then
    raise exception 'stale cancel must carry currentRevision 1: %', result::text;
  end if;
end;
$$;

-- =====================================================================
-- D: soft-delete / restore and terminal-state guards
-- =====================================================================
do $$
declare
  result jsonb;
  task_id uuid := current_setting('g4i2b.task1', true)::uuid;
begin
  -- Soft-delete commits with a revision bump and a 30-day purge window.
  result := public.soft_delete_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad0'::uuid,
    clientOccurredAt => '2026-08-05T02:00:00+00:00'::timestamptz,
    expectedRevision => 2,
    entityType => 'task',
    entityId => task_id,
    confirmation => true
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'soft-delete failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 3 then
    raise exception 'soft-delete must bump revision to 3: %', result::text;
  end if;
  if result #>> '{data,deletedAt}' is null or result #>> '{data,purgeAfter}' is null then
    raise exception 'soft-delete must set deletedAt/purgeAfter: %', result::text;
  end if;
  if ((result #>> '{data,purgeAfter}')::timestamptz
      - (result #>> '{data,deletedAt}')::timestamptz) <> interval '30 days' then
    raise exception 'purge window must be 30 days: %', result::text;
  end if;

  -- Deleted tasks are invisible to update/cancel.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad4'::uuid,
    clientOccurredAt => '2026-08-05T02:01:00+00:00'::timestamptz,
    expectedRevision => 2,
    taskId => task_id,
    patch => jsonb_build_object('title', 'Must not apply')
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'update on deleted task must be NOT_FOUND: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad5'::uuid,
    clientOccurredAt => '2026-08-05T02:02:00+00:00'::timestamptz,
    expectedRevision => 3,
    taskId => task_id,
    reason => 'gone'
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'cancel on deleted task must be NOT_FOUND: %', result::text;
  end if;

  -- Repeat soft-delete is a committed no-op (revision unchanged).
  result := public.soft_delete_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad1'::uuid,
    clientOccurredAt => '2026-08-05T02:03:00+00:00'::timestamptz,
    expectedRevision => 3,
    entityType => 'task',
    entityId => task_id,
    confirmation => true
  );
  if not (result ->> 'ok')::boolean or (result #>> '{data,revision}')::int <> 3 then
    raise exception 'repeat soft-delete must be a no-op: %', result::text;
  end if;
end;
$$;
do $$
declare
  result jsonb;
  task_id uuid := current_setting('g4i2b.task1', true)::uuid;
begin
  -- Restore clears the deletion window and bumps revision once more.
  result := public.restore_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad2'::uuid,
    clientOccurredAt => '2026-08-05T02:04:00+00:00'::timestamptz,
    expectedRevision => 3,
    entityType => 'task',
    entityId => task_id
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'restore failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 4
     or result #>> '{data,deletedAt}' is not null
     or result #>> '{data,purgeAfter}' is not null then
    raise exception 'restore must clear deletion fields: %', result::text;
  end if;

  -- Restoring a live task is a committed no-op.
  result := public.restore_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad3'::uuid,
    clientOccurredAt => '2026-08-05T02:05:00+00:00'::timestamptz,
    expectedRevision => 4,
    entityType => 'task',
    entityId => task_id
  );
  if not (result ->> 'ok')::boolean or (result #>> '{data,revision}')::int <> 4 then
    raise exception 'restore on live task must be a no-op: %', result::text;
  end if;

  -- Explicit null clears exact times and notes; confirmation is required
  -- because the full-window morning task still overlaps once times are gone.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae1'::uuid,
    clientOccurredAt => '2026-08-05T02:06:00+00:00'::timestamptz,
    expectedRevision => 4,
    taskId => task_id,
    patch => jsonb_build_object(
      'plannedLocalTime', null,
      'plannedLocalEndTime', null,
      'notes', null,
      'confirmTimeOverlap', true
    )
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'time/notes clear update failed: %', result::text;
  end if;
  if (result #>> '{data,revision}')::int <> 5 then
    raise exception 'clear update must bump revision to 5: %', result::text;
  end if;
end;
$$;

do $$
declare
  result jsonb;
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  task2 uuid := current_setting('g4i2b.task2', true)::uuid;
begin
  -- Terminal states are guarded across all commands.
  result := public.soft_delete_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad7'::uuid,
    clientOccurredAt => '2026-08-06T01:00:00+00:00'::timestamptz,
    expectedRevision => 2,
    entityType => 'task',
    entityId => task2,
    confirmation => true
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'soft-delete on cancelled task must be rejected: %', result::text;
  end if;

  result := public.restore_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad8'::uuid,
    clientOccurredAt => '2026-08-06T01:01:00+00:00'::timestamptz,
    expectedRevision => 2,
    entityType => 'task',
    entityId => task2
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'restore on cancelled task must be rejected: %', result::text;
  end if;

  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad9'::uuid,
    clientOccurredAt => '2026-08-05T03:00:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    patch => jsonb_build_object('notes', 'x')
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'update on completed task must be rejected: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaada'::uuid,
    clientOccurredAt => '2026-08-05T03:01:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    reason => 'x'
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'cancel on completed task must be rejected: %', result::text;
  end if;

  result := public.soft_delete_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadb'::uuid,
    clientOccurredAt => '2026-08-05T03:02:00+00:00'::timestamptz,
    expectedRevision => 1,
    entityType => 'task',
    entityId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid,
    confirmation => true
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'soft-delete on completed task must be rejected: %', result::text;
  end if;

  result := public.restore_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadc'::uuid,
    clientOccurredAt => '2026-08-05T03:03:00+00:00'::timestamptz,
    expectedRevision => 1,
    entityType => 'task',
    entityId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'::uuid
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'restore on completed task must be rejected: %', result::text;
  end if;

  result := public.restore_entity(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadd'::uuid,
    clientOccurredAt => '2026-08-05T03:04:00+00:00'::timestamptz,
    expectedRevision => 1,
    entityType => 'task',
    entityId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'::uuid
  );
  if result #>> '{error,code}' <> 'INVALID_STATE_TRANSITION' then
    raise exception 'restore on cancelled fixture must be rejected: %', result::text;
  end if;

  -- The soft-deleted fixture stays invisible to update.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaade'::uuid,
    clientOccurredAt => '2026-08-05T03:05:00+00:00'::timestamptz,
    expectedRevision => 1,
    taskId => 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'::uuid,
    patch => jsonb_build_object('notes', 'x')
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'update on deleted fixture must be NOT_FOUND: %', result::text;
  end if;

  -- Unknown patch keys and empty patches fail validation.
  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadf'::uuid,
    clientOccurredAt => '2026-08-05T03:06:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    patch => jsonb_build_object('bogus', 1)
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'unknown patch key must fail validation: %', result::text;
  end if;

  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae0'::uuid,
    clientOccurredAt => '2026-08-05T03:07:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    patch => '{}'::jsonb
  );
  if result #>> '{error,code}' <> 'VALIDATION_FAILED' then
    raise exception 'empty patch must fail validation: %', result::text;
  end if;
end;
$$;
-- =====================================================================
-- E: receipt / conflict / row / audit verification (postgres role)
-- =====================================================================
set local role postgres;

do $$
declare
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  task2 uuid := current_setting('g4i2b.task2', true)::uuid;
  task3 uuid := current_setting('g4i2b.task3', true)::uuid;
  task4 uuid := current_setting('g4i2b.task4', true)::uuid;
  task5 uuid := current_setting('g4i2b.task5', true)::uuid;
  r record;
  n integer;
begin
  -- b6: challenge attempt wrote nothing; the confirmed commit has one
  -- committed receipt at revision 2.
  select count(*) into n
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6'::uuid;
  if n <> 1 then
    raise exception 'b6 receipt count must be 1, got %', n;
  end if;

  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab6'::uuid;
  if r.rpc_name <> 'update_experiment_task' or r.result_code <> 'committed'
     or r.result_revision <> 2 or r.entity_type <> 'task' or r.entity_id <> task1 then
    raise exception 'b6 receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  -- b7: stale update registered a conflict receipt.
  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab7'::uuid;
  if r.result_code <> 'conflict_registered' or r.result_revision <> 2
     or r.entity_id <> task1 then
    raise exception 'b7 conflict receipt inconsistent: %', to_jsonb(r)::text;
  end if;
  if (r.result_payload #>> '{error,code}') <> 'CONFLICT'
     or (r.result_payload #>> '{error,currentRevision}')::int <> 2
     or r.result_payload #>> '{error,conflictId}' is null then
    raise exception 'b7 conflict payload inconsistent: %', r.result_payload::text;
  end if;

  -- b8: all-whitespace cancel wrote no receipt.
  if exists (
    select 1 from private.mutation_receipts
    where user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab8'::uuid
  ) then
    raise exception 'all-whitespace cancel wrote a receipt';
  end if;

  -- b9: U+200B-only cancel committed at revision 2.
  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab9'::uuid;
  if r.rpc_name <> 'cancel_experiment_task' or r.result_code <> 'committed'
     or r.result_revision <> 2 or r.entity_id <> task2 then
    raise exception 'b9 receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  -- c2: re-cancel wrote no receipt.
  if exists (
    select 1 from private.mutation_receipts
    where user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaac2'::uuid
  ) then
    raise exception 're-cancel wrote a receipt';
  end if;

  -- ca: mixed-whitespace cancel committed at revision 2 on task3.
  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaca'::uuid;
  if r.result_code <> 'committed' or r.result_revision <> 2 or r.entity_id <> task3 then
    raise exception 'ca receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  -- cc: 501-char cancel wrote no receipt; cb: 500-char committed at 2.
  if exists (
    select 1 from private.mutation_receipts
    where user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacc'::uuid
  ) then
    raise exception '501-char cancel wrote a receipt';
  end if;

  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacb'::uuid;
  if r.result_code <> 'committed' or r.result_revision <> 2 or r.entity_id <> task4 then
    raise exception 'cb receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  -- cd: stale cancel registered a conflict receipt at current revision 1.
  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacd'::uuid;
  if r.result_code <> 'conflict_registered' or r.result_revision <> 1
     or r.entity_id <> task5 then
    raise exception 'cd conflict receipt inconsistent: %', to_jsonb(r)::text;
  end if;
end;
$$;
do $$
declare
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  r record;
begin
  -- d0/d1 soft-delete and d2/d3 restore receipts.
  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad0'::uuid;
  if r.rpc_name <> 'soft_delete_entity' or r.result_code <> 'committed'
     or r.result_revision <> 3 or r.entity_id <> task1 then
    raise exception 'd0 receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad1'::uuid;
  if r.result_code <> 'committed' or r.result_revision <> 3 then
    raise exception 'd1 no-op receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad2'::uuid;
  if r.rpc_name <> 'restore_entity' or r.result_code <> 'committed'
     or r.result_revision <> 4 then
    raise exception 'd2 restore receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  select * into r
  from private.mutation_receipts
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid
    and mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad3'::uuid;
  if r.result_code <> 'committed' or r.result_revision <> 4 then
    raise exception 'd3 no-op receipt inconsistent: %', to_jsonb(r)::text;
  end if;

  -- d4/d5 (deleted-task visibility) and d7-df/e0 (rejections) wrote nothing.
  if exists (
    select 1 from private.mutation_receipts
    where user_id = '11111111-1111-4111-8111-111111111111'::uuid
      and mutation_id in (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad4'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad5'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad7'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad8'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaad9'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaada'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadb'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadc'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadd'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaade'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadf'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae0'::uuid
      )
  ) then
    raise exception 'a rejected command wrote a mutation receipt';
  end if;
end;
$$;

do $$
declare
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  task2 uuid := current_setting('g4i2b.task2', true)::uuid;
  task3 uuid := current_setting('g4i2b.task3', true)::uuid;
  task4 uuid := current_setting('g4i2b.task4', true)::uuid;
  task5 uuid := current_setting('g4i2b.task5', true)::uuid;
  t public.experiment_tasks%rowtype;
begin
  select * into t from public.experiment_tasks where id = task1;
  if t.revision <> 5 or t.execution_state <> 'not_started'
     or t.title <> 'Morning bench run updated'
     or t.notes is not null
     or t.planned_local_time is not null or t.planned_local_end_time is not null
     or t.planned_start_at is not null or t.planned_end_at is not null
     or t.deleted_at is not null or t.purge_after is not null then
    raise exception 'task1 row inconsistent: %', to_jsonb(t)::text;
  end if;

  select * into t from public.experiment_tasks where id = task2;
  if t.execution_state <> 'cancelled' or t.cancellation_reason <> chr(8203)
     or t.revision <> 2 then
    raise exception 'task2 row inconsistent: %', to_jsonb(t)::text;
  end if;

  select * into t from public.experiment_tasks where id = task3;
  if t.execution_state <> 'cancelled' or t.cancellation_reason <> E'alpha\nbeta'
     or t.revision <> 2 then
    raise exception 'task3 row inconsistent: %', to_jsonb(t)::text;
  end if;

  select * into t from public.experiment_tasks where id = task4;
  if t.execution_state <> 'cancelled' or t.cancellation_reason <> repeat('x', 500)
     or t.revision <> 2 then
    raise exception 'task4 row inconsistent: %', to_jsonb(t)::text;
  end if;

  select * into t from public.experiment_tasks where id = task5;
  if t.execution_state <> 'not_started' or t.revision <> 1 then
    raise exception 'task5 row inconsistent: %', to_jsonb(t)::text;
  end if;
end;
$$;

do $$
declare
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  task5 uuid := current_setting('g4i2b.task5', true)::uuid;
  n integer;
  r public.sync_conflicts%rowtype;
begin
  select count(*) into n from public.sync_conflicts;
  if n <> 2 then
    raise exception 'expected exactly 2 sync_conflicts, got %', n;
  end if;

  select * into r from public.sync_conflicts
  where mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab7'::uuid;
  if r.reason <> 'STALE_ENTITY_REVISION' or r.status <> 'open'
     or r.base_revision <> 1 or r.current_revision <> 2
     or r.entity_type <> 'task' or r.entity_id <> task1
     or r.user_id <> '11111111-1111-4111-8111-111111111111'::uuid
     or r.space_id <> '22222222-2222-4222-8222-222222222222'::uuid
     or r.pending_intent #>> '{rpcName}' <> 'update_experiment_task'
     or (r.current_state #>> '{revision}')::int <> 2 then
    raise exception 'b7 conflict row inconsistent: %', to_jsonb(r)::text;
  end if;

  select * into r from public.sync_conflicts
  where mutation_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacd'::uuid;
  if r.reason <> 'STALE_ENTITY_REVISION' or r.status <> 'open'
     or r.base_revision <> 2 or r.current_revision <> 1
     or r.entity_type <> 'task' or r.entity_id <> task5
     or r.pending_intent #>> '{rpcName}' <> 'cancel_experiment_task' then
    raise exception 'cd conflict row inconsistent: %', to_jsonb(r)::text;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from private.audit_events where action = 'update_task')
     or not exists (select 1 from private.audit_events where action = 'cancel_task')
     or not exists (select 1 from private.audit_events where action = 'soft_delete_task')
     or not exists (select 1 from private.audit_events where action = 'restore_task') then
    raise exception 'expected audit actions are missing';
  end if;

  if exists (
    select 1 from private.audit_events
    where metadata ? 'reason' or metadata ? 'title' or metadata ? 'notes'
       or metadata ? 'cancellationReason' or metadata ? 'cancellation_reason'
  ) then
    raise exception 'audit metadata must not carry experiment body text';
  end if;

  if not exists (
    select 1 from private.audit_events
    where action = 'update_task'
      and metadata ->> 'revision' = '2'
      and metadata ->> 'executionState' = 'not_started'
      and metadata ->> 'resultCode' = 'committed'
  ) then
    raise exception 'update_task audit metadata is inconsistent';
  end if;

  if exists (
    select 1 from private.audit_events
    where action = 'cancel_task' and metadata ? 'reason'
  ) then
    raise exception 'cancel audit metadata must not carry the reason';
  end if;
end;
$$;
-- =====================================================================
-- F: cross-account isolation, session boundaries and ACL
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{sub:33333333-3333-4333-8333-333333333333,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);

do $$
declare
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
  n integer;
  result jsonb;
begin
  -- B sees only its own profile; A's rows are invisible everywhere.
  select count(*) into n
  from public.user_profiles
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'B can see A profile (%)', n;
  end if;

  select count(*) into n
  from public.user_profiles
  where user_id = '33333333-3333-4333-8333-333333333333'::uuid;
  if n <> 1 then
    raise exception 'B cannot see own profile (%)', n;
  end if;

  select count(*) into n
  from public.spaces
  where id = '22222222-2222-4222-8222-222222222222'::uuid;
  if n <> 0 then
    raise exception 'B can see A space (%)', n;
  end if;

  select count(*) into n
  from public.space_memberships
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'B can see A membership (%)', n;
  end if;

  select count(*) into n
  from public.user_preferences
  where user_id = '11111111-1111-4111-8111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'B can see A preferences (%)', n;
  end if;

  select count(*) into n
  from public.experiment_tasks
  where id = task1;
  if n <> 0 then
    raise exception 'B can see A task (%)', n;
  end if;

  select count(*) into n
  from public.experiment_tasks
  where created_by = '11111111-1111-4111-8111-111111111111'::uuid;
  if n <> 0 then
    raise exception 'B can see A tasks by creator (%)', n;
  end if;

  -- B's writes on A's task surface as NOT_FOUND with zero side effects.
  result := public.update_experiment_task(
    mutationId => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
    clientOccurredAt => '2026-08-05T04:00:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    patch => jsonb_build_object('notes', 'B writes')
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'B update on A task must be NOT_FOUND: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'::uuid,
    clientOccurredAt => '2026-08-05T04:01:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    reason => 'B cancels'
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'B cancel on A task must be NOT_FOUND: %', result::text;
  end if;

  result := public.soft_delete_entity(
    mutationId => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'::uuid,
    clientOccurredAt => '2026-08-05T04:02:00+00:00'::timestamptz,
    expectedRevision => 5,
    entityType => 'task',
    entityId => task1,
    confirmation => true
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'B soft-delete on A task must be NOT_FOUND: %', result::text;
  end if;

  result := public.restore_entity(
    mutationId => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'::uuid,
    clientOccurredAt => '2026-08-05T04:03:00+00:00'::timestamptz,
    expectedRevision => 5,
    entityType => 'task',
    entityId => task1
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'B restore on A task must be NOT_FOUND: %', result::text;
  end if;
end;
$$;

set local role postgres;

do $$
declare
  n integer;
begin
  select count(*) into n
  from private.mutation_receipts
  where user_id = '33333333-3333-4333-8333-333333333333'::uuid
    and mutation_id in (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'::uuid,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'::uuid
    );
  if n <> 0 then
    raise exception 'B cross-account attempts wrote receipts (%)', n;
  end if;

  select count(*) into n
  from public.sync_conflicts
  where user_id = '33333333-3333-4333-8333-333333333333'::uuid;
  if n <> 0 then
    raise exception 'B cross-account attempts wrote conflicts (%)', n;
  end if;
end;
$$;
-- A's membership is removed while the account stays active.
update public.space_memberships
set status = 'removed'
where user_id = '11111111-1111-4111-8111-111111111111'::uuid
  and space_id = '22222222-2222-4222-8222-222222222222'::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
begin
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae2'::uuid,
    clientOccurredAt => '2026-08-10T00:30:00+00:00'::timestamptz,
    title => 'Removed membership create',
    plannedLocalDate => '2026-08-10',
    dayPart => 'morning',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'FORBIDDEN' then
    raise exception 'create without membership must be FORBIDDEN: %', result::text;
  end if;

  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae3'::uuid,
    clientOccurredAt => '2026-08-10T00:31:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    patch => jsonb_build_object('notes', 'x')
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'update without membership must be NOT_FOUND: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae4'::uuid,
    clientOccurredAt => '2026-08-10T00:32:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    reason => 'x'
  );
  if result #>> '{error,code}' <> 'NOT_FOUND' then
    raise exception 'cancel without membership must be NOT_FOUND: %', result::text;
  end if;
end;
$$;

set local role postgres;
update public.space_memberships
set status = 'active'
where user_id = '11111111-1111-4111-8111-111111111111'::uuid
  and space_id = '22222222-2222-4222-8222-222222222222'::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
begin
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae5'::uuid,
    clientOccurredAt => '2026-08-10T00:33:00+00:00'::timestamptz,
    title => 'Membership restored create',
    plannedLocalDate => '2026-08-10',
    dayPart => 'afternoon',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'create after membership restore failed: %', result::text;
  end if;
end;
$$;

set local role postgres;
update public.user_profiles
set account_status = 'pending_deletion'
where user_id = '11111111-1111-4111-8111-111111111111'::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
  task1 uuid := current_setting('g4i2b.task1', true)::uuid;
begin
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae6'::uuid,
    clientOccurredAt => '2026-08-10T00:34:00+00:00'::timestamptz,
    title => 'Pending deletion create',
    plannedLocalDate => '2026-08-10',
    dayPart => 'evening',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if result #>> '{error,code}' <> 'FORBIDDEN' then
    raise exception 'create with pending_deletion must be FORBIDDEN: %', result::text;
  end if;

  result := public.update_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae7'::uuid,
    clientOccurredAt => '2026-08-10T00:35:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    patch => jsonb_build_object('notes', 'x')
  );
  if result #>> '{error,code}' <> 'FORBIDDEN' then
    raise exception 'update with pending_deletion must be FORBIDDEN: %', result::text;
  end if;

  result := public.cancel_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae8'::uuid,
    clientOccurredAt => '2026-08-10T00:36:00+00:00'::timestamptz,
    expectedRevision => 5,
    taskId => task1,
    reason => 'x'
  );
  if result #>> '{error,code}' <> 'FORBIDDEN' then
    raise exception 'cancel with pending_deletion must be FORBIDDEN: %', result::text;
  end if;
end;
$$;

set local role postgres;
update public.user_profiles
set account_status = 'active'
where user_id = '11111111-1111-4111-8111-111111111111'::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{sub:11111111-1111-4111-8111-111111111111,role:authenticated}', true);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

do $$
declare
  result jsonb;
begin
  result := public.create_experiment_task(
    mutationId => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaae9'::uuid,
    clientOccurredAt => '2026-08-10T00:37:00+00:00'::timestamptz,
    title => 'Account restored create',
    plannedLocalDate => '2026-08-10',
    dayPart => 'evening',
    plannedLocalTime => null,
    plannedLocalEndTime => null,
    plannedTimezone => 'Asia/Shanghai',
    notes => null,
    protocolVersionId => null,
    confirmTimeOverlap => false
  );
  if not (result ->> 'ok')::boolean then
    raise exception 'create after account restore failed: %', result::text;
  end if;
end;
$$;
set local role postgres;

revoke execute on function public.create_experiment_task(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean) from anon;
revoke execute on function public.update_experiment_task(uuid, timestamptz, bigint, uuid, jsonb) from anon;
revoke execute on function public.cancel_experiment_task(uuid, timestamptz, bigint, uuid, text) from anon;
revoke execute on function public.soft_delete_entity(uuid, timestamptz, bigint, text, uuid, boolean) from anon;
revoke execute on function public.restore_entity(uuid, timestamptz, bigint, text, uuid) from anon;

set local role anon;

do $$
begin
  begin
    perform public.update_experiment_task(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      '2026-08-05T00:47:00+00:00'::timestamptz,
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      '{"notes":"x"}'::jsonb
    );
    raise exception 'anon must not execute update_experiment_task';
  exception when insufficient_privilege then null; end;

  begin
    perform public.cancel_experiment_task(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      '2026-08-05T00:47:00+00:00'::timestamptz,
      1,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      'x'
    );
    raise exception 'anon must not execute cancel_experiment_task';
  exception when insufficient_privilege then null; end;

  begin
    perform public.soft_delete_entity(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      '2026-08-05T00:47:00+00:00'::timestamptz,
      1,
      'task',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      true
    );
    raise exception 'anon must not execute soft_delete_entity';
  exception when insufficient_privilege then null; end;

  begin
    perform public.restore_entity(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid,
      '2026-08-05T00:47:00+00:00'::timestamptz,
      1,
      'task',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaab4'::uuid
    );
    raise exception 'anon must not execute restore_entity';
  exception when insufficient_privilege then null; end;
end;
$$;

set local role postgres;

do $$
declare
  r text;
begin
  foreach r in array array['public', 'anon', 'service_role'] loop
    if coalesce(has_function_privilege(r, 'public.create_experiment_task(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)', 'EXECUTE'), false) then
      raise exception 'create wrapper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'public.update_experiment_task(uuid, timestamptz, bigint, uuid, jsonb)', 'EXECUTE'), false) then
      raise exception 'update wrapper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'public.cancel_experiment_task(uuid, timestamptz, bigint, uuid, text)', 'EXECUTE'), false) then
      raise exception 'cancel wrapper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'public.soft_delete_entity(uuid, timestamptz, bigint, text, uuid, boolean)', 'EXECUTE'), false) then
      raise exception 'soft-delete wrapper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'public.restore_entity(uuid, timestamptz, bigint, text, uuid)', 'EXECUTE'), false) then
      raise exception 'restore wrapper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.create_experiment_task_cmd(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)', 'EXECUTE'), false) then
      raise exception 'create cmd must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.update_experiment_task_cmd(uuid, timestamptz, bigint, uuid, jsonb)', 'EXECUTE'), false) then
      raise exception 'update cmd must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.cancel_experiment_task_cmd(uuid, timestamptz, bigint, uuid, text)', 'EXECUTE'), false) then
      raise exception 'cancel cmd must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.soft_delete_entity_cmd(uuid, timestamptz, bigint, text, uuid, boolean)', 'EXECUTE'), false) then
      raise exception 'soft-delete cmd must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.restore_entity_cmd(uuid, timestamptz, bigint, text, uuid)', 'EXECUTE'), false) then
      raise exception 'restore cmd must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.experiment_task_bounds_seconds(time, time, text)', 'EXECUTE'), false) then
      raise exception 'bounds helper must not be executable by %', r;
    end if;
    if coalesce(has_function_privilege(r, 'private.register_task_revision_conflict(uuid, uuid, text, text, uuid, uuid, bigint, bigint, jsonb, jsonb)', 'EXECUTE'), false) then
      raise exception 'conflict helper must not be executable by %', r;
    end if;
  end loop;

  if coalesce(has_function_privilege('authenticated', 'private.experiment_task_bounds_seconds(time, time, text)', 'EXECUTE'), false) then
    raise exception 'bounds helper must not be executable by authenticated';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.register_task_revision_conflict(uuid, uuid, text, text, uuid, uuid, bigint, bigint, jsonb, jsonb)', 'EXECUTE'), false) then
    raise exception 'conflict helper must not be executable by authenticated';
  end if;
end;
$$;
do $$
begin
  if coalesce(has_function_privilege('authenticated', 'public.create_experiment_task(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)', 'EXECUTE'), false) is not true then
    raise exception 'create wrapper missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'public.update_experiment_task(uuid, timestamptz, bigint, uuid, jsonb)', 'EXECUTE'), false) is not true then
    raise exception 'update wrapper missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'public.cancel_experiment_task(uuid, timestamptz, bigint, uuid, text)', 'EXECUTE'), false) is not true then
    raise exception 'cancel wrapper missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'public.soft_delete_entity(uuid, timestamptz, bigint, text, uuid, boolean)', 'EXECUTE'), false) is not true then
    raise exception 'soft-delete wrapper missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'public.restore_entity(uuid, timestamptz, bigint, text, uuid)', 'EXECUTE'), false) is not true then
    raise exception 'restore wrapper missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.create_experiment_task_cmd(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)', 'EXECUTE'), false) is not true then
    raise exception 'create cmd missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.update_experiment_task_cmd(uuid, timestamptz, bigint, uuid, jsonb)', 'EXECUTE'), false) is not true then
    raise exception 'update cmd missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.cancel_experiment_task_cmd(uuid, timestamptz, bigint, uuid, text)', 'EXECUTE'), false) is not true then
    raise exception 'cancel cmd missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.soft_delete_entity_cmd(uuid, timestamptz, bigint, text, uuid, boolean)', 'EXECUTE'), false) is not true then
    raise exception 'soft-delete cmd missing authenticated EXECUTE';
  end if;
  if coalesce(has_function_privilege('authenticated', 'private.restore_entity_cmd(uuid, timestamptz, bigint, text, uuid)', 'EXECUTE'), false) is not true then
    raise exception 'restore cmd missing authenticated EXECUTE';
  end if;
end;
$$;

do $$
begin
  if coalesce(has_table_privilege('authenticated', 'private.mutation_receipts', 'SELECT'), false) then
    raise exception 'authenticated must not select mutation_receipts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'private.mutation_receipts', 'INSERT'), false) then
    raise exception 'authenticated must not insert mutation_receipts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'private.mutation_receipts', 'UPDATE'), false) then
    raise exception 'authenticated must not update mutation_receipts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'private.mutation_receipts', 'DELETE'), false) then
    raise exception 'authenticated must not delete mutation_receipts';
  end if;
  if coalesce(has_table_privilege('anon', 'private.mutation_receipts', 'SELECT'), false) then
    raise exception 'anon must not select mutation_receipts';
  end if;
  if coalesce(has_table_privilege('anon', 'private.audit_events', 'SELECT'), false) then
    raise exception 'anon must not select audit_events';
  end if;
  if coalesce(has_table_privilege('authenticated', 'private.audit_events', 'SELECT'), false) then
    raise exception 'authenticated must not select audit_events';
  end if;
  if coalesce(has_table_privilege('authenticated', 'private.audit_events', 'INSERT'), false) then
    raise exception 'authenticated must not insert audit_events';
  end if;

  if coalesce(has_table_privilege('authenticated', 'public.sync_conflicts', 'SELECT'), false) is not true then
    raise exception 'authenticated must select sync_conflicts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.sync_conflicts', 'INSERT'), false) then
    raise exception 'authenticated must not insert sync_conflicts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.sync_conflicts', 'UPDATE'), false) then
    raise exception 'authenticated must not update sync_conflicts';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.sync_conflicts', 'DELETE'), false) then
    raise exception 'authenticated must not delete sync_conflicts';
  end if;
  if coalesce(has_table_privilege('anon', 'public.sync_conflicts', 'SELECT'), false) then
    raise exception 'anon must not select sync_conflicts';
  end if;

  if coalesce(has_table_privilege('authenticated', 'public.experiment_tasks', 'SELECT'), false) is not true then
    raise exception 'authenticated must select experiment_tasks';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.experiment_tasks', 'INSERT'), false) then
    raise exception 'authenticated must not insert experiment_tasks';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.experiment_tasks', 'UPDATE'), false) then
    raise exception 'authenticated must not update experiment_tasks';
  end if;
  if coalesce(has_table_privilege('authenticated', 'public.experiment_tasks', 'DELETE'), false) then
    raise exception 'authenticated must not delete experiment_tasks';
  end if;
  if coalesce(has_table_privilege('anon', 'public.experiment_tasks', 'SELECT'), false) then
    raise exception 'anon must not select experiment_tasks';
  end if;
end;
$$;

rollback;

-- G4-I2-B schedule task command RPCs: create/update/cancel/soft-delete/
-- restore. SECURITY INVOKER wrappers forward to SECURITY DEFINER command
-- helpers. Every helper re-derives the actor from auth.uid(), checks active
-- account + active space membership, applies the frozen time/overlap/revision
-- rules, then writes the task row, mutation receipt and whitelisted audit
-- event in one transaction. Pure validation failures, overlap challenges and
-- auth failures never write receipts.

-- ---------------------------------------------------------------------------
-- Interval bounds helper (seconds since local midnight). A task participates
-- in overlap detection only when both exact times are set or neither is set
-- (day-part window); a single exact time is a point and never overlaps.
-- Evening window ends at next-day 00:00 (= 86400 seconds).
-- ---------------------------------------------------------------------------
create function private.experiment_task_bounds_seconds(
  p_local_time time,
  p_local_end_time time,
  p_day_part text
)
returns bigint[]
language sql
immutable
set search_path = ''
as $$
  select array[
    case
      when p_local_time is not null then extract(epoch from p_local_time)::bigint
      when p_day_part = 'afternoon' then 12 * 3600
      when p_day_part = 'evening' then 18 * 3600
      else 0
    end,
    case
      when p_local_end_time is not null then extract(epoch from p_local_end_time)::bigint
      when p_local_time is not null then extract(epoch from p_local_time)::bigint
      when p_day_part = 'afternoon' then 18 * 3600
      when p_day_part = 'evening' then 24 * 3600
      else 12 * 3600
    end
  ];
$$;

-- ---------------------------------------------------------------------------
-- create_experiment_task (public wrapper + private command helper)
-- ---------------------------------------------------------------------------
create function private.create_experiment_task_cmd(
  p_mutation_id uuid,
  p_client_occurred_at timestamptz,
  p_title text,
  p_planned_local_date date,
  p_day_part text,
  p_planned_local_time time,
  p_planned_local_end_time time,
  p_planned_timezone text,
  p_notes text,
  p_protocol_version_id uuid,
  p_confirm_time_overlap boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  canonical_payload jsonb;
  computed_hash text;
  existing_rpc_name text;
  existing_hash text;
  existing_payload jsonb;
  personal_space_id uuid;
  conflict_summary jsonb;
  overlap_bounds bigint[];
  task_row public.experiment_tasks%rowtype;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return private.raise_api_error(
      'AUTH_REQUIRED',
      'Authentication is required to create a task.'
    );
  end if;

  -- Canonical payload excludes clientOccurredAt (device-clock noise) and
  -- mutationId (the key itself); jsonb normalizes key order.
  canonical_payload := jsonb_strip_nulls(jsonb_build_object(
    'title', p_title,
    'plannedLocalDate', p_planned_local_date,
    'dayPart', p_day_part,
    'plannedLocalTime', p_planned_local_time,
    'plannedLocalEndTime', p_planned_local_end_time,
    'plannedTimezone', p_planned_timezone,
    'notes', p_notes,
    'protocolVersionId', p_protocol_version_id,
    'confirmTimeOverlap', p_confirm_time_overlap
  ));

  computed_hash := private.request_hash(
    'create_experiment_task',
    current_user_id,
    canonical_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || p_mutation_id::text, 0)
  );

  select rpc_name, request_hash, result_payload
    into existing_rpc_name, existing_hash, existing_payload
  from private.mutation_receipts
  where user_id = current_user_id
    and mutation_id = p_mutation_id;

  if found then
    if existing_hash = computed_hash then
      return existing_payload;
    end if;
    return private.raise_api_error(
      'IDEMPOTENCY_KEY_REUSED',
      'This mutationId was already used with a different payload.'
    );
  end if;

  -- Pure validation failures never write receipts.
  if p_title is null or btrim(p_title) = '' or length(btrim(p_title)) > 200 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Title is required and must be 1-200 characters.'
    );
  end if;
  if p_planned_local_date is null then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'plannedLocalDate is required.'
    );
  end if;
  if p_day_part not in ('morning', 'afternoon', 'evening') then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'dayPart must be morning, afternoon or evening.'
    );
  end if;
  if p_planned_timezone is null or length(p_planned_timezone) = 0 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'plannedTimezone is required.'
    );
  end if;
  if p_notes is not null and length(p_notes) > 10000 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'notes must be at most 10000 characters.'
    );
  end if;
  if p_protocol_version_id is not null then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Protocol association is not implemented in this increment.'
    );
  end if;

  -- Frozen order rule: planned_local_time < planned_local_end_time when both
  -- exact times are set on the same local date; equal or reversed fails.
  if p_planned_local_time is not null
     and p_planned_local_end_time is not null
     and not (p_planned_local_time < p_planned_local_end_time) then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Exact end time must be after the exact start time.'
    );
  end if;

  -- Actor must have an active account and an active personal space.
  if not private.is_active_account(current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'The account is not active.'
    );
  end if;

  select space.id
    into personal_space_id
  from public.spaces as space
  where space.owner_user_id = current_user_id
    and space.kind = 'personal'
    and space.deleted_at is null;

  if personal_space_id is null
     or not private.is_active_space_member(personal_space_id, current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'No active personal space membership is available.'
    );
  end if;

  -- Overlap detection: same space + same local date + half-open intervals.
  -- A candidate with exactly one exact time is a point and never challenges.
  if (p_planned_local_time is null) = (p_planned_local_end_time is null) then
    overlap_bounds := private.experiment_task_bounds_seconds(
      p_planned_local_time,
      p_planned_local_end_time,
      p_day_part
    );

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'taskId', existing.id,
          'title', existing.title,
          'date', existing.planned_local_date,
          'dayPart', existing.day_part,
          'overlapStart', to_char(
            time '00:00' + greatest(
              (private.experiment_task_bounds_seconds(
                existing.planned_local_time,
                existing.planned_local_end_time,
                existing.day_part
              ))[1],
              overlap_bounds[1]
            ) * interval '1 second',
            'HH24:MI'
          ),
          'overlapEnd', case
            when least(
              (private.experiment_task_bounds_seconds(
                existing.planned_local_time,
                existing.planned_local_end_time,
                existing.day_part
              ))[2],
              overlap_bounds[2]
            ) = 86400 then '24:00'
            else to_char(
              time '00:00' + least(
                (private.experiment_task_bounds_seconds(
                  existing.planned_local_time,
                  existing.planned_local_end_time,
                  existing.day_part
                ))[2],
                overlap_bounds[2]
              ) * interval '1 second',
              'HH24:MI'
            )
          end,
          'times', jsonb_build_object(
            'start', existing.planned_local_time,
            'end', existing.planned_local_end_time
          )
        )
        order by existing.planned_local_time nulls first, existing.id
      ),
      '[]'::jsonb
    )
      into conflict_summary
    from public.experiment_tasks as existing
    where existing.space_id = personal_space_id
      and existing.planned_local_date = p_planned_local_date
      and existing.deleted_at is null
      and (existing.planned_local_time is null) = (existing.planned_local_end_time is null)
      and (
        (private.experiment_task_bounds_seconds(
          existing.planned_local_time,
          existing.planned_local_end_time,
          existing.day_part
        ))[1]
        < overlap_bounds[2]
      )
      and (
        overlap_bounds[1]
        < (private.experiment_task_bounds_seconds(
          existing.planned_local_time,
          existing.planned_local_end_time,
          existing.day_part
        ))[2]
      );

    if jsonb_array_length(conflict_summary) > 0
       and not coalesce(p_confirm_time_overlap, false) then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'TIME_OVERLAP_CONFIRMATION_REQUIRED',
          'message', 'The task overlaps another task in the same space.',
          'conflicts', conflict_summary
        )
      );
    end if;
  end if;

  begin
    insert into public.experiment_tasks (
      space_id,
      title,
      execution_state,
      planned_local_date,
      day_part,
      planned_local_time,
      planned_local_end_time,
      planned_timezone,
      notes,
      cancellation_reason,
      protocol_version_id,
      created_by
    )
    values (
      personal_space_id,
      btrim(p_title),
      'not_started',
      p_planned_local_date,
      p_day_part,
      p_planned_local_time,
      p_planned_local_end_time,
      p_planned_timezone,
      p_notes,
      null,
      null,
      current_user_id
    )
    returning * into task_row;
  exception
    when check_violation then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Task time fields are invalid for the selected timezone or date.'
      );
    when others then
      if sqlstate = '23514' then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'Task time fields are invalid for the selected timezone or date.'
        );
      end if;
      raise;
  end;

  -- Derived instants must respect the frozen order (planned_start_at <
  -- planned_end_at) whenever both are present.
  if task_row.planned_start_at is not null
     and task_row.planned_end_at is not null
     and not (task_row.planned_start_at < task_row.planned_end_at) then
    raise exception 'Derived planned instants violate start < end';
  end if;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    current_user_id,
    p_mutation_id,
    'create_experiment_task',
    computed_hash,
    'task',
    task_row.id,
    'committed',
    task_row.revision,
    jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    )
  );

  insert into private.audit_events (
    space_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    task_row.space_id,
    current_user_id,
    'create_task',
    'task',
    task_row.id,
    p_mutation_id,
    jsonb_build_object(
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'resultCode', 'committed'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'taskId', task_row.id,
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'plannedStartAt', task_row.planned_start_at,
      'plannedEndAt', task_row.planned_end_at
    )
  );
end;
$$;

create function public.create_experiment_task(
  mutationId uuid,
  clientOccurredAt timestamptz,
  title text,
  plannedLocalDate date,
  dayPart text,
  plannedLocalTime time,
  plannedLocalEndTime time,
  plannedTimezone text,
  notes text,
  protocolVersionId uuid,
  confirmTimeOverlap boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.create_experiment_task_cmd(
    mutationId, clientOccurredAt, title, plannedLocalDate, dayPart,
    plannedLocalTime, plannedLocalEndTime, plannedTimezone, notes,
    protocolVersionId, confirmTimeOverlap
  ) || jsonb_build_object('requestId', mutationId);
$$;

-- ---------------------------------------------------------------------------
-- Shared revision-conflict registration. Called only from the SECURITY
-- DEFINER command helpers below; EXECUTE is never granted to any client
-- role. Writes the open sync_conflicts fact and the conflict_registered
-- mutation receipt in the same transaction as the rejected mutation, then
-- returns the CONFLICT envelope without raising.
-- ---------------------------------------------------------------------------
create function private.register_task_revision_conflict(
  p_user_id uuid,
  p_mutation_id uuid,
  p_rpc_name text,
  p_request_hash text,
  p_space_id uuid,
  p_task_id uuid,
  p_base_revision bigint,
  p_current_revision bigint,
  p_pending_intent jsonb,
  p_current_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflict_id uuid;
begin
  insert into public.sync_conflicts (
    space_id,
    user_id,
    task_id,
    entity_type,
    entity_id,
    mutation_id,
    base_revision,
    current_revision,
    pending_intent,
    current_state,
    reason
  )
  values (
    p_space_id,
    p_user_id,
    p_task_id,
    'task',
    p_task_id,
    p_mutation_id,
    p_base_revision,
    p_current_revision,
    p_pending_intent,
    p_current_state,
    'STALE_ENTITY_REVISION'
  )
  returning id into conflict_id;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    p_user_id,
    p_mutation_id,
    p_rpc_name,
    p_request_hash,
    'task',
    p_task_id,
    'conflict_registered',
    p_current_revision,
    jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'CONFLICT',
        'message', 'The task was modified on another device.',
        'conflictId', conflict_id,
        'currentRevision', p_current_revision
      )
    )
  );

  return jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object(
      'code', 'CONFLICT',
      'message', 'The task was modified on another device.',
      'conflictId', conflict_id,
      'currentRevision', p_current_revision
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- update_experiment_task (public wrapper + private command helper)
-- ---------------------------------------------------------------------------
create function private.update_experiment_task_cmd(
  p_mutation_id uuid,
  p_client_occurred_at timestamptz,
  p_expected_revision bigint,
  p_task_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  canonical_payload jsonb;
  computed_hash text;
  existing_rpc_name text;
  existing_hash text;
  existing_payload jsonb;
  new_title text;
  new_planned_local_date date;
  new_day_part text;
  new_planned_local_time time;
  new_planned_local_end_time time;
  new_planned_timezone text;
  new_notes text;
  new_confirm_time_overlap boolean;
  editable_key_count integer;
  unknown_key_count integer;
  task_row public.experiment_tasks%rowtype;
  conflict_summary jsonb;
  overlap_bounds bigint[];
  updated_row_count integer;
  eff_date date;
  eff_day_part text;
  eff_time time;
  eff_end_time time;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return private.raise_api_error(
      'AUTH_REQUIRED',
      'Authentication is required to update a task.'
    );
  end if;

  canonical_payload := jsonb_build_object(
    'expectedRevision', p_expected_revision,
    'taskId', p_task_id,
    'patch', coalesce(p_patch, '{}'::jsonb)
  );

  computed_hash := private.request_hash(
    'update_experiment_task',
    current_user_id,
    canonical_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || p_mutation_id::text, 0)
  );

  select rpc_name, request_hash, result_payload
    into existing_rpc_name, existing_hash, existing_payload
  from private.mutation_receipts
  where user_id = current_user_id
    and mutation_id = p_mutation_id;

  if found then
    if existing_hash = computed_hash then
      return existing_payload;
    end if;
    return private.raise_api_error(
      'IDEMPOTENCY_KEY_REUSED',
      'This mutationId was already used with a different payload.'
    );
  end if;

  -- Pure validation failures never write receipts. The patch must be a
  -- JSON object with only frozen keys; unknown keys fail closed.
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'patch must be a JSON object.'
    );
  end if;

  select count(*) into unknown_key_count
  from jsonb_object_keys(p_patch) as key
  where key not in (
    'title', 'plannedLocalDate', 'dayPart', 'plannedLocalTime',
    'plannedLocalEndTime', 'plannedTimezone', 'notes',
    'protocolVersionId', 'confirmTimeOverlap'
  );

  if unknown_key_count > 0 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'patch contains unsupported fields.'
    );
  end if;

  editable_key_count := 0;

  if p_patch ? 'title' then
    if jsonb_typeof(p_patch -> 'title') <> 'string' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'title must be a string.'
      );
    end if;
    new_title := btrim(p_patch ->> 'title');
    if length(new_title) = 0 or length(new_title) > 200 then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Title is required and must be 1-200 characters.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'plannedTimezone' then
    if jsonb_typeof(p_patch -> 'plannedTimezone') <> 'string' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'plannedTimezone must be a string.'
      );
    end if;
    new_planned_timezone := p_patch ->> 'plannedTimezone';
    if length(new_planned_timezone) = 0 then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'plannedTimezone is required.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'notes' then
    if jsonb_typeof(p_patch -> 'notes') = 'string' then
      new_notes := p_patch ->> 'notes';
      if length(new_notes) > 10000 then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'notes must be at most 10000 characters.'
        );
      end if;
    elsif jsonb_typeof(p_patch -> 'notes') <> 'null' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'notes must be a string or null.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  -- I3 association (protocol_version_id is not null) stays rejected here;
  -- only an explicit null is accepted and simply clears the column.
  if p_patch ? 'protocolVersionId' then
    if jsonb_typeof(p_patch -> 'protocolVersionId') <> 'null' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Protocol association is not implemented in this increment.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'confirmTimeOverlap' then
    if jsonb_typeof(p_patch -> 'confirmTimeOverlap') = 'boolean' then
      new_confirm_time_overlap := (p_patch ->> 'confirmTimeOverlap')::boolean;
    elsif jsonb_typeof(p_patch -> 'confirmTimeOverlap') <> 'null' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'confirmTimeOverlap must be a boolean.'
      );
    end if;
  end if;

  if p_patch ? 'plannedLocalDate' then
    if jsonb_typeof(p_patch -> 'plannedLocalDate') <> 'string' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'plannedLocalDate must be a date string.'
      );
    end if;
    begin
      new_planned_local_date := (p_patch ->> 'plannedLocalDate')::date;
    exception
      when invalid_text_representation or datetime_field_overflow then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'plannedLocalDate must be a valid date.'
        );
    end;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'dayPart' then
    if jsonb_typeof(p_patch -> 'dayPart') <> 'string' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'dayPart must be a string.'
      );
    end if;
    new_day_part := p_patch ->> 'dayPart';
    if new_day_part not in ('morning', 'afternoon', 'evening') then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'dayPart must be morning, afternoon or evening.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'plannedLocalTime' then
    if jsonb_typeof(p_patch -> 'plannedLocalTime') = 'string' then
      begin
        new_planned_local_time := (p_patch ->> 'plannedLocalTime')::time;
      exception
        when invalid_text_representation or datetime_field_overflow then
          return private.raise_api_error(
            'VALIDATION_FAILED',
            'plannedLocalTime must be a valid time.'
          );
      end;
    elsif jsonb_typeof(p_patch -> 'plannedLocalTime') <> 'null' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'plannedLocalTime must be a time string or null.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if p_patch ? 'plannedLocalEndTime' then
    if jsonb_typeof(p_patch -> 'plannedLocalEndTime') = 'string' then
      begin
        new_planned_local_end_time := (p_patch ->> 'plannedLocalEndTime')::time;
      exception
        when invalid_text_representation or datetime_field_overflow then
          return private.raise_api_error(
            'VALIDATION_FAILED',
            'plannedLocalEndTime must be a valid time.'
          );
      end;
    elsif jsonb_typeof(p_patch -> 'plannedLocalEndTime') <> 'null' then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'plannedLocalEndTime must be a time string or null.'
      );
    end if;
    editable_key_count := editable_key_count + 1;
  end if;

  if editable_key_count = 0 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'patch must change at least one editable field.'
    );
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'expectedRevision must be a positive integer.'
    );
  end if;

  if not private.is_active_account(current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'The account is not active.'
    );
  end if;

  -- Visibility is resolved before revision comparison so missing or
  -- unauthorized tasks always surface as NOT_FOUND (no existence leak).
  select *
    into task_row
  from public.experiment_tasks as task
  where task.id = p_task_id
    and task.deleted_at is null
    and private.is_active_space_member(task.space_id, current_user_id);

  if not found then
    return private.raise_api_error(
      'NOT_FOUND',
      'Task not found or not visible.'
    );
  end if;

  if task_row.execution_state in ('completed', 'cancelled') then
    return private.raise_api_error(
      'INVALID_STATE_TRANSITION',
      'Completed or cancelled tasks cannot be updated.'
    );
  end if;

  if task_row.revision <> p_expected_revision then
    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'update_experiment_task',
      computed_hash,
      task_row.space_id,
      p_task_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'update_experiment_task',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  -- Effective values after the patch: explicit null clears exact times and
  -- notes; absent keys keep the current row values. plannedLocalDate and
  -- dayPart cannot be cleared (null is rejected above).
  eff_date := coalesce(new_planned_local_date, task_row.planned_local_date);
  eff_day_part := coalesce(new_day_part, task_row.day_part);
  eff_time := case
    when p_patch ? 'plannedLocalTime' then new_planned_local_time
    else task_row.planned_local_time
  end;
  eff_end_time := case
    when p_patch ? 'plannedLocalEndTime' then new_planned_local_end_time
    else task_row.planned_local_end_time
  end;

  -- Frozen order rule on the effective interval; pure validation failure.
  if eff_time is not null
     and eff_end_time is not null
     and not (eff_time < eff_end_time) then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Exact end time must be after the exact start time.'
    );
  end if;

  -- Exact start time must stay inside the selected day part (mirrors the
  -- frozen schema CHECK so the failure is a clean validation error).
  if eff_time is not null
     and not (
       (eff_day_part = 'morning' and eff_time < time '12:00')
       or (
         eff_day_part = 'afternoon'
         and eff_time >= time '12:00'
         and eff_time < time '18:00'
       )
       or (eff_day_part = 'evening' and eff_time >= time '18:00')
     ) then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Exact start time must fall inside the selected day part.'
    );
  end if;

  -- Overlap detection excludes the updated task itself.
  if (eff_time is null) = (eff_end_time is null) then
    overlap_bounds := private.experiment_task_bounds_seconds(
      eff_time,
      eff_end_time,
      eff_day_part
    );

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'taskId', existing.id,
          'title', existing.title,
          'date', existing.planned_local_date,
          'dayPart', existing.day_part,
          'overlapStart', to_char(
            time '00:00' + greatest(
              (private.experiment_task_bounds_seconds(
                existing.planned_local_time,
                existing.planned_local_end_time,
                existing.day_part
              ))[1],
              overlap_bounds[1]
            ) * interval '1 second',
            'HH24:MI'
          ),
          'overlapEnd', case
            when least(
              (private.experiment_task_bounds_seconds(
                existing.planned_local_time,
                existing.planned_local_end_time,
                existing.day_part
              ))[2],
              overlap_bounds[2]
            ) = 86400 then '24:00'
            else to_char(
              time '00:00' + least(
                (private.experiment_task_bounds_seconds(
                  existing.planned_local_time,
                  existing.planned_local_end_time,
                  existing.day_part
                ))[2],
                overlap_bounds[2]
              ) * interval '1 second',
              'HH24:MI'
            )
          end,
          'times', jsonb_build_object(
            'start', existing.planned_local_time,
            'end', existing.planned_local_end_time
          )
        )
        order by existing.planned_local_time nulls first, existing.id
      ),
      '[]'::jsonb
    )
      into conflict_summary
    from public.experiment_tasks as existing
    where existing.space_id = task_row.space_id
      and existing.planned_local_date = eff_date
      and existing.id <> p_task_id
      and existing.deleted_at is null
      and (existing.planned_local_time is null) = (existing.planned_local_end_time is null)
      and (
        (private.experiment_task_bounds_seconds(
          existing.planned_local_time,
          existing.planned_local_end_time,
          existing.day_part
        ))[1]
        < overlap_bounds[2]
      )
      and (
        overlap_bounds[1]
        < (private.experiment_task_bounds_seconds(
          existing.planned_local_time,
          existing.planned_local_end_time,
          existing.day_part
        ))[2]
      );

    if jsonb_array_length(conflict_summary) > 0
       and not coalesce(new_confirm_time_overlap, false) then
      return jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', 'TIME_OVERLAP_CONFIRMATION_REQUIRED',
          'message', 'The task overlaps another task in the same space.',
          'conflicts', conflict_summary
        )
      );
    end if;
  end if;

  begin
    update public.experiment_tasks
    set title = case
          when p_patch ? 'title' then new_title
          else title
        end,
        planned_local_date = case
          when p_patch ? 'plannedLocalDate' then new_planned_local_date
          else planned_local_date
        end,
        day_part = case
          when p_patch ? 'dayPart' then new_day_part
          else day_part
        end,
        planned_local_time = case
          when p_patch ? 'plannedLocalTime' then new_planned_local_time
          else planned_local_time
        end,
        planned_local_end_time = case
          when p_patch ? 'plannedLocalEndTime' then new_planned_local_end_time
          else planned_local_end_time
        end,
        planned_timezone = case
          when p_patch ? 'plannedTimezone' then new_planned_timezone
          else planned_timezone
        end,
        notes = case
          when p_patch ? 'notes' then new_notes
          else notes
        end,
        protocol_version_id = case
          when p_patch ? 'protocolVersionId' then null
          else protocol_version_id
        end
    where id = p_task_id
      and revision = p_expected_revision
    returning * into task_row;
  exception
    when check_violation then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Task time fields are invalid for the selected timezone or date.'
      );
    when others then
      if sqlstate = '23514' then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'Task time fields are invalid for the selected timezone or date.'
        );
      end if;
      raise;
  end;

  get diagnostics updated_row_count = row_count;
  if updated_row_count = 0 then
    -- Lost a concurrent race after the visibility check: re-resolve and
    -- register the conflict atomically without overwriting anything.
    select *
      into task_row
    from public.experiment_tasks as task
    where task.id = p_task_id
      and task.deleted_at is null
      and private.is_active_space_member(task.space_id, current_user_id);

    if not found then
      return private.raise_api_error(
        'NOT_FOUND',
        'Task not found or not visible.'
      );
    end if;

    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'update_experiment_task',
      computed_hash,
      task_row.space_id,
      p_task_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'update_experiment_task',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  -- The revision bump trigger already incremented revision on the row.
  if task_row.planned_start_at is not null
     and task_row.planned_end_at is not null
     and not (task_row.planned_start_at < task_row.planned_end_at) then
    raise exception 'Derived planned instants violate start < end';
  end if;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    current_user_id,
    p_mutation_id,
    'update_experiment_task',
    computed_hash,
    'task',
    task_row.id,
    'committed',
    task_row.revision,
    jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    )
  );

  insert into private.audit_events (
    space_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    task_row.space_id,
    current_user_id,
    'update_task',
    'task',
    task_row.id,
    p_mutation_id,
    jsonb_build_object(
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'resultCode', 'committed'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'taskId', task_row.id,
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'plannedStartAt', task_row.planned_start_at,
      'plannedEndAt', task_row.planned_end_at
    )
  );
end;
$$;

create function public.update_experiment_task(
  mutationId uuid,
  clientOccurredAt timestamptz,
  expectedRevision bigint,
  taskId uuid,
  patch jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_experiment_task_cmd(
    mutationId, clientOccurredAt, expectedRevision, taskId, patch
  ) || jsonb_build_object('requestId', mutationId);
$$;

-- ---------------------------------------------------------------------------
-- cancel_experiment_task (public wrapper + private command helper)
-- ---------------------------------------------------------------------------
create function private.cancel_experiment_task_cmd(
  p_mutation_id uuid,
  p_client_occurred_at timestamptz,
  p_expected_revision bigint,
  p_task_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  canonical_payload jsonb;
  computed_hash text;
  existing_rpc_name text;
  existing_hash text;
  existing_payload jsonb;
  new_reason text;
  task_row public.experiment_tasks%rowtype;
  updated_row_count integer;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return private.raise_api_error(
      'AUTH_REQUIRED',
      'Authentication is required to cancel a task.'
    );
  end if;

  canonical_payload := jsonb_build_object(
    'expectedRevision', p_expected_revision,
    'taskId', p_task_id,
    'reason', p_reason
  );

  computed_hash := private.request_hash(
    'cancel_experiment_task',
    current_user_id,
    canonical_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || p_mutation_id::text, 0)
  );

  select rpc_name, request_hash, result_payload
    into existing_rpc_name, existing_hash, existing_payload
  from private.mutation_receipts
  where user_id = current_user_id
    and mutation_id = p_mutation_id;

  if found then
    if existing_hash = computed_hash then
      return existing_payload;
    end if;
    return private.raise_api_error(
      'IDEMPOTENCY_KEY_REUSED',
      'This mutationId was already used with a different payload.'
    );
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'expectedRevision must be a positive integer.'
    );
  end if;

  -- Frozen Unicode White_Space trim set (U+0009-000D, U+0020, U+0085,
  -- U+00A0, U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000)
  -- plus U+FEFF, implemented by private.normalize_cancellation_reason as a
  -- btrim over the full set including chr(65279). Only leading/trailing
  -- whitespace is removed; interior text is preserved verbatim.
  new_reason := private.normalize_cancellation_reason(p_reason);
  if new_reason is null or length(new_reason) = 0 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Cancellation reason is required.'
    );
  end if;
  if length(new_reason) > 500 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Cancellation reason must be at most 500 characters.'
    );
  end if;

  if not private.is_active_account(current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'The account is not active.'
    );
  end if;

  select *
    into task_row
  from public.experiment_tasks as task
  where task.id = p_task_id
    and task.deleted_at is null
    and private.is_active_space_member(task.space_id, current_user_id);

  if not found then
    return private.raise_api_error(
      'NOT_FOUND',
      'Task not found or not visible.'
    );
  end if;

  if task_row.execution_state in ('completed', 'cancelled') then
    return private.raise_api_error(
      'INVALID_STATE_TRANSITION',
      'Only not-started, active or paused tasks can be cancelled.'
    );
  end if;

  if task_row.revision <> p_expected_revision then
    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'cancel_experiment_task',
      computed_hash,
      task_row.space_id,
      p_task_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'cancel_experiment_task',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  task_row.cancellation_reason := new_reason;

  begin
    update public.experiment_tasks
    set execution_state = 'cancelled',
        cancellation_reason = task_row.cancellation_reason
    where id = p_task_id
      and revision = p_expected_revision
    returning * into task_row;
  exception
    when check_violation then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Cancellation state is inconsistent with the reason field.'
      );
    when others then
      if sqlstate = '23514' then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'Cancellation state is inconsistent with the reason field.'
        );
      end if;
      raise;
  end;

  get diagnostics updated_row_count = row_count;
  if updated_row_count = 0 then
    select *
      into task_row
    from public.experiment_tasks as task
    where task.id = p_task_id
      and task.deleted_at is null
      and private.is_active_space_member(task.space_id, current_user_id);

    if not found then
      return private.raise_api_error(
        'NOT_FOUND',
        'Task not found or not visible.'
      );
    end if;

    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'cancel_experiment_task',
      computed_hash,
      task_row.space_id,
      p_task_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'cancel_experiment_task',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    current_user_id,
    p_mutation_id,
    'cancel_experiment_task',
    computed_hash,
    'task',
    task_row.id,
    'committed',
    task_row.revision,
    jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    )
  );

  insert into private.audit_events (
    space_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    task_row.space_id,
    current_user_id,
    'cancel_task',
    'task',
    task_row.id,
    p_mutation_id,
    jsonb_build_object(
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'resultCode', 'committed'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'taskId', task_row.id,
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'plannedStartAt', task_row.planned_start_at,
      'plannedEndAt', task_row.planned_end_at
    )
  );
end;
$$;

create function public.cancel_experiment_task(
  mutationId uuid,
  clientOccurredAt timestamptz,
  expectedRevision bigint,
  taskId uuid,
  reason text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_experiment_task_cmd(
    mutationId, clientOccurredAt, expectedRevision, taskId, reason
  ) || jsonb_build_object('requestId', mutationId);
$$;

-- ---------------------------------------------------------------------------
-- soft_delete_entity / restore_entity (task branch; protocol is I3)
-- ---------------------------------------------------------------------------
create function private.soft_delete_entity_cmd(
  p_mutation_id uuid,
  p_client_occurred_at timestamptz,
  p_expected_revision bigint,
  p_entity_type text,
  p_entity_id uuid,
  p_confirmation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  canonical_payload jsonb;
  computed_hash text;
  existing_rpc_name text;
  existing_hash text;
  existing_payload jsonb;
  task_row public.experiment_tasks%rowtype;
  updated_row_count integer;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return private.raise_api_error(
      'AUTH_REQUIRED',
      'Authentication is required to soft-delete a task.'
    );
  end if;

  canonical_payload := jsonb_build_object(
    'expectedRevision', p_expected_revision,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'confirmation', p_confirmation
  );

  computed_hash := private.request_hash(
    'soft_delete_entity',
    current_user_id,
    canonical_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || p_mutation_id::text, 0)
  );

  select rpc_name, request_hash, result_payload
    into existing_rpc_name, existing_hash, existing_payload
  from private.mutation_receipts
  where user_id = current_user_id
    and mutation_id = p_mutation_id;

  if found then
    if existing_hash = computed_hash then
      return existing_payload;
    end if;
    return private.raise_api_error(
      'IDEMPOTENCY_KEY_REUSED',
      'This mutationId was already used with a different payload.'
    );
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'expectedRevision must be a positive integer.'
    );
  end if;

  if p_entity_type <> 'task' then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Only task soft-delete is implemented in this increment.'
    );
  end if;

  if p_confirmation is not true then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'confirmation must be true to soft-delete a task.'
    );
  end if;

  if not private.is_active_account(current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'The account is not active.'
    );
  end if;

  -- Unlike update/cancel, the deleted row stays visible so an up-to-date
  -- repeated soft-delete can be a committed no-op.
  select *
    into task_row
  from public.experiment_tasks as task
  where task.id = p_entity_id
    and private.is_active_space_member(task.space_id, current_user_id);

  if not found then
    return private.raise_api_error(
      'NOT_FOUND',
      'Task not found or not visible.'
    );
  end if;

  if task_row.revision <> p_expected_revision then
    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'soft_delete_entity',
      computed_hash,
      task_row.space_id,
      p_entity_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'soft_delete_entity',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  if task_row.execution_state in ('completed', 'cancelled') then
    return private.raise_api_error(
      'INVALID_STATE_TRANSITION',
      'Completed or cancelled tasks cannot be soft-deleted.'
    );
  end if;

  if task_row.deleted_at is not null then
    -- Repeat soft-delete: committed no-op, revision unchanged.
    insert into private.mutation_receipts (
      user_id,
      mutation_id,
      rpc_name,
      request_hash,
      entity_type,
      entity_id,
      result_code,
      result_revision,
      result_payload
    )
    values (
      current_user_id,
      p_mutation_id,
      'soft_delete_entity',
      computed_hash,
      'task',
      task_row.id,
      'committed',
      task_row.revision,
      jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
          'taskId', task_row.id,
          'revision', task_row.revision,
          'executionState', task_row.execution_state,
          'deletedAt', task_row.deleted_at,
          'purgeAfter', task_row.purge_after
        )
      )
    );
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    );
  end if;

  begin
    update public.experiment_tasks
    set deleted_at = statement_timestamp()
    where id = p_entity_id
      and revision = p_expected_revision
    returning * into task_row;
  exception
    when check_violation then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Soft-delete window fields are inconsistent.'
      );
    when others then
      if sqlstate = '23514' then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'Soft-delete window fields are inconsistent.'
        );
      end if;
      raise;
  end;

  get diagnostics updated_row_count = row_count;
  if updated_row_count = 0 then
    select *
      into task_row
    from public.experiment_tasks as task
    where task.id = p_entity_id
      and private.is_active_space_member(task.space_id, current_user_id);

    if not found then
      return private.raise_api_error(
        'NOT_FOUND',
        'Task not found or not visible.'
      );
    end if;

    if task_row.deleted_at is not null then
      -- Lost a race to another soft-delete: committed no-op.
      insert into private.mutation_receipts (
        user_id,
        mutation_id,
        rpc_name,
        request_hash,
        entity_type,
        entity_id,
        result_code,
        result_revision,
        result_payload
      )
      values (
        current_user_id,
        p_mutation_id,
        'soft_delete_entity',
        computed_hash,
        'task',
        task_row.id,
        'committed',
        task_row.revision,
        jsonb_build_object(
          'ok', true,
          'data', jsonb_build_object(
            'taskId', task_row.id,
            'revision', task_row.revision,
            'executionState', task_row.execution_state,
            'deletedAt', task_row.deleted_at,
            'purgeAfter', task_row.purge_after
          )
        )
      );
      return jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
          'taskId', task_row.id,
          'revision', task_row.revision,
          'executionState', task_row.execution_state,
          'deletedAt', task_row.deleted_at,
          'purgeAfter', task_row.purge_after
        )
      );
    end if;

    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'soft_delete_entity',
      computed_hash,
      task_row.space_id,
      p_entity_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'soft_delete_entity',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'plannedStartAt', task_row.planned_start_at,
        'plannedEndAt', task_row.planned_end_at
      )
    );
  end if;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    current_user_id,
    p_mutation_id,
    'soft_delete_entity',
    computed_hash,
    'task',
    task_row.id,
    'committed',
    task_row.revision,
    jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    )
  );

  insert into private.audit_events (
    space_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    task_row.space_id,
    current_user_id,
    'soft_delete_task',
    'task',
    task_row.id,
    p_mutation_id,
    jsonb_build_object(
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'resultCode', 'committed'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'taskId', task_row.id,
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'deletedAt', task_row.deleted_at,
      'purgeAfter', task_row.purge_after
    )
  );
end;
$$;

create function public.soft_delete_entity(
  mutationId uuid,
  clientOccurredAt timestamptz,
  expectedRevision bigint,
  entityType text,
  entityId uuid,
  confirmation boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.soft_delete_entity_cmd(
    mutationId, clientOccurredAt, expectedRevision, entityType, entityId,
    confirmation
  ) || jsonb_build_object('requestId', mutationId);
$$;

create function private.restore_entity_cmd(
  p_mutation_id uuid,
  p_client_occurred_at timestamptz,
  p_expected_revision bigint,
  p_entity_type text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  canonical_payload jsonb;
  computed_hash text;
  existing_rpc_name text;
  existing_hash text;
  existing_payload jsonb;
  task_row public.experiment_tasks%rowtype;
  updated_row_count integer;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    return private.raise_api_error(
      'AUTH_REQUIRED',
      'Authentication is required to restore a task.'
    );
  end if;

  canonical_payload := jsonb_build_object(
    'expectedRevision', p_expected_revision,
    'entityType', p_entity_type,
    'entityId', p_entity_id
  );

  computed_hash := private.request_hash(
    'restore_entity',
    current_user_id,
    canonical_payload
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || p_mutation_id::text, 0)
  );

  select rpc_name, request_hash, result_payload
    into existing_rpc_name, existing_hash, existing_payload
  from private.mutation_receipts
  where user_id = current_user_id
    and mutation_id = p_mutation_id;

  if found then
    if existing_hash = computed_hash then
      return existing_payload;
    end if;
    return private.raise_api_error(
      'IDEMPOTENCY_KEY_REUSED',
      'This mutationId was already used with a different payload.'
    );
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'expectedRevision must be a positive integer.'
    );
  end if;

  if p_entity_type <> 'task' then
    return private.raise_api_error(
      'VALIDATION_FAILED',
      'Only task restore is implemented in this increment.'
    );
  end if;

  if not private.is_active_account(current_user_id) then
    return private.raise_api_error(
      'FORBIDDEN',
      'The account is not active.'
    );
  end if;

  select *
    into task_row
  from public.experiment_tasks as task
  where task.id = p_entity_id
    and private.is_active_space_member(task.space_id, current_user_id);

  if not found then
    return private.raise_api_error(
      'NOT_FOUND',
      'Task not found or not visible.'
    );
  end if;

  if task_row.execution_state in ('completed', 'cancelled') then
    return private.raise_api_error(
      'INVALID_STATE_TRANSITION',
      'Completed or cancelled tasks cannot be restored.'
    );
  end if;

  if task_row.revision <> p_expected_revision then
    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'restore_entity',
      computed_hash,
      task_row.space_id,
      p_entity_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'restore_entity',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    );
  end if;

  if task_row.deleted_at is null then
    -- Restoring a live task is a committed no-op; revision unchanged.
    insert into private.mutation_receipts (
      user_id,
      mutation_id,
      rpc_name,
      request_hash,
      entity_type,
      entity_id,
      result_code,
      result_revision,
      result_payload
    )
    values (
      current_user_id,
      p_mutation_id,
      'restore_entity',
      computed_hash,
      'task',
      task_row.id,
      'committed',
      task_row.revision,
      jsonb_build_object(
        'ok', true,
        'data', jsonb_build_object(
          'taskId', task_row.id,
          'revision', task_row.revision,
          'executionState', task_row.execution_state,
          'deletedAt', task_row.deleted_at,
          'purgeAfter', task_row.purge_after
        )
      )
    );
    return jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    );
  end if;

  begin
    update public.experiment_tasks
    set deleted_at = null,
        purge_after = null
    where id = p_entity_id
      and revision = p_expected_revision
      and deleted_at is not null
    returning * into task_row;
  exception
    when check_violation then
      return private.raise_api_error(
        'VALIDATION_FAILED',
        'Soft-delete window fields are inconsistent.'
      );
    when others then
      if sqlstate = '23514' then
        return private.raise_api_error(
          'VALIDATION_FAILED',
          'Soft-delete window fields are inconsistent.'
        );
      end if;
      raise;
  end;

  get diagnostics updated_row_count = row_count;
  if updated_row_count = 0 then
    select *
      into task_row
    from public.experiment_tasks as task
    where task.id = p_entity_id
      and private.is_active_space_member(task.space_id, current_user_id);

    if not found then
      return private.raise_api_error(
        'NOT_FOUND',
        'Task not found or not visible.'
      );
    end if;

    return private.register_task_revision_conflict(
      current_user_id,
      p_mutation_id,
      'restore_entity',
      computed_hash,
      task_row.space_id,
      p_entity_id,
      p_expected_revision,
      task_row.revision,
      jsonb_build_object(
        'rpcName', 'restore_entity',
        'expectedRevision', p_expected_revision
      ),
      jsonb_build_object(
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    );
  end if;

  insert into private.mutation_receipts (
    user_id,
    mutation_id,
    rpc_name,
    request_hash,
    entity_type,
    entity_id,
    result_code,
    result_revision,
    result_payload
  )
  values (
    current_user_id,
    p_mutation_id,
    'restore_entity',
    computed_hash,
    'task',
    task_row.id,
    'committed',
    task_row.revision,
    jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'taskId', task_row.id,
        'revision', task_row.revision,
        'executionState', task_row.execution_state,
        'deletedAt', task_row.deleted_at,
        'purgeAfter', task_row.purge_after
      )
    )
  );

  insert into private.audit_events (
    space_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    metadata
  )
  values (
    task_row.space_id,
    current_user_id,
    'restore_task',
    'task',
    task_row.id,
    p_mutation_id,
    jsonb_build_object(
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'resultCode', 'committed'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'taskId', task_row.id,
      'revision', task_row.revision,
      'executionState', task_row.execution_state,
      'deletedAt', task_row.deleted_at,
      'purgeAfter', task_row.purge_after
    )
  );
end;
$$;

create function public.restore_entity(
  mutationId uuid,
  clientOccurredAt timestamptz,
  expectedRevision bigint,
  entityType text,
  entityId uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.restore_entity_cmd(
    mutationId, clientOccurredAt, expectedRevision, entityType, entityId
  ) || jsonb_build_object('requestId', mutationId);
$$;

-- ---------------------------------------------------------------------------
-- ACL: only authenticated callers may execute the wrappers and their command
-- helpers. Shared helpers (bounds, conflict registration) and the private
-- command bodies are never exposed to anon/service_role; the service role
-- keeps no EXECUTE on any of these functions.
-- ---------------------------------------------------------------------------
revoke all on function public.create_experiment_task(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function public.create_experiment_task(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)
to authenticated;

revoke all on function private.create_experiment_task_cmd(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function private.create_experiment_task_cmd(uuid, timestamptz, text, date, text, time, time, text, text, uuid, boolean)
to authenticated;

revoke all on function public.update_experiment_task(uuid, timestamptz, bigint, uuid, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.update_experiment_task(uuid, timestamptz, bigint, uuid, jsonb)
to authenticated;

revoke all on function private.update_experiment_task_cmd(uuid, timestamptz, bigint, uuid, jsonb)
from public, anon, authenticated, service_role;

grant execute on function private.update_experiment_task_cmd(uuid, timestamptz, bigint, uuid, jsonb)
to authenticated;

revoke all on function public.cancel_experiment_task(uuid, timestamptz, bigint, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.cancel_experiment_task(uuid, timestamptz, bigint, uuid, text)
to authenticated;

revoke all on function private.cancel_experiment_task_cmd(uuid, timestamptz, bigint, uuid, text)
from public, anon, authenticated, service_role;

grant execute on function private.cancel_experiment_task_cmd(uuid, timestamptz, bigint, uuid, text)
to authenticated;

revoke all on function public.soft_delete_entity(uuid, timestamptz, bigint, text, uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function public.soft_delete_entity(uuid, timestamptz, bigint, text, uuid, boolean)
to authenticated;

revoke all on function private.soft_delete_entity_cmd(uuid, timestamptz, bigint, text, uuid, boolean)
from public, anon, authenticated, service_role;

grant execute on function private.soft_delete_entity_cmd(uuid, timestamptz, bigint, text, uuid, boolean)
to authenticated;

revoke all on function public.restore_entity(uuid, timestamptz, bigint, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.restore_entity(uuid, timestamptz, bigint, text, uuid)
to authenticated;

revoke all on function private.restore_entity_cmd(uuid, timestamptz, bigint, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function private.restore_entity_cmd(uuid, timestamptz, bigint, text, uuid)
to authenticated;

revoke all on function private.experiment_task_bounds_seconds(time, time, text)
from public, anon, authenticated, service_role;

revoke all on function private.register_task_revision_conflict(uuid, uuid, text, text, uuid, uuid, bigint, bigint, jsonb, jsonb)
from public, anon, authenticated, service_role;

create table public.experiment_tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete restrict,
  title text not null
    check (length(btrim(title)) between 1 and 200),
  execution_state text not null default 'not_started'
    check (execution_state in ('not_started', 'active', 'paused', 'completed', 'cancelled')),
  planned_local_date date not null,
  day_part text not null
    check (day_part in ('morning', 'afternoon', 'evening')),
  planned_local_time time,
  planned_local_end_time time,
  planned_timezone text not null
    check (length(planned_timezone) between 1 and 255),
  planned_start_at timestamptz,
  planned_end_at timestamptz,
  notes text check (notes is null or length(notes) <= 10000),
  cancellation_reason text,
  protocol_version_id uuid,
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  revision bigint not null default 1 check (revision >= 1),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  purge_after timestamptz,
  constraint experiment_tasks_exact_time_order_check
    check (
      planned_local_time is null
      or planned_local_end_time is null
      or planned_local_time < planned_local_end_time
    ),
  constraint experiment_tasks_start_matches_day_part_check
    check (
      planned_local_time is null
      or (day_part = 'morning' and planned_local_time < time '12:00')
      or (
        day_part = 'afternoon'
        and planned_local_time >= time '12:00'
        and planned_local_time < time '18:00'
      )
      or (day_part = 'evening' and planned_local_time >= time '18:00')
    ),
  constraint experiment_tasks_protocol_unimplemented_check
    check (protocol_version_id is null),
  constraint experiment_tasks_cancellation_reason_text_check
    check (
      cancellation_reason is null
      or (
        length(cancellation_reason) between 1 and 500
        and cancellation_reason = btrim(
          cancellation_reason,
          E' \t\n\r\f'
            || chr(11)
            || chr(133)
            || chr(160)
            || chr(5760)
            || chr(8192)
            || chr(8193)
            || chr(8194)
            || chr(8195)
            || chr(8196)
            || chr(8197)
            || chr(8198)
            || chr(8199)
            || chr(8200)
            || chr(8201)
            || chr(8202)
            || chr(8232)
            || chr(8233)
            || chr(8239)
            || chr(8287)
            || chr(12288)
            || chr(65279)
        )
      )
    ),
  constraint experiment_tasks_cancellation_state_check
    check (
      (
        execution_state = 'cancelled'
        and cancellation_reason is not null
      )
      or (
        execution_state <> 'cancelled'
        and cancellation_reason is null
      )
    ),
  constraint experiment_tasks_soft_delete_window_check
    check (
      (deleted_at is null and purge_after is null)
      or (deleted_at is not null and purge_after > deleted_at)
    )
);

create index experiment_tasks_space_id_idx
  on public.experiment_tasks (space_id);

create index experiment_tasks_created_by_idx
  on public.experiment_tasks (created_by);

create index experiment_tasks_schedule_range_idx
  on public.experiment_tasks (
    space_id,
    planned_local_date,
    day_part,
    planned_local_time,
    id
  )
  where deleted_at is null;

create index experiment_tasks_execution_state_idx
  on public.experiment_tasks (
    space_id,
    execution_state,
    planned_start_at,
    id
  )
  where deleted_at is null;

create index experiment_tasks_protocol_version_id_idx
  on public.experiment_tasks (protocol_version_id)
  where protocol_version_id is not null;

create function private.set_experiment_task_planned_instants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as zone
    where zone.name = new.planned_timezone
  ) then
    raise exception using
      errcode = '23514',
      message = 'experiment_tasks.planned_timezone must be a valid IANA timezone.';
  end if;

  if new.planned_local_time is null then
    new.planned_start_at := null;
  else
    new.planned_start_at :=
      (new.planned_local_date + new.planned_local_time)
      at time zone new.planned_timezone;

    if (new.planned_start_at at time zone new.planned_timezone)::date
         <> new.planned_local_date
       or (new.planned_start_at at time zone new.planned_timezone)::time
         <> new.planned_local_time then
      raise exception using
        errcode = '23514',
        message = 'experiment_tasks.planned_local_time does not exist in the selected timezone.';
    end if;
  end if;

  if new.planned_local_end_time is null then
    new.planned_end_at := null;
  else
    new.planned_end_at :=
      (new.planned_local_date + new.planned_local_end_time)
      at time zone new.planned_timezone;

    if (new.planned_end_at at time zone new.planned_timezone)::date
         <> new.planned_local_date
       or (new.planned_end_at at time zone new.planned_timezone)::time
         <> new.planned_local_end_time then
      raise exception using
        errcode = '23514',
        message = 'experiment_tasks.planned_local_end_time does not exist in the selected timezone.';
    end if;
  end if;

  return new;
end;
$$;

create trigger experiment_tasks_set_planned_instants
before insert or update of
  planned_local_date,
  planned_local_time,
  planned_local_end_time,
  planned_timezone
on public.experiment_tasks
for each row execute function private.set_experiment_task_planned_instants();

create function private.bump_experiment_task_revision()
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

create trigger experiment_tasks_bump_revision
before update on public.experiment_tasks
for each row execute function private.bump_experiment_task_revision();

alter table public.experiment_tasks enable row level security;

create policy experiment_tasks_select_own_active
on public.experiment_tasks
for select
to authenticated
using (
  deleted_at is null
  and private.is_active_space_member(
    experiment_tasks.space_id,
    (select auth.uid())
  )
);

revoke all on table public.experiment_tasks
from public, anon, authenticated;

grant select on table public.experiment_tasks to authenticated;

revoke all on function private.set_experiment_task_planned_instants()
from public, anon, authenticated;

revoke all on function private.bump_experiment_task_revision()
from public, anon, authenticated;

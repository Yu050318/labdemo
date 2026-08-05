-- G4-I2-B task command foundation: idempotency receipts, sync conflicts,
-- audit trail and fixed-path helpers shared by the schedule task command
-- RPCs. Requires I1 (4 migrations) and I2-A (1 migration) to be applied
-- first. This migration only creates supporting objects; the public RPC
-- wrappers and SECURITY DEFINER command helpers ship in the next migration.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- private.mutation_receipts
-- One row per (user_id, mutation_id). Written only for committed transactions
-- or successfully registered revision conflicts; never for pure validation
-- failures, overlap challenges, authentication failures or transient errors.
-- ---------------------------------------------------------------------------
create table private.mutation_receipts (
  user_id uuid not null,
  mutation_id uuid not null,
  rpc_name text not null,
  request_hash text not null,
  entity_type text,
  entity_id uuid,
  result_code text not null
    check (result_code in ('committed', 'conflict_registered')),
  result_revision bigint,
  result_payload jsonb not null,
  committed_at timestamptz not null default statement_timestamp(),
  primary key (user_id, mutation_id)
);

alter table private.mutation_receipts enable row level security;

revoke all on table private.mutation_receipts
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.sync_conflicts
-- Server-side conflict facts surfaced to the client. Only status='open' is a
-- blocking fact; resolution flows update status. Written only by the command
-- helpers inside the mutation transaction.
-- ---------------------------------------------------------------------------
create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  task_id uuid,
  run_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  mutation_id uuid not null,
  base_revision bigint,
  current_revision bigint,
  pending_intent jsonb,
  current_state jsonb,
  reason text not null
    check (reason in ('STALE_ENTITY_REVISION', 'PARENT_COMPLETED')),
  status text not null default 'open'
    check (status in ('open', 'resolved_keep_server', 'resolved_reapplied')),
  resolved_at timestamptz,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (user_id, mutation_id)
);

alter table public.sync_conflicts enable row level security;

create policy sync_conflicts_select_own_open
on public.sync_conflicts
for select
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'open'
);

revoke all on table public.sync_conflicts
from public, anon, authenticated;

grant select on table public.sync_conflicts to authenticated;

-- ---------------------------------------------------------------------------
-- private.audit_events
-- Important business/security audit only. metadata carries whitelisted state,
-- revision and result-code fields; experiment body text is never written.
-- ---------------------------------------------------------------------------
create table private.audit_events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete restrict,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp()
);

alter table private.audit_events enable row level security;

revoke all on table private.audit_events
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Soft-delete window invariant: entering recent deletion always pairs
-- deleted_at with purge_after = deleted_at + 30 days; restoring clears both.
-- ---------------------------------------------------------------------------
create function private.set_task_soft_delete_purge_after()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    new.purge_after := null;
  elsif new.purge_after is null then
    new.purge_after := new.deleted_at + interval '30 days';
  end if;
  return new;
end;
$$;

create trigger experiment_tasks_set_soft_delete_purge_after
before update of deleted_at on public.experiment_tasks
for each row execute function private.set_task_soft_delete_purge_after();

revoke all on function private.set_task_soft_delete_purge_after()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixed-path helpers shared by the command RPCs. All private; revoked from
-- public/anon/authenticated/service_role. Only the SECURITY DEFINER command
-- helpers in the next migration call these functions.
-- ---------------------------------------------------------------------------

create function private.database_now()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select statement_timestamp();
$$;

create function private.request_hash(
  p_rpc_name text,
  p_user_id uuid,
  p_payload jsonb
)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select encode(
    extensions.digest(
      p_rpc_name || p_user_id::text || p_payload::text,
      'sha256'
    ),
    'hex'
  );
$$;

create function private.raise_api_error(
  p_code text,
  p_message text
)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_strip_nulls(jsonb_build_object(
      'code', p_code,
      'message', p_message,
      'fieldErrors', case
        when p_code <> 'VALIDATION_FAILED' then null
        else jsonb_build_object(
          case
            when p_message ilike 'title %' then 'title'
            when p_message ilike 'plannedLocalDate %' then 'plannedLocalDate'
            when p_message ilike 'dayPart %' then 'dayPart'
            when p_message ilike 'plannedTimezone %' then 'plannedTimezone'
            when p_message ilike 'plannedLocalTime %' then 'plannedLocalTime'
            when p_message ilike 'plannedLocalEndTime %' then 'plannedLocalEndTime'
            when p_message ilike 'notes %' then 'notes'
            when p_message ilike 'protocol %' then 'protocolVersionId'
            when p_message ilike 'confirmTimeOverlap %' then 'confirmTimeOverlap'
            when p_message ilike 'expectedRevision %' then 'expectedRevision'
            when p_message ilike 'cancellation reason %' then 'reason'
            when p_message ilike 'confirmation %' then 'confirmation'
            when p_message ilike 'only task %' then 'entityType'
            when p_message ilike 'exact end time %' then 'plannedLocalEndTime'
            when p_message ilike 'exact start time %' then 'plannedLocalTime'
            else '_form'
          end,
          p_message
        )
      end
    ))
  );
$$;

-- Unicode White_Space set frozen by the product department (plus U+FEFF):
-- U+0009-000D, U+0020, U+0085, U+00A0, U+1680, U+2000-200A, U+2028, U+2029,
-- U+202F, U+205F, U+3000, U+FEFF. U+200B is intentionally not included.
-- Only leading/trailing whitespace is removed; interior whitespace is kept.
create function private.normalize_cancellation_reason(p_reason text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select btrim(
    p_reason,
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
  );
$$;

revoke all on function private.database_now()
from public, anon, authenticated, service_role;

revoke all on function private.request_hash(text, uuid, jsonb)
from public, anon, authenticated, service_role;

revoke all on function private.raise_api_error(text, text)
from public, anon, authenticated, service_role;

revoke all on function private.normalize_cancellation_reason(text)
from public, anon, authenticated, service_role;

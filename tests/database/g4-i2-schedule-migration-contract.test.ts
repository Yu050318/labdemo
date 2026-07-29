import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const scheduleMigrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_g4_i2_schedule_schema.sql"),
);

describe("G4-I2 schedule schema migration", () => {
  it("has exactly one CLI-generated schedule migration", () => {
    expect(scheduleMigrationNames).toHaveLength(1);
  });

  const migration = scheduleMigrationNames[0]
    ? readFileSync(
        resolve(migrationsDirectory, scheduleMigrationNames[0]),
        "utf8",
      )
    : "";

  it("creates only the frozen task root with nullable protocol compatibility", () => {
    expect(migration).toContain("create table public.experiment_tasks");
    expect(migration).toContain("protocol_version_id uuid");
    expect(migration).toContain(
      "check (protocol_version_id is null)",
    );
    expect(migration).not.toContain("create table public.protocols");
    expect(migration).not.toMatch(
      /protocol_version_id[\s\S]{0,120}references public\.protocol_versions/,
    );
  });

  it("enforces frozen task fields and same-day exact time ordering", () => {
    expect(migration).toContain(
      "check (execution_state in ('not_started', 'active', 'paused', 'completed', 'cancelled'))",
    );
    expect(migration).toContain(
      "check (day_part in ('morning', 'afternoon', 'evening'))",
    );
    expect(migration).toMatch(
      /planned_local_time is null\s+or planned_local_end_time is null/,
    );
    expect(migration).toContain(
      "planned_local_time < planned_local_end_time",
    );
  });

  it("stores cancellation reason as constrained task text, not audit metadata", () => {
    expect(migration).toContain("cancellation_reason text");
    expect(migration).toMatch(
      /cancellation_reason is null\s+or\s+\(\s*length\(btrim\(cancellation_reason\)\) between 1 and 500/,
    );
    expect(migration).toContain(
      "cancellation_reason = btrim(cancellation_reason)",
    );
    expect(migration).toMatch(
      /execution_state = 'cancelled'\s+and cancellation_reason is not null/,
    );
    expect(migration).toMatch(
      /execution_state <> 'cancelled'\s+and cancellation_reason is null/,
    );
    expect(migration).not.toContain("create table private.audit_events");
  });

  it("derives UTC using a validated IANA timezone without trusting client instants", () => {
    expect(migration).toContain(
      "create function private.set_experiment_task_planned_instants",
    );
    expect(migration).toContain("pg_catalog.pg_timezone_names");
    expect(migration).toContain("at time zone new.planned_timezone");
    expect(migration).toContain("new.planned_start_at :=");
    expect(migration).toContain("new.planned_end_at :=");
  });

  it("owns revisions and timestamps in the database", () => {
    expect(migration).toContain(
      "create function private.bump_experiment_task_revision",
    );
    expect(migration).toContain("new.revision := old.revision + 1");
    expect(migration).toContain("new.updated_at := statement_timestamp()");
  });

  it("adds frozen schedule indexes and RLS read boundary", () => {
    expect(migration).toContain("experiment_tasks_space_id_idx");
    expect(migration).toContain("experiment_tasks_created_by_idx");
    expect(migration).toContain(
      "experiment_tasks_schedule_range_idx",
    );
    expect(migration).toContain(
      "experiment_tasks_execution_state_idx",
    );
    expect(migration).toContain(
      "experiment_tasks_protocol_version_id_idx",
    );
    expect(migration).toContain(
      "alter table public.experiment_tasks enable row level security",
    );
    expect(migration).toContain("to authenticated");
    expect(migration).toMatch(
      /private\.is_active_space_member\(\s*experiment_tasks\.space_id,\s*\(select auth\.uid\(\)\)\s*\)/,
    );
    expect(migration).toMatch(
      /revoke all on table public\.experiment_tasks\s+from public, anon, authenticated/,
    );
    expect(migration).toContain(
      "grant select on table public.experiment_tasks to authenticated",
    );
  });
});

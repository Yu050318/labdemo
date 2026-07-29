import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const scheduleMigrationNames = readdirSync(migrationsDirectory).filter((name) =>
  name.endsWith("_g4_i2_schedule_schema.sql"),
);
const canonicalScheduleMigrationName =
  "20260729150030_g4_i2_schedule_schema.sql";
const canonicalScheduleMigrationSha256 =
  "F45E2445F68CF7CFF6BA6C21D7006286B58318F5DC37C2DD0FF4688516273301";
const canonicalMigrationOrder = [
  "20260729080019_g4_i1_identity_spaces_rls.sql",
  "20260729080358_g4_i1_enforce_iana_timezone.sql",
  "20260729104223_g4_i1_auth_fixture_support.sql",
  "20260729113507_g4_i1_tighten_fixture_acl_and_membership.sql",
  canonicalScheduleMigrationName,
];

describe("G4-I2 schedule schema migration", () => {
  it("uses the unique remote-aligned timestamp without changing SQL bytes", () => {
    expect(scheduleMigrationNames).toEqual([canonicalScheduleMigrationName]);
    expect(migrationNames).toEqual(canonicalMigrationOrder);
    expect(new Set(migrationNames.map((name) => name.slice(0, 14))).size).toBe(
      migrationNames.length,
    );
  });

  const migration = scheduleMigrationNames[0]
    ? readFileSync(
        resolve(migrationsDirectory, scheduleMigrationNames[0]),
        "utf8",
      )
    : "";

  it("keeps the authorized migration SHA-256", () => {
    expect(
      createHash("sha256").update(migration).digest("hex").toUpperCase(),
    ).toBe(canonicalScheduleMigrationSha256);
  });

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
    expect(migration).toContain("and cancellation_reason = btrim(");
    expect(migration).toContain("|| chr(11)");
    expect(migration).toContain("|| chr(133)");
    expect(migration).toContain("|| chr(160)");
    expect(migration).toContain("|| chr(8195)");
    expect(migration).toContain("|| chr(65279)");
    expect(migration).toMatch(
      /length\(cancellation_reason\) between 1 and 500/,
    );
    expect(migration).not.toMatch(
      /length\(btrim\(cancellation_reason\)\)/,
    );
    expect(migration).toMatch(
      /execution_state = 'cancelled'\s+and cancellation_reason is not null/,
    );
    expect(migration).toMatch(
      /execution_state <> 'cancelled'\s+and cancellation_reason is null/,
    );
    expect(migration).not.toContain("create table private.audit_events");
  });

  it("ships an executable PostgreSQL cancellation reason semantics test", () => {
    const semanticsTest = readFileSync(
      resolve(
        process.cwd(),
        "supabase/tests/g4_i2_schedule_cancellation_reason_semantics.sql",
      ),
      "utf8",
    );

    expect(semanticsTest).toContain("legacy_btrim_does_not_trim_tabs");
    expect(semanticsTest).toContain("required_boundary_whitespace_is_empty");
    expect(semanticsTest).toContain("unicode_boundary_whitespace_is_empty");
    expect(semanticsTest).toContain("each_frozen_code_point_is_empty");
    expect(semanticsTest).toContain("entire_unicode_whitespace_set_is_empty");
    expect(semanticsTest).toContain("zero_width_space_is_preserved");
    expect(semanticsTest).toContain("internal_newline_is_preserved");
    expect(semanticsTest).toContain("exactly_500_characters_is_valid");
    expect(semanticsTest).toContain("more_than_500_characters_is_invalid");
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

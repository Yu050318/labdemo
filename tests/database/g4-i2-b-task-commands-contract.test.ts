import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const foundationMigrationNames = migrationNames.filter((name) =>
  name.endsWith("_g4_i2_b_task_command_foundation.sql"),
);
const rpcMigrationNames = migrationNames.filter((name) =>
  name.endsWith("_g4_i2_b_schedule_rpcs_rls.sql"),
);
const scheduleSchemaMigrationName =
  "20260729150030_g4_i2_schedule_schema.sql";

function sha256(fileName: string | undefined): string {
  if (fileName === undefined) {
    throw new Error("migration file not found");
  }
  return createHash("sha256")
    .update(
      readFileSync(resolve(migrationsDirectory, fileName), "utf8"),
    )
    .digest("hex")
    .toUpperCase();
}

describe("G4-I2-B task command foundation migration", () => {
  it("appends exactly one foundation and one RPC migration after I2-A", () => {
    expect(foundationMigrationNames).toHaveLength(1);
    expect(rpcMigrationNames).toHaveLength(1);
    expect(migrationNames[0]).toBe("20260729080019_g4_i1_identity_spaces_rls.sql");
    expect(migrationNames[4]).toBe(
      scheduleSchemaMigrationName,
    );
    expect(migrationNames.indexOf(foundationMigrationNames[0]!)).toBeGreaterThan(
      migrationNames.indexOf(scheduleSchemaMigrationName),
    );
    expect(migrationNames.indexOf(rpcMigrationNames[0]!)).toBeGreaterThan(
      migrationNames.indexOf(foundationMigrationNames[0]!),
    );
    expect(new Set(migrationNames.map((name) => name.slice(0, 14))).size).toBe(
      migrationNames.length,
    );
  });

  it("keeps the authorized I2-A SHA unchanged", () => {
    expect(sha256(scheduleSchemaMigrationName)).toBe(
      "F45E2445F68CF7CFF6BA6C21D7006286B58318F5DC37C2DD0FF4688516273301",
    );
  });

  it("keeps the authorized I2-B foundation SHA unchanged", () => {
    expect(foundationMigrationNames).toHaveLength(1);
    expect(sha256(foundationMigrationNames[0])).toBe(
      "FA0B795053DA8878483582921C95C65BBC897DFF603BF0FF8AF0EC5EF9BE515B",
    );
  });

  const foundation = foundationMigrationNames[0]
    ? readFileSync(resolve(migrationsDirectory, foundationMigrationNames[0]), "utf8")
    : "";

  it("creates private mutation receipts and audit events", () => {
    expect(foundation).toContain("create table private.mutation_receipts");
    expect(foundation).toMatch(
      /primary key \(user_id, mutation_id\)/,
    );
    expect(foundation).toContain("result_code text not null");
    expect(foundation).toContain("result_payload jsonb not null");
    expect(foundation).toContain("create table private.audit_events");
    expect(foundation).toContain("metadata jsonb not null");
  });

  it("enables RLS and revokes all Data API access on private tables", () => {
    expect(foundation).toContain(
      "alter table private.mutation_receipts enable row level security",
    );
    expect(foundation).toContain(
      "alter table private.audit_events enable row level security",
    );
    expect(foundation).toMatch(
      /revoke all on table private\.mutation_receipts\s+from public, anon, authenticated/,
    );
    expect(foundation).toMatch(
      /revoke all on table private\.audit_events\s+from public, anon, authenticated/,
    );
  });

  it("ships fixed-path hashing and error helpers", () => {
    expect(foundation).toContain("create function private.database_now");
    expect(foundation).toContain("create function private.request_hash");
    expect(foundation).toContain("extensions.digest(");
    expect(foundation).toContain("create function private.raise_api_error");
    expect(foundation).toMatch(/security definer/);
    expect(foundation).toMatch(/set search_path = ''/);
    expect(foundation).toMatch(
      /revoke all on function private\.request_hash\(text, uuid, jsonb\)\s+from public, anon, authenticated/,
    );
  });
});

describe("G4-I2-B schedule task command RPCs", () => {
  const rpcs = rpcMigrationNames[0]
    ? readFileSync(resolve(migrationsDirectory, rpcMigrationNames[0]), "utf8")
    : "";

  it("keeps the authorized I2-B RPC/RLS SHA unchanged", () => {
    expect(rpcMigrationNames).toHaveLength(1);
    expect(sha256(rpcMigrationNames[0])).toBe(
      "6637DBCD69FBD265A64D96C73E83FB6F172E7C24170DC2C3472141E830BE093B",
    );
  });

  it("exposes the five frozen RPCs through invoker wrappers", () => {
    for (const rpcName of [
      "create_experiment_task",
      "update_experiment_task",
      "cancel_experiment_task",
      "soft_delete_entity",
      "restore_entity",
    ]) {
      expect(rpcs).toContain(`create function public.${rpcName}(`);
      expect(rpcs).toMatch(new RegExp(`create function public\\.${rpcName}\\([\\s\\S]{0,900}security invoker`));
      expect(rpcs).toMatch(new RegExp(`create function public\\.${rpcName}\\([\\s\\S]{0,900}set search_path = ''`));
      expect(rpcs).toMatch(
        new RegExp(
          `revoke all on function public\\.${rpcName}\\([\\s\\S]{0,300}from public, anon, authenticated`,
        ),
      );
      expect(rpcs).toMatch(
        new RegExp(`grant execute on function public\\.${rpcName}\\([\\s\\S]{0,300}to authenticated`),
      );
    }
    expect(rpcs.match(/'requestId', mutationId/g)).toHaveLength(5);
  });

  it("routes writes through definer helpers with fixed search paths", () => {
    for (const helperName of [
      "private.create_experiment_task_cmd",
      "private.update_experiment_task_cmd",
      "private.cancel_experiment_task_cmd",
      "private.soft_delete_entity_cmd",
      "private.restore_entity_cmd",
    ]) {
      expect(rpcs).toContain(`create function ${helperName}(`);
      expect(rpcs).toMatch(new RegExp(`create function ${helperName}\\([\\s\\S]{0,900}security definer`));
      expect(rpcs).toMatch(new RegExp(`create function ${helperName}\\([\\s\\S]{0,900}set search_path = ''`));
      expect(rpcs).toMatch(
        new RegExp(
          `revoke all on function ${helperName}\\([\\s\\S]{0,300}from public, anon, authenticated`,
        ),
      );
      expect(rpcs).toMatch(
        new RegExp(
          `grant execute on function ${helperName}\\([\\s\\S]{0,300}to authenticated`,
        ),
      );
    }
  });

  it("implements idempotency receipts with advisory serialization", () => {
    expect(rpcs).toContain("pg_advisory_xact_lock");
    expect(rpcs).toContain("private.request_hash(");
    expect(rpcs).toContain("IDEMPOTENCY_KEY_REUSED");
    expect(rpcs).toContain("result_payload");
    expect(rpcs).toMatch(/insert into private\.mutation_receipts/);
  });

  it("implements the frozen time and overlap contract", () => {
    expect(rpcs).toContain("TIME_OVERLAP_CONFIRMATION_REQUIRED");
    expect(rpcs).toContain("confirmTimeOverlap");
    expect(rpcs).toContain("planned_local_time < planned_local_end_time");
    expect(rpcs).toMatch(/planned_start_at < [\s\S]{0,120}planned_end_at/);
    expect(rpcs).toContain("'title', existing.title");
    expect(rpcs).toContain("'overlapStart'");
    expect(rpcs).toContain("'overlapEnd'");
  });

  it("returns stable field errors for validation failures", () => {
    const foundation = foundationMigrationNames[0]
      ? readFileSync(resolve(migrationsDirectory, foundationMigrationNames[0]), "utf8")
      : "";
    expect(foundation).toContain("'fieldErrors'");
    for (const fieldName of [
      "title",
      "plannedLocalDate",
      "dayPart",
      "plannedTimezone",
      "plannedLocalTime",
      "plannedLocalEndTime",
      "expectedRevision",
      "reason",
      "confirmation",
    ]) {
      expect(foundation).toContain(`'${fieldName}'`);
    }
  });

  it("implements Unicode cancellation trimming and state consistency", () => {
    expect(rpcs).toContain("btrim(");
    expect(rpcs).toContain("chr(65279)");
    expect(rpcs).toMatch(/cancellation_reason\s*:=/);
    expect(rpcs).toContain("INVALID_STATE_TRANSITION");
    expect(rpcs).not.toMatch(/cancellation_reason[\s\S]{0,40}audit_events/);
  });

  it("records audit without experiment body text", () => {
    expect(rpcs).toMatch(/insert into private\.audit_events/);
    expect(rpcs).toMatch(/jsonb_build_object\(/);
    expect(rpcs).toContain("'revision'");
    expect(rpcs).not.toMatch(/metadata[\s\S]{0,80}p_notes/);
    expect(rpcs).not.toMatch(/metadata[\s\S]{0,80}p_reason/);
  });

  it("rejects I3 protocol association and non-task entity types", () => {
    expect(rpcs).toContain("protocol_version_id is not null");
    expect(rpcs).toMatch(/entity_type[\s\S]{0,120}'task'/);
  });
});

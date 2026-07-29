import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260729080019_g4_i1_identity_spaces_rls.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const timezoneMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729080358_g4_i1_enforce_iana_timezone.sql",
  ),
  "utf8",
);

describe("G4-I1 identity and personal-space migration", () => {
  it("creates the frozen identity tables and private boundary", () => {
    expect(migration).toContain("create schema if not exists private");
    expect(migration).toContain("create table public.user_profiles");
    expect(migration).toContain("create table public.spaces");
    expect(migration).toContain("create table public.space_memberships");
    expect(migration).toContain("create table public.user_preferences");
  });

  it("enables RLS and scopes policies to authenticated users", () => {
    for (const table of [
      "user_profiles",
      "spaces",
      "space_memberships",
      "user_preferences",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }

    expect(migration).toMatch(/create policy[\s\S]+to authenticated/);
    expect(migration).not.toMatch(/create policy[\s\S]+to public/);
  });

  it("uses fixed-path definers with explicit execute grants", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("grant execute on function");
  });

  it("exposes only the frozen bootstrap RPC", () => {
    expect(migration).toContain(
      "create function public.bootstrap_personal_space",
    );
    expect(migration).toContain("security invoker");
    expect(migration).toContain("pg_catalog.pg_timezone_names");
  });

  it("enforces IANA timezones for every preferences write path", () => {
    expect(timezoneMigration).toContain(
      "create function private.validate_preferences_timezone",
    );
    expect(timezoneMigration).toContain("pg_catalog.pg_timezone_names");
    expect(timezoneMigration).toContain(
      "before insert or update of timezone on public.user_preferences",
    );
    expect(timezoneMigration).toContain(
      "revoke all on function private.validate_preferences_timezone()",
    );
  });
});

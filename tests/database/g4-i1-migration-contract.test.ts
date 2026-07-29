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
const authFixtureMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729104223_g4_i1_auth_fixture_support.sql",
  ),
  "utf8",
);
const tightenedFixtureMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729113507_g4_i1_tighten_fixture_acl_and_membership.sql",
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

  it("limits B test fixtures to tagged users and service-role wrappers", () => {
    expect(authFixtureMigration).toContain(
      "raw_app_meta_data ->> 'labflow_fixture' = 'g4_i1_b'",
    );
    expect(authFixtureMigration).toContain("set search_path = ''");
    expect(authFixtureMigration).toContain(
      "grant execute on function public.g4_i1_test_set_account_status",
    );
    expect(authFixtureMigration).toContain(
      "grant execute on function public.g4_i1_test_set_membership_status",
    );
    expect(authFixtureMigration).toContain("to service_role");
    expect(authFixtureMigration).toContain(
      "revoke all on function public.g4_i1_test_set_account_status",
    );
    expect(authFixtureMigration).toContain(
      "grant select on table public.user_profiles to service_role",
    );
  });

  it("provides a fixture-only rollback probe without exposing general writes", () => {
    expect(authFixtureMigration).toContain(
      "create function public.g4_i1_test_bootstrap_then_fail",
    );
    expect(authFixtureMigration).toContain(
      "grant execute on function public.g4_i1_test_bootstrap_then_fail(text) to authenticated",
    );
    expect(authFixtureMigration).toContain(
      "raise exception 'G4-I1 fixture rollback probe'",
    );
  });

  it("revokes the fixture predicate from authenticated callers", () => {
    expect(tightenedFixtureMigration).toMatch(
      /revoke execute on function private\.is_g4_i1_fixture_user\(uuid\)\s+from authenticated/,
    );
  });

  it("adds service-only physical membership remove and restore probes", () => {
    for (const functionName of [
      "g4_i1_test_remove_membership",
      "g4_i1_test_restore_membership",
    ]) {
      expect(tightenedFixtureMigration).toContain(
        `create function private.${functionName}`,
      );
      expect(tightenedFixtureMigration).toContain(
        `create function public.${functionName}`,
      );
      expect(tightenedFixtureMigration).toMatch(
        new RegExp(
          `grant execute on function public\\.${functionName}\\(uuid\\)\\s+to service_role`,
        ),
      );
      expect(tightenedFixtureMigration).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\(uuid\\)\\s+from public, anon, authenticated`,
        ),
      );
    }
    expect(tightenedFixtureMigration).toContain("set search_path = ''");
    expect(tightenedFixtureMigration).toContain(
      "private.is_g4_i1_fixture_user(p_user_id)",
    );
  });
});

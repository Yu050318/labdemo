import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCleanupEvidence,
  crossAccountMutationMatrix,
  crossAccountSelectMatrix,
  isExpiredAuthRejection,
  loadRuntimeConfig,
  readExpiredJwtMetadata,
  redactIdentifier,
} from "../../scripts/g4-i1-auth-isolation";

const harnessSource = readFileSync(
  resolve(process.cwd(), "scripts/g4-i1-auth-isolation.ts"),
  "utf8",
);

describe("G4-I1 Auth isolation harness", () => {
  it("fails closed without server-only runtime variables", () => {
    expect(() => loadRuntimeConfig({})).toThrowError(
      "Missing server runtime variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("does not include variable values in configuration errors", () => {
    const sentinel = "must-not-appear";
    expect(() =>
      loadRuntimeConfig({
        SUPABASE_URL: sentinel,
        SUPABASE_PUBLISHABLE_KEY: sentinel,
      }),
    ).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);

    try {
      loadRuntimeConfig({
        SUPABASE_URL: sentinel,
        SUPABASE_PUBLISHABLE_KEY: sentinel,
      });
    } catch (error) {
      expect(String(error)).not.toContain(sentinel);
    }
  });

  it("produces stable non-reversible identifiers for reports", () => {
    const rawId = "11111111-1111-4111-8111-111111111111";
    const redacted = redactIdentifier(rawId);

    expect(redacted).toHaveLength(12);
    expect(redacted).not.toContain(rawId);
    expect(redactIdentifier(rawId)).toBe(redacted);
  });

  it("defines the complete four-table, two-direction SELECT matrix", () => {
    expect(crossAccountSelectMatrix).toEqual([
      ["A", "B", "user_profiles"],
      ["B", "A", "user_profiles"],
      ["A", "B", "spaces"],
      ["B", "A", "spaces"],
      ["A", "B", "space_memberships"],
      ["B", "A", "space_memberships"],
      ["A", "B", "user_preferences"],
      ["B", "A", "user_preferences"],
    ]);
  });

  it("defines INSERT, UPDATE and DELETE for every cross-account direction", () => {
    expect(crossAccountMutationMatrix).toHaveLength(24);
    for (const direction of [
      ["A", "B"],
      ["B", "A"],
    ] as const) {
      for (const table of [
        "user_profiles",
        "spaces",
        "space_memberships",
        "user_preferences",
      ] as const) {
        for (const operation of ["INSERT", "UPDATE", "DELETE"] as const) {
          expect(crossAccountMutationMatrix).toContainEqual([
            ...direction,
            table,
            operation,
          ]);
        }
      }
    }
  });

  it("aligns cleanup counts to the same redacted fixture identifiers", () => {
    const fixtures = [
      { alias: "A" as const, id: "user-a" },
      { alias: "B" as const, id: "user-b" },
    ];
    const before = new Map([
      [
        "user-a",
        {
          profile_count: 1,
          space_count: 1,
          membership_count: 1,
          preferences_count: 1,
        },
      ],
      [
        "user-b",
        {
          profile_count: 1,
          space_count: 1,
          membership_count: 1,
          preferences_count: 1,
        },
      ],
    ]);
    const after = new Map([
      [
        "user-a",
        {
          profile_count: 0,
          space_count: 0,
          membership_count: 0,
          preferences_count: 0,
        },
      ],
      [
        "user-b",
        {
          profile_count: 0,
          space_count: 0,
          membership_count: 0,
          preferences_count: 0,
        },
      ],
    ]);

    const evidence = buildCleanupEvidence(fixtures, before, after);

    expect(evidence).toEqual([
      {
        alias: "A",
        redactedId: redactIdentifier("user-a"),
        before: {
          profiles: 1,
          spaces: 1,
          memberships: 1,
          preferences: 1,
        },
        after: {
          profiles: 0,
          spaces: 0,
          memberships: 0,
          preferences: 0,
        },
      },
      {
        alias: "B",
        redactedId: redactIdentifier("user-b"),
        before: {
          profiles: 1,
          spaces: 1,
          memberships: 1,
          preferences: 1,
        },
        after: {
          profiles: 0,
          spaces: 0,
          memberships: 0,
          preferences: 0,
        },
      },
    ]);
  });

  it("accepts only a JWT whose exp is genuinely in the past", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 100 })).toString(
      "base64url",
    );
    const token = `header.${payload}.signature`;

    expect(readExpiredJwtMetadata(token, 101_000)).toEqual({
      expiredAt: "1970-01-01T00:01:40.000Z",
    });
    expect(() => readExpiredJwtMetadata(token, 99_000)).toThrowError(
      "Injected token has not expired",
    );
    expect(() => readExpiredJwtMetadata("not-a-jwt", 101_000)).toThrowError(
      "Injected token is not a JWT",
    );
    expect(
      isExpiredAuthRejection({ message: "JWT expired", code: "bad_jwt" }),
    ).toBe(true);
    expect(
      isExpiredAuthRejection({
        message: "invalid JWT signature",
        code: "bad_jwt",
      }),
    ).toBe(false);
  });

  it("does not use the service-role client for direct business-table writes", () => {
    expect(harnessSource).not.toMatch(
      /admin\s*\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\s*\(/,
    );
  });
});

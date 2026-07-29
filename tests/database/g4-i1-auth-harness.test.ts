import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCleanupEvidence,
  assertBusinessReadCounts,
  classifyAuthFailure,
  createNewApiKeySafeFetch,
  crossAccountMutationMatrix,
  crossAccountSelectMatrix,
  isExpiredAuthRejection,
  loadRuntimeConfig,
  readExpiredJwtMetadata,
  redactIdentifier,
  runAuthIsolationHarness,
} from "../../scripts/g4-i1-auth-isolation";

const harnessSource = readFileSync(
  resolve(process.cwd(), "scripts/g4-i1-auth-isolation.ts"),
  "utf8",
);

describe("G4-I1 Auth isolation harness", () => {
  it("starts under Node strip-only mode and stops at missing variables", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        resolve(process.cwd(), "scripts/g4-i1-auth-isolation.ts"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { NODE_ENV: "test" },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      '"reason": "Missing server runtime variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY"',
    );
    expect(result.stderr).not.toContain("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX");
  });

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

  it("fails closed before writes when the URL targets another project", () => {
    expect(() =>
      loadRuntimeConfig({
        SUPABASE_URL: "https://not-labflow.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      }),
    ).toThrowError("SUPABASE_URL does not target the LabFlow test project");
  });

  it("fails closed before fetch when the target project uses HTTP", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      await expect(
        runAuthIsolationHarness({
          NODE_ENV: "test",
          SUPABASE_URL: "http://ogvqegmgcuwlynczasop.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
        }),
      ).rejects.toThrowError("SUPABASE_URL must use the LabFlow HTTPS origin");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    "https://operator:password@ogvqegmgcuwlynczasop.supabase.co",
    "https://ogvqegmgcuwlynczasop.supabase.co:444",
  ])("rejects unsafe target URL form before writes: %s", (supabaseUrl) => {
    expect(() =>
      loadRuntimeConfig({
        SUPABASE_URL: supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      }),
    ).toThrowError("SUPABASE_URL must use the LabFlow HTTPS origin");
  });

  it("rejects malformed target URLs without echoing the input", () => {
    const malformed = "not a URL with sensitive query material";
    expect(() =>
      loadRuntimeConfig({
        SUPABASE_URL: malformed,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      }),
    ).toThrowError("SUPABASE_URL is not a valid URL");

    try {
      loadRuntimeConfig({
        SUPABASE_URL: malformed,
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
      });
    } catch (error) {
      expect(String(error)).not.toContain(malformed);
    }
  });

  it("removes a new secret key from the Auth bearer header", async () => {
    const observedHeaders: Headers[] = [];
    const safeFetch = createNewApiKeySafeFetch(async (_input, init) => {
      observedHeaders.push(new Headers(init?.headers));
      return new Response(null, { status: 204 });
    });

    await safeFetch("https://example.test/auth/v1/admin/users", {
      headers: {
        apikey: "sb_secret_test",
        Authorization: "Bearer sb_secret_test",
      },
    });

    expect(observedHeaders[0]?.get("apikey")).toBe("sb_secret_test");
    expect(observedHeaders[0]?.has("Authorization")).toBe(false);
  });

  it("preserves a real user bearer token", async () => {
    const observedHeaders: Headers[] = [];
    const safeFetch = createNewApiKeySafeFetch(async (_input, init) => {
      observedHeaders.push(new Headers(init?.headers));
      return new Response(null, { status: 204 });
    });

    await safeFetch("https://example.test/rest/v1/user_profiles", {
      headers: {
        apikey: "sb_secret_test",
        Authorization: "Bearer user-session-token",
      },
    });

    expect(observedHeaders[0]?.get("Authorization")).toBe(
      "Bearer user-session-token",
    );
  });

  it("classifies Auth failures without serializing messages or bodies", () => {
    const failure = classifyAuthFailure("fixture_A_creation", {
      name: "AuthApiError",
      status: 403,
      code: "bad_jwt",
      message: "sensitive upstream response",
      body: "must not be serialized",
    });

    expect(failure).toEqual({
      stage: "fixture_A_creation",
      status: 403,
      code: "bad_jwt",
      category: "authorization",
    });
    expect(JSON.stringify(failure)).not.toContain("sensitive");
    expect(JSON.stringify(failure)).not.toContain("serialized");
  });

  it("classifies code-less transport failures without using unknown", () => {
    expect(
      classifyAuthFailure("fixture_A_creation", {
        name: "AuthRetryableFetchError",
        status: 0,
      }),
    ).toEqual({
      stage: "fixture_A_creation",
      status: null,
      code: "unavailable",
      category: "transport",
    });
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

  it("keeps the active user's profile visible when membership is unavailable", () => {
    expect(() =>
      assertBusinessReadCounts(
        {
          profiles: 1,
          spaces: 0,
          memberships: 0,
          preferences: 0,
        },
        "active_without_membership",
        "removed membership",
      ),
    ).not.toThrow();

    expect(() =>
      assertBusinessReadCounts(
        {
          profiles: 0,
          spaces: 0,
          memberships: 0,
          preferences: 0,
        },
        "active_without_membership",
        "removed membership",
      ),
    ).toThrowError("removed membership profile count is not one");
  });

  it("hides all four tables when the account itself is inactive", () => {
    expect(() =>
      assertBusinessReadCounts(
        {
          profiles: 0,
          spaces: 0,
          memberships: 0,
          preferences: 0,
        },
        "inactive_account",
        "pending_deletion old session",
      ),
    ).not.toThrow();
  });
});

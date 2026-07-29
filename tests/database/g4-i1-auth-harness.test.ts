import { describe, expect, it } from "vitest";
import {
  loadRuntimeConfig,
  redactIdentifier,
} from "../../scripts/g4-i1-auth-isolation";

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
});

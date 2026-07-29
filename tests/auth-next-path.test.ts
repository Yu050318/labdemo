import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "../src/lib/auth/next-path";

describe("sanitizeNextPath", () => {
  it("keeps an application-relative path", () => {
    expect(sanitizeNextPath("/schedule?view=week")).toBe(
      "/schedule?view=week",
    );
  });

  it.each([
    null,
    "",
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "\\\\attacker.example",
  ])("falls back to root for unsafe next value %s", (value) => {
    expect(sanitizeNextPath(value)).toBe("/");
  });
});

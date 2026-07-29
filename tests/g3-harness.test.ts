import { describe, expect, it } from "vitest";

import {
  G3_FIXED_STATES,
  G3_ROUTE_SKELETON,
} from "../src/fixtures/g3-harness";

describe("G3 fixed-data harness", () => {
  it("keeps one unique route skeleton for each of the 23 frozen views", () => {
    expect(G3_ROUTE_SKELETON).toHaveLength(23);
    expect(new Set(G3_ROUTE_SKELETON.map(({ id }) => id)).size).toBe(23);
    expect(new Set(G3_ROUTE_SKELETON.map(({ path }) => path)).size).toBe(23);
  });

  it("contains the non-ideal states required before static page QA", () => {
    expect(G3_FIXED_STATES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: "loading" }),
        expect.objectContaining({ state: "empty" }),
        expect.objectContaining({ state: "error" }),
        expect.objectContaining({ state: "offline" }),
        expect.objectContaining({ state: "conflict" }),
        expect.objectContaining({ state: "notification_unavailable" }),
        expect.objectContaining({ state: "pending_sync_23h59m" }),
        expect.objectContaining({ state: "pending_sync_over_24h" }),
      ]),
    );
  });
});

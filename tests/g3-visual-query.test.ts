import { describe, expect, it } from "vitest";

import {
  G3_GLOBAL_STATES,
  G3_PAGE_IDS,
  normalizeVisualQuery,
} from "../src/features/g3-static/visual-query";

describe("G3 visual query", () => {
  it("keeps the 23-page and 10-state design contract", () => {
    expect(G3_PAGE_IDS).toHaveLength(23);
    expect(G3_GLOBAL_STATES).toHaveLength(10);
  });

  it("accepts reproducible ampersand and Windows semicolon parameters", () => {
    expect(normalizeVisualQuery("?page=W04&state=conflict&qa=1")).toEqual({
      page: "W04",
      state: "conflict",
      qa: true,
    });
    expect(normalizeVisualQuery("?page=H02;state=normal;qa=1")).toEqual({
      page: "H02",
      state: "normal",
      qa: true,
    });
  });

  it("falls back safely for unknown page and state values", () => {
    expect(normalizeVisualQuery("?page=unknown&state=unknown")).toEqual({
      page: "D01",
      state: "normal",
      qa: false,
    });
  });
});

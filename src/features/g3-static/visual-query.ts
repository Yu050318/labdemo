import type { FrozenViewId } from "../../fixtures/g3-harness";

export const G3_PAGE_IDS = [
  "A01", "A02", "A03", "O01", "D01", "S01", "S02", "W01", "W02", "W03",
  "W04", "K01", "K02", "K03", "T01", "N01", "H01", "H02", "M01", "P01",
  "X01", "R01", "C01",
] as const satisfies readonly FrozenViewId[];

export const G3_GLOBAL_STATES = [
  "normal", "loading", "empty", "error", "disabled", "offline", "conflict",
  "notification-unavailable", "account-pending-deletion", "dense",
] as const;

export type G3VisualState = (typeof G3_GLOBAL_STATES)[number];

export interface VisualQuery {
  page: FrozenViewId;
  state: G3VisualState;
  qa: boolean;
}

function includesValue<const T extends readonly string[]>(
  values: T,
  candidate: string | null,
): candidate is T[number] {
  return candidate !== null && values.includes(candidate);
}

export function normalizeVisualQuery(search: string): VisualQuery {
  const params = new URLSearchParams(search.replaceAll(";", "&"));
  const page = params.get("page");
  const state = params.get("state");

  return {
    page: includesValue(G3_PAGE_IDS, page) ? page : "D01",
    state: includesValue(G3_GLOBAL_STATES, state) ? state : "normal",
    qa: params.get("qa") === "1",
  };
}

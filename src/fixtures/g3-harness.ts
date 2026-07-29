export type FrozenViewId =
  | "A01"
  | "A02"
  | "A03"
  | "O01"
  | "D01"
  | "S01"
  | "S02"
  | "W01"
  | "W02"
  | "W03"
  | "W04"
  | "K01"
  | "K02"
  | "K03"
  | "T01"
  | "N01"
  | "H01"
  | "H02"
  | "M01"
  | "P01"
  | "X01"
  | "R01"
  | "C01";

interface RouteSkeleton {
  id: FrozenViewId;
  path: string;
}

export const G3_ROUTE_SKELETON = [
  { id: "A01", path: "/login" },
  { id: "A02", path: "/register" },
  { id: "A03", path: "/password" },
  { id: "O01", path: "/onboarding" },
  { id: "D01", path: "/today" },
  { id: "S01", path: "/schedule" },
  { id: "S02", path: "/tasks/editor" },
  { id: "W01", path: "/tasks/workspace" },
  { id: "W02", path: "/tasks/preparation" },
  { id: "W03", path: "/tasks/execution" },
  { id: "W04", path: "/tasks/completion" },
  { id: "K01", path: "/knowledge" },
  { id: "K02", path: "/knowledge/detail" },
  { id: "K03", path: "/knowledge/editor" },
  { id: "T01", path: "/timers" },
  { id: "N01", path: "/notifications" },
  { id: "H01", path: "/history" },
  { id: "H02", path: "/history/run" },
  { id: "M01", path: "/summary" },
  { id: "P01", path: "/settings" },
  { id: "X01", path: "/settings/export" },
  { id: "R01", path: "/settings/trash" },
  { id: "C01", path: "/settings/account-deletion" },
] as const satisfies readonly RouteSkeleton[];

type HarnessState =
  | "loading"
  | "empty"
  | "error"
  | "offline"
  | "conflict"
  | "notification_unavailable"
  | "pending_sync_23h59m"
  | "pending_sync_over_24h";

export const G3_FIXED_STATES: ReadonlyArray<{
  id: string;
  state: HarnessState;
}> = [
  { id: "state-loading", state: "loading" },
  { id: "state-empty", state: "empty" },
  { id: "state-error", state: "error" },
  { id: "state-offline", state: "offline" },
  { id: "state-conflict", state: "conflict" },
  {
    id: "state-notification-unavailable",
    state: "notification_unavailable",
  },
  { id: "state-pending-sync-23h59m", state: "pending_sync_23h59m" },
  { id: "state-pending-sync-over-24h", state: "pending_sync_over_24h" },
];

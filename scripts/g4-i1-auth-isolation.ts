import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          account_status: "active" | "pending_deletion" | "purging";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          account_status?: "active" | "pending_deletion" | "purging";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          account_status?: "active" | "pending_deletion" | "purging";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      spaces: {
        Row: {
          id: string;
          kind: "personal";
          name: string;
          owner_user_id: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          kind?: "personal";
          name: string;
          owner_user_id: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          kind?: "personal";
          name?: string;
          owner_user_id?: string;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      space_memberships: {
        Row: {
          space_id: string;
          user_id: string;
          role: "owner";
          status: "active" | "removed";
          created_at: string;
        };
        Insert: {
          space_id: string;
          user_id: string;
          role?: "owner";
          status?: "active" | "removed";
          created_at?: string;
        };
        Update: {
          space_id?: string;
          user_id?: string;
          role?: "owner";
          status?: "active" | "removed";
          created_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          space_id: string;
          timezone: string;
          summary_enabled: boolean;
          summary_local_time: string;
          protocol_display_preference: "standard_full";
          next_summary_at: string | null;
          revision: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          space_id: string;
          timezone: string;
          summary_enabled?: boolean;
          summary_local_time?: string;
          protocol_display_preference?: "standard_full";
          next_summary_at?: string | null;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          space_id?: string;
          timezone?: string;
          summary_enabled?: boolean;
          summary_local_time?: string;
          protocol_display_preference?: "standard_full";
          next_summary_at?: string | null;
          revision?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      bootstrap_personal_space: {
        Args: { timezone: string };
        Returns: {
          spaceId: string;
          preferencesId: string;
          alreadyExisted: boolean;
        }[];
      };
      g4_i1_test_set_account_status: {
        Args: {
          user_id: string;
          account_status: "active" | "pending_deletion" | "purging";
        };
        Returns: undefined;
      };
      g4_i1_test_set_membership_status: {
        Args: {
          user_id: string;
          membership_status: "active" | "removed";
        };
        Returns: undefined;
      };
      g4_i1_test_remove_membership: {
        Args: { user_id: string };
        Returns: undefined;
      };
      g4_i1_test_restore_membership: {
        Args: { user_id: string };
        Returns: undefined;
      };
      g4_i1_test_fixture_snapshot: {
        Args: { user_ids: string[] };
        Returns: FixtureSnapshot[];
      };
      g4_i1_test_bootstrap_then_fail: {
        Args: { timezone: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

interface RuntimeConfig {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  expiredAccessToken?: string;
}

interface SafeAuthFailure {
  stage: string;
  status: number | null;
  code: string;
  category:
    | "authorization"
    | "request"
    | "service"
    | "transport"
    | "sdk_unknown"
    | "missing_response_data"
    | "auth";
}

class AuthHarnessFailure extends Error {
  readonly failure: SafeAuthFailure;

  constructor(failure: SafeAuthFailure) {
    super("Auth harness request failed");
    this.failure = failure;
  }
}

interface FixtureSnapshot {
  user_id: string;
  profile_count: number;
  space_count: number;
  membership_count: number;
  preferences_count: number;
  account_status: string | null;
  membership_status: string | null;
}

interface FixtureUser {
  alias: "A" | "B";
  id: string;
  client: SupabaseClient<Database>;
}

interface BootstrapResult {
  spaceId: string;
  preferencesId: string;
  alreadyExisted: boolean;
}

interface FixtureCounts {
  profile_count: number;
  space_count: number;
  membership_count: number;
  preferences_count: number;
}

const fixtureTag = "g4_i1_b";
const timezone = "Asia/Shanghai";
const expectedProjectRef = "ogvqegmgcuwlynczasop";

export const crossAccountSelectMatrix = [
  ["A", "B", "user_profiles"],
  ["B", "A", "user_profiles"],
  ["A", "B", "spaces"],
  ["B", "A", "spaces"],
  ["A", "B", "space_memberships"],
  ["B", "A", "space_memberships"],
  ["A", "B", "user_preferences"],
  ["B", "A", "user_preferences"],
] as const;

export const crossAccountMutationMatrix = (
  [
    ["A", "B"],
    ["B", "A"],
  ] as const
).flatMap(([reader, target]) =>
  (
    [
      "user_profiles",
      "spaces",
      "space_memberships",
      "user_preferences",
    ] as const
  ).flatMap((table) =>
    (["INSERT", "UPDATE", "DELETE"] as const).map(
      (operation) => [reader, target, table, operation] as const,
    ),
  ),
);

export function loadRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const missing = required.filter((name) => !environment[name]);

  if (missing.length > 0) {
    throw new Error(`Missing server runtime variables: ${missing.join(", ")}`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(environment.SUPABASE_URL!);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL");
  }
  const expectedHostname = `${expectedProjectRef}.supabase.co`;
  if (parsedUrl.hostname !== expectedHostname) {
    throw new Error("SUPABASE_URL does not target the LabFlow test project");
  }
  if (
    parsedUrl.origin !== `https://${expectedHostname}`
    || parsedUrl.username !== ""
    || parsedUrl.password !== ""
  ) {
    throw new Error("SUPABASE_URL must use the LabFlow HTTPS origin");
  }

  return {
    supabaseUrl: environment.SUPABASE_URL!,
    publishableKey: environment.SUPABASE_PUBLISHABLE_KEY!,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!,
    expiredAccessToken: environment.LABFLOW_TEST_EXPIRED_ACCESS_TOKEN,
  };
}

export function createNewApiKeySafeFetch(
  fetchImplementation: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const apiKey = headers.get("apikey");
    const authorization = headers.get("Authorization");
    const isNewApiKey =
      apiKey?.startsWith("sb_secret_")
      || apiKey?.startsWith("sb_publishable_");

    if (isNewApiKey && authorization === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }

    return fetchImplementation(input, { ...init, headers });
  };
}

export function classifyAuthFailure(
  stage: string,
  error: unknown,
): SafeAuthFailure {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const rawStatus = record?.status;
  const status =
    typeof rawStatus === "number"
    && Number.isInteger(rawStatus)
    && rawStatus >= 100
    && rawStatus <= 599
      ? rawStatus
      : null;
  const rawCode = record?.code;
  const code =
    typeof rawCode === "string" && /^[a-z0-9_]{1,64}$/.test(rawCode)
      ? rawCode
      : "unavailable";
  const name = typeof record?.name === "string" ? record.name : "";

  let category: SafeAuthFailure["category"] = "auth";
  if (error === null) {
    category = "missing_response_data";
  } else if (name === "AuthRetryableFetchError") {
    category = "transport";
  } else if (name === "AuthUnknownError") {
    category = "sdk_unknown";
  } else if (status === 401 || status === 403) {
    category = "authorization";
  } else if (status !== null && status >= 500) {
    category = "service";
  } else if (status !== null && status >= 400) {
    category = "request";
  }

  return { stage, status, code, category };
}

export function redactIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function readExpiredJwtMetadata(
  token: string,
  nowMs = Date.now(),
): { expiredAt: string } {
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new Error("Injected token is not a JWT");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(segments[1], "base64url").toString("utf8"),
    );
  } catch {
    throw new Error("Injected token has no readable JWT payload");
  }

  if (
    typeof decoded !== "object"
    || decoded === null
    || !("exp" in decoded)
    || typeof decoded.exp !== "number"
    || !Number.isFinite(decoded.exp)
  ) {
    throw new Error("Injected token has no numeric exp claim");
  }

  const expiredAtMs = decoded.exp * 1000;
  if (expiredAtMs >= nowMs) {
    throw new Error("Injected token has not expired");
  }

  return { expiredAt: new Date(expiredAtMs).toISOString() };
}

export function isExpiredAuthRejection(error: {
  message?: string;
  code?: string;
}): boolean {
  return error.code === "bad_jwt" && /(?:expired|expiration)/i.test(
    error.message ?? "",
  );
}

export function buildCleanupEvidence(
  fixtures: ReadonlyArray<{ alias: "A" | "B"; id: string }>,
  before: ReadonlyMap<string, FixtureCounts>,
  after: ReadonlyMap<string, FixtureCounts>,
) {
  return fixtures.map((fixture) => {
    const beforeCounts = before.get(fixture.id);
    const afterCounts = after.get(fixture.id);
    invariant(beforeCounts, `Missing pre-cleanup counts for ${fixture.alias}`);
    invariant(afterCounts, `Missing post-cleanup counts for ${fixture.alias}`);

    return {
      alias: fixture.alias,
      redactedId: redactIdentifier(fixture.id),
      before: {
        profiles: beforeCounts.profile_count,
        spaces: beforeCounts.space_count,
        memberships: beforeCounts.membership_count,
        preferences: beforeCounts.preferences_count,
      },
      after: {
        profiles: afterCounts.profile_count,
        spaces: afterCounts.space_count,
        memberships: afterCounts.membership_count,
        preferences: afterCounts.preferences_count,
      },
    };
  });
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function describeError(error: PostgrestError | null): string {
  return error?.code ?? "unknown";
}

function authOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: createNewApiKeySafeFetch() },
  };
}

function makeFixtureCredentials(alias: "A" | "B") {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    email: `labflow-g4-i1-${alias.toLowerCase()}-${suffix}@example.com`,
    password: `Lf4!${randomBytes(24).toString("base64url")}`,
  };
}

async function createFixtureUser(
  alias: "A" | "B",
  admin: SupabaseClient<Database>,
  config: RuntimeConfig,
  onCreated: (userId: string) => void,
): Promise<FixtureUser> {
  const credentials = makeFixtureCredentials(alias);
  const created = await admin.auth.admin.createUser({
    email: credentials.email,
    password: credentials.password,
    email_confirm: true,
    app_metadata: {
      labflow_fixture: fixtureTag,
      fixture_alias: alias,
    },
  });

  if (created.error || !created.data.user) {
    throw new AuthHarnessFailure(
      classifyAuthFailure(
        `fixture_${alias}_creation`,
        created.error ?? null,
      ),
    );
  }
  onCreated(created.data.user.id);

  const client = createClient<Database>(
    config.supabaseUrl,
    config.publishableKey,
    authOptions(),
  );
  const signedIn = await client.auth.signInWithPassword(credentials);

  if (signedIn.error || !signedIn.data.session) {
    throw new AuthHarnessFailure(
      classifyAuthFailure(
        `fixture_${alias}_sign_in`,
        signedIn.error ?? null,
      ),
    );
  }

  return { alias, id: created.data.user.id, client };
}

async function bootstrap(
  client: SupabaseClient<Database>,
): Promise<BootstrapResult> {
  const response = await client.rpc("bootstrap_personal_space", { timezone });
  if (response.error || response.data.length !== 1) {
    throw new Error(
      `bootstrap failed (${describeError(response.error)})`,
    );
  }
  const result = response.data[0];
  invariant(result, "bootstrap returned no result");
  return result;
}

async function snapshot(
  admin: SupabaseClient<Database>,
  userIds: string[],
): Promise<FixtureSnapshot[]> {
  const response = await admin.rpc("g4_i1_test_fixture_snapshot", {
    user_ids: userIds,
  });
  if (response.error || response.data.length !== userIds.length) {
    throw new Error(
      `fixture snapshot failed (${describeError(response.error)})`,
    );
  }
  return response.data;
}

function assertEmptySnapshot(row: FixtureSnapshot, label: string) {
  invariant(row.profile_count === 0, `${label} profile count is not zero`);
  invariant(row.space_count === 0, `${label} space count is not zero`);
  invariant(
    row.membership_count === 0,
    `${label} membership count is not zero`,
  );
  invariant(
    row.preferences_count === 0,
    `${label} preferences count is not zero`,
  );
}

function assertInitializedSnapshot(row: FixtureSnapshot, label: string) {
  invariant(row.profile_count === 1, `${label} profile count is not one`);
  invariant(row.space_count === 1, `${label} space count is not one`);
  invariant(
    row.membership_count === 1,
    `${label} membership count is not one`,
  );
  invariant(
    row.preferences_count === 1,
    `${label} preferences count is not one`,
  );
}

async function expectDenied(
  label: string,
  operation: PromiseLike<{ error: PostgrestError | null }>,
) {
  const result = await operation;
  invariant(result.error !== null, `${label} unexpectedly succeeded`);
}

async function assertCrossAccountMutationDirection(
  reader: FixtureUser,
  target: FixtureUser,
  targetBootstrap: BootstrapResult,
) {
  const operations = [
    reader.client.from("user_profiles").insert({
      user_id: target.id,
    }),
    reader.client
      .from("user_profiles")
      .update({ display_name: "Unauthorized" })
      .eq("user_id", target.id),
    reader.client
      .from("user_profiles")
      .delete()
      .eq("user_id", target.id),
    reader.client.from("spaces").insert({
      name: "Unauthorized",
      owner_user_id: target.id,
    }),
    reader.client
      .from("spaces")
      .update({ name: "Unauthorized" })
      .eq("id", targetBootstrap.spaceId),
    reader.client
      .from("spaces")
      .delete()
      .eq("id", targetBootstrap.spaceId),
    reader.client.from("space_memberships").insert({
      space_id: targetBootstrap.spaceId,
      user_id: target.id,
    }),
    reader.client
      .from("space_memberships")
      .update({ status: "removed" })
      .eq("space_id", targetBootstrap.spaceId)
      .eq("user_id", target.id),
    reader.client
      .from("space_memberships")
      .delete()
      .eq("space_id", targetBootstrap.spaceId)
      .eq("user_id", target.id),
    reader.client.from("user_preferences").insert({
      id: targetBootstrap.preferencesId,
      user_id: target.id,
      space_id: targetBootstrap.spaceId,
      timezone,
    }),
    reader.client
      .from("user_preferences")
      .update({ summary_enabled: false })
      .eq("id", targetBootstrap.preferencesId),
    reader.client
      .from("user_preferences")
      .delete()
      .eq("id", targetBootstrap.preferencesId),
  ] as const;
  const matrixEntries = crossAccountMutationMatrix.filter(
    ([readerAlias]) => readerAlias === reader.alias,
  );
  invariant(
    operations.length === matrixEntries.length,
    "Cross-account mutation matrix is incomplete",
  );

  for (const [index, operation] of operations.entries()) {
    const matrixEntry = matrixEntries[index];
    invariant(matrixEntry, "Cross-account mutation label is missing");
    await expectDenied(matrixEntry.join(" "), operation);
  }
}

async function assertCrossAccountIsolation(
  userA: FixtureUser,
  userB: FixtureUser,
  bootstrapA: BootstrapResult,
  bootstrapB: BootstrapResult,
) {
  const aReadsBProfile = await userA.client
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userB.id);
  const bReadsAProfile = await userB.client
    .from("user_profiles")
    .select("user_id")
    .eq("user_id", userA.id);
  const aReadsBSpace = await userA.client
    .from("spaces")
    .select("id")
    .eq("id", bootstrapB.spaceId);
  const bReadsASpace = await userB.client
    .from("spaces")
    .select("id")
    .eq("id", bootstrapA.spaceId);
  const aReadsBMembership = await userA.client
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", userB.id);
  const bReadsAMembership = await userB.client
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", userA.id);
  const aReadsBPreferences = await userA.client
    .from("user_preferences")
    .select("id")
    .eq("id", bootstrapB.preferencesId);
  const bReadsAPreferences = await userB.client
    .from("user_preferences")
    .select("id")
    .eq("id", bootstrapA.preferencesId);

  const results = [
    aReadsBProfile,
    bReadsAProfile,
    aReadsBSpace,
    bReadsASpace,
    aReadsBMembership,
    bReadsAMembership,
    aReadsBPreferences,
    bReadsAPreferences,
  ] as const;

  for (const [index, result] of results.entries()) {
    const matrixEntry = crossAccountSelectMatrix[index];
    invariant(matrixEntry, "Cross-account SELECT matrix is incomplete");
    const [reader, target, table] = matrixEntry;
    const label = `${reader} reads ${target} ${table}`;
    invariant(!result.error, `${label} returned an API error`);
    invariant(result.data.length === 0, `${label} exposed a row`);
  }

  await assertCrossAccountMutationDirection(userA, userB, bootstrapB);
  await assertCrossAccountMutationDirection(userB, userA, bootstrapA);
  await expectDenied(
    "owner tamper UPDATE",
    userA.client
      .from("spaces")
      .update({ owner_user_id: userB.id })
      .eq("id", bootstrapA.spaceId),
  );
  await expectDenied(
    "user tamper UPDATE",
    userA.client
      .from("user_profiles")
      .update({ user_id: userB.id })
      .eq("user_id", userA.id),
  );
  await expectDenied(
    "space tamper UPDATE",
    userA.client
      .from("user_preferences")
      .update({ space_id: bootstrapB.spaceId })
      .eq("id", bootstrapA.preferencesId),
  );
  await expectDenied(
    "cross-account DELETE",
    userA.client
      .from("user_preferences")
      .delete()
      .eq("id", bootstrapB.preferencesId),
  );
  await expectDenied(
    "service-only RPC",
    userA.client.rpc("g4_i1_test_set_account_status", {
      user_id: userB.id,
      account_status: "pending_deletion",
    }),
  );
}

async function setAccountStatus(
  admin: SupabaseClient<Database>,
  userId: string,
  status: "active" | "pending_deletion" | "purging",
) {
  const response = await admin.rpc("g4_i1_test_set_account_status", {
    user_id: userId,
    account_status: status,
  });
  if (response.error) {
    throw new Error(
      `account fixture update failed (${describeError(response.error)})`,
    );
  }
}

async function setMembershipStatus(
  admin: SupabaseClient<Database>,
  userId: string,
  status: "active" | "removed",
) {
  const response = await admin.rpc("g4_i1_test_set_membership_status", {
    user_id: userId,
    membership_status: status,
  });
  if (response.error) {
    throw new Error(
      `membership fixture update failed (${describeError(response.error)})`,
    );
  }
}

async function changeMembershipPresence(
  admin: SupabaseClient<Database>,
  userId: string,
  operation: "remove" | "restore",
) {
  const response = await admin.rpc(
    operation === "remove"
      ? "g4_i1_test_remove_membership"
      : "g4_i1_test_restore_membership",
    { user_id: userId },
  );
  if (response.error) {
    throw new Error(
      `membership ${operation} failed (${describeError(response.error)})`,
    );
  }
}

export function assertBusinessReadCounts(
  counts: {
    profiles: number;
    spaces: number;
    memberships: number;
    preferences: number;
  },
  mode: "active_without_membership" | "inactive_account",
  label: string,
) {
  const expectedProfiles = mode === "active_without_membership" ? 1 : 0;
  invariant(
    counts.profiles === expectedProfiles,
    `${label} profile count is not ${expectedProfiles === 1 ? "one" : "zero"}`,
  );
  for (const table of ["spaces", "memberships", "preferences"] as const) {
    invariant(counts[table] === 0, `${label} exposed ${table}`);
  }
}

async function assertBusinessReadVisibility(
  user: FixtureUser,
  label: string,
  mode: "active_without_membership" | "inactive_account",
) {
  const [profiles, spaces, memberships, preferences] = await Promise.all([
    user.client.from("user_profiles").select("user_id"),
    user.client.from("spaces").select("id"),
    user.client.from("space_memberships").select("space_id"),
    user.client.from("user_preferences").select("id"),
  ]);

  for (const [table, result] of [
    ["profiles", profiles],
    ["spaces", spaces],
    ["memberships", memberships],
    ["preferences", preferences],
  ] as const) {
    invariant(!result.error, `${label} ${table} read returned an API error`);
  }
  invariant(profiles.data, `${label} profiles read returned no data`);
  invariant(spaces.data, `${label} spaces read returned no data`);
  invariant(memberships.data, `${label} memberships read returned no data`);
  invariant(preferences.data, `${label} preferences read returned no data`);
  assertBusinessReadCounts(
    {
      profiles: profiles.data.length,
      spaces: spaces.data.length,
      memberships: memberships.data.length,
      preferences: preferences.data.length,
    },
    mode,
    label,
  );
}

function snapshotCountsByUser(rows: FixtureSnapshot[]) {
  return new Map<string, FixtureCounts>(
    rows.map((row) => [
      row.user_id,
      {
        profile_count: row.profile_count,
        space_count: row.space_count,
        membership_count: row.membership_count,
        preferences_count: row.preferences_count,
      },
    ]),
  );
}

async function countFixtureRowsByUser(
  admin: SupabaseClient<Database>,
  userIds: string[],
) {
  const counts = new Map<string, FixtureCounts>();
  for (const userId of userIds) {
    const results = await Promise.all([
      admin
        .from("user_profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId),
      admin
        .from("spaces")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", userId),
      admin
        .from("space_memberships")
        .select("space_id", { count: "exact", head: true })
        .eq("user_id", userId),
      admin
        .from("user_preferences")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    for (const result of results) {
      if (result.error) {
        throw new Error(
          `fixture row count failed (${describeError(result.error)})`,
        );
      }
    }
    counts.set(userId, {
      profile_count: results[0].count ?? -1,
      space_count: results[1].count ?? -1,
      membership_count: results[2].count ?? -1,
      preferences_count: results[3].count ?? -1,
    });
  }
  return counts;
}

async function deleteFixtureUsers(
  admin: SupabaseClient<Database>,
  userIds: string[],
) {
  for (const userId of [...userIds].reverse()) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error && result.error.status !== 404) {
      throw new AuthHarnessFailure(
        classifyAuthFailure("fixture_cleanup", result.error),
      );
    }
  }
}

async function verifyExpiredSessionIfProvided(config: RuntimeConfig) {
  if (!config.expiredAccessToken) {
    return {
      status: "not_run",
      reason: "requires_naturally_expired_supabase_issued_token",
    } as const;
  }

  const metadata = readExpiredJwtMetadata(config.expiredAccessToken);
  const client = createClient<Database>(
    config.supabaseUrl,
    config.publishableKey,
    authOptions(),
  );
  const verification = await client.auth.getUser(config.expiredAccessToken);
  invariant(
    verification.error !== null
      && verification.data.user === null
      && isExpiredAuthRejection(verification.error),
    "Supabase Auth did not confirm token expiration",
  );
  return { status: "passed", ...metadata } as const;
}

export async function runAuthIsolationHarness(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const config = loadRuntimeConfig(environment);
  const admin = createClient<Database>(
    config.supabaseUrl,
    config.serviceRoleKey,
    authOptions(),
  );
  const users: FixtureUser[] = [];
  const createdUserIds: string[] = [];
  let report:
    | {
        status: "passed" | "incomplete";
        projectRef: string;
        fixtures: Array<{
          alias: "A" | "B";
          redactedId: string;
          emailConfirmed: true;
        }>;
        assertions: Record<string, string | object>;
      }
    | undefined;
  let cleanupBefore = new Map<string, FixtureCounts>();
  let cleanupEvidence: ReturnType<typeof buildCleanupEvidence> = [];

  try {
    const registerCreatedUser = (userId: string) => {
      createdUserIds.push(userId);
    };
    const userA = await createFixtureUser(
      "A",
      admin,
      config,
      registerCreatedUser,
    );
    users.push(userA);
    const userB = await createFixtureUser(
      "B",
      admin,
      config,
      registerCreatedUser,
    );
    users.push(userB);

    await expectDenied(
      "invalid timezone bootstrap",
      userA.client.rpc("bootstrap_personal_space", {
        timezone: "Mars/LabFlow",
      }),
    );
    const invalidTimezoneSnapshot = (await snapshot(admin, [userA.id]))[0];
    invariant(
      invalidTimezoneSnapshot,
      "A invalid-timezone snapshot was not returned",
    );
    assertEmptySnapshot(invalidTimezoneSnapshot, "A");

    await expectDenied(
      "transaction rollback probe",
      userA.client.rpc("g4_i1_test_bootstrap_then_fail", { timezone }),
    );
    const rollbackSnapshot = (await snapshot(admin, [userA.id]))[0];
    invariant(rollbackSnapshot, "A rollback snapshot was not returned");
    assertEmptySnapshot(rollbackSnapshot, "A");

    const firstA = await bootstrap(userA.client);
    invariant(!firstA.alreadyExisted, "A first bootstrap was not new");
    const repeatedA = await bootstrap(userA.client);
    invariant(repeatedA.alreadyExisted, "A repeated bootstrap was not idempotent");
    invariant(
      repeatedA.spaceId === firstA.spaceId
        && repeatedA.preferencesId === firstA.preferencesId,
      "A repeated bootstrap changed identifiers",
    );

    const concurrentB = await Promise.all([
      bootstrap(userB.client),
      bootstrap(userB.client),
    ]);
    invariant(
      concurrentB[0].spaceId === concurrentB[1].spaceId
        && concurrentB[0].preferencesId === concurrentB[1].preferencesId,
      "B concurrent bootstrap changed identifiers",
    );
    invariant(
      concurrentB
        .map((result) => result.alreadyExisted)
        .sort()
        .join(",") === "false,true",
      "B concurrent bootstrap did not produce one new and one existing result",
    );
    const firstB = concurrentB[0].alreadyExisted
      ? concurrentB[1]
      : concurrentB[0];

    const parallelExisting = await Promise.all([
      bootstrap(userA.client),
      bootstrap(userB.client),
    ]);
    invariant(
      parallelExisting.every((result) => result.alreadyExisted),
      "A/B parallel idempotent bootstrap was not stable",
    );

    const initialized = await snapshot(admin, [userA.id, userB.id]);
    assertInitializedSnapshot(
      initialized.find((row) => row.user_id === userA.id)!,
      "A",
    );
    assertInitializedSnapshot(
      initialized.find((row) => row.user_id === userB.id)!,
      "B",
    );

    const [preferencesA, preferencesB] = await Promise.all([
      userA.client
        .from("user_preferences")
        .select("revision")
        .eq("id", firstA.preferencesId)
        .single(),
      userB.client
        .from("user_preferences")
        .select("revision")
        .eq("id", firstB.preferencesId)
        .single(),
    ]);
    invariant(!preferencesA.error, "A preference revision read failed");
    invariant(!preferencesB.error, "B preference revision read failed");
    invariant(preferencesA.data.revision === 1, "A preference revision is not 1");
    invariant(preferencesB.data.revision === 1, "B preference revision is not 1");

    await assertCrossAccountIsolation(userA, userB, firstA, firstB);

    await setMembershipStatus(admin, userA.id, "removed");
    await assertBusinessReadVisibility(
      userA,
      "removed membership",
      "active_without_membership",
    );
    await expectDenied(
      "removed membership bootstrap",
      userA.client.rpc("bootstrap_personal_space", { timezone }),
    );
    await setMembershipStatus(admin, userA.id, "active");

    await changeMembershipPresence(admin, userA.id, "remove");
    const missingMembershipSnapshot = (await snapshot(admin, [userA.id]))[0];
    invariant(
      missingMembershipSnapshot?.membership_count === 0,
      "A membership row still exists after physical removal",
    );
    await assertBusinessReadVisibility(
      userA,
      "missing membership",
      "active_without_membership",
    );
    await expectDenied(
      "missing membership bootstrap",
      userA.client.rpc("bootstrap_personal_space", { timezone }),
    );
    await changeMembershipPresence(admin, userA.id, "restore");
    const restoredMembershipSnapshot = (await snapshot(admin, [userA.id]))[0];
    invariant(
      restoredMembershipSnapshot?.membership_count === 1
        && restoredMembershipSnapshot.membership_status === "active",
      "A membership row was not restored",
    );

    for (const status of ["pending_deletion", "purging"] as const) {
      await setAccountStatus(admin, userA.id, status);
      await assertBusinessReadVisibility(
        userA,
        `${status} old session`,
        "inactive_account",
      );
      await expectDenied(
        `${status} bootstrap`,
        userA.client.rpc("bootstrap_personal_space", { timezone }),
      );
      await setAccountStatus(admin, userA.id, "active");
    }

    const invalidSessionClient = createClient<Database>(
      config.supabaseUrl,
      config.publishableKey,
      {
        ...authOptions(),
        global: {
          headers: { Authorization: "Bearer fixture-invalid-token" },
        },
      },
    );
    await expectDenied(
      "invalid session",
      invalidSessionClient.from("user_profiles").select("user_id"),
    );
    const expiredSession = await verifyExpiredSessionIfProvided(config);

    const signOut = await userA.client.auth.signOut({ scope: "local" });
    invariant(!signOut.error, "A local sign-out failed");
    const signedOutSession = await userA.client.auth.getSession();
    invariant(
      signedOutSession.data.session === null,
      "A client retained a local session after sign-out",
    );
    await expectDenied(
      "signed-out client read",
      userA.client.from("user_profiles").select("user_id"),
    );

    cleanupBefore = snapshotCountsByUser(
      await snapshot(admin, createdUserIds),
    );
    report = {
      status: expiredSession.status === "passed" ? "passed" : "incomplete",
      projectRef: expectedProjectRef,
      fixtures: users.map((user) => ({
        alias: user.alias,
        redactedId: redactIdentifier(user.id),
        emailConfirmed: true,
      })),
      assertions: {
        failureRollback: "passed",
        firstBootstrap: "passed",
        sequentialIdempotency: "passed",
        sameUserConcurrency: "passed",
        crossUserConcurrency: "passed",
        revision: "passed",
        crossAccountIsolation: "passed",
        directMutationDenial: "passed",
        removedMembership: "passed",
        missingMembershipRow: "passed",
        pendingDeletionOldSession: "passed",
        purgingOldSession: "passed",
        invalidSession: "passed",
        expiredSession,
        localSignOut: "passed",
      },
    };
  } finally {
    if (createdUserIds.length > 0) {
      if (cleanupBefore.size === 0) {
        cleanupBefore = snapshotCountsByUser(
          await snapshot(admin, createdUserIds),
        );
      }
      await deleteFixtureUsers(admin, createdUserIds);
      const cleanupAfter = await countFixtureRowsByUser(admin, createdUserIds);
      invariant(
        [...cleanupAfter.values()].every((counts) =>
          Object.values(counts).every((count) => count === 0),
        ),
        "Fixture cleanup left business rows",
      );
      cleanupEvidence = buildCleanupEvidence(
        users,
        cleanupBefore,
        cleanupAfter,
      );
    }
  }

  invariant(report, "Harness completed without a report");
  return {
    ...report,
    cleanup: {
      status: "passed",
      fixtures: cleanupEvidence,
    },
  };
}

async function main() {
  try {
    const result = await runAuthIsolationHarness();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof AuthHarnessFailure) {
      process.stderr.write(
        `${JSON.stringify(
          { status: "failed", failure: error.failure },
          null,
          2,
        )}\n`,
      );
      process.exitCode = 1;
      return;
    }
    const reason =
      error instanceof Error ? error.message : "Unknown harness failure";
    process.stderr.write(
      `${JSON.stringify({ status: "failed", reason }, null, 2)}\n`,
    );
    process.exitCode = 1;
  }
}

const executedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (executedPath === import.meta.url) {
  await main();
}

export type { Json };

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

const fixtureTag = "g4_i1_b";
const timezone = "Asia/Shanghai";

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

  return {
    supabaseUrl: environment.SUPABASE_URL!,
    publishableKey: environment.SUPABASE_PUBLISHABLE_KEY!,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

export function redactIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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
    throw new Error(
      `Fixture ${alias} creation failed (${created.error?.code ?? "unknown"})`,
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
    throw new Error(
      `Fixture ${alias} sign-in failed (${signedIn.error?.code ?? "unknown"})`,
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

  for (const [label, result] of [
    ["A reads B profile", aReadsBProfile],
    ["B reads A profile", bReadsAProfile],
    ["A reads B space", aReadsBSpace],
    ["B reads A space", bReadsASpace],
  ] as const) {
    invariant(!result.error, `${label} returned an API error`);
    invariant(result.data.length === 0, `${label} exposed a row`);
  }

  await expectDenied(
    "cross-account INSERT",
    userA.client.from("spaces").insert({
      name: "Unauthorized",
      owner_user_id: userB.id,
    }),
  );
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

async function assertNoBusinessRead(
  user: FixtureUser,
  label: string,
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
    invariant(result.data.length === 0, `${label} exposed ${table}`);
  }
}

async function countFixtureRows(
  admin: SupabaseClient<Database>,
  userIds: string[],
) {
  const requests = [
    admin
      .from("user_profiles")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", userIds),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .in("owner_user_id", userIds),
    admin
      .from("space_memberships")
      .select("space_id", { count: "exact", head: true })
      .in("user_id", userIds),
    admin
      .from("user_preferences")
      .select("id", { count: "exact", head: true })
      .in("user_id", userIds),
  ] as const;
  const results = await Promise.all(requests);

  for (const result of results) {
    if (result.error) {
      throw new Error(
        `fixture row count failed (${describeError(result.error)})`,
      );
    }
  }
  return results.map((result) => result.count ?? -1);
}

async function deleteFixtureUsers(
  admin: SupabaseClient<Database>,
  userIds: string[],
) {
  for (const userId of [...userIds].reverse()) {
    const result = await admin.auth.admin.deleteUser(userId);
    if (result.error && result.error.status !== 404) {
      throw new Error(
        `fixture cleanup failed (${result.error.code ?? "unknown"})`,
      );
    }
  }
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
    await assertNoBusinessRead(userA, "removed membership");
    await expectDenied(
      "removed membership bootstrap",
      userA.client.rpc("bootstrap_personal_space", { timezone }),
    );
    await setMembershipStatus(admin, userA.id, "active");

    for (const status of ["pending_deletion", "purging"] as const) {
      await setAccountStatus(admin, userA.id, status);
      await assertNoBusinessRead(userA, `${status} old session`);
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
      "invalid or expired session",
      invalidSessionClient.from("user_profiles").select("user_id"),
    );

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

    return {
      status: "passed",
      projectRef: "ogvqegmgcuwlynczasop",
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
        pendingDeletionOldSession: "passed",
        purgingOldSession: "passed",
        invalidSession: "passed",
        localSignOut: "passed",
        cleanup: "passed",
      },
    };
  } finally {
    if (createdUserIds.length > 0) {
      await deleteFixtureUsers(admin, createdUserIds);
      const cleanupCounts = await countFixtureRows(admin, createdUserIds);
      invariant(
        cleanupCounts.every((count) => count === 0),
        "Fixture cleanup left business rows",
      );
    }
  }
}

async function main() {
  try {
    const result = await runAuthIsolationHarness();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
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

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      runtime,
      environment: {
        appOriginConfigured: Boolean(process.env.NEXT_PUBLIC_APP_ORIGIN),
        supabaseUrlConfigured: Boolean(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
        ),
        serverProbeConfigured: Boolean(
          process.env.LABFLOW_M0_SERVER_ONLY_PROBE,
        ),
      },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

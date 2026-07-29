import { NextResponse } from "next/server";

import { sanitizeNextPath } from "../../../lib/auth/next-path";

export function GET(request: Request): NextResponse {
  const url = new URL(request.url);
  const safeNext = sanitizeNextPath(url.searchParams.get("next"));

  return NextResponse.json(
    {
      status: "placeholder",
      safeNext,
      exchangePerformed: false,
    },
    {
      status: 501,
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

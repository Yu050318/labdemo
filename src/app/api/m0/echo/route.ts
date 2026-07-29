import { NextResponse } from "next/server";

const MAX_PROBE_LENGTH = 64;

interface EchoPayload {
  probe: string;
}

function isEchoPayload(value: unknown): value is EchoPayload {
  if (typeof value !== "object" || value === null || !("probe" in value)) {
    return false;
  }

  const probe = value.probe;
  return (
    typeof probe === "string" &&
    probe.length > 0 &&
    probe.length <= MAX_PROBE_LENGTH
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json().catch(() => null);

  if (!isEchoPayload(payload)) {
    return NextResponse.json(
      { accepted: false, error: "INVALID_PROBE" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    accepted: true,
    probe: payload.probe,
  });
}

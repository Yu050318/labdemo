import { NextResponse } from "next/server";

export function GET(): NextResponse {
  const response = NextResponse.json({ cookie: "set" });

  response.cookies.set({
    name: "labflow_m0_cookie",
    value: "verified",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return response;
}

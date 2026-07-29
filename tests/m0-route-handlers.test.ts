import { describe, expect, it } from "vitest";

import { GET as authCallback } from "../src/app/auth/callback/route";
import { GET as cookieProbe } from "../src/app/api/m0/cookie/route";
import { POST as echoProbe } from "../src/app/api/m0/echo/route";
import { GET as healthProbe } from "../src/app/api/m0/health/route";
import { GET as streamProbe } from "../src/app/api/m0/stream/route";

describe("M0 Route Handlers", () => {
  it("returns an SSR/runtime health payload without environment values", async () => {
    const response = await healthProbe();
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      runtime: "nodejs",
    });
    expect(JSON.stringify(payload)).not.toContain("placeholder-anon-key");
  });

  it("accepts a bounded JSON POST payload", async () => {
    const request = new Request("https://labflow.example/api/m0/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: "sites-m0" }),
    });

    const response = await echoProbe(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: true,
      probe: "sites-m0",
    });
  });

  it("sets a secure HTTP-only probe cookie", async () => {
    const response = await cookieProbe();
    const cookie = response.headers.get("set-cookie");

    expect(cookie).toContain("labflow_m0_cookie=verified");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
  });

  it("streams more than one response chunk", async () => {
    const response = await streamProbe();

    expect(response.headers.get("content-type")).toContain("text/plain");
    await expect(response.text()).resolves.toBe("sites-m0\nstream-ok\n");
  });

  it("keeps Auth callback next values on the current origin", async () => {
    const unsafe = await authCallback(
      new Request(
        "https://labflow.example/auth/callback?next=https://attacker.example",
      ),
    );
    const safe = await authCallback(
      new Request("https://labflow.example/auth/callback?next=/today"),
    );

    await expect(unsafe.json()).resolves.toMatchObject({ safeNext: "/" });
    await expect(safe.json()).resolves.toMatchObject({ safeNext: "/today" });
  });
});

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const publicPath = (...segments: string[]) =>
  resolve(process.cwd(), "public", ...segments);

describe("PWA assets", () => {
  it("declares an installable standalone manifest", async () => {
    const manifest = JSON.parse(
      await readFile(publicPath("manifest.webmanifest"), "utf8"),
    ) as Record<string, unknown>;

    expect(manifest).toMatchObject({
      name: "LabFlow",
      short_name: "LabFlow",
      start_url: "/",
      display: "standalone",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512" }),
      ]),
    );
  });

  it("replaces old shell caches during activation", async () => {
    const serviceWorker = await readFile(publicPath("sw.js"), "utf8");

    expect(serviceWorker).toContain('const CACHE_VERSION = "labflow-m0-v1"');
    expect(serviceWorker).toContain("self.skipWaiting()");
    expect(serviceWorker).toContain("clients.claim()");
    expect(serviceWorker).toContain("caches.delete");
  });

  it("does not cache API or Auth callback responses", async () => {
    const serviceWorker = await readFile(publicPath("sw.js"), "utf8");

    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain(
      'url.pathname.startsWith("/auth/callback")',
    );
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import M0Page from "../src/app/page";

describe("Sites M0 page", () => {
  it("renders a server-generated technical baseline without product data", async () => {
    const markup = renderToStaticMarkup(await M0Page());

    expect(markup).toContain("LabFlow Sites M0");
    expect(markup).toContain("Waiting for the approved visual source");
    expect(markup).toContain("/api/m0/health");
    expect(markup).toContain("Server render timestamp");
    expect(markup).not.toContain("experiment protocol");
  });
});

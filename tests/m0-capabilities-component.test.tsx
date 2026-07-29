import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { M0Capabilities } from "../src/components/m0-capabilities";

describe("M0Capabilities", () => {
  it("renders a neutral capability probe with in-app fallback disclosure", () => {
    const markup = renderToStaticMarkup(<M0Capabilities />);

    expect(markup).toContain("Browser capability probe");
    expect(markup).toContain("In-app notifications remain the fallback");
    expect(markup).not.toContain("service_role");
  });
});

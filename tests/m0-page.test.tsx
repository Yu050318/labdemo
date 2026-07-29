import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import G3StaticPage from "../src/app/page";

describe("G3 static visual page", () => {
  it("renders the default Field Ledger view without real product data", async () => {
    const markup = renderToStaticMarkup(await G3StaticPage());

    expect(markup).toContain("LabFlow");
    expect(markup).toContain("今日工作台");
    expect(markup).toContain("D01");
    expect(markup).not.toContain("LabFlow Sites M0");
  });

  it("renders the requested page and state in the first server response", async () => {
    const markup = renderToStaticMarkup(
      await G3StaticPage({
        searchParams: Promise.resolve({
          page: "W03",
          state: "offline",
          qa: "1",
        }),
      }),
    );

    expect(markup).toContain("实验执行");
    expect(markup).toContain("W03");
    expect(markup).toContain("当前处于离线状态");
    expect(markup).not.toContain("静态设计检查器");
  });
});

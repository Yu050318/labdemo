async (page) => {
  const base = "http://127.0.0.1:4311/";
  const pageIds = [
    "A01", "A02", "A03", "O01", "D01", "S01", "S02", "W01", "W02",
    "W03", "W04", "K01", "K02", "K03", "T01", "N01", "H01", "H02",
    "M01", "P01", "X01", "R01", "C01",
  ];
  const routeIssues = [];
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const pageId of pageIds) {
      await page.goto(`${base}?page=${pageId}&state=normal&qa=1`);
      await page.waitForLoadState("networkidle");
      const result = await page.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        inspector: document.querySelectorAll(".design-inspector").length,
        title: document.title,
      }));

      if (result.h1 !== 1) {
        routeIssues.push(`${viewport.width}px ${pageId}: h1=${result.h1}`);
      }
      if (result.overflow > 1) {
        routeIssues.push(
          `${viewport.width}px ${pageId}: overflow=${result.overflow}`,
        );
      }
      if (result.inspector !== 0) {
        routeIssues.push(
          `${viewport.width}px ${pageId}: QA inspector visible`,
        );
      }
      if (result.title !== "LabFlow · 实验记录台") {
        routeIssues.push(`${viewport.width}px ${pageId}: wrong title`);
      }
    }
  }

  const stateCases = [
    ["D01", "normal"],
    ["D01", "loading"],
    ["K01", "empty"],
    ["R01", "error"],
    ["W04", "disabled"],
    ["W04", "offline"],
    ["W04", "conflict"],
    ["N01", "notification-unavailable"],
    ["C01", "account-pending-deletion"],
    ["K01", "dense"],
  ];
  const stateResults = [];
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [pageId, state] of stateCases) {
    await page.goto(`${base}?page=${pageId}&state=${state}&qa=1`);
    await page.waitForLoadState("networkidle");
    stateResults.push(
      await page.evaluate(
        ({ expectedPage, expectedState }) => ({
          expectedPage,
          expectedState,
          h1: document.querySelectorAll("h1").length,
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          inspector: document.querySelectorAll(".design-inspector").length,
          bodyHasContent: (document.body.textContent?.trim().length ?? 0) > 100,
        }),
        { expectedPage: pageId, expectedState: state },
      ),
    );
  }

  const incrementCases = [
    {
      pageId: "H02",
      state: "normal",
      needles: ["CMP-0728-02", "撤销完成", "首次完成"],
    },
    {
      pageId: "W04",
      state: "offline",
      needles: ["2 条 outbox 未发送", "完成已阻止"],
    },
    {
      pageId: "W04",
      state: "normal",
      needles: ["无法提前发现其他离线设备尚未上报的操作"],
    },
    {
      pageId: "W04",
      state: "conflict",
      needles: ["PARENT_COMPLETED", "采用最新状态", "重新应用我的动作"],
    },
    {
      pageId: "K02",
      state: "normal",
      needles: ["最新生效归档", "最新生效完成归档"],
    },
  ];
  const incrementResults = [];
  for (const testCase of incrementCases) {
    await page.goto(
      `${base}?page=${testCase.pageId}&state=${testCase.state}&qa=1`,
    );
    await page.waitForLoadState("networkidle");
    incrementResults.push(
      await page.evaluate(
        ({ pageId, state, needles }) => {
          const text = document.body.textContent ?? "";
          return {
            pageId,
            state,
            checks: needles.map((needle) => ({
              needle,
              present: text.includes(needle),
            })),
          };
        },
        testCase,
      ),
    );
  }

  const accessibilityResults = [];
  for (const testCase of [
    { pageId: "D01", state: "normal", width: 1440, height: 900 },
    { pageId: "W03", state: "offline", width: 390, height: 844 },
    {
      pageId: "C01",
      state: "account-pending-deletion",
      width: 390,
      height: 844,
    },
  ]) {
    await page.setViewportSize({
      width: testCase.width,
      height: testCase.height,
    });
    await page.goto(
      `${base}?page=${testCase.pageId}&state=${testCase.state}&qa=1`,
    );
    await page.waitForLoadState("networkidle");

    const structure = await page.evaluate(() => {
      const visibleTargets = [
        ...document.querySelectorAll(
          "button, a, input, select, textarea, summary",
        ),
      ].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      return {
        main: document.querySelectorAll("main").length,
        h1: document.querySelectorAll("h1").length,
        unlabeledButtons: [...document.querySelectorAll("button")].filter(
          (button) =>
            !(button.getAttribute("aria-label") || button.textContent?.trim()),
        ).length,
        undersized: visibleTargets
          .filter((element) => !["checkbox", "radio"].includes(element.type))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              label:
                element.getAttribute("aria-label") ||
                element.textContent?.trim().slice(0, 40) ||
                element.name,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((target) => target.width < 44 || target.height < 44),
      };
    });

    const focusTrail = [];
    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      focusTrail.push(
        await page.evaluate(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return {
            tag: element?.tagName,
            label:
              element?.getAttribute("aria-label") ||
              element?.textContent?.trim().slice(0, 40) ||
              element?.name,
            outlineWidth: style.outlineWidth,
            outlineStyle: style.outlineStyle,
          };
        }),
      );
    }
    accessibilityResults.push({ ...testCase, structure, focusTrail });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}?page=D01&state=normal&qa=1`);
  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-g3-next-desktop-1440x900.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}?page=W03&state=offline&qa=1`);
  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-g3-next-mobile-390x844.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${base}?page=D01&state=normal&qa=1`);
  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-g3-next-mobile-320x844.png",
    fullPage: false,
  });

  return {
    pagesChecked: pageIds.length,
    routeChecks: pageIds.length * 2,
    routeIssues,
    consoleErrors,
    stateResults,
    incrementResults,
    accessibilityResults,
  };
}

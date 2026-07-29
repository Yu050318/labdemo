async (page) => {
  const cases = [
    {
      pageId: "D01",
      state: "normal",
      actions: ["开始计时", "查看步骤详情"],
    },
    {
      pageId: "W03",
      state: "offline",
      actions: ["重试", "完成步骤", "跳过"],
    },
    {
      pageId: "W04",
      state: "conflict",
      actions: ["采用最新状态", "重新应用我的动作"],
    },
    {
      pageId: "C01",
      state: "account-pending-deletion",
      actions: ["撤销账户删除", "退出"],
    },
  ];
  const results = [];

  for (const testCase of cases) {
    await page.goto(
      `http://127.0.0.1:4311/?page=${testCase.pageId}&state=${testCase.state}&qa=1`,
    );
    await page.waitForLoadState("networkidle");

    const layout = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      devicePixelRatio,
      visualViewportScale: visualViewport?.scale ?? null,
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      h1: document.querySelectorAll("h1").length,
      fixedBars: [".mobile-timer-bar", ".mobile-nav"]
        .map((selector) => document.querySelector(selector))
        .filter(Boolean)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            className: element.className,
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            visible: rect.width > 0 && rect.height > 0,
          };
        }),
    }));

    const actions = [];
    for (const name of testCase.actions) {
      const locator = page.getByRole("button", { name, exact: true });
      const count = await locator.count();
      if (count !== 1) {
        actions.push({ name, count, reachable: false });
        continue;
      }

      await locator.scrollIntoViewIfNeeded();
      await locator.focus();
      await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const fixedTop = [".mobile-timer-bar", ".mobile-nav"]
          .map((selector) => document.querySelector(selector))
          .filter(Boolean)
          .map((fixed) => fixed.getBoundingClientRect().top)
          .reduce((minimum, top) => Math.min(minimum, top), innerHeight);
        if (rect.bottom > fixedTop) {
          scrollBy(0, rect.bottom - fixedTop + 12);
        }
      });
      actions.push(
        await locator.evaluate((element, actionName) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const centerX = Math.max(
            0,
            Math.min(innerWidth - 1, rect.left + rect.width / 2),
          );
          const centerY = Math.max(
            0,
            Math.min(innerHeight - 1, rect.top + rect.height / 2),
          );
          const topElement = document.elementFromPoint(centerX, centerY);
          return {
            name: actionName,
            rect: {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            focus: {
              outlineWidth: style.outlineWidth,
              outlineStyle: style.outlineStyle,
            },
            reachable:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight &&
              (topElement === element || element.contains(topElement)),
          };
        }, name),
      );
    }

    results.push({ ...testCase, layout, actions });
  }

  await page.goto(
    "http://127.0.0.1:4311/?page=D01&state=normal&qa=1",
  );
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-g3-native-200-edge.png",
    fullPage: false,
  });

  return results;
}

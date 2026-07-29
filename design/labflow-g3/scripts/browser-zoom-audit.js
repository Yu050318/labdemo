async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4173/?page=D01;state=normal;qa=1");
  const before = await page.evaluate(() => ({ innerWidth, devicePixelRatio }));
  await page.keyboard.press("Control++");
  await page.keyboard.press("Control++");
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    innerWidth,
    devicePixelRatio,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  await page.screenshot({
    path: "D:/学习/labdemo/design/labflow-g3/output/playwright/zoom-200-browser.png",
  });
  return { before, after };
}

async (page) => {
  const result = await page.evaluate(() => ({
    innerWidth,
    outerWidth,
    devicePixelRatio,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    h1: document.querySelectorAll("h1").length,
  }));

  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-g3-native-200.png",
    fullPage: true,
  });

  return result;
}

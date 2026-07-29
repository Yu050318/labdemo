async (page) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("http://127.0.0.1:4173/?page=D01;state=normal;qa=1");
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className?.toString().slice(0, 100),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        };
      })
      .filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1)
      .slice(0, 30),
  );
}

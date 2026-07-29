async (page) => {
  const pageIds = [
    "A01", "A02", "A03", "O01", "D01", "S01", "S02", "W01", "W02", "W03",
    "W04", "K01", "K02", "K03", "T01", "N01", "H01", "H02", "M01", "P01",
    "X01", "R01", "C01",
  ];
  const issues = [];
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const id of pageIds) {
      await page.goto(`http://127.0.0.1:4173/?page=${id};state=normal;qa=1`);
      await page.waitForLoadState("networkidle");
      const result = await page.evaluate(() => ({
        h1: document.querySelectorAll("h1").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        title: document.title,
      }));
      if (result.h1 !== 1) issues.push(`${viewport.width}px ${id}: expected one h1, got ${result.h1}`);
      if (result.overflow > 1) issues.push(`${viewport.width}px ${id}: horizontal overflow ${result.overflow}px`);
      if (result.title !== "LabFlow · 实验记录台") issues.push(`${viewport.width}px ${id}: wrong document title`);
    }
  }

  return {
    pagesChecked: pageIds.length,
    viewportsChecked: 2,
    routeChecks: pageIds.length * 2,
    issues,
    consoleErrors,
  };
}

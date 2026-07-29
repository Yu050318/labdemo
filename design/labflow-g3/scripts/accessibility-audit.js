async (page) => {
  const cases = [
    { page: "D01", state: "normal", width: 1440, height: 900 },
    { page: "W03", state: "normal", width: 390, height: 844 },
    { page: "C01", state: "account-pending-deletion", width: 390, height: 844 },
  ];
  const results = [];

  for (const testCase of cases) {
    await page.setViewportSize({ width: testCase.width, height: testCase.height });
    await page.goto(`http://127.0.0.1:4173/?page=${testCase.page};state=${testCase.state};qa=1`);
    await page.waitForLoadState("networkidle");

    const structure = await page.evaluate(() => {
      const targets = [...document.querySelectorAll("button, a, input, select, textarea, summary")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        })
        .filter((element) => !["checkbox", "radio"].includes(element.type))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 50) || element.name,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });
      return {
        main: document.querySelectorAll("main").length,
        nav: document.querySelectorAll("nav").length,
        unlabeledButtons: [...document.querySelectorAll("button")].filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim())).length,
        undersized: targets.filter((target) => target.width < 44 || target.height < 44),
      };
    });

    const focusTrail = [];
    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      focusTrail.push(await page.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        return {
          tag: element.tagName,
          label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 40) || element.name,
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
        };
      }));
    }

    results.push({ ...testCase, structure, focusTrail });
  }

  return results;
}

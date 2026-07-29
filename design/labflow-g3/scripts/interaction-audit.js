async (page) => {
  const checks = [];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4173/?page=D01;state=normal;qa=1");

  await page.getByRole("button", { name: "开始计时" }).click();
  checks.push({
    action: "D01 开始计时 → W03",
    passed: page.url().includes("page=W03") && await page.getByRole("heading", { level: 1 }).innerText() === "实验执行",
  });

  await page.getByRole("button", { name: "日程", exact: true }).click();
  checks.push({
    action: "主导航 → S01",
    passed: page.url().includes("page=S01") && await page.getByRole("heading", { level: 1 }).innerText() === "实验日程",
  });

  await page.goto("http://127.0.0.1:4173/?page=D01;state=normal;qa=1");
  const conflictDetails = page.locator(".secondary-details");
  await conflictDetails.locator("summary").click();
  checks.push({
    action: "冲突次级区域折叠",
    passed: !await conflictDetails.getAttribute("open"),
  });

  await page.goto("http://127.0.0.1:4173/?page=C01;state=account-pending-deletion;qa=1");
  checks.push({
    action: "账户待删除隔离导航",
    passed: await page.locator("nav").count() === 0 && await page.getByRole("button", { name: "撤销账户删除" }).isVisible(),
  });

  return checks;
}

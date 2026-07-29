async (page) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("http://127.0.0.1:4311/");
  await page.waitForLoadState("networkidle");

  const result = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const manifestResponse = await fetch("/manifest.webmanifest");
    const manifest = await manifestResponse.json();
    const cacheNames = await caches.keys();

    return {
      title: document.title,
      h1: document.querySelectorAll("h1").length,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      secureContext: window.isSecureContext,
      serviceWorker: {
        registered: Boolean(registration),
        controlled: Boolean(navigator.serviceWorker.controller),
        scope: registration.scope,
      },
      pushSupported:
        "PushManager" in window && "Notification" in window,
      manifest: {
        status: manifestResponse.status,
        display: manifest.display,
        startUrl: manifest.start_url,
        scope: manifest.scope,
        iconSizes: manifest.icons?.map((icon) => icon.sizes),
      },
      cacheNames,
    };
  });

  await page.screenshot({
    path: "D:/学习/labdemo/output/playwright/qa-sites-m0-mobile-320.png",
    fullPage: true,
  });

  return result;
}

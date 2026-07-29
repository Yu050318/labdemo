"use client";

import { useEffect, useState } from "react";

import {
  assessPushCapability,
  type PushCapability,
} from "../lib/pwa/push-capability";

type ServiceWorkerState = "checking" | "registered" | "unsupported" | "failed";

export function M0Capabilities() {
  const [serviceWorkerState, setServiceWorkerState] =
    useState<ServiceWorkerState>("checking");
  const [pushCapability, setPushCapability] = useState<PushCapability | null>(
    null,
  );

  useEffect(() => {
    const capability = assessPushCapability({
      secureContext: window.isSecureContext,
      serviceWorker: "serviceWorker" in navigator,
      pushManager: "PushManager" in window,
      notification: "Notification" in window,
    });
    queueMicrotask(() => setPushCapability(capability));

    if (!("serviceWorker" in navigator)) {
      queueMicrotask(() => setServiceWorkerState("unsupported"));
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => setServiceWorkerState("registered"))
      .catch(() => setServiceWorkerState("failed"));
  }, []);

  return (
    <section aria-labelledby="browser-capabilities-title">
      <h2 id="browser-capabilities-title">Browser capability probe</h2>
      <dl>
        <div>
          <dt>Service Worker</dt>
          <dd data-testid="service-worker-state">{serviceWorkerState}</dd>
        </div>
        <div>
          <dt>Web Push</dt>
          <dd data-testid="push-state">
            {pushCapability?.status ?? "checking"}
          </dd>
        </div>
        <div>
          <dt>Secure context</dt>
          <dd>{pushCapability?.reason ?? "checking"}</dd>
        </div>
      </dl>
      <p>
        In-app notifications remain the fallback when permission is denied,
        browser support is unavailable, registration fails, or delivery is
        delayed.
      </p>
    </section>
  );
}

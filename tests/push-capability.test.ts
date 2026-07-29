import { describe, expect, it } from "vitest";

import { assessPushCapability } from "../src/lib/pwa/push-capability";

describe("assessPushCapability", () => {
  it("reports Web Push as available only when every browser primitive exists", () => {
    expect(
      assessPushCapability({
        secureContext: true,
        serviceWorker: true,
        pushManager: true,
        notification: true,
      }),
    ).toEqual({
      status: "available",
      fallback: "in_app",
      reason: null,
    });
  });

  it("uses an in-app fallback outside a secure context", () => {
    expect(
      assessPushCapability({
        secureContext: false,
        serviceWorker: true,
        pushManager: true,
        notification: true,
      }),
    ).toEqual({
      status: "unavailable",
      fallback: "in_app",
      reason: "secure_context_required",
    });
  });

  it("uses an in-app fallback when Push APIs are unsupported", () => {
    expect(
      assessPushCapability({
        secureContext: true,
        serviceWorker: true,
        pushManager: false,
        notification: true,
      }),
    ).toEqual({
      status: "unavailable",
      fallback: "in_app",
      reason: "push_api_unsupported",
    });
  });
});

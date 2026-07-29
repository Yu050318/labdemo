export interface PushEnvironment {
  secureContext: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
}

export type PushCapability =
  | {
      status: "available";
      fallback: "in_app";
      reason: null;
    }
  | {
      status: "unavailable";
      fallback: "in_app";
      reason:
        | "secure_context_required"
        | "service_worker_unsupported"
        | "push_api_unsupported"
        | "notification_api_unsupported";
    };

export function assessPushCapability(
  environment: PushEnvironment,
): PushCapability {
  if (!environment.secureContext) {
    return {
      status: "unavailable",
      fallback: "in_app",
      reason: "secure_context_required",
    };
  }

  if (!environment.serviceWorker) {
    return {
      status: "unavailable",
      fallback: "in_app",
      reason: "service_worker_unsupported",
    };
  }

  if (!environment.pushManager) {
    return {
      status: "unavailable",
      fallback: "in_app",
      reason: "push_api_unsupported",
    };
  }

  if (!environment.notification) {
    return {
      status: "unavailable",
      fallback: "in_app",
      reason: "notification_api_unsupported",
    };
  }

  return {
    status: "available",
    fallback: "in_app",
    reason: null,
  };
}

import { assertPilotReleaseReady } from "@/lib/security/release-readiness";
import type { Instrumentation } from "next";
import { logSecurityEvent } from "@/lib/security/security-log";

/** Do not serialize the framework error, request headers, cookies, body or URL. */
export const onRequestError: Instrumentation.onRequestError = () => {
  logSecurityEvent("REQUEST_ERROR", "error");
};

export function register() {
  assertPilotReleaseReady();
}

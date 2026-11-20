import { describe, expect, it } from "vitest";
import { runRetryableFormAction } from "./retryable-action";
describe("retryable form actions", () => {
  it("preserves the exact form and request key across a failed transport and retry", async () => { const form = new FormData(); form.set("idempotencyKey", "same-request"); form.set("points1", "30000"); let attempts = 0; const action = async (_state: { message?: string }, input: FormData) => { expect(input).toBe(form); if (!attempts++) throw new TypeError("Network error"); return { message: "Saved" }; }; const failed = await runRetryableFormAction(action, {}, form); expect(failed.message).toContain("入力は残っています"); expect(await runRetryableFormAction(action, failed, form)).toEqual({ message: "Saved" }); expect(form.get("idempotencyKey")).toBe("same-request"); });
  it("does not leak an exception's private text", async () => { const result = await runRetryableFormAction(async () => { throw new Error("private-db-and-customer-data"); }, {}, new FormData()); expect(JSON.stringify(result)).not.toContain("private-db-and-customer-data"); });
  it("lets framework login redirects proceed", async () => { const error = { digest: "NEXT_REDIRECT;replace;/admin/login;303;" }; await expect(runRetryableFormAction(async () => { throw error; }, {}, new FormData())).rejects.toBe(error); });
});

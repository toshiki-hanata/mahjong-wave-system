import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeReceptionName } from "@/features/visits/reception-schemas";

export const QR_RECEPTION_POLICY = Object.freeze({ formMs: 15 * 60_000, pendingMs: 30 * 60_000, receiptSeconds: 86400, ipWindowMs: 60_000, ipMaximum: 30, storeMaximum: 120, pendingMaximum: 100 });
export const storeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const receptionNameSchema = z.string().max(240).transform(normalizeReceptionName).pipe(z.string().min(1, "お名前・呼び名を入力してください。").max(120, "お名前は120文字以内にしてください。").refine(v => !/[\u0000-\u001f\u007f]/.test(v), "お名前を確認してください。"));
export const submissionSchema = z.object({ name: receptionNameSchema, token: z.string().max(180) });
export const reviewSchema = z.object({ requestId: z.string().min(1).max(200), mode: z.enum(["existing", "new"]), customerId: z.string().max(200), newName: z.string().max(240), personConfirmed: z.literal(true), differentPersonConfirmed: z.boolean() });
export type ReceptionReview = z.infer<typeof reviewSchema>;

export function qrReceptionEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean { return env.QR_RECEPTION_ENABLED === "true"; }
export function receptionOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const url = new URL(env.APP_ORIGIN ?? "http://localhost:3000");
  if (url.origin !== (env.APP_ORIGIN ?? "http://localhost:3000") || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost" && !env.VERCEL_ENV))) throw new Error("QR受付の公開先を確認してください。");
  return url.origin;
}
function sign(purpose: string, value: string, secret: string): string {
  if (secret.length < 32) throw new Error("QR受付の認証設定を確認してください。");
  return createHmac("sha256", secret).update(`wave-qr-reception:v1:${purpose}\0${value}`).digest("hex");
}
function equal(a: string, b: string): boolean { return /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
export function stationKey(storeId: string, revision: number, secret: string): string {
  storeIdSchema.parse(storeId);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid QR revision");
  return `${revision}.${sign("station", `${storeId}\0${revision}`, secret)}`;
}
export function validStationKey(storeId: string, revision: number, key: string, secret: string): boolean {
  if (!storeIdSchema.safeParse(storeId).success || key.length > 90) return false;
  const match = /^([1-9]\d{0,9})\.([a-f0-9]{64})$/.exec(key);
  return Boolean(match && match[1] === String(revision) && equal(match[2], sign("station", `${storeId}\0${revision}`, secret)));
}
export function createReceptionToken(storeId: string, key: string, secret: string, now = new Date()): string {
  const payload = `${now.getTime()}.${randomBytes(32).toString("hex")}`;
  return `${payload}.${sign("form", `${storeId}\0${key}\0${payload}`, secret)}`;
}
export function validReceptionToken(storeId: string, key: string, token: string, secret: string, maximumAgeMs = QR_RECEPTION_POLICY.formMs, now = new Date()): boolean {
  if (token.length > 180) return false;
  const match = /^(\d{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
  if (!match) return false;
  const age = now.getTime() - Number(match[1]);
  return age >= -30_000 && age <= maximumAgeMs && equal(match[3], sign("form", `${storeId}\0${key}\0${match[1]}.${match[2]}`, secret));
}
export function receiptHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function receptionCookieName(storeId: string): string { return `wave_qr_${receiptHash(storeId).slice(0, 12)}`; }
export function receptionRateKey(storeId: string, address: string, secret: string): string { return sign("rate", `${storeId}\0${address || "unknown"}`, secret); }
export function receptionUrl(storeId: string, revision: number, secret: string, origin: string): string {
  const url = new URL(`/reception/${encodeURIComponent(storeId)}`, origin); url.searchParams.set("key", stationKey(storeId, revision, secret)); return url.toString();
}

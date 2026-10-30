import "server-only";
import { createHash, randomBytes } from "node:crypto";

export function createAuthToken(): string { return randomBytes(32).toString("base64url"); }
export function isAuthToken(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value); }
export function hashAuthToken(value: string): string { return createHash("sha256").update(value).digest("hex"); }

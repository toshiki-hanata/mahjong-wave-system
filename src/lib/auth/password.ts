import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";

const BCRYPT_COST = 12;
let dummyHashPromise: Promise<string> | undefined;

/** A per-process, non-account hash used to equalize the unknown-login path. */
export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hash(randomBytes(32).toString("base64url"), BCRYPT_COST);
  return dummyHashPromise;
}

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password exceeds the maximum supported UTF-8 length.");
  }
  return hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (Buffer.byteLength(password, "utf8") > 72) return false;
  return compare(password, passwordHash);
}

import type { Role } from "@prisma/client";
import { z } from "zod";

export type AdminSessionData = {
  staffId?: string;
  storeId?: string;
  role?: Role;
  sessionVersion?: number;
};

const sessionSchema = z.object({
  staffId: z.string().min(1),
  storeId: z.string().min(1),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]),
  sessionVersion: z.number().int().nonnegative(),
});

export function parseAdminSession(value: AdminSessionData) {
  return sessionSchema.safeParse(value);
}

export function isSessionVersionCurrent(cookieVersion: number | undefined, databaseVersion: number): boolean {
  return Number.isInteger(cookieVersion) && cookieVersion === databaseVersion;
}

import { beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { authenticateStaff, type CredentialStaff } from "./credentials";
import { hasAnyRole, hasRole } from "./authorization";
import { hashPassword, verifyPassword } from "./password";
import { isSessionVersionCurrent, parseAdminSession } from "./session-data";
import { isProtectedAdminPath, shouldRedirectToLogin } from "./proxy-rules";

describe("staff authentication primitives", () => {
  let storedHash: string;

  beforeAll(async () => {
    storedHash = await hashPassword("correct-horse-battery");
  });

  it("stores a password hash and verifies only the matching password", async () => {
    expect(storedHash).not.toBe("correct-horse-battery");
    expect(storedHash).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword("correct-horse-battery", storedHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", storedHash)).resolves.toBe(false);
  });

  it("authenticates an active staff account and rejects a disabled staff account", async () => {
    const activeStaff: CredentialStaff = {
      id: "staff-1", storeId: "store-1", name: "Test Staff", loginId: "staff",
      passwordHash: storedHash, role: Role.STAFF, isActive: true, sessionVersion: 0, store: { isActive: true },
    };
    const repository = { findByLoginId: async () => activeStaff };
    await expect(authenticateStaff("staff", "correct-horse-battery", repository)).resolves.toEqual(activeStaff);
    await expect(authenticateStaff("staff", "incorrect", repository)).resolves.toBeNull();
    await expect(authenticateStaff("staff", "correct-horse-battery", {
      findByLoginId: async () => ({ ...activeStaff, isActive: false }),
    })).resolves.toBeNull();
    await expect(authenticateStaff("staff", "correct-horse-battery", {
      findByLoginId: async () => ({ ...activeStaff, store: { isActive: false } }),
    })).resolves.toBeNull();
  });

  it.each([Role.STAFF, Role.MANAGER, Role.OWNER])("uses the same credential path for %s", async (role) => {
    const account: CredentialStaff = {
      id: `staff-${role}`, storeId: "store-1", name: "Role Test", loginId: role.toLowerCase(),
      passwordHash: storedHash, role, isActive: true, sessionVersion: 0, store: { isActive: true },
    };
    await expect(authenticateStaff(account.loginId, "correct-horse-battery", { findByLoginId: async () => account })).resolves.toMatchObject({ role });
    await expect(authenticateStaff(account.loginId, "wrong", { findByLoginId: async () => account })).resolves.toBeNull();
  });

  it("enforces the OWNER > MANAGER > STAFF role order", () => {
    expect(hasRole(Role.OWNER, Role.MANAGER)).toBe(true);
    expect(hasRole(Role.MANAGER, Role.STAFF)).toBe(true);
    expect(hasRole(Role.STAFF, Role.MANAGER)).toBe(false);
    expect(hasAnyRole(Role.MANAGER, [Role.OWNER, Role.MANAGER])).toBe(true);
    expect(hasAnyRole(Role.STAFF, [Role.OWNER, Role.MANAGER])).toBe(false);
  });

  it("accepts a complete session context and rejects incomplete or unknown roles", () => {
    expect(parseAdminSession({ staffId: "staff-1", storeId: "store-1", role: Role.OWNER, sessionVersion: 0 }).success).toBe(true);
    expect(parseAdminSession({ staffId: "staff-1", storeId: "", role: Role.OWNER }).success).toBe(false);
    expect(parseAdminSession({ staffId: "staff-1", storeId: "store-1", role: "SUPERUSER" as never }).success).toBe(false);
  });

  it("accepts only matching session versions and rejects revoked cookies", () => {
    expect(isSessionVersionCurrent(2, 2)).toBe(true);
    expect(isSessionVersionCurrent(1, 2)).toBe(false);
    expect(isSessionVersionCurrent(undefined, 0)).toBe(false);
  });

  it("runs a password verification path for an unknown login ID", async () => {
    const findByLoginId = async () => null;
    await expect(authenticateStaff("unknown", "incorrect", { findByLoginId })).resolves.toBeNull();
  });

  it("redirects protected admin paths without a session cookie and leaves login public", () => {
    expect(isProtectedAdminPath("/admin")).toBe(true);
    expect(shouldRedirectToLogin("/admin/customers", false)).toBe(true);
    expect(shouldRedirectToLogin("/admin/customers", true)).toBe(false);
    expect(shouldRedirectToLogin("/admin/login", false)).toBe(false);
  });
});

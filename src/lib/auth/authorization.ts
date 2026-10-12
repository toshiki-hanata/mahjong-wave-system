import type { Role } from "@prisma/client";

const roleRank: Record<Role, number> = {
  STAFF: 1,
  MANAGER: 2,
  OWNER: 3,
};

/** Returns true when the current role meets the minimum role threshold. */
export function hasRole(currentRole: Role, requiredRole: Role): boolean {
  return roleRank[currentRole] >= roleRank[requiredRole];
}

export function hasAnyRole(currentRole: Role, allowedRoles: readonly Role[]): boolean {
  return allowedRoles.includes(currentRole);
}

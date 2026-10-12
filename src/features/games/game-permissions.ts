import { Role } from "@prisma/client";

export const gameEntryRoles = [Role.OWNER, Role.MANAGER, Role.STAFF] as const;
export const gameCorrectionRoles = [Role.OWNER, Role.MANAGER] as const;
export const storeRuleRoles = [Role.OWNER, Role.MANAGER] as const;

import { Role } from "@prisma/client";

export const tableOperationRoles = [Role.OWNER, Role.MANAGER, Role.STAFF] as const;
export const tableManagementRoles = [Role.OWNER, Role.MANAGER] as const;


import { Role } from "@prisma/client";

export const visitOperationRoles = [Role.OWNER, Role.MANAGER, Role.STAFF] as const;
export const futureVisitCorrectionRoles = [Role.OWNER, Role.MANAGER] as const;

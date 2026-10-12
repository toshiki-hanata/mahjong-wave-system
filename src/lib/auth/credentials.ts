import type { Role } from "@prisma/client";
import { getDummyPasswordHash, verifyPassword } from "./password";

export type CredentialStaff = {
  id: string;
  storeId: string;
  name: string;
  loginId: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  sessionVersion: number;
  store: { isActive: boolean };
};

export type CredentialRepository = {
  findByLoginId(loginId: string): Promise<CredentialStaff | null>;
};

export async function authenticateStaff(
  loginId: string,
  password: string,
  repository: CredentialRepository,
): Promise<CredentialStaff | null> {
  const [staff, dummyHash] = await Promise.all([
    repository.findByLoginId(loginId),
    getDummyPasswordHash(),
  ]);
  const passwordMatches = await verifyPassword(password, staff?.passwordHash ?? dummyHash);
  if (!staff || !passwordMatches || !staff.isActive || !staff.store.isActive) return null;
  return staff;
}

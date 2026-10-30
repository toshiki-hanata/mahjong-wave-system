"use server";
import { prisma } from "@/lib/prisma";
import { createAuthToken, isAuthToken, hashAuthToken } from "@/features/customer-auth/auth-tokens";
import { readPairingClaim, requireCustomerOrigin, writePairingClaim } from "@/features/customer-auth/pairing-cookie";
import { claimCustomerPairing, confirmCustomerPairing, readClaimedPairing, type CustomerLinkState } from "@/features/customer-auth/pairing-service";

const invalid: CustomerLinkState = { state: "INVALID" };
export async function claimPairingAction(token: string): Promise<CustomerLinkState> {
  try {
    await requireCustomerOrigin();
    if (!prisma || !isAuthToken(token)) return invalid;
    const previous = await readPairingClaim();
    const row = await prisma.customerPairing.findUnique({ where: { tokenHash: hashAuthToken(token) }, select: { claimHash: true } });
    const claim = previous && row?.claimHash === hashAuthToken(previous) ? previous : createAuthToken();
    const result = await claimCustomerPairing(prisma, token, claim);
    if (result.state !== "INVALID") await writePairingClaim(claim);
    return result;
  } catch { return invalid; }
}
export async function readPairingAction(): Promise<CustomerLinkState> {
  try { await requireCustomerOrigin(); return prisma ? await readClaimedPairing(prisma, await readPairingClaim()) : invalid; } catch { return invalid; }
}
export async function confirmPairingAction(): Promise<CustomerLinkState> {
  try { await requireCustomerOrigin(); return prisma ? await confirmCustomerPairing(prisma, await readPairingClaim()) : invalid; } catch { return invalid; }
}

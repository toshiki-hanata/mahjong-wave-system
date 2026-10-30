import "server-only";
import { createHash } from "node:crypto";

export type SeatSnapshot = { id: string; visitId: string; position: number };

/** Includes seat IDs so leaving and returning to the same seat still invalidates old forms. */
export function seatingToken(seats: readonly SeatSnapshot[]): string {
  const ordered = [...seats].sort((a, b) => a.position - b.position).map(({ id, visitId, position }) => ({ id, visitId, position }));
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

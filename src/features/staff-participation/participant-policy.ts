/** Provisional user decision, 2026-10-30. Keep staff identity/history when policy changes. */
export const staffParticipationPolicy = Object.freeze({
  includeInCustomerRankings: false,
  includeInCustomerRewards: false,
  provisional: true,
});

export function customerRankingParticipantFilter() {
  return staffParticipationPolicy.includeInCustomerRankings ? {} : { participantStaffId: null };
}

export function participantName(person: { internalName: string; participantStaffId?: string | null }) {
  return `${person.internalName}${person.participantStaffId ? "（スタッフ）" : ""}`;
}

export function participantCode(person: { customerCode: string; participantStaffId?: string | null }) {
  return person.participantStaffId ? "スタッフ" : person.customerCode;
}

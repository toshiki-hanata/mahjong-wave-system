/** User-approved release gate: management MFA must be implemented and accepted before production. */
export function assertPilotReleaseReady(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (env.VERCEL_ENV === "production") {
    throw new Error("管理者MFAの本番登録・受入と公開前確認が未完了のため、本番起動を停止しました。");
  }
}
// No environment switch bypasses this gate. Replace it only with the implemented
// management-MFA checks after acceptance evidence and the release review exist.

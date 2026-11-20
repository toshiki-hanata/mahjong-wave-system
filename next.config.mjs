// Approved release hold: do not build or start Vercel production until management MFA is accepted.
if (process.env.VERCEL_ENV === "production") {
  throw new Error("管理者MFAの本番登録・受入と公開前確認が未完了のため、本番ビルド・起動を停止しました。");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep build output outside OneDrive's special .next directory to avoid
  // Windows sync locks when Next replaces route-segment directories.
  distDir: "build",
};

export default nextConfig;

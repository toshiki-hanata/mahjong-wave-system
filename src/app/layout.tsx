import type { Metadata } from "next";
import "./globals.css";
import "./business-management.css";

export const metadata: Metadata = {
  title: "麻雀ウェーブ | 店舗管理",
  description: "麻雀店の卓・半荘・売上を管理するスタッフ用ダッシュボード",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}

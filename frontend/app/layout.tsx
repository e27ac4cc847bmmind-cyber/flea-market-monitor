import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "買い物ウォッチ",
  description: "メルカリ・ラクマ・PayPayフリマの新着商品をAIが監視・通知",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}

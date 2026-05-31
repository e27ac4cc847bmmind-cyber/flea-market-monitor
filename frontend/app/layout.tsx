import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "フリマ監視システム",
  description: "メルカリ・ラクマ・PayPayフリマの新着商品を監視",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}

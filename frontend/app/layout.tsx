import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev プレイグラウンド",
  description: "TypeSafe AI の判断モデル Jev を試すアプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "LabFlow · 实验记录台",
  description: "LabFlow P0 固定数据静态视觉候选",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/labflow-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#075c4c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

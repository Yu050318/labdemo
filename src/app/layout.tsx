import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "LabFlow Sites M0",
  description: "Technical compatibility baseline without user data",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/labflow-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

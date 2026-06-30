import type { Metadata, Viewport } from "next";
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Auto-Garaj — Avtoservis boshqaruvi",
  description: "Auto-shop management for Uzbekistan",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Onest:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div id="root">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}

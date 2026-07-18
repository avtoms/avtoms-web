import type { Metadata, Viewport } from "next";
import { Manrope, Golos_Text, Onest, Unbounded, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./tailwind.css";
import "flag-icons/css/flag-icons.min.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui-kit/sonner";

// Self-hosted via next/font: fonts are bundled + preloaded and a metrics-matched fallback is
// auto-generated, so text no longer flashes/resizes on load (no FOUT layout shift). Cyrillic
// subset is included for the RU/UZ-Cyrillic UI. Each font exposes a CSS variable consumed by
// globals.css, lib/theme.ts (runtime font switcher) and the landing page.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--ff-manrope", display: "swap" });
const golos = Golos_Text({ subsets: ["latin", "cyrillic"], variable: "--ff-golos", display: "swap" });
const onest = Onest({ subsets: ["latin", "cyrillic"], variable: "--ff-onest", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--ff-unbounded", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--ff-mono", display: "swap" });

const fontVars = [manrope, golos, onest, unbounded, mono].map((f) => f.variable).join(" ");

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
    <html lang="uz" className={fontVars}>
      <body>
        <div id="root">
          <Providers>{children}</Providers>
          <Toaster />
        </div>
      </body>
    </html>
  );
}

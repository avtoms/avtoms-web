// Themes + fonts ported from the prototype. applyTheme sets CSS custom properties on :root.
export type ThemeName = "workshop" | "steel" | "carbon";
export type FontName = "golos" | "manrope" | "onest";
export type Density = "compact" | "regular" | "comfy";

type ThemeDef = { label: string; dark: boolean; vars: Record<string, string> };

export const THEMES: Record<ThemeName, ThemeDef> = {
  workshop: {
    label: "Workshop", dark: false,
    vars: {
      "--bg": "oklch(0.971 0.008 75)", "--surface": "oklch(0.995 0.004 85)", "--surface-2": "oklch(0.952 0.011 75)", "--surface-3": "oklch(0.925 0.014 72)",
      "--ink": "oklch(0.235 0.012 62)", "--ink-2": "oklch(0.44 0.014 62)", "--ink-3": "oklch(0.60 0.014 65)",
      "--line": "oklch(0.892 0.012 72)", "--line-2": "oklch(0.83 0.014 70)",
      "--accent": "oklch(0.66 0.166 47)", "--accent-2": "oklch(0.60 0.172 45)", "--accent-ink": "oklch(0.99 0.005 80)", "--accent-soft": "oklch(0.945 0.05 62)",
      "--ok": "oklch(0.60 0.13 150)", "--ok-soft": "oklch(0.95 0.05 150)", "--warn": "oklch(0.71 0.145 72)", "--warn-soft": "oklch(0.95 0.06 75)",
      "--danger": "oklch(0.585 0.19 26)", "--danger-soft": "oklch(0.95 0.05 26)", "--info": "oklch(0.60 0.13 250)", "--info-soft": "oklch(0.95 0.04 250)",
      "--shadow": "0 1px 2px oklch(0.3 0.02 60 / 0.06), 0 8px 24px oklch(0.3 0.02 60 / 0.06)",
      "--shadow-lg": "0 4px 12px oklch(0.3 0.02 60 / 0.10), 0 24px 60px oklch(0.3 0.02 60 / 0.14)",
    },
  },
  steel: {
    label: "Steel", dark: false,
    vars: {
      "--bg": "oklch(0.975 0.004 250)", "--surface": "oklch(1 0 0)", "--surface-2": "oklch(0.962 0.006 250)", "--surface-3": "oklch(0.935 0.009 250)",
      "--ink": "oklch(0.245 0.022 258)", "--ink-2": "oklch(0.46 0.022 258)", "--ink-3": "oklch(0.61 0.02 258)",
      "--line": "oklch(0.905 0.009 250)", "--line-2": "oklch(0.85 0.012 250)",
      "--accent": "oklch(0.55 0.17 256)", "--accent-2": "oklch(0.49 0.18 258)", "--accent-ink": "oklch(0.99 0 0)", "--accent-soft": "oklch(0.95 0.04 256)",
      "--ok": "oklch(0.58 0.14 158)", "--ok-soft": "oklch(0.95 0.05 158)", "--warn": "oklch(0.70 0.15 70)", "--warn-soft": "oklch(0.95 0.06 72)",
      "--danger": "oklch(0.57 0.20 25)", "--danger-soft": "oklch(0.95 0.05 25)", "--info": "oklch(0.58 0.15 256)", "--info-soft": "oklch(0.95 0.04 256)",
      "--shadow": "0 1px 2px oklch(0.4 0.03 258 / 0.06), 0 8px 24px oklch(0.4 0.03 258 / 0.07)",
      "--shadow-lg": "0 4px 12px oklch(0.4 0.03 258 / 0.10), 0 24px 60px oklch(0.4 0.03 258 / 0.16)",
    },
  },
  carbon: {
    label: "Carbon", dark: true,
    vars: {
      "--bg": "oklch(0.17 0.012 256)", "--surface": "oklch(0.215 0.014 256)", "--surface-2": "oklch(0.262 0.016 256)", "--surface-3": "oklch(0.31 0.018 256)",
      "--ink": "oklch(0.96 0.004 256)", "--ink-2": "oklch(0.76 0.012 256)", "--ink-3": "oklch(0.62 0.014 256)",
      "--line": "oklch(0.315 0.016 256)", "--line-2": "oklch(0.38 0.018 256)",
      "--accent": "oklch(0.80 0.165 152)", "--accent-2": "oklch(0.86 0.16 150)", "--accent-ink": "oklch(0.20 0.03 152)", "--accent-soft": "oklch(0.30 0.06 152)",
      "--ok": "oklch(0.78 0.16 155)", "--ok-soft": "oklch(0.30 0.06 155)", "--warn": "oklch(0.80 0.15 78)", "--warn-soft": "oklch(0.33 0.07 78)",
      "--danger": "oklch(0.68 0.18 26)", "--danger-soft": "oklch(0.32 0.09 26)", "--info": "oklch(0.72 0.13 250)", "--info-soft": "oklch(0.30 0.06 250)",
      "--shadow": "0 1px 2px oklch(0 0 0 / 0.4), 0 8px 24px oklch(0 0 0 / 0.4)",
      "--shadow-lg": "0 4px 12px oklch(0 0 0 / 0.5), 0 24px 60px oklch(0 0 0 / 0.6)",
    },
  },
};

export const FONTS: Record<FontName, { label: string; sans: string; mono: string }> = {
  golos: { label: "Golos Text", sans: "var(--ff-golos), system-ui, sans-serif", mono: "var(--ff-mono), ui-monospace, monospace" },
  manrope: { label: "Manrope", sans: "var(--ff-manrope), system-ui, sans-serif", mono: "var(--ff-mono), ui-monospace, monospace" },
  onest: { label: "Onest", sans: "var(--ff-onest), system-ui, sans-serif", mono: "var(--ff-mono), ui-monospace, monospace" },
};

export function applyTheme(themeName: ThemeName, fontName: FontName, density: Density) {
  if (typeof document === "undefined") return;
  const t = THEMES[themeName] || THEMES.steel;
  const root = document.documentElement;
  Object.entries(t.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  const f = FONTS[fontName] || FONTS.manrope;
  root.style.setProperty("--font-sans", f.sans);
  root.style.setProperty("--font-mono", f.mono);
  const scale = density === "compact" ? 0.9 : density === "comfy" ? 1.08 : 1;
  root.style.setProperty("--scale", String(scale));
  root.setAttribute("data-theme", themeName);
  root.style.colorScheme = t.dark ? "dark" : "light";
}

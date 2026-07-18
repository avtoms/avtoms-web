/** Tailwind v4 uses a dedicated PostCSS plugin. Only the admin console pulls in Tailwind
 *  utilities (see app/tailwind.css); the legacy owner/mechanic/landing surfaces keep their
 *  inline-style design system untouched. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

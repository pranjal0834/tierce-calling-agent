/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Primary Teal palette ──────────────────────────────────────────
        primary: {
          50:  "#EDFAFA",
          100: "#D5F5F6",
          200: "#AFFCFE",
          300: "#7ECDD0",
          400: "#2BA7A9",
          500: "#0B8A8F",
          600: "#0F766E",
          700: "#115E59",
        },
        // ── Brand alias (maps to teal, used throughout all components) ────
        brand: {
          50:  "#EDFAFA",
          100: "#D5F5F6",
          300: "#7ECDD0",
          400: "#2BA7A9",
          500: "#0B8A8F",
          600: "#0F766E",
          700: "#115E59",
          900: "#134E4A",
        },
        // ── Secondary / Accent ────────────────────────────────────────────
        secondary: { 500: "#2BA7A9", 600: "#0B8A8F" },
        accent:    { 500: "#F4B63D", 600: "#D97706" },
        // ── Neutral (warm off-white background, dark navy text) ───────────
        neutral: {
          50:  "#F8F7F5",   // off-white page background
          100: "#F3F4F6",
          200: "#E9ECEF",   // sidebar border, card borders
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#64748B",   // secondary text (slate gray)
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#0F172A",   // primary text (dark navy)
        },
      },
      spacing: { 1:"0.25rem",2:"0.5rem",3:"0.75rem",4:"1rem",5:"1.25rem",6:"1.5rem",8:"2rem" },
      borderRadius: { sm:"0.5rem", md:"0.75rem", lg:"1rem" },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0,0,0,0.05)",
        md: "0 4px 6px -1px rgba(0,0,0,0.1)",
        lg: "0 10px 15px -3px rgba(0,0,0,0.1)",
      },
      fontFamily: { sans: ["Inter","system-ui","sans-serif"] },
    },
  },
  plugins: [],
};

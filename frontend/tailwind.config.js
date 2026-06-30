/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
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
        brand: {
          50:  "#EDFAFA",
          100: "#D5F5F6",
          200: "#AFFCFE",
          300: "#7ECDD0",
          400: "#2BA7A9",
          500: "#0B8A8F",
          600: "#0F766E",
          700: "#115E59",
          900: "#134E4A",
        },
        secondary: { 500: "#2BA7A9", 600: "#0B8A8F" },
        accent:    { 500: "#F4B63D", 600: "#D97706" },

        // ── Semantic status tokens (use these instead of ad-hoc red/emerald/amber) ──
        success: { 50: "#ECFDF5", 100: "#D1FAE5", 200: "#A7F3D0", 500: "#10B981", 600: "#059669", 700: "#047857" },
        error:   { 50: "#FEF2F2", 100: "#FEE2E2", 200: "#FECACA", 500: "#EF4444", 600: "#DC2626", 700: "#B91C1C" },
        warning: { 50: "#FFFBEB", 100: "#FEF3C7", 200: "#FDE68A", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" },
        info:    { 50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8" },
        neutral: {
          50:  "#FAFAF9",
          100: "#F5F5F4",
          150: "#EFEFED",
          200: "#E8E8E6",
          300: "#D4D4D2",
          400: "#A3A3A0",
          500: "#737370",
          600: "#525250",
          700: "#3D3D3B",
          800: "#262625",
          900: "#0F0F0E",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      borderRadius: {
        "2xs": "0.25rem",
        xs:   "0.375rem",
        sm:   "0.5rem",
        md:   "0.75rem",
        lg:   "1rem",
        xl:   "1.25rem",
        "2xl":"1.5rem",
        "3xl":"2rem",
      },
      boxShadow: {
        xs:    "0 1px 2px 0 rgb(0 0 0 / 0.04)",
        sm:    "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        md:    "0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        lg:    "0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
        xl:    "0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)",
        card:  "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        hover: "0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)",
        focus: "0 0 0 3px rgb(11 138 143 / 0.15)",
        modal: "0 24px 48px -8px rgb(0 0 0 / 0.18), 0 8px 16px -4px rgb(0 0 0 / 0.08)",
        brand: "0 4px 12px 0 rgb(11 138 143 / 0.25)",
      },
      transitionDuration: {
        150: "150ms",
        250: "250ms",
      },
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%":   { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          "0%":   { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in":      "fade-in 0.2s ease-out",
        "slide-in-left":"slide-in-left 0.2s ease-out",
        "slide-in-right":"slide-in-right 0.2s ease-out",
        "scale-in":     "scale-in 0.15s ease-out",
        shimmer:        "shimmer 2s linear infinite",
        pulse:          "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [
    // Icon size scale — `icon-xs/sm/md/lg/xl` set both width + height so icon
    // sizing stays consistent everywhere (replaces ad-hoc w-3.5 / w-[18px] / w-5).
    function ({ addUtilities }) {
      addUtilities({
        ".icon-xs": { width: "0.875rem", height: "0.875rem" }, // 14px
        ".icon-sm": { width: "1rem",     height: "1rem" },     // 16px
        ".icon-md": { width: "1.125rem", height: "1.125rem" }, // 18px
        ".icon-lg": { width: "1.25rem",  height: "1.25rem" },  // 20px
        ".icon-xl": { width: "1.5rem",   height: "1.5rem" },   // 24px
      });
    },
  ],
};

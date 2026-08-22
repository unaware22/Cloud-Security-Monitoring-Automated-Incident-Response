/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0d14",
        surface: {
          DEFAULT: "#111726",
          hover: "#182136",
          border: "#1f2b48",
        },
        minecraft: {
          light: "#34d399",
          DEFAULT: "#10b981",
          dark: "#059669",
          accent: "#064e3b",
        },
        roblox: {
          light: "#f87171",
          DEFAULT: "#ef4444",
          dark: "#dc2626",
          accent: "#450a0a",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        config: ['ConfigText', 'Config Text', 'Plus Jakarta Sans', 'sans-serif'],
        configText: ['ConfigText', 'Config Text', 'Plus Jakarta Sans', 'sans-serif'],
        description: ['ConfigText', 'Config Text', 'Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // FS-themed dark palette (modeled on reference, slightly cooler accent)
        bg: {
          DEFAULT: "#0b0f17",
          base: "#0b0f17",
          elevated: "#121826",
          card: "#161d2e",
        },
        border: { DEFAULT: "#1f2940" },
        accent: {
          DEFAULT: "#3b82f6", // FS blue
          hover: "#2563eb",
        },
        muted: "#8b95ad",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

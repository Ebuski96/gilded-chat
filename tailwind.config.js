/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0A0A0B",
        card: "#151517",
        raised: "#1E1E21",
        line: "#2A2A2E",
        gold: {
          DEFAULT: "#D4AF37",
          soft: "#E8C866",
          deep: "#A8862A",
        },
        muted: "#8A8A90",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "\"SF Pro Text\"",
          "\"Segoe UI\"",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

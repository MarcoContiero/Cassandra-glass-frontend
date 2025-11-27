/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // opzionale: palette neutra più “glass”
      colors: {
        border: "hsl(240 4% 16%)",
        input: "hsl(240 4% 16%)",
        ring: "hsl(240 4% 16%)",
        background: "hsl(240 10% 5%)",
        foreground: "hsl(0 0% 98%)",
      },
      borderRadius: {
        "2xl": "1.25rem",
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

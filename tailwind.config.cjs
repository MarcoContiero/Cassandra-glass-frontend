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
      colors: {
        border: "hsl(240 4% 10%)",
        input: "hsl(240 4% 12%)",
        ring: "hsl(190 80% 50%)",
        background: "hsl(240 25% 4%)",
        foreground: "hsl(0 0% 98%)",
        accent: {
          DEFAULT: "hsl(190 80% 50%)",
          foreground: "hsl(240 25% 4%)",
        },
      },
      borderRadius: {
        "2xl": "1.25rem",
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        cyan: "0 0 20px rgba(6,182,212,0.20)",
        "cyan-sm": "0 0 10px rgba(6,182,212,0.14)",
      },
      backgroundImage: {
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

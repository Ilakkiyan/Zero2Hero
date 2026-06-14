import type { Config } from "tailwindcss";

// Colors are driven by CSS variables (see app/globals.css) so the light-mode
// toggle is a one-line attribute flip later — no Tailwind config change needed.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "risk-high": "var(--risk-high)",
        "risk-med": "var(--risk-med)",
        "risk-low": "var(--risk-low)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

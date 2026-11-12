/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 1. Base Surface (Dynamic via CSS variables)
        surface: {
          base: "var(--surface-base, #0B0C10)",
          elevated: "var(--surface-elevated, #13151B)",
          card: "var(--surface-card, #13151B)",
          interactive: "var(--surface-interactive, #1B1E26)",
          hover: "var(--surface-hover, #222631)",
          border: "var(--surface-border, rgba(255, 255, 255, 0.07))",
          borderHover: "var(--surface-borderHover, rgba(255, 255, 255, 0.14))",
          borderActive: "var(--surface-borderActive, rgba(255, 255, 255, 0.28))",
        },
        // 2. Signature Brand Accent (Electric Cobalt — used sparingly)
        cobalt: {
          DEFAULT: "#4A6CFF",
          hover: "#5B7FFF",
          subtle: "rgba(74, 108, 255, 0.12)",
          border: "rgba(74, 108, 255, 0.35)",
        },
        // 3. Neutrals (Gray-on-graphite hierarchy)
        ink: {
          primary: "var(--ink-primary, #F2F3F5)",
          secondary: "var(--ink-secondary, #8E95A5)",
          muted: "var(--ink-muted, #5E6678)",
          dim: "var(--ink-dim, #3A404F)",
        },
        // 4. Semantic / Status Colors
        status: {
          safe: "#10B981",
          high: "#F59E0B",
          critical: "#EF4444",
        },
        // 5. Scientific Colormap Scale (Domain data only)
        thermal: {
          cool: "#2563eb",
          mild: "#06b6d4",
          warm: "#f59e0b",
          hot: "#ea580c",
          extreme: "#dc2626",
        },
        // Legacy compatibility aliases
        background: "var(--surface-base, #0B0C10)",
        card: "var(--surface-card, #13151B)",
        cardHover: "var(--surface-interactive, #1B1E26)",
        border: "var(--surface-border, rgba(255, 255, 255, 0.07))",
        botanical: {
          DEFAULT: "#4A6CFF",
          light: "#5B7FFF",
          dark: "#3B55CC",
        },
        obsidian: {
          base: "var(--surface-base, #0B0C10)",
          subtle: "var(--surface-elevated, #13151B)",
          surface: "var(--surface-interactive, #1B1E26)",
          hover: "var(--surface-hover, #222631)",
          textPrimary: "var(--ink-primary, #F2F3F5)",
          textSecondary: "var(--ink-secondary, #8E95A5)",
          textMuted: "var(--ink-muted, #5E6678)",
          border: "var(--surface-border, rgba(255, 255, 255, 0.07))",
        }
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Instrument Serif", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Plus Jakarta Sans", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "SF Mono", "monospace"],
      },
      boxShadow: {
        surface: "0 2px 12px -2px rgba(0, 0, 0, 0.35)",
        floating: "0 8px 24px -4px rgba(0, 0, 0, 0.55)",
        cobaltGlow: "0 0 16px -2px rgba(74, 108, 255, 0.3)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.025em",
        tight: "-0.015em",
        normal: "0",
        wide: "0.025em",
        wider: "0.05em",
        widest: "0.12em",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        subtlePulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "subtle-pulse": "subtlePulse 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

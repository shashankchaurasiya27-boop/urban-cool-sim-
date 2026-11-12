"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({ className = "", showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("urbancoolsim_theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    } else {
      // Default to dark mode
      document.documentElement.classList.add("dark");
      setTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("urbancoolsim_theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    window.dispatchEvent(new CustomEvent("themeChanged", { detail: newTheme }));
  };

  if (!mounted) {
    return (
      <div className={`w-8 h-8 rounded-md bg-surface-elevated border border-surface-border ${className}`} />
    );
  }

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      type="button"
      title={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
      aria-label={`Switch to ${isDark ? "Light" : "Dark"} Mode`}
      className={`inline-flex items-center gap-1.5 p-1.5 rounded-md bg-surface-elevated border border-surface-border hover:border-surface-borderHover text-ink-secondary hover:text-ink-primary transition-colors select-none ${className}`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, scale: 0.8, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        exit={{ rotate: 90, scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="w-4 h-4 flex items-center justify-center"
      >
        {isDark ? (
          <Sun className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <Moon className="w-3.5 h-3.5 text-cobalt" />
        )}
      </motion.div>
      {showLabel && (
        <span className="text-[11px] font-medium hidden sm:inline">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </button>
  );
}

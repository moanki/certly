"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

const storageKey = "certly-theme";
const themeChangeEvent = "certly-theme-change";

function getTheme(): Theme {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
  const handleThemeChange = () => {
    const theme = getTheme();
    document.documentElement.setAttribute("data-theme", theme);
    onStoreChange();
  };
  const handleSystemChange = () => {
    if (!window.localStorage.getItem(storageKey)) handleThemeChange();
  };

  window.addEventListener("storage", handleThemeChange);
  window.addEventListener(themeChangeEvent, handleThemeChange);
  mediaQuery.addEventListener("change", handleSystemChange);

  return () => {
    window.removeEventListener("storage", handleThemeChange);
    window.removeEventListener(themeChangeEvent, handleThemeChange);
    mediaQuery.removeEventListener("change", handleSystemChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, getTheme, () => "dark");
  const toggleTheme = useCallback(() => {
    const nextTheme = getTheme() === "dark" ? "light" : "dark";
    window.localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      className={
        className ??
        "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-soft)] transition-colors hover:text-[var(--text)]"
      }
    >
      <Sun
        className={`absolute h-4 w-4 transition-all duration-300 ${
          theme === "dark" ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon
        className={`absolute h-4 w-4 transition-all duration-300 ${
          theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
}

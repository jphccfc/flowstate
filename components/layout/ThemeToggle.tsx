"use client";

import { useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, resolveTheme, type Theme } from "@/lib/theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

function getSnapshot(): Theme {
  return resolveTheme(
    window.localStorage.getItem(THEME_STORAGE_KEY),
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function getServerSnapshot(): Theme {
  return "light";
}

function subscribe(onChange: () => void) {
  const handleChange = () => onChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener("flowstate-theme-change", handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("flowstate-theme-change", handleChange);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event("flowstate-theme-change"));
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="workspace-theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

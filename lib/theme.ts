export const THEME_STORAGE_KEY = "flowstate-theme";

export type Theme = "light" | "dark";

export function normalizeTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  return normalizeTheme(stored) ?? (prefersDark ? "dark" : "light");
}

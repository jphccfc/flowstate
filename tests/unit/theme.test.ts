import { describe, expect, it } from "vitest";
import { normalizeTheme, resolveTheme } from "../../lib/theme";

describe("theme preference", () => {
  it("accepts only supported themes", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("system")).toBeNull();
  });

  it("prefers a stored theme over the operating-system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("uses the operating-system preference when no stored theme exists", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
  });
});

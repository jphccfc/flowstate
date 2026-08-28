import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "app/dashboard/page.tsx"), "utf8");
const navbar = readFileSync(resolve(process.cwd(), "components/layout/Navbar.tsx"), "utf8");

describe("dashboard dark-theme contract", () => {
  it("uses theme-aware dashboard surfaces and controls", () => {
    expect(dashboard).toContain("dashboard-card");
    expect(dashboard).toContain("dashboard-input");
    expect(dashboard).toContain("dashboard-primary-button");
    expect(dashboard).not.toContain("bg-white");
    expect(dashboard).not.toContain("hover:bg-[#1a3352]");
    expect(navbar).toContain("ThemeToggle");
    expect(css).toContain(".dashboard-card");
    expect(css).toContain(".dashboard-input");
    expect(css).toContain(":root[data-theme=\"dark\"] .dashboard-card");
    expect(css).toContain(":root[data-theme=\"dark\"] .dashboard-input");
  });
});

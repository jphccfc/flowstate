import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");

describe("overview dark-theme text contract", () => {
  it("uses a readable semantic token for overview stat values in both themes", () => {
    expect(overview).toContain('className="workspace-stat-value text-2xl font-bold"');
    expect(css).toContain("--stat-value:");
    expect(css).toContain(":root[data-theme=\"dark\"]");
    expect(css).toContain("--stat-value: var(--accent);");
    expect(overview).not.toContain("text-[var(--primary)]");
  });
});

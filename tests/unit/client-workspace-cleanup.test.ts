import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const dashboard = readFileSync(resolve(process.cwd(), "app/dashboard/page.tsx"), "utf8");
const overview = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");
describe("client dashboard organisation search contract", () => {
  it("provides an accessible search, result count, and clear control", () => {
    expect(dashboard).toContain('aria-label="Search client organisations"');
    expect(dashboard).toContain("organisations");
    expect(dashboard).toContain("Clear search");
    expect(dashboard).toContain("setSearchQuery");
  });
  it("filters loaded organisations by name, industry, or size", () => {
    expect(dashboard).toContain("org.name, org.industry, org.size");
    expect(dashboard).toContain("toLowerCase().includes(normalizedQuery)");
    expect(dashboard).toContain("filteredOrgs");
  });
  it("keeps loading, empty, and no-results states distinct", () => {
    expect(dashboard).toContain("Loading clients...");
    expect(dashboard).toContain("No clients yet");
    expect(dashboard).toContain("No organisations match your search");
  });
});
describe("client overview workflow presentation contract", () => {
  it("uses semantic workflow labels instead of duplicated numeric icons", () => {
    expect(overview).toContain("Workflow areas");
    expect(overview).toContain('aria-label={`Workflow: ${card.label}`}');
    expect(overview).not.toContain('icon: "02"');
    expect(overview).not.toContain('icon: "04"');
  });
  it("preserves each separate workflow link", () => {
    for (const route of ["capture", "configure", "assess", "tasks", "analysis", "report", "recommendations", "review"]) expect(overview).toContain("`/clients/${id}/" + route + "`");
  });
});

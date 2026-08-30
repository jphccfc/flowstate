import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/page.tsx"), "utf8");

describe("client overview progress summary", () => {
  it("renders separate organisation-scoped workflow progress cards with links", () => {
    for (const label of ["Progress summary", "Captures needing review", "Processing or failed captures", "Assessment progress", "Open assessment tasks", "Planning items", "Growth Plan actions"]) expect(page).toContain(label);
    for (const route of ["review", "capture", "assess", "tasks", "planning", "recommendations"]) expect(page).toContain("`/clients/${id}/" + route + "`");
  });

  it("keeps progress counts organisation-scoped and distinguishes work domains", () => {
    expect(page).toContain("organizationId: id");
    expect(page).toContain("TRANSCRIBING");
    expect(page).toContain("assessmentTask.count");
    expect(page).toContain('lifecycleStatus: { not: "COMPLETED" }');
    expect(page).toContain('status: { in: ["PLANNED", "IN_PROGRESS"] }');
    expect(page).not.toContain("Growth Plan actions and Assessment tasks");
  });
});

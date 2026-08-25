import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const report = readFileSync(resolve(root, "app/clients/[id]/report/page.tsx"), "utf8");
const clientRoute = readFileSync(resolve(root, "app/api/clients/[id]/route.ts"), "utf8");

describe("executive report traceability", () => {
  it("exposes the decision-to-action traceability section", () => {
    expect(report).toContain("Decision traceability");
    expect(report).toContain("Approved insight");
    expect(report).toContain("Growth Plan");
    expect(report).toContain("Recommendation");
  });

  it("loads approved insights and linked Growth Plan actions for the report", () => {
    expect(clientRoute).toContain("approvedInsights");
    expect(clientRoute).toContain("growthActions");
    expect(clientRoute).toContain("recommendation");
  });
});

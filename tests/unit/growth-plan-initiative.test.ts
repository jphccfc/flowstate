import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const assess = readFileSync(resolve(root, "app/clients/[id]/assess/page.tsx"), "utf8");

describe("Growth Plan strategic initiative contract", () => {
  it("keeps outcome scenario and accountable planning fields on GrowthAction", () => {
    const growthAction = schema.slice(schema.indexOf("model GrowthAction"), schema.indexOf("model TargetMaturity"));
    expect(growthAction).toContain("outcomeScenario");
    expect(growthAction).toContain("expectedValue");
    expect(growthAction).toContain("valueAssumptions");
    expect(growthAction).toContain("ownerEmail");
    expect(growthAction).toContain("dueDate");
  });

  it("labels Growth Plan work as strategic rather than assessment operations", () => {
    expect(assess).toContain("Growth actions");
    expect(assess).toContain("owner");
    expect(assess).toContain("due date");
    expect(assess).toContain("Value assumptions");
  });
});

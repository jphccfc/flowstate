import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/summary/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/clients/[id]/assess/page.tsx", import.meta.url), "utf8");

describe("FlowScore executive summary", () => {
  it("exposes latest confirmed scores, domain rollups and evidence gaps", () => {
    expect(route).toContain("client.read");
    expect(route).toContain("confirmedScore");
    expect(route).toContain("evidenceGap");
    expect(route).toContain("domainAverage");
    expect(page).toContain("FlowScore summary");
    expect(page).toContain("Scored capabilities");
    expect(route).toContain("scoreHistory");
    expect(page).toContain("Score history");
  });
});

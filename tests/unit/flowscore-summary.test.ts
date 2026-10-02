import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/summary/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../../components/assessment/ReviewerConfirmedScore.tsx", import.meta.url), "utf8");

describe("FlowScore executive summary", () => {
  it("exposes latest confirmed scores, domain rollups and evidence gaps", () => {
    expect(route).toContain("client.read");
    expect(route).toContain("confirmedScore");
    expect(route).toContain("evidenceGap");
    expect(route).toContain("domainAverage");
    expect(component).toContain("FlowScore summary");
    expect(component).toContain("Scored capabilities");
    expect(route).toContain("scoreHistory");
    expect(component).toContain("Score history");
  });
});

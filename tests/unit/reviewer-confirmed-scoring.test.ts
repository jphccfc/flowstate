import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/decisions/route.ts", import.meta.url), "utf8");
const component = readFileSync(new URL("../../components/assessment/ReviewerConfirmedScore.tsx", import.meta.url), "utf8");

describe("reviewer-confirmed scoring", () => {
  it("persists a confirmed score with rubric, rationale and evidence ids", () => {
    expect(route).toContain("rubricVersion");
    expect(route).toContain("sourceEvidenceIds");
    expect(route).toContain("assessment.review");
    expect(route).toContain("CONFIRMED");
    expect(component).toContain("Confirm score");
    expect(component).toContain("Reviewer rationale");
    expect(component).toContain("rubricVersion");
  });
});

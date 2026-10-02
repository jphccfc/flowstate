import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../components/assessment/ReviewerConfirmedScore.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/evidence/route.ts", import.meta.url), "utf8");

describe("visible scoring v1", () => {
  it("provides capability selection, score and approved evidence", () => {
    expect(component).toContain("Scoring v1");
    expect(component).toContain("Provisional score");
    expect(component).toContain("Approved evidence");
    expect(component).toContain("/assessment/evidence?capabilityId=");
    expect(component).toContain("readJsonResponse");
    expect(component).toContain("returned invalid data");
    expect(route).toContain('capturedInput: { is: { versionStatus: "CURRENT" } }');
  });
});

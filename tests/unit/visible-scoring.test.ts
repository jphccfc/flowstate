import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../app/clients/[id]/assess/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/evidence/route.ts", import.meta.url), "utf8");

describe("visible scoring v1", () => {
  it("provides capability selection, score and approved evidence", () => {
    expect(page).toContain("Scoring v1");
    expect(page).toContain("Provisional score");
    expect(page).toContain("Approved evidence");
    expect(page).toContain("/assessment/evidence?capabilityId=");
    expect(page).toContain("readJsonResponse");
    expect(page).toContain("returned invalid data");
    expect(route).toContain('capturedInput: { is: { versionStatus: "CURRENT" } }');
  });
});

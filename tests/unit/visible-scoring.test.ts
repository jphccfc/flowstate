import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../app/clients/[id]/assess/page.tsx", import.meta.url), "utf8");

describe("visible scoring v1", () => {
  it("provides capability selection, score and approved evidence", () => {
    expect(page).toContain("Scoring v1");
    expect(page).toContain("Provisional score");
    expect(page).toContain("Approved evidence");
    expect(page).toContain("/assessment/evidence?capabilityId=");
    expect(page).toContain("Only current, approved findings are included.");
  });
});

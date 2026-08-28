import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/clients/[id]/assess/page.tsx", "utf8");

describe("assessment evidence provenance UI contract", () => {
  it("renders reviewed evidence as selectable sources and submits their ids", () => {
    expect(page).toContain("Reviewed evidence");
    expect(page).toContain('type="checkbox"');
    expect(page).toContain("sourceEvidenceIds");
    expect(page).toContain("Save perspective");
    expect(page).toContain("/evidence");
  });

  it("keeps AI proposals explicitly provisional and records original statements", () => {
    expect(page).toContain("AI evidence proposal");
    expect(page).toContain("Provisional only; it cannot change the saved assessment.");
    expect(page).toContain("Original statement");
    expect(page).toContain("Draft with AI");
  });
});

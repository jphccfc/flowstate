import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("agent output review surface", () => {
  const page = readFileSync("app/clients/[id]/review/page.tsx", "utf8");
  it("renders source provenance, prompt, model metadata and explicit review actions", () => {
    for (const text of ["Provisional agent outputs", "Prompt version", "Provisional output", "Review notes", "Mark amended", "/api/agent-outputs/"]) expect(page).toContain(text);
  });
  it("keeps reviewed agent outputs separate from downstream assessment domains", () => {
    expect(page).toContain("remain separate from assessments, insights, recommendations, and growth actions");
  });
});

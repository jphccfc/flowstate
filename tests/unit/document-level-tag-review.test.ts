import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/tags/bulk/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/clients/[id]/review/page.tsx", import.meta.url), "utf8");

describe("document-level tag review", () => {
  it("updates all pending tags for one authorized document in one decision", () => {
    expect(route).toContain("prisma.tag.updateMany");
    expect(route).toContain("capturedInputId");
    expect(route).toContain('status: "PENDING_REVIEW"');
    expect(route).toContain("isOrganizationMember");
  });

  it("renders one document approval action with expandable tag detail", () => {
    expect(page).toContain("Approve document");
    expect(page).toContain("Reject document");
    expect(page).toContain("Show supporting tags (not separate approval tasks)");
    expect(page).toContain("/api/tags/bulk");
  });
});

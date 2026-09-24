import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const review = readFileSync(new URL("../../app/clients/[id]/review/page.tsx", import.meta.url), "utf8");

describe("document-level Tag Review", () => {
  it("keeps supporting tags read-only and delegates the decision to the document", () => {
    expect(review).toContain("Approve document");
    expect(review).toContain("Reject document");
    expect(review).toContain("Supporting tag detail (read-only)");
    expect(review).not.toContain('onClick={() => act(tag.id, "approve")}');
    expect(review).not.toContain('onClick={() => act(tag.id, "reject")}');
    expect(review).not.toContain("Reassign to…");
  });
});

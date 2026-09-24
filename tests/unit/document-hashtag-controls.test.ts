import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../components/tags/DocumentHashtags.tsx", import.meta.url), "utf8");
const review = readFileSync(new URL("../../app/clients/[id]/review/page.tsx", import.meta.url), "utf8");

describe("document hashtag controls", () => {
  it("offers catalogue reuse and create-and-attach from document review", () => {
    expect(component).toContain("Attach an existing hashtag");
    expect(component).toContain("Create & attach");
    expect(component).toContain("Reusable across this client workspace");
    expect(review).toContain("<DocumentHashtags organizationId={organizationId} capturedInputId={group.capturedInputId} />");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/tags/route.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../../app/clients/[id]/review/page.tsx", import.meta.url), "utf8");

describe("Tag Review search", () => {
  it("supports server-side search across meeting and tag evidence", () => {
    expect(route).toContain("searchParams.get(\"q\")");
    expect(route).toContain("segment: { text");
    expect(route).toContain("capturedInput: { organizationId");
    expect(route).toContain("targetId");
    expect(route).toContain("hashtagAttachments");
    expect(route).toContain("normalizedName");
  });

  it("renders search and source-type filters", () => {
    expect(page).toContain("Search tags, meeting notes or documents");
    expect(page).toContain("Source type");
    expect(page).toContain("Apply filters");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/ai/route.ts"), "utf8");

describe("FlowCoach hashtag retrieval", () => {
  it("retrieves only approved, tenant-scoped hashtag attachments as cited context", () => {
    expect(route).toContain("normalizeHashtag");
    expect(route).toContain("tagAttachment.findMany");
    expect(route).toContain('status: "APPROVED"');
    expect(route).toContain("tagDefinition: { active: true }");
    expect(route).toContain("Approved hashtag");
    expect(route).toContain("sourceHref(organizationId, source.kind, source.id)");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/clients/[id]/assessment/evidence/route.ts", import.meta.url), "utf8");

describe("assessment evidence bridge", () => {
  it("scopes evidence to the client and requested capability", () => {
    expect(route).toContain("hasOrganizationPermission");
    expect(route).toContain("organizationId: id");
    expect(route).toContain("capabilityId");
    expect(route).toContain('status: "APPROVED"');
  });

  it("excludes superseded and stale findings and returns citations", () => {
    expect(route).toContain('status: { notIn: ["STALE", "SOURCE_REMOVED", "SUPERSEDED", "REJECTED"] }');
    expect(route).toContain("citedExcerpts");
    expect(route).toContain("sourceHash");
  });
});

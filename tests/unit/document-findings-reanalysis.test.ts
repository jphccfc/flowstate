import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/findings/reanalyze/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/findings/page.tsx"), "utf8");
const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260914190000_add_finding_reanalysis_link/migration.sql"), "utf8");

describe("finding re-analysis", () => {
  it("requires client configuration permission and scopes the finding to the organisation", () => {
    expect(route).toContain('hasOrganizationPermission(user.email, id, "client.configure")');
    expect(route).toContain("organizationId: id");
    expect(route).toContain("findingId");
  });

  it("accepts only pending findings", () => {
    expect(route).toContain('finding.status !== "PENDING_REVIEW"');
    expect(route).toContain("Only pending findings can be re-analysed");
  });

  it("preserves the old finding as stale and queues the stored input", () => {
    expect(route).toContain('data: { status: "STALE" }');
    expect(route).toContain("processCapturedInput(finding.capturedInputId)");
    expect(route).toContain("status: \"REANALYSIS_QUEUED\"");
  });

  it("links the replacement to the old finding", () => {
    expect(route).toContain("reanalysisOfId: finding.id");
    expect(schema).toContain("reanalysisOfId");
    expect(migration).toContain('ADD COLUMN "reanalysisOfId" TEXT');
  });

  it("does not expose a synchronous long-running request", () => {
    expect(route).toContain("after(async () =>");
    expect(route).toContain("return NextResponse.json({ accepted: true");
  });

  it("exposes the action only for pending findings in the UI", () => {
    expect(page).toContain("Re-analyse");
    expect(page).toContain('finding.status === "PENDING_REVIEW"');
    expect(page).toContain('fetch(`${api}/reanalyze`');
  });

  it("does not offer re-analysis for an approved decision", () => {
    const buttonRegion = page.slice(page.indexOf('finding.status === "PENDING_REVIEW"'), page.indexOf(': <p className="mt-3'));
    expect(buttonRegion).toContain("Re-analyse");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const route = readFileSync(resolve(process.cwd(), "app/api/clients/[id]/findings/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "app/clients/[id]/findings/page.tsx"), "utf8");

describe("findings review API", () => {
  it("requires a session and organisation permission", () => {
    expect(route).toContain("auth.getUser()");
    expect(route).toContain('authorize(id, "client.read")');
    expect(route).toContain('authorize(id, "client.configure")');
    expect(route).toContain("{ status: 401 }");
    expect(route).toContain("{ status: 403 }");
  });

  it("defaults to what needs a human decision", () => {
    expect(route).toContain('{ status: "PENDING_REVIEW" as const }');
  });

  it("records who decided and when", () => {
    expect(route).toContain('action === "approve" ? "APPROVED" : "REJECTED"');
    expect(route).toContain("reviewedBy: guard.user?.email ?? null");
    expect(route).toContain("reviewedAt: new Date()");
  });

  it("scopes a decision to the route organisation, not just the finding id", () => {
    expect(route).toContain("findFirst({ where: { id: findingId, organizationId: id } })");
  });

  it("refuses to act on a stale finding", () => {
    expect(route).toContain('if (existing.status === "STALE")');
    expect(route).toContain("the source document has changed since it was analysed");
  });

  it("validates the action rather than accepting any string", () => {
    expect(route).toContain('action !== "approve" && action !== "reject"');
  });

  it("returns the cited excerpts a reviewer needs to check the claim", () => {
    expect(route).toContain("citedExcerpts: finding.citedExcerpts");
    expect(route).toContain("citedCount: finding.citedSegmentIds.length");
  });

  it("never exposes token material", () => {
    for (const forbidden of ["accessToken", "refreshToken", "encryptedTokens"]) {
      expect(route).not.toContain(forbidden);
    }
  });
});

describe("findings review page", () => {
  it("shows what the document is", () => {
    expect(page).toContain("finding.documentType");
    expect(page).toContain("finding.title");
  });

  it("shows what it proves and about which capability", () => {
    expect(page).toContain("finding.evidenceDemonstrated");
    expect(page).toContain("finding.capabilityName");
    expect(page).toContain("Evidence demonstrated");
  });

  it("shows the cited excerpts so the claim can be checked against the source", () => {
    expect(page).toContain("finding.citedExcerpts.map");
    expect(page).toContain("Cited from the document");
  });

  it("flags strength and confidence, including when no capability is evidenced", () => {
    expect(page).toContain("finding.strength");
    expect(page).toContain("no capability");
  });

  it("offers approve and reject only while a decision is outstanding", () => {
    expect(page).toContain('finding.status === "PENDING_REVIEW"');
    expect(page).toContain('decide(finding.id, "approve")');
    expect(page).toContain('decide(finding.id, "reject")');
  });

  it("explains a stale finding instead of offering a meaningless decision", () => {
    expect(page).toContain('finding.status === "STALE"');
    expect(page).toContain("The source document changed after this was analysed");
  });

  it("states that nothing feeds the assessment before approval", () => {
    expect(page).toContain("Nothing here feeds the assessment until a person approves it.");
  });

  it("separates the states a reviewer works through", () => {
    for (const tab of ["PENDING_REVIEW", "APPROVED", "REJECTED", "STALE"]) {
      expect(page).toContain(tab);
    }
  });
});

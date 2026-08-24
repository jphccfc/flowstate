import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "reviewer-1", email: "advisor@test.com" } } }) } }) }));

import { GET, POST } from "../../app/api/capabilities/[id]/assessment-decisions/route";

function req(body: unknown, method = "POST") {
  return new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) }) as never;
}

describe("human maturity assessment decisions", () => {
  let organizationId: string | undefined;
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("creates an append-only approval decision with provenance and rationale", async () => {
    const organization = await createTestOrganization({ name: "Decision Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "employee", score: 2, originalStatement: "The process is repeatable", sourceEvidenceIds: ["evidence-1"] } });
    const response = await POST(req({ action: "approve", locationTag: "Brampton", approvedScore: 2, scoreRangeMin: 1.5, scoreRangeMax: 2.5, rationale: "Supported by employee account", supportingPerspectiveIds: [perspective.id], conflictingPerspectiveIds: [], supportingEvidenceIds: ["evidence-1"] }), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ capabilityId: capability.id, status: "APPROVED", approvedScore: 2, reviewerEmail: "advisor@test.com", supportingPerspectiveIds: [perspective.id], supportingEvidenceIds: ["evidence-1"] });
  });

  it("records a follow-up decision without mutating the previous decision", async () => {
    const organization = await createTestOrganization({ name: "Decision History Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Quality control" } });
    const first = await prisma.maturityDecision.create({ data: { capabilityId: capability.id, action: "APPROVE", status: "APPROVED", approvedScore: 2, rationale: "Initial review", reviewerEmail: "advisor@test.com" } });
    const response = await POST(req({ action: "REQUEST_EVIDENCE", rationale: "Need process documentation", supersedesDecisionId: first.id }), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ action: "REQUEST_EVIDENCE", status: "EVIDENCE_REQUESTED", supersedesDecisionId: first.id });
    expect((await prisma.maturityDecision.findUnique({ where: { id: first.id } }))?.status).toBe("APPROVED");
  });

  it("lists the decision history for an authorised capability", async () => {
    const organization = await createTestOrganization({ name: "Decision List Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Scheduling" } });
    await prisma.maturityDecision.create({ data: { capabilityId: capability.id, action: "SIGN_OFF", status: "SIGNED_OFF", rationale: "Approved by steering group", reviewerEmail: "advisor@test.com" } });
    const response = await GET(req({}, "GET"), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).decisions).toHaveLength(1);
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) } }) }));
import { POST } from "../../app/api/capabilities/[id]/proposals/route";
import { PATCH } from "../../app/api/maturity-proposals/[id]/route";

function req(body: unknown, method = "POST") { return new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never; }

describe("persisted AI maturity proposals", () => {
  let organizationId: string | undefined;
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });
  it("persists a provisional evidence-backed proposal without changing the assessment", async () => {
    const organization = await createTestOrganization({ name: "Maturity Proposal Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const input = await prisma.capturedInput.create({ data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "Planning is manual", status: "TAGGED" } });
    const segment = await prisma.capturedSegment.create({ data: { capturedInputId: input.id, order: 0, text: "Planning is manual" } });
    const tag = await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "APPROVED" } });
    await prisma.maturityAssessment.create({ data: { capabilityId: capability.id, score: 1, evidence: "Existing approved score", sourceSegmentIds: [] } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interpretation: "Planning is ad hoc", suggestedScore: 1, scoreRangeMin: 0.5, scoreRangeMax: 1.5, confidence: 0.82, missingEvidence: ["Documented ownership"], conflictingEvidence: [] }) } }] }) }));
    const response = await POST(req({}), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(201); const body = await response.json();
    expect(body).toMatchObject({ capabilityId: capability.id, status: "PENDING_REVIEW", suggestedScore: 1, scoreRangeMin: 0.5, scoreRangeMax: 1.5, confidence: 0.82, sourceEvidenceIds: [tag.id] });
    expect((await prisma.maturityAssessment.findFirst({ where: { capabilityId: capability.id } }))?.score).toBe(1);
  });
  it("uses only approved perspectives and preserves their IDs as proposal provenance", async () => {
    const organization = await createTestOrganization({ name: "Perspective Provenance Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const pending = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "EMPLOYEE", score: 1, originalStatement: "Unreviewed claim", status: "SUBMITTED" } });
    const approved = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "EXPERT", score: 2, originalStatement: "Reviewed claim", status: "APPROVED" } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interpretation: "Planning is ad hoc", suggestedScore: 1, confidence: 0.82, missingEvidence: [], conflictingEvidence: [] }) } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(req({}), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sourcePerspectiveIds).toEqual([approved.id]);
    expect(fetchMock.mock.calls[0][1].body).toContain("Reviewed claim");
    expect(fetchMock.mock.calls[0][1].body).not.toContain("Unreviewed claim");
    expect(pending.status).toBe("SUBMITTED");
  });
  it("refuses approval when a cited perspective is no longer approved", async () => {
    const organization = await createTestOrganization({ name: "Stale Provenance Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "EXPERT", score: 2, originalStatement: "Reviewed claim", status: "APPROVED" } });
    const proposal = await prisma.maturityProposal.create({ data: { capabilityId: capability.id, proposalType: "MATURITY_RATING", interpretation: "Supported practice", suggestedScore: 2, sourcePerspectiveIds: [perspective.id], status: "PENDING_REVIEW" } });
    await prisma.maturityPerspective.update({ where: { id: perspective.id }, data: { status: "REJECTED" } });

    const response = await PATCH(req({ action: "approve" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "proposal cites perspectives that are no longer approved" });
    expect((await prisma.maturityProposal.findUnique({ where: { id: proposal.id } }))?.status).toBe("PENDING_REVIEW");
    expect(await prisma.assessmentDecision.count({ where: { capabilityId: capability.id } })).toBe(0);
  });

  it("rejects proposal generation for a capability in another organization", async () => {
    const organization = await createTestOrganization({ name: "Other Proposal Org" });
    try {
      const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
      const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
      await prisma.userOrganization.deleteMany({ where: { organizationId: organization.id, user: { email: "advisor@test.com" } } });
      const response = await POST(req({}), { params: Promise.resolve({ id: capability.id }) });
      expect(response.status).toBe(403);
    } finally {
      await cleanupOrganization(organization.id);
    }
  });
  it("blocks a client stakeholder from approving an AI proposal", async () => {
    const organization = await createTestOrganization({ name: "Maturity Role Org" }); organizationId = organization.id;
    await prisma.userOrganization.updateMany({ where: { organizationId: organization.id, user: { email: "advisor@test.com" } }, data: { role: "CLIENT_STAKEHOLDER" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const proposal = await prisma.maturityProposal.create({ data: { capabilityId: capability.id, proposalType: "MATURITY_RATING", interpretation: "Ad hoc practice", suggestedScore: 1, confidence: 0.7, sourceEvidenceIds: [], missingEvidence: [], conflictingEvidence: [], status: "PENDING_REVIEW" } });
    const response = await PATCH(req({ action: "approve" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) });
    expect(response.status).toBe(403);
  });
  it("requires an explicit human review action and records the reviewer", async () => {
    const organization = await createTestOrganization({ name: "Maturity Review Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const proposal = await prisma.maturityProposal.create({ data: { capabilityId: capability.id, proposalType: "MATURITY_RATING", interpretation: "Ad hoc practice", suggestedScore: 1, confidence: 0.7, sourceEvidenceIds: [], missingEvidence: [], conflictingEvidence: [], status: "PENDING_REVIEW" } });
    const response = await PATCH(req({ action: "approve", reviewNotes: "Confirmed with manager" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ id: proposal.id, status: "APPROVED", reviewedBy: "advisor@test.com", reviewNotes: "Confirmed with manager" });
    const decision = await prisma.assessmentDecision.findFirst({ where: { capabilityId: capability.id }, orderBy: { createdAt: "desc" } });
    expect(decision).toMatchObject({ status: "APPROVED", score: 1, rationale: "Ad hoc practice", decidedBy: "advisor@test.com", sourceEvidenceIds: [], sourcePerspectiveIds: [] });
  });
  it("allows only one human review transition when actions race", async () => {
    const organization = await createTestOrganization({ name: "Concurrent Review Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const proposal = await prisma.maturityProposal.create({ data: { capabilityId: capability.id, proposalType: "MATURITY_RATING", interpretation: "Ad hoc practice", suggestedScore: 1, confidence: 0.7, sourceEvidenceIds: [], missingEvidence: [], conflictingEvidence: [], status: "PENDING_REVIEW" } });

    const responses = await Promise.all([
      PATCH(req({ action: "reject", reviewNotes: "Not supported" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) }),
      PATCH(req({ action: "edit", interpretation: "Needs clarification" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(["REJECTED", "EDITED"]).toContain((await prisma.maturityProposal.findUnique({ where: { id: proposal.id } }))?.status);
  });
  it("allows only one decision when competing proposals are approved concurrently", async () => {
    const organization = await createTestOrganization({ name: "Concurrent Proposal Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const proposalData = { capabilityId: capability.id, proposalType: "MATURITY_RATING" as const, interpretation: "Ad hoc practice", suggestedScore: 1, confidence: 0.7, sourceEvidenceIds: [], missingEvidence: [], conflictingEvidence: [], status: "PENDING_REVIEW" as const };
    const [first, second] = await Promise.all([prisma.maturityProposal.create({ data: proposalData }), prisma.maturityProposal.create({ data: proposalData })]);

    const responses = await Promise.all([
      PATCH(req({ action: "approve" }, "PATCH"), { params: Promise.resolve({ id: first.id }) }),
      PATCH(req({ action: "approve" }, "PATCH"), { params: Promise.resolve({ id: second.id }) }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.assessmentDecision.count({ where: { capabilityId: capability.id } })).toBe(1);
  });
});

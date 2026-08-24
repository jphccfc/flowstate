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
  it("requires an explicit human review action and records the reviewer", async () => {
    const organization = await createTestOrganization({ name: "Maturity Review Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const proposal = await prisma.maturityProposal.create({ data: { capabilityId: capability.id, proposalType: "MATURITY_RATING", interpretation: "Ad hoc practice", suggestedScore: 1, confidence: 0.7, sourceEvidenceIds: [], missingEvidence: [], conflictingEvidence: [], status: "PENDING_REVIEW" } });
    const response = await PATCH(req({ action: "approve", reviewNotes: "Confirmed with manager" }, "PATCH"), { params: Promise.resolve({ id: proposal.id }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ id: proposal.id, status: "APPROVED", reviewedBy: "advisor@test.com", reviewNotes: "Confirmed with manager" });
  });
});

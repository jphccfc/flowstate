import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) } }) }));
import { POST } from "../../app/api/capabilities/[id]/validation/route";

function req(body: unknown = {}) { return new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never; }

describe("AI rating validation proposals", () => {
  let organizationId: string | undefined;
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("creates a provisional validation linked to the approved decision, evidence, and perspectives", async () => {
    const organization = await createTestOrganization({ name: "Validation Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const input = await prisma.capturedInput.create({ data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "Planning is manual", status: "TAGGED" } });
    const segment = await prisma.capturedSegment.create({ data: { capturedInputId: input.id, order: 0, text: "Planning is manual" } });
    const tag = await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "APPROVED" } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "employee", assessorEmail: "employee@test.com", score: 1, originalStatement: "We do this manually", sourceEvidenceIds: [tag.id] } });
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId: capability.id, status: "APPROVED", score: 2, rationale: "Existing approved score", sourceEvidenceIds: [tag.id], sourcePerspectiveIds: [perspective.id] } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ interpretation: "Evidence conflicts with the approved score", confidence: 0.81, missingEvidence: ["Documented ownership"], conflictingEvidence: ["Employee account indicates manual work"] }) } }] }) }));
    const response = await POST(req(), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ proposalType: "RATING_VALIDATION", status: "PENDING_REVIEW", sourceEvidenceIds: [tag.id], sourcePerspectiveIds: [perspective.id], conflictingEvidence: ["Employee account indicates manual work"] });
    expect((await prisma.assessmentDecision.findUnique({ where: { id: decision.id } }))?.status).toBe("APPROVED");
  });

  it("rejects validation for a capability in another organisation", async () => {
    const memberOrganization = await createTestOrganization({ name: "Validation Member Org" }); organizationId = memberOrganization.id;
    const otherOrganization = await createTestOrganization({ name: "Validation Other Org" });
    await prisma.userOrganization.deleteMany({ where: { organizationId: otherOrganization.id, user: { email: "advisor@test.com" } } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: otherOrganization.id, name: "Private" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Private capability" } });
    const response = await POST(req(), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(403);
    await cleanupOrganization(otherOrganization.id);
  });
});

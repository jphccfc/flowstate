import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) } }),
}));

import { GET } from "../../app/api/capabilities/[id]/evidence/route";
import { POST as POST_PERSPECTIVE } from "../../app/api/capabilities/[id]/perspectives/route";

describe("reviewed evidence available to a capability assessment", () => {
  const organizationIds: string[] = [];
  afterAll(async () => { for (const id of organizationIds) await cleanupOrganization(id); await prisma.$disconnect(); });

  it("returns only approved capability tags with segment and source metadata", async () => {
    const organization = await createTestOrganization({ name: "Evidence Scope Org" }); organizationIds.push(organization.id);
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    const input = await prisma.capturedInput.create({ data: { organizationId: organization.id, type: "DOCUMENT", sourceRef: "planning.pdf", rawText: "Approved source text", capturedAt: new Date() } });
    const segment = await prisma.capturedSegment.create({ data: { capturedInputId: input.id, text: "Approved source segment", order: 0 } });
    const approved = await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.92, status: "APPROVED", reviewedBy: "advisor@test.com", reviewedAt: new Date() } });
    await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.2, status: "PENDING_REVIEW" } });
    const response = await GET(new Request(`http://localhost/api/capabilities/${capability.id}/evidence`) as never, { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: approved.id, segmentText: "Approved source segment", sourceType: "DOCUMENT", sourceRef: "planning.pdf", capturedInputId: input.id, segmentId: segment.id }]);
    const saved = await POST_PERSPECTIVE(new Request(`http://localhost/api/capabilities/${capability.id}/perspectives`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stakeholderType: "employee", score: 2, originalStatement: "The approved source supports this", sourceEvidenceIds: [approved.id] }) }) as never, { params: Promise.resolve({ id: capability.id }) });
    expect(saved.status).toBe(201);
    expect((await saved.json()).sourceEvidenceIds).toEqual([approved.id]);
  });

  it("does not disclose evidence from another organization", async () => {
    const organization = await createTestOrganization({ name: "Evidence Private Org" }); organizationIds.push(organization.id);
    const other = await createTestOrganization({ name: "Evidence Other Org" }); organizationIds.push(other.id);
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    const otherDomain = await prisma.businessDomain.create({ data: { organizationId: other.id, name: "Operations" } });
    const otherCapability = await prisma.capability.create({ data: { domainId: otherDomain.id, name: "Planning" } });
    const input = await prisma.capturedInput.create({ data: { organizationId: other.id, type: "TEXT_NOTE", rawText: "Private", capturedAt: new Date() } });
    const segment = await prisma.capturedSegment.create({ data: { capturedInputId: input.id, text: "Private segment", order: 0 } });
    await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: otherCapability.id, confidence: 1, status: "APPROVED", reviewedBy: "advisor@test.com", reviewedAt: new Date() } });
    const response = await GET(new Request(`http://localhost/api/capabilities/${capability.id}/evidence`) as never, { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    const foreignTag = await prisma.tag.findFirst({ where: { targetId: otherCapability.id, status: "APPROVED" }, select: { id: true } });
    const rejected = await POST_PERSPECTIVE(new Request(`http://localhost/api/capabilities/${capability.id}/perspectives`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stakeholderType: "employee", score: 2, originalStatement: "Should not cite foreign evidence", sourceEvidenceIds: [foreignTag!.id] }) }) as never, { params: Promise.resolve({ id: capability.id }) });
    expect(rejected.status).toBe(400);
  });
});

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) } }) }));
import { PATCH } from "../../app/api/capabilities/[id]/perspectives/[perspectiveId]/route";

function req(body: unknown) { return new Request("http://localhost/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never; }

describe("human review of maturity perspectives", () => {
  let organizationId: string | undefined;
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("approves a submitted perspective and records the reviewer without changing its statement or score", async () => {
    const organization = await createTestOrganization({ name: "Perspective Review Org" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "employee", score: 1.5, originalStatement: "We do this manually" } });
    const response = await PATCH(req({ action: "approve", reviewNotes: "Confirmed with employee" }), { params: Promise.resolve({ id: capability.id, perspectiveId: perspective.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: perspective.id, status: "APPROVED", reviewedBy: "advisor@test.com", reviewNotes: "Confirmed with employee", originalStatement: perspective.originalStatement, score: 1.5 });
  });

  it("rejects a perspective from another organisation", async () => {
    const memberOrganization = await createTestOrganization({ name: "Perspective Member Org" }); organizationId = memberOrganization.id;
    const otherOrganization = await createTestOrganization({ name: "Perspective Other Org" });
    const advisor = await prisma.user.findUniqueOrThrow({ where: { email: "advisor@test.com" } });
    await prisma.userOrganization.deleteMany({ where: { organizationId: otherOrganization.id, userId: advisor.id } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: otherOrganization.id, name: "Private" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Private capability" } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "employee", score: 2, originalStatement: "Private statement" } });
    const response = await PATCH(req({ action: "approve" }), { params: Promise.resolve({ id: capability.id, perspectiveId: perspective.id }) });
    expect(response.status).toBe(403);
    await cleanupOrganization(otherOrganization.id);
  });
});

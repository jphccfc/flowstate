import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

let currentEmail = "advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: currentEmail, email: currentEmail } } }) } }),
}));

import { GET as getEvidence } from "../../app/api/capabilities/[id]/evidence/route";
import { POST as postPerspective } from "../../app/api/capabilities/[id]/perspectives/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, sourceEvidenceIds: string[] = []) => postPerspective(new Request("http://localhost", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ stakeholderType: "employee", score: 2, originalStatement: "A human statement", sourceEvidenceIds }),
}) as never, params(id));

describe("evidence provenance authorization", () => {
  const organizationIds: string[] = [];
  afterAll(async () => { for (const id of organizationIds) await cleanupOrganization(id); await prisma.$disconnect(); });

  it("allows a system admin without membership", async () => {
    const organization = await createTestOrganization({ name: "Admin Evidence Org" }); organizationIds.push(organization.id);
    const adminEmail = `admin-${Date.now()}@test.com`;
    await prisma.user.create({ data: { email: adminEmail, role: "SYSTEM_ADMIN" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    currentEmail = adminEmail;
    expect((await getEvidence(new Request("http://localhost") as never, params(capability.id))).status).toBe(200);
    expect((await post(capability.id)).status).toBe(201);
  });

  it("denies a user who belongs only to another organization", async () => {
    const target = await createTestOrganization({ name: "Target Evidence Org" }); organizationIds.push(target.id);
    const other = await createTestOrganization({ name: "Other Evidence Org" }); organizationIds.push(other.id);
    const outsiderEmail = `outsider-${Date.now()}@test.com`;
    const outsider = await prisma.user.create({ data: { email: outsiderEmail, role: "CLIENT_EXECUTIVE" } });
    await prisma.userOrganization.create({ data: { userId: outsider.id, organizationId: other.id, role: "CLIENT_EXECUTIVE" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: target.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    currentEmail = outsiderEmail;
    expect((await getEvidence(new Request("http://localhost") as never, params(capability.id))).status).toBe(403);
    expect((await post(capability.id)).status).toBe(403);
  });
});

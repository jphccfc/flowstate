import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as getClient, PATCH as patchClient } from "../../app/api/clients/[id]/route";

describe("GET /api/clients/[id]", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("embeds currentAsIs and currentToBe per capability", async () => {
    const org = await createTestOrganization({ name: "Clients Route Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Alexandria", score: 2 },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: null, score: 4 },
    });

    const res = await getClient(new Request("http://localhost/api/clients/" + org.id) as never, {
      params: Promise.resolve({ id: org.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    const cap = body.domains[0].capabilities[0];
    expect(cap.currentAsIs).toEqual([{ locationTag: "Alexandria", score: 2 }]);
    expect(cap.currentToBe).toEqual([{ locationTag: null, score: 4 }]);
  });

  it("returns empty arrays for a capability with no assessments", async () => {
    const org = await createTestOrganization({ name: "Clients Route Empty Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Untouched" } });

    const res = await getClient(new Request("http://localhost/api/clients/" + org.id) as never, {
      params: Promise.resolve({ id: org.id }),
    });
    const body = await res.json();
    expect(body.domains[0].capabilities[0].currentAsIs).toEqual([]);
    expect(body.domains[0].capabilities[0].currentToBe).toEqual([]);
  });

  it("PATCH updates engagementMotive", async () => {
    const org = await createTestOrganization({ name: "Engagement Motive Test Org" });
    orgId = org.id;

    const res = await patchClient(
      new Request("http://localhost/api/clients/" + org.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementMotive: "Liquidation" }),
      }) as never,
      { params: Promise.resolve({ id: org.id }) }
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.engagementMotive).toBe("Liquidation");
  });
});

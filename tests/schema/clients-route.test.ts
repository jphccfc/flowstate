import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as getClient, PATCH as patchClient } from "../../app/api/clients/[id]/route";
import { POST as createClient } from "../../app/api/clients/route";

describe("GET /api/clients/[id]", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("POST returns dashboard-compatible count fields", async () => {
    const response = await createClient(new Request("http://localhost/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Created Client Org", industry: "Technology" }),
    }) as never);

    expect(response.status).toBe(201);
    const body = await response.json();
    orgId = body.id;
    expect(body._count).toEqual({ domains: 0, sessions: 0 });
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

  it("rejects access to an organization the authenticated user does not belong to", async () => {
    const outsider = await prisma.organization.create({ data: { name: "Other Organization" } });
    try {
      const getRes = await getClient(new Request("http://localhost/api/clients/" + outsider.id) as never, {
        params: Promise.resolve({ id: outsider.id }),
      });
      expect(getRes.status).toBe(403);

      const patchRes = await patchClient(
        new Request("http://localhost/api/clients/" + outsider.id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Should Not Change" }),
        }) as never,
        { params: Promise.resolve({ id: outsider.id }) }
      );
      expect(patchRes.status).toBe(403);
    } finally {
      await cleanupOrganization(outsider.id);
    }
  });
});

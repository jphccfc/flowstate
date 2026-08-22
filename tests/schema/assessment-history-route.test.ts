import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as getHistory } from "../../app/api/capabilities/[id]/assessment-history/route";

describe("GET /api/capabilities/[id]/assessment-history", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns current + full history for both as-is and to-be", async () => {
    const org = await createTestOrganization({ name: "History Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: null, score: 1, assessedAt: new Date("2026-01-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: null, score: 2, assessedAt: new Date("2026-02-01") },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: null, score: 4, setAt: new Date("2026-01-15") },
    });

    const res = await getHistory(new Request("http://localhost/api/capabilities/" + capability.id + "/assessment-history") as never, {
      params: Promise.resolve({ id: capability.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.currentAsIs).toHaveLength(1);
    expect(body.currentAsIs[0]).toMatchObject({ locationTag: null, score: 2 });
    expect(body.currentToBe).toHaveLength(1);
    expect(body.currentToBe[0]).toMatchObject({ locationTag: null, score: 4 });
    expect(body.asIsHistory).toHaveLength(2);
    expect(body.asIsHistory[0].score).toBe(2); // desc order, most recent first
    expect(body.toBeHistory).toHaveLength(1);
    expect(body.gap).toBe(2);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await getHistory(new Request("http://localhost/api/capabilities/does-not-exist/assessment-history") as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(res.status).toBe(404);
  });
});

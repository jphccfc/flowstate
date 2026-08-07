import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { getCurrentMaturity } from "../../lib/maturity/current";

describe("getCurrentMaturity", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns the latest assessment per location, not older ones", async () => {
    const org = await createTestOrganization({ name: "Current Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Extrusion Process Control" },
    });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 1, assessedAt: new Date("2026-01-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 2, assessedAt: new Date("2026-03-01") },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Alexandria", score: 4, assessedAt: new Date("2026-02-01") },
    });

    const current = await getCurrentMaturity(capability.id);

    expect(current).toHaveLength(2);
    const brampton = current.find((c) => c.locationTag === "Brampton");
    const alexandria = current.find((c) => c.locationTag === "Alexandria");
    expect(brampton?.score).toBe(2);
    expect(alexandria?.score).toBe(4);
  });

  it("returns an empty array when a capability has never been assessed", async () => {
    const org = await createTestOrganization({ name: "Unassessed Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Untouched Capability" },
    });

    const current = await getCurrentMaturity(capability.id);
    expect(current).toEqual([]);
  });
});

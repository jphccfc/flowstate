import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { getCurrentTargetMaturity, getCurrentTargetMaturityForOrganization } from "../../lib/maturity/target";

describe("target maturity helpers", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("returns the latest target per location, and the org-wide batched view", async () => {
    const org = await createTestOrganization({ name: "Target Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Extrusion Process Control" } });

    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 3, setAt: new Date("2026-01-01") },
    });
    await prisma.targetMaturity.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 4, setAt: new Date("2026-03-01") },
    });

    const current = await getCurrentTargetMaturity(capability.id);
    expect(current).toHaveLength(1);
    expect(current[0].score).toBe(4);

    const orgWide = await getCurrentTargetMaturityForOrganization(org.id);
    expect(orgWide).toHaveLength(1);
    expect(orgWide[0]).toMatchObject({ capabilityId: capability.id, locationTag: "Brampton", score: 4 });
  });

  it("returns an empty array when a capability has no targets", async () => {
    const org = await createTestOrganization({ name: "No Target Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Untouched" } });

    expect(await getCurrentTargetMaturity(capability.id)).toEqual([]);
  });
});

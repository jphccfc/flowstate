import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("maturity models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("records a versioned maturity assessment per capability and location", async () => {
    const org = await createTestOrganization({ name: "Maturity Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Extrusion Process Control" },
    });
    const kpi = await prisma.kPI.create({
      data: { organizationId: org.id, name: "On-time delivery rate", targetValue: "95%" },
    });

    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 2, evidence: "Manual extrusion logs, no digital tracking" },
    });
    await prisma.maturityAssessment.create({
      data: { capabilityId: capability.id, locationTag: "Brampton", score: 3, evidence: "Digital tracking introduced" },
    });

    const history = await prisma.maturityAssessment.findMany({
      where: { capabilityId: capability.id, locationTag: "Brampton" },
      orderBy: { assessedAt: "asc" },
    });
    expect(history).toHaveLength(2);
    expect(history[1].score).toBe(3);

    const ceiling = await prisma.capabilityKPIMaturityCeiling.create({
      data: {
        capabilityId: capability.id,
        kpiId: kpi.id,
        maturityLevel: 2,
        targetCeilingMin: 50,
        targetCeilingMax: 60,
        valueToNextLevel: 250000,
      },
    });
    expect(ceiling.valueToNextLevel).toBe(250000);
  });
});

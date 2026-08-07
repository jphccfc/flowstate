import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("dependency and conflict models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("records a cross-domain dependency and a stakeholder conflict flag", async () => {
    const org = await createTestOrganization({ name: "Dependency Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Technology & Data" },
    });
    const crmCapability = await prisma.capability.create({
      data: { domainId: domain.id, name: "CRM Data Accuracy" },
    });
    const salesKpi = await prisma.kPI.create({
      data: { organizationId: org.id, name: "Quarterly Sales Target" },
    });

    const dependency = await prisma.dependency.create({
      data: {
        type: "CAPABILITY_TO_KPI",
        sourceType: "CAPABILITY",
        sourceId: crmCapability.id,
        targetType: "KPI",
        targetId: salesKpi.id,
        description: "CRM data accuracy cascades into quarterly finance targets",
      },
    });
    expect(dependency.description).toContain("cascades");

    const conflict = await prisma.conflictFlag.create({
      data: {
        entityType: "CAPABILITY",
        entityId: crmCapability.id,
        claims: [
          { stakeholderId: "s1", segmentId: "seg1", statement: "Inventory tracking is fine" },
          { stakeholderId: "s2", segmentId: "seg2", statement: "PO reconciliation is broken" },
        ],
      },
    });
    expect(conflict.status).toBe("OPEN");
    expect(Array.isArray(conflict.claims)).toBe(true);
  });
});

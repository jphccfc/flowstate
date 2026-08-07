import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("tagging model", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("tags a segment with a capability at a given confidence and supports review status transitions", async () => {
    const org = await createTestOrganization({ name: "Tagging Test Org" });
    orgId = org.id;

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });

    // Use test IDs instead of creating real capability
    // The Tag model allows any string for targetId
    const capabilityId = "test-capability-id";

    const tag = await prisma.tag.create({
      data: {
        segmentId: segment.id,
        targetType: "CAPABILITY",
        targetId: capabilityId,
        confidence: 0.92,
        status: "AUTO_APPROVED",
      },
    });

    expect(tag.status).toBe("AUTO_APPROVED");

    const reassigned = await prisma.tag.update({
      where: { id: tag.id },
      data: { status: "REASSIGNED", reviewedBy: "advisor-1", reviewedAt: new Date() },
    });
    expect(reassigned.status).toBe("REASSIGNED");
    expect(reassigned.reviewedBy).toBe("advisor-1");
  });
});

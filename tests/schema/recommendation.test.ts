import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("recommendation models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("drafts a recommendation, edits it, and logs the feedback", async () => {
    const org = await createTestOrganization({ name: "Recommendation Test Org" });
    orgId = org.id;

    const recommendation = await prisma.recommendation.create({
      data: {
        organizationId: org.id,
        title: "Digitize extrusion process tracking at Brampton",
        description: "Move from manual logs to a digital tracking system.",
        relatedCapabilityIds: ["cap-1"],
        relatedKPIIds: ["kpi-1"],
        estimatedValue: 250000,
        status: "DRAFT",
      },
    });
    expect(recommendation.status).toBe("DRAFT");

    const edited = await prisma.recommendation.update({
      where: { id: recommendation.id },
      data: { status: "EDITED", estimatedValue: 200000 },
    });

    const feedback = await prisma.recommendationFeedback.create({
      data: {
        recommendationId: recommendation.id,
        action: "edited",
        originalFields: { estimatedValue: 250000 },
        editedFields: { estimatedValue: 200000 },
        reason: "Advisor judged the original estimate too optimistic",
        actedBy: "advisor-1",
      },
    });

    expect(edited.estimatedValue).toBe(200000);
    expect(feedback.action).toBe("edited");

    const withFeedback = await prisma.recommendation.findUniqueOrThrow({
      where: { id: recommendation.id },
      include: { feedback: true },
    });
    expect(withFeedback.feedback).toHaveLength(1);
  });
});

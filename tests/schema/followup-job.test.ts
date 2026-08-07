import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("follow-up suggestion and processing job models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("generates a live follow-up suggestion tied to a session and segment", async () => {
    const org = await createTestOrganization({ name: "FollowUp Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });
    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, sessionId: session.id, type: "AUDIO", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "We are losing money on night shift." },
    });

    const suggestion = await prisma.followUpSuggestion.create({
      data: {
        sessionId: session.id,
        triggerSegmentId: segment.id,
        suggestedQuestion: "What's driving the night shift labor cost specifically?",
        status: "SHOWN",
      },
    });
    expect(suggestion.status).toBe("SHOWN");

    const withSuggestions = await prisma.assessmentSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { followUpSuggestions: true },
    });
    expect(withSuggestions.followUpSuggestions).toHaveLength(1);
  });

  it("tracks an async processing job through its lifecycle", async () => {
    const job = await prisma.processingJob.create({
      data: { type: "transcribe", targetId: "some-captured-input-id", status: "QUEUED" },
    });
    expect(job.attempts).toBe(0);

    const running = await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    expect(running.status).toBe("RUNNING");
    expect(running.attempts).toBe(1);

    await prisma.processingJob.delete({ where: { id: job.id } });
  });
});

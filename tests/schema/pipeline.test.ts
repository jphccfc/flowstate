import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { processCapturedInput } from "../../lib/ingestion/pipeline";
import { transcribeAudio } from "../../lib/ai/transcription";
import { extractDocumentText } from "../../lib/documents/extraction";
import { generateFollowUpSuggestions } from "../../lib/ai/followups";

vi.mock("../../lib/ai/transcription", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("../../lib/documents/extraction", () => ({
  extractDocumentText: vi.fn(),
}));
vi.mock("../../lib/ai/followups", () => ({
  generateFollowUpSuggestions: vi.fn(),
}));

describe("processCapturedInput", () => {
  let orgId: string;
  let sessionOrgId: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(transcribeAudio).mockReset();
    vi.mocked(extractDocumentText).mockReset();
    vi.mocked(generateFollowUpSuggestions).mockReset();
  });

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    if (sessionOrgId) await cleanupOrganization(sessionOrgId);
    await prisma.$disconnect();
  });

  it("segments and tags a text CapturedInput end to end against real data, auto-approving high-confidence tags", async () => {
    const org = await createTestOrganization({ name: "Pipeline Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Shift Scheduling" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "TEXT_NOTE",
        rawText: "Night shift scheduling is a mess.\n\nUnrelated paragraph about lunch.",
        status: "TRANSCRIBED",
      },
    });

    const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      const segmentText: string = body.messages[1].content;
      const isSchedulingSegment = segmentText.includes("scheduling");
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(
            isSchedulingSegment
              ? [{ targetId: capability.id, confidence: 0.92 }]
              : []
          ) } }],
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await processCapturedInput(input.id);

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const segments = await prisma.capturedSegment.findMany({
      where: { capturedInputId: input.id },
      orderBy: { order: "asc" },
    });
    expect(segments).toHaveLength(2);

    const tags = await prisma.tag.findMany({ where: { segmentId: { in: segments.map((s) => s.id) } } });
    expect(tags).toHaveLength(1);
    expect(tags[0].targetId).toBe(capability.id);
    expect(tags[0].status).toBe("AUTO_APPROVED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["segment", "tag"]);
    expect(jobs.every((j) => j.status === "DONE")).toBe(true);
    expect(generateFollowUpSuggestions).not.toHaveBeenCalled();
  });

  it("marks the input FAILED and records the error when tagging throws", async () => {
    const org = await createTestOrganization({ name: "Pipeline Failure Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "TEXT_NOTE",
        rawText: "Some text that will fail to tag.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Claude API unavailable"))
    );

    await expect(processCapturedInput(input.id)).rejects.toThrow("Claude API unavailable");

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("FAILED");
    expect(updatedInput.error).toContain("Claude API unavailable");
  });

  it("transcribes an AUDIO CapturedInput before segmenting, when rawText is null", async () => {
    const org = await createTestOrganization({ name: "Pipeline Audio Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "AUDIO",
        sourceRef: "https://blob.example.com/interview.m4a",
        status: "PENDING",
      },
    });

    vi.mocked(transcribeAudio).mockResolvedValue("Night shift scheduling is a mess.");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "[]" } }] }) })
    );

    await processCapturedInput(input.id);

    expect(transcribeAudio).toHaveBeenCalledWith("https://blob.example.com/interview.m4a");
    expect(extractDocumentText).not.toHaveBeenCalled();

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.rawText).toBe("Night shift scheduling is a mess.");
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["transcribe", "segment", "tag"]);
  });

  it("generates follow-up suggestions after tagging when the input belongs to a live session", async () => {
    const org = await createTestOrganization({ name: "Pipeline Session Test Org" });
    sessionOrgId = org.id;

    const domain = await prisma.businessDomain.create({
      data: { organizationId: org.id, name: "Operations" },
    });
    const capability = await prisma.capability.create({
      data: { domainId: domain.id, name: "Shift Scheduling" },
    });
    const advisor = await prisma.user.create({
      data: { email: `advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    // Prior capture in this session, already tagged, to seed "touched areas"
    const priorInput = await prisma.capturedInput.create({
      data: { organizationId: org.id, sessionId: session.id, type: "TEXT_NOTE", rawText: "Night shift scheduling.", status: "TAGGED" },
    });
    const priorSegment = await prisma.capturedSegment.create({
      data: { capturedInputId: priorInput.id, order: 0, text: "Night shift scheduling." },
    });
    await prisma.tag.create({
      data: { segmentId: priorSegment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "AUTO_APPROVED" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        sessionId: session.id,
        type: "TEXT_NOTE",
        rawText: "It's worse in the winter months.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "[]" } }] }) })
    );
    vi.mocked(generateFollowUpSuggestions).mockResolvedValue([
      "How does seasonal demand affect the night shift specifically?",
    ]);

    await processCapturedInput(input.id);

    expect(generateFollowUpSuggestions).toHaveBeenCalledWith(
      "It's worse in the winter months.",
      ["Shift Scheduling"]
    );

    const suggestions = await prisma.followUpSuggestion.findMany({ where: { sessionId: session.id } });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].suggestedQuestion).toBe("How does seasonal demand affect the night shift specifically?");
    expect(suggestions[0].status).toBe("SHOWN");

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    expect(jobs.map((j) => j.type)).toEqual(["segment", "tag", "suggest_followups"]);
  });

  it("still reaches TAGGED when the suggest_followups step throws (non-fatal)", async () => {
    const org = await createTestOrganization({ name: "Pipeline Session Failure Test Org" });
    sessionOrgId = org.id;

    await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const advisor = await prisma.user.create({
      data: { email: `advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        sessionId: session.id,
        type: "TEXT_NOTE",
        rawText: "Some live note.",
        status: "TRANSCRIBED",
      },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "[]" } }] }) })
    );
    vi.mocked(generateFollowUpSuggestions).mockRejectedValue(new Error("Claude unavailable"));

    await processCapturedInput(input.id);

    const updatedInput = await prisma.capturedInput.findUniqueOrThrow({ where: { id: input.id } });
    expect(updatedInput.status).toBe("TAGGED");

    const jobs = await prisma.processingJob.findMany({ where: { targetId: input.id }, orderBy: { createdAt: "asc" } });
    const suggestJob = jobs.find((j) => j.type === "suggest_followups");
    expect(suggestJob?.status).toBe("FAILED");
    expect(suggestJob?.error).toContain("Claude unavailable");
  });
});

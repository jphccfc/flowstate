import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";
import { processCapturedInput } from "../../lib/ingestion/pipeline";
import { transcribeAudio } from "../../lib/ai/transcription";
import { extractDocumentText } from "../../lib/documents/extraction";

vi.mock("../../lib/ai/transcription", () => ({
  transcribeAudio: vi.fn(),
}));
vi.mock("../../lib/documents/extraction", () => ({
  extractDocumentText: vi.fn(),
}));

describe("processCapturedInput", () => {
  let orgId: string;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(transcribeAudio).mockReset();
    vi.mocked(extractDocumentText).mockReset();
  });

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
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
      const segmentText: string = body.messages[0].content;
      const isSchedulingSegment = segmentText.includes("scheduling");
      return {
        json: async () => ({
          content: [
            {
              text: JSON.stringify(
                isSchedulingSegment
                  ? [{ targetId: capability.id, confidence: 0.92 }]
                  : []
              ),
            },
          ],
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
      vi.fn().mockResolvedValue({ json: async () => ({ content: [{ text: "[]" }] }) })
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
});

import { afterAll, describe, expect, it } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

describe("ingestion models", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a CapturedInput with segments and reads them back", async () => {
    const org = await createTestOrganization({ name: "Ingestion Test Org" });
    orgId = org.id;

    const input = await prisma.capturedInput.create({
      data: {
        organizationId: org.id,
        type: "AUDIO",
        locationTag: "Brampton",
        status: "TRANSCRIBED",
        rawText: "We are losing money on night shift.",
        segments: {
          create: [
            { order: 0, text: "We are losing money on night shift.", speaker: "Plant Manager" },
          ],
        },
      },
      include: { segments: true },
    });

    expect(input.locationTag).toBe("Brampton");
    expect(input.segments).toHaveLength(1);
    expect(input.segments[0].text).toContain("night shift");

    const found = await prisma.organization.findUniqueOrThrow({
      where: { id: org.id },
      include: { capturedInputs: true },
    });
    expect(found.capturedInputs).toHaveLength(1);
  });
});

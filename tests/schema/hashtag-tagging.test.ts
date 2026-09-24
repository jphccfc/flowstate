import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("fluid hashtag tagging schema", () => {
  let organizationId = "";
  let otherOrganizationId = "";
  let documentId = "";
  let meetingNoteId = "";

  beforeAll(async () => {
    const organization = await prisma.organization.create({ data: { name: "Hashtag discovery organisation" } });
    const otherOrganization = await prisma.organization.create({ data: { name: "Other hashtag organisation" } });
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    const document = await prisma.capturedInput.create({ data: { organizationId, type: "DOCUMENT", sourceRef: "falcon-model.xlsx", rawText: "Project Falcon workbook." } });
    const meetingNote = await prisma.capturedInput.create({ data: { organizationId, type: "TEXT_NOTE", sourceRef: "falcon-meeting", rawText: "Project Falcon meeting notes." } });
    documentId = document.id;
    meetingNoteId = meetingNote.id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  it("normalizes one organisation-scoped tag vocabulary entry", async () => {
    const tag = await prisma.tagDefinition.create({
      data: { organizationId, displayName: "Project Falcon", normalizedName: "project-falcon", aliases: ["falcon"] },
    });
    expect(tag).toMatchObject({ organizationId, displayName: "Project Falcon", normalizedName: "project-falcon", active: true });
    await expect(prisma.tagDefinition.create({ data: { organizationId, displayName: "#Project Falcon", normalizedName: "project-falcon" } })).rejects.toThrow();
    await expect(prisma.tagDefinition.create({ data: { organizationId: otherOrganizationId, displayName: "Project Falcon", normalizedName: "project-falcon" } })).resolves.toMatchObject({ organizationId: otherOrganizationId });
  });

  it("attaches one reusable tag to a workbook and a meeting note without affecting taxonomy tags", async () => {
    const tag = await prisma.tagDefinition.findFirstOrThrow({ where: { organizationId, normalizedName: "project-falcon" } });
    const [workbookAttachment, noteAttachment] = await Promise.all([
      prisma.tagAttachment.create({ data: { organizationId, tagDefinitionId: tag.id, capturedInputId: documentId, targetKey: `input:${documentId}`, source: "AI_SUGGESTED", status: "APPROVED", confidence: 0.91 } }),
      prisma.tagAttachment.create({ data: { organizationId, tagDefinitionId: tag.id, capturedInputId: meetingNoteId, targetKey: `input:${meetingNoteId}`, source: "MANUAL", status: "APPROVED" } }),
    ]);
    expect(workbookAttachment.source).toBe("AI_SUGGESTED");
    expect(noteAttachment.source).toBe("MANUAL");
    const discovered = await prisma.tagAttachment.findMany({ where: { organizationId, tagDefinition: { normalizedName: "project-falcon" }, status: "APPROVED" }, include: { capturedInput: true } });
    expect(discovered.map((entry) => entry.capturedInput.type).sort()).toEqual(["DOCUMENT", "TEXT_NOTE"]);
  });

});

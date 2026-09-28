import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

let currentEmail = "hashtag-discovery-advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "hashtag-discovery-user", email: currentEmail } } }) } }) }));

import { GET as discover } from "@/app/api/clients/[id]/hashtags/discovery/route";

describe("hashtag discovery API", () => {
  let organizationId = "";
  let otherOrganizationId = "";

  beforeAll(async () => {
    const user = await prisma.user.upsert({ where: { email: currentEmail }, update: { role: "ADVISOR" }, create: { email: currentEmail, role: "ADVISOR" } });
    const organization = await prisma.organization.create({ data: { name: "Hashtag discovery organisation" } });
    const otherOrganization = await prisma.organization.create({ data: { name: "Other hashtag discovery organisation" } });
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    await prisma.userOrganization.create({ data: { userId: user.id, organizationId, role: "ADVISOR" } });

    const falcon = await prisma.tagDefinition.create({ data: { organizationId, displayName: "Project Falcon", normalizedName: "project-falcon", aliases: ["falcon-deal"] } });
    const workbook = await prisma.capturedInput.create({ data: { organizationId, type: "DOCUMENT", sourceRef: "Project-Falcon-Model.xlsx", subject: "Falcon operating model", rawText: "Workbook extraction" } });
    const meetingNote = await prisma.capturedInput.create({ data: { organizationId, type: "TEXT_NOTE", subject: "Alexandria leadership meeting", rawText: "Decisions were recorded." } });
    const meetingSegment = await prisma.capturedSegment.create({ data: { capturedInputId: meetingNote.id, order: 0, text: "The team agreed a Falcon recovery plan is needed." } });
    const unrelated = await prisma.capturedInput.create({ data: { organizationId, type: "EMAIL", subject: "Unrelated renewal", rawText: "No shared tag." } });

    await prisma.tagAttachment.createMany({ data: [
      { organizationId, tagDefinitionId: falcon.id, capturedInputId: workbook.id, targetKey: `input:${workbook.id}`, source: "MANUAL", status: "APPROVED" },
      { organizationId, tagDefinitionId: falcon.id, capturedInputId: meetingNote.id, segmentId: meetingSegment.id, targetKey: `segment:${meetingSegment.id}`, source: "AI_SUGGESTED", status: "APPROVED", rationale: "Named initiative" },
      { organizationId, tagDefinitionId: falcon.id, capturedInputId: unrelated.id, targetKey: `input:${unrelated.id}`, source: "AI_SUGGESTED", status: "SUGGESTED" },
    ] });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.user.deleteMany({ where: { email: { in: ["hashtag-discovery-advisor@test.com", "hashtag-discovery-outsider@test.com"] } } });
    await prisma.$disconnect();
  });

  it("returns approved cross-source evidence with source metadata and segment provenance", async () => {
    const response = await discover(new Request(`http://localhost/discovery?q=%23project-falcon`) as NextRequest, { params: Promise.resolve({ id: organizationId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      query: "project-falcon",
      results: expect.arrayContaining([
        expect.objectContaining({ tag: expect.objectContaining({ normalizedName: "project-falcon" }), source: expect.objectContaining({ type: "DOCUMENT", sourceRef: "Project-Falcon-Model.xlsx", subject: "Falcon operating model" }), excerpt: null }),
        expect.objectContaining({ tag: expect.objectContaining({ normalizedName: "project-falcon" }), source: expect.objectContaining({ type: "TEXT_NOTE", subject: "Alexandria leadership meeting" }), excerpt: "The team agreed a Falcon recovery plan is needed." }),
      ]),
    });
    const body = await discover(new Request(`http://localhost/discovery?q=%23project-falcon&sourceType=DOCUMENT`) as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect((await body.json()).results).toHaveLength(1);
  });

  it("rejects an outsider before returning discovery evidence", async () => {
    currentEmail = "hashtag-discovery-outsider@test.com";
    const response = await discover(new Request(`http://localhost/discovery?q=%23project-falcon`) as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(403);
    currentEmail = "hashtag-discovery-advisor@test.com";
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

let currentEmail = "hashtag-advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "hashtag-user", email: currentEmail } } }) } }) }));

import { GET as listTags, POST as createTag } from "@/app/api/clients/[id]/hashtags/route";
import { GET as listAttachments, POST as attachTag, DELETE as detachTag } from "@/app/api/clients/[id]/hashtags/attachments/route";

function request(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as unknown as NextRequest;
}

describe("hashtag catalogue API", () => {
  let organizationId = "";
  let otherOrganizationId = "";
  let inputId = "";

  beforeAll(async () => {
    const user = await prisma.user.upsert({ where: { email: currentEmail }, update: { role: "ADVISOR" }, create: { email: currentEmail, role: "ADVISOR" } });
    const organization = await prisma.organization.create({ data: { name: "Hashtag API organisation" } });
    const otherOrganization = await prisma.organization.create({ data: { name: "Other Hashtag API organisation" } });
    organizationId = organization.id; otherOrganizationId = otherOrganization.id;
    await prisma.userOrganization.create({ data: { userId: user.id, organizationId, role: "ADVISOR" } });
    inputId = (await prisma.capturedInput.create({ data: { organizationId, type: "TEXT_NOTE", rawText: "Project Falcon review" } })).id;
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.user.deleteMany({ where: { email: { in: ["hashtag-advisor@test.com", "hashtag-outsider@test.com"] } } });
    await prisma.$disconnect();
  });

  it("creates a normalized organisation tag and attaches it to evidence", async () => {
    const created = await createTag(request("http://localhost/hashtags", { displayName: "#Project Falcon", aliases: ["Falcon"] }), { params: Promise.resolve({ id: organizationId }) });
    expect(created.status).toBe(201);
    const tag = await created.json();
    expect(tag).toMatchObject({ organizationId, displayName: "Project Falcon", normalizedName: "project-falcon", aliases: ["falcon"] });

    const duplicate = await createTag(request("http://localhost/hashtags", { displayName: "project_falcon" }), { params: Promise.resolve({ id: organizationId }) });
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).id).toBe(tag.id);

    const attached = await attachTag(request("http://localhost/attachments", { tagDefinitionId: tag.id, capturedInputId: inputId }), { params: Promise.resolve({ id: organizationId }) });
    expect(attached.status).toBe(201);
    expect(await attached.json()).toMatchObject({ organizationId, tagDefinitionId: tag.id, capturedInputId: inputId, targetKey: `input:${inputId}`, source: "MANUAL", status: "APPROVED" });

    const duplicateAttachment = await attachTag(request("http://localhost/attachments", { tagDefinitionId: tag.id, capturedInputId: inputId }), { params: Promise.resolve({ id: organizationId }) });
    expect(duplicateAttachment.status).toBe(200);
    expect((await duplicateAttachment.json()).id).toBe((await prisma.tagAttachment.findFirstOrThrow({ where: { organizationId, tagDefinitionId: tag.id, capturedInputId: inputId } })).id);

    const listedAttachments = await listAttachments(new Request(`http://localhost/attachments?capturedInputId=${inputId}`) as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(listedAttachments.status).toBe(200);
    const attachmentId = (await listedAttachments.json())[0].id as string;
    const detached = await detachTag(new Request(`http://localhost/attachments?attachmentId=${attachmentId}`, { method: "DELETE" }) as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(detached.status).toBe(204);
    expect(await prisma.tagAttachment.findUnique({ where: { id: attachmentId } })).toBeNull();
    expect(await prisma.tagDefinition.findUnique({ where: { id: tag.id } })).not.toBeNull();

    const list = await listTags(new Request("http://localhost/hashtags?q=project+falcon") as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect((await list.json()).map((entry: { normalizedName: string }) => entry.normalizedName)).toContain("project-falcon");
  });

  it("rejects attaching a foreign tag or reading a foreign organisation", async () => {
    const foreignTag = await prisma.tagDefinition.create({ data: { organizationId: otherOrganizationId, displayName: "Project Falcon", normalizedName: "project-falcon" } });
    const attachment = await attachTag(request("http://localhost/attachments", { tagDefinitionId: foreignTag.id, capturedInputId: inputId }), { params: Promise.resolve({ id: organizationId }) });
    expect(attachment.status).toBe(400);

    currentEmail = "hashtag-outsider@test.com";
    const denied = await listTags(new Request("http://localhost/hashtags") as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(denied.status).toBe(403);
    currentEmail = "hashtag-advisor@test.com";
  });
});

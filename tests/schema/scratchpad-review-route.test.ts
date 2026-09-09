import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

let currentEmail = "advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }),
}));

import { PATCH } from "../../app/api/scratchpad/route";

const request = (body: unknown) => new Request("http://localhost/api/scratchpad", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}) as never;

describe("Scratch Pad review route", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    for (const id of organizationIds) await cleanupOrganization(id);
    await prisma.$disconnect();
  });

  it("edits a note and explicitly approves it with reviewer audit fields", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Review Org" });
    organizationIds.push(organization.id);
    const note = await prisma.capturedInput.create({
      data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "raw draft", status: "TRANSCRIBED" },
    });

    const edited = await PATCH(request({ id: note.id, text: "human-edited draft", revision: 0 }));
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ rawText: "human-edited draft", revision: 1, reviewStatus: "PENDING_REVIEW" });

    const approved = await PATCH(request({ id: note.id, action: "approve" }));
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ reviewStatus: "APPROVED", reviewedBy: "advisor@test.com" });
    expect((await prisma.capturedInput.findUniqueOrThrow({ where: { id: note.id } })).reviewedAt).toBeTruthy();
  });

  it("rejects a note with an explicit reviewer decision", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Reject Org" });
    organizationIds.push(organization.id);
    const note = await prisma.capturedInput.create({
      data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "provisional", status: "TRANSCRIBED" },
    });

    const rejected = await PATCH(request({ id: note.id, action: "reject" }));
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({ reviewStatus: "REJECTED", reviewedBy: "advisor@test.com" });
  });

  it("allows ordinary note edits with client access without review permission", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Edit Org" });
    organizationIds.push(organization.id);
    const editor = await prisma.user.upsert({ where: { email: "editor@test.com" }, update: {}, create: { email: "editor@test.com", role: "CLIENT_STAKEHOLDER" } });
    await prisma.userOrganization.create({ data: { userId: editor.id, organizationId: organization.id, role: "CLIENT_STAKEHOLDER" } });
    currentEmail = "editor@test.com";
    const note = await prisma.capturedInput.create({ data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "raw draft", status: "TRANSCRIBED", reviewStatus: "APPROVED", reviewedBy: "old-reviewer@test.com", reviewedAt: new Date() } });

    const edited = await PATCH(request({ id: note.id, text: "<p>edited <script>alert(1)</script></p>", revision: 0 }));
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ rawText: "<p>edited </p>", revision: 1, reviewStatus: "PENDING_REVIEW", reviewedBy: null, reviewedAt: null });
    currentEmail = "advisor@test.com";
  });

  it("denies review decisions to a client user without review permission", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Review Permission Org" });
    organizationIds.push(organization.id);
    const editor = await prisma.user.upsert({ where: { email: "reviewless@test.com" }, update: {}, create: { email: "reviewless@test.com", role: "CLIENT_STAKEHOLDER" } });
    await prisma.userOrganization.create({ data: { userId: editor.id, organizationId: organization.id, role: "CLIENT_STAKEHOLDER" } });
    currentEmail = "reviewless@test.com";
    const note = await prisma.capturedInput.create({ data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "pending", status: "TRANSCRIBED" } });

    const response = await PATCH(request({ id: note.id, action: "approve" }));
    expect(response.status).toBe(403);
    expect((await prisma.capturedInput.findUniqueOrThrow({ where: { id: note.id } })).reviewStatus).toBe("PENDING_REVIEW");
    currentEmail = "advisor@test.com";
  });

  it("rejects review mutations by a user outside the note organization", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Private Org" });
    const otherOrganization = await createTestOrganization({ name: "Scratch Pad Other Org" });
    organizationIds.push(organization.id, otherOrganization.id);
    currentEmail = "outsider@test.com";
    const outsider = await prisma.user.upsert({ where: { email: currentEmail }, update: {}, create: { email: currentEmail, role: "CLIENT_EXECUTIVE" } });
    await prisma.userOrganization.create({ data: { userId: outsider.id, organizationId: otherOrganization.id, role: "CLIENT_EXECUTIVE" } });
    const note = await prisma.capturedInput.create({
      data: { organizationId: organization.id, type: "TEXT_NOTE", rawText: "private", status: "TRANSCRIBED" },
    });

    const response = await PATCH(request({ id: note.id, action: "approve" }));
    expect(response.status).toBe(403);
    expect((await prisma.capturedInput.findUniqueOrThrow({ where: { id: note.id } })).reviewedBy).toBeNull();
    currentEmail = "advisor@test.com";
  });
});
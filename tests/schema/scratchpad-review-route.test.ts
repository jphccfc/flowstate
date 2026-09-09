import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

const { processCapturedInput } = vi.hoisted(() => ({ processCapturedInput: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ingestion/pipeline", () => ({ processCapturedInput }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (fn: () => unknown) => fn() }));

let currentEmail = "advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }),
}));

import { GET, POST, PATCH } from "../../app/api/scratchpad/route";

const request = (body: unknown, method = "PATCH") => new Request("http://localhost/api/scratchpad", {
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}) as never;

describe("Scratch Pad review route", () => {
  const organizationIds: string[] = [];

  afterAll(async () => {
    for (const id of organizationIds) await cleanupOrganization(id);
    await prisma.$disconnect();
  });

  it("creates a session-linked raw scratch pad capture and schedules AI processing", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Live Session Org" });
    organizationIds.push(organization.id);
    const advisor = await prisma.user.upsert({ where: { email: "advisor@test.com" }, update: {}, create: { email: "advisor@test.com", role: "ADVISOR" } });
    const session = await prisma.assessmentSession.create({ data: { organizationId: organization.id, advisorId: advisor.id, status: "active" } });

    const response = await POST(request({ organizationId: organization.id, sessionId: session.id, text: "Unstructured workshop thought" }, "POST"));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({ organizationId: organization.id, sessionId: session.id, type: "TEXT_NOTE", rawText: "Unstructured workshop thought", status: "TRANSCRIBED" });
    expect(processCapturedInput).toHaveBeenCalledWith(created.id);
  });
  it("rejects new session-scoped captures after the live session is completed", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Completed Session Org" });
    organizationIds.push(organization.id);
    const advisor = await prisma.user.upsert({ where: { email: "advisor@test.com" }, update: {}, create: { email: "advisor@test.com", role: "ADVISOR" } });
    const session = await prisma.assessmentSession.create({ data: { organizationId: organization.id, advisorId: advisor.id, status: "completed", completedAt: new Date() } });

    const response = await POST(request({ organizationId: organization.id, sessionId: session.id, text: "Must not be discarded" }, "POST"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Live session is not active" });
    expect(await prisma.capturedInput.count({ where: { organizationId: organization.id } })).toBe(0);
  });

  it("loads notes from a completed session without treating completion as missing data", async () => {
    const organization = await createTestOrganization({ name: "Scratch Pad Completed Review Org" });
    organizationIds.push(organization.id);
    const advisor = await prisma.user.upsert({ where: { email: "advisor@test.com" }, update: {}, create: { email: "advisor@test.com", role: "ADVISOR" } });
    const session = await prisma.assessmentSession.create({ data: { organizationId: organization.id, advisorId: advisor.id, status: "completed", completedAt: new Date() } });
    await prisma.capturedInput.create({ data: { organizationId: organization.id, sessionId: session.id, type: "TEXT_NOTE", rawText: "Recovered note", status: "TRANSCRIBED" } });

    const response = await GET(new Request(`http://localhost/api/scratchpad?organizationId=${organization.id}&sessionId=${session.id}`) as never);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ rawText: "Recovered note", sessionId: session.id })]));
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
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

let currentEmail = "advisor@test.com";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: currentEmail } } }) },
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockImplementation(async (name: string) => ({ url: `https://blob.example.com/${name}` })),
}));

vi.mock("@/lib/ingestion/pipeline", () => ({
  processCapturedInput: vi.fn().mockResolvedValue(undefined),
}));

import { GET as listInputs, POST as createInput } from "../../app/api/captured-inputs/route";
import { GET as getInput } from "../../app/api/captured-inputs/[id]/route";

function makeFormDataRequest(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/captured-inputs", {
    method: "POST",
    body: formData,
  }) as never;
}

describe("captured-inputs routes", () => {
  let orgId: string;

  afterEach(() => {
    currentEmail = "advisor@test.com";
  });

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a TEXT_NOTE input via the rawText field, and lists/gets it back", async () => {
    const org = await createTestOrganization({ name: "Route Test Org" });
    orgId = org.id;

    const createRes = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "A short note." })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.type).toBe("TEXT_NOTE");
    expect(created.status).toBe("TRANSCRIBED");

    const listReq = new Request(`http://localhost/api/captured-inputs?organizationId=${org.id}`) as never;
    const listRes = await listInputs(listReq);
    const list = await listRes.json();
    expect(list.some((i: { id: string }) => i.id === created.id)).toBe(true);

    const getRes = await getInput(new Request("http://localhost/api/captured-inputs/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
  });

  it("allows a system admin to capture and read client inputs without membership, but denies another organization", async () => {
    const client = await createTestOrganization({ name: "System Admin Capture Client" });
    orgId = client.id;
    const foreign = await prisma.organization.create({ data: { name: "System Admin Foreign Org", industry: "Manufacturing" } });
    const adminEmail = `capture-system-admin-${Date.now()}@flowstate.test`;
    await prisma.user.create({ data: { email: adminEmail, role: "SYSTEM_ADMIN" } });
    currentEmail = adminEmail;

    const createRes = await createInput(
      makeFormDataRequest({ organizationId: client.id, type: "TEXT_NOTE", rawText: "Admin capture note." })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect((await listInputs(new Request(`http://localhost/api/captured-inputs?organizationId=${client.id}`) as never)).status).toBe(200);
    expect((await getInput(new Request(`http://localhost/api/captured-inputs/${created.id}`) as never, {
      params: Promise.resolve({ id: created.id }),
    })).status).toBe(200);

    const outsiderEmail = `capture-outsider-${Date.now()}@flowstate.test`;
    await prisma.user.create({ data: { email: outsiderEmail, role: "ADVISOR" } });
    currentEmail = outsiderEmail;
    const foreignCreate = await createInput(
      makeFormDataRequest({ organizationId: foreign.id, type: "TEXT_NOTE", rawText: "Should be denied." })
    );
    expect(foreignCreate.status).toBe(403);
    expect((await listInputs(new Request(`http://localhost/api/captured-inputs?organizationId=${foreign.id}`) as never)).status).toBe(403);
    expect(await prisma.capturedInput.count({ where: { organizationId: foreign.id } })).toBe(0);

    await prisma.organization.delete({ where: { id: foreign.id } });
    await prisma.organization.delete({ where: { id: client.id } });
    orgId = "";
    currentEmail = "advisor@test.com";
  });

  it("uploads an AUDIO file to Blob and creates a PENDING CapturedInput with sourceRef set", async () => {
    const org = await createTestOrganization({ name: "Route Audio Test Org" });
    orgId = org.id;

    const file = new File(["fake audio bytes"], "interview.m4a", { type: "audio/m4a" });
    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "AUDIO", file })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.sourceRef).toBe("https://blob.example.com/interview.m4a");
    expect(created.status).toBe("PENDING");
    expect(created.rawText).toBeNull();
  });

  it("uploads a PDF document and preserves its source provenance for processing", async () => {
    const org = await createTestOrganization({ name: "Route Document Test Org" });
    orgId = org.id;
    const file = new File(["fake pdf bytes"], "assessment.pdf", { type: "application/pdf" });
    const res = await createInput(makeFormDataRequest({ organizationId: org.id, type: "DOCUMENT", file, locationTag: "Toronto" }));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.type).toBe("DOCUMENT");
    expect(created.sourceRef).toBe("https://blob.example.com/assessment.pdf");
    expect(created.locationTag).toBe("Toronto");
    expect(created.status).toBe("PENDING");
    expect(created.rawText).toBeNull();
  });

  it("rejects a document that is not PDF or DOCX before uploading it", async () => {
    const org = await createTestOrganization({ name: "Route Document Type Test Org" });
    orgId = org.id;
    const file = new File(["spreadsheet"], "assessment.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const res = await createInput(makeFormDataRequest({ organizationId: org.id, type: "DOCUMENT", file }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Documents must be PDF or DOCX files" });
  });

  it("denies a document upload to an organization the authenticated user cannot access", async () => {
    const org = await prisma.organization.create({ data: { name: "Route Foreign Document Test Org", industry: "Manufacturing" } });
    orgId = org.id;
    const file = new File(["fake pdf bytes"], "foreign.pdf", { type: "application/pdf" });
    const res = await createInput(makeFormDataRequest({ organizationId: org.id, type: "DOCUMENT", file }));
    expect(res.status).toBe(403);
    expect(await prisma.capturedInput.count({ where: { organizationId: org.id } })).toBe(0);
  });
  it("rejects an invalid type with 400", async () => {
    const org = await createTestOrganization({ name: "Route Reject Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "NOT_A_REAL_TYPE", rawText: "n/a" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a file-based type submitted without a file", async () => {
    const org = await createTestOrganization({ name: "Route Missing File Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "AUDIO" })
    );
    expect(res.status).toBe(400);
  });

  it("sets sessionId on a TEXT_NOTE capture submitted with a session", async () => {
    const org = await createTestOrganization({ name: "Route Session Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `route-session-advisor-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "Live note.", sessionId: session.id })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.sessionId).toBe(session.id);
  });

  it("accepts an AUDIO file for an active live session and keeps the organisation link", async () => {
    const org = await createTestOrganization({ name: "Route Live Audio Test Org" });
    orgId = org.id;
    const advisor = await prisma.user.create({ data: { email: `route-live-audio-${Date.now()}@flowstate.test`, role: "ADVISOR" } });
    const session = await prisma.assessmentSession.create({ data: { organizationId: org.id, advisorId: advisor.id, status: "active" } });
    const file = new File(["recorded audio"], "live.webm", { type: "audio/webm" });
    const res = await createInput(makeFormDataRequest({ organizationId: org.id, type: "AUDIO", file, sessionId: session.id }));
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.type).toBe("AUDIO");
    expect(created.sessionId).toBe(session.id);
    expect(created.status).toBe("PENDING");
  });

  it("rejects a live audio capture for a missing or foreign session", async () => {
    const org = await createTestOrganization({ name: "Route Live Audio Boundary Test Org" });
    orgId = org.id;
    const file = new File(["recorded audio"], "live.webm", { type: "audio/webm" });
    const res = await createInput(makeFormDataRequest({ organizationId: org.id, type: "AUDIO", file, sessionId: "missing-session" }));
    expect(res.status).toBe(404);
  });
});

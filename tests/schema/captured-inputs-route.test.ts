import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://blob.example.com/interview.m4a" }),
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

  it("rejects a sessionId paired with a non-TEXT_NOTE type", async () => {
    const org = await createTestOrganization({ name: "Route Session Reject Test Org" });
    orgId = org.id;

    const advisor = await prisma.user.create({
      data: { email: `route-session-advisor2-${Date.now()}@flowstate.test`, role: "ADVISOR" },
    });
    const session = await prisma.assessmentSession.create({
      data: { organizationId: org.id, advisorId: advisor.id, status: "active" },
    });

    const res = await createInput(
      makeFormDataRequest({ organizationId: org.id, type: "EMAIL", rawText: "n/a", sessionId: session.id })
    );
    expect(res.status).toBe(400);
  });
});

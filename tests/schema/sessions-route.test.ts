import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "session-advisor@test.com" } } }) },
  }),
}));

import { POST as createSession } from "../../app/api/sessions/route";
import { GET as getSession, PATCH as patchSession } from "../../app/api/sessions/[id]/route";

describe("sessions routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a session, upserting the advisor User by email, and gets it back with an empty feed", async () => {
    const org = await createTestOrganization({ name: "Sessions Route Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.status).toBe("active");
    expect(created.organizationId).toBe(org.id);

    const advisor = await prisma.user.findUniqueOrThrow({ where: { email: "session-advisor@test.com" } });
    expect(created.advisorId).toBe(advisor.id);

    const getRes = await getSession(new Request("http://localhost/api/sessions/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.capturedInputs).toEqual([]);
  });

  it("ends a session, setting status completed and completedAt", async () => {
    const org = await createTestOrganization({ name: "Sessions End Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    const created = await createRes.json();

    const patchRes = await patchSession(
      new Request("http://localhost/api/sessions/" + created.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "end" }),
      }) as never,
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(patchRes.status).toBe(200);
    const ended = await patchRes.json();
    expect(ended.status).toBe("completed");
    expect(ended.completedAt).not.toBeNull();
  });

  it("rejects an invalid PATCH action with 400", async () => {
    const org = await createTestOrganization({ name: "Sessions Invalid Action Test Org" });
    orgId = org.id;

    const createRes = await createSession(
      new Request("http://localhost/api/sessions", {
        method: "POST",
        body: JSON.stringify({ organizationId: org.id }),
      }) as never
    );
    const created = await createRes.json();

    const patchRes = await patchSession(
      new Request("http://localhost/api/sessions/" + created.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "not-a-real-action" }),
      }) as never,
      { params: Promise.resolve({ id: created.id }) }
    );
    expect(patchRes.status).toBe(400);
  });

  it("returns 404 from PATCH for a nonexistent session", async () => {
    const nonexistentId = "clnonexistentsessionid00";

    const patchRes = await patchSession(
      new Request("http://localhost/api/sessions/" + nonexistentId, {
        method: "PATCH",
        body: JSON.stringify({ action: "end" }),
      }) as never,
      { params: Promise.resolve({ id: nonexistentId }) }
    );
    expect(patchRes.status).toBe(404);
    const body = await patchRes.json();
    expect(body).toEqual({ error: "Not found" });
  });
});

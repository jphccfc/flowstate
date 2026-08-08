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

import { GET as listInputs, POST as createInput } from "../../app/api/captured-inputs/route";
import { GET as getInput } from "../../app/api/captured-inputs/[id]/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/captured-inputs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("captured-inputs routes", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a TEXT_NOTE input and lists/gets it back (after() is stubbed so the background pipeline is invoked, but this test only asserts fields set synchronously at creation — not on pipeline completion, which Task 3's tests cover directly)", async () => {
    const org = await createTestOrganization({ name: "Route Test Org" });
    orgId = org.id;

    const createRes = await createInput(
      makeRequest({ organizationId: org.id, type: "TEXT_NOTE", rawText: "A short note." })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.type).toBe("TEXT_NOTE");
    expect(created.status).toBe("TRANSCRIBED");

    const listReq = new Request(`http://localhost/api/captured-inputs?organizationId=${org.id}`) as never;
    const listRes = await listInputs(listReq);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(created.id);

    const getRes = await getInput(new Request("http://localhost/api/captured-inputs/" + created.id) as never, {
      params: Promise.resolve({ id: created.id }),
    });
    expect(getRes.status).toBe(200);
    const single = await getRes.json();
    expect(single.id).toBe(created.id);
  });

  it("rejects an unsupported type with 400", async () => {
    const org = await createTestOrganization({ name: "Route Reject Test Org" });
    orgId = org.id;

    const res = await createInput(
      makeRequest({ organizationId: org.id, type: "AUDIO", rawText: "n/a" })
    );
    expect(res.status).toBe(400);
  });
});

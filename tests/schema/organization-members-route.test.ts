import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }),
}));

import { GET, POST } from "../../app/api/clients/[id]/members/route";

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/clients/org/members", {
    method, headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

describe("organisation member management", () => {
  let orgId = "";

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("lists memberships with role and permission data", async () => {
    const org = await createTestOrganization({ name: "Member Visibility Org" });
    orgId = org.id;
    const response = await GET(request("GET"), { params: Promise.resolve({ id: org.id }) });
    expect(response.status).toBe(200);
    const members = await response.json();
    expect(members.some((member: { email: string; role: string }) => member.email === "advisor@test.com" && member.role === "ADVISOR")).toBe(true);
  });

  it("allows an advisor to add a client executive membership", async () => {
    const response = await POST(request("POST", { email: "executive@test.com", name: "Client Executive", role: "CLIENT_EXECUTIVE" }), { params: Promise.resolve({ id: orgId }) });
    expect(response.status).toBe(201);
    const member = await response.json();
    expect(member.email).toBe("executive@test.com");
    expect(member.role).toBe("CLIENT_EXECUTIVE");
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }),
}));

import { GET as getUsers, PATCH as patchUser } from "../../app/api/admin/users/route";

function request(body?: unknown) { return new Request("http://localhost/api/admin/users", { method: body ? "PATCH" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }) as never; }

describe("global platform administration", () => {
  let orgId = "";

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("rejects a normal advisor from the platform admin API", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "advisor@test.com" } });
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADVISOR" } });
    const response = await getUsers();
    expect(response.status).toBe(403);
  });

  it("allows a system administrator to change another user global role", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "advisor@test.com" } });
    await prisma.user.update({ where: { id: admin.id }, data: { role: "SYSTEM_ADMIN" } });
    const target = await prisma.user.upsert({ where: { email: "global-target@test.com" }, update: {}, create: { email: "global-target@test.com", role: "ADVISOR" } });
    const response = await patchUser(request({ userId: target.id, role: "INVESTOR" }));
    expect(response.status).toBe(200);
    expect((await response.json()).role).toBe("INVESTOR");
  });

  it("allows a system administrator to list users and organisations", async () => {
    const org = await createTestOrganization({ name: "Platform Admin Org" });
    orgId = org.id;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "advisor@test.com" } });
    await prisma.user.update({ where: { id: user.id }, data: { role: "SYSTEM_ADMIN" } });
    const response = await getUsers();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users.some((item: { email: string }) => item.email === "advisor@test.com")).toBe(true);
    expect(body.organizations.some((item: { id: string }) => item.id === org.id)).toBe(true);
  });
});

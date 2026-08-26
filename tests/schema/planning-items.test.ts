import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

const currentEmail = "planning-advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }) }));

import { GET, POST, PATCH } from "@/app/api/clients/[id]/planning-items/route";

function request(body: unknown, method = "POST") {
  return new Request("http://localhost/api/planning-items", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("planning item contract", () => {
  let organizationId = "";
  let otherOrganizationId = "";

  beforeAll(async () => {
    const owner = await prisma.user.upsert({ where: { email: currentEmail }, update: { role: "ADVISOR" }, create: { email: currentEmail, role: "ADVISOR" } });
    const outsider = await prisma.user.upsert({ where: { email: "planning-outsider@test.com" }, update: {}, create: { email: "planning-outsider@test.com", role: "CLIENT_EXECUTIVE" } });
    const org = await prisma.organization.create({ data: { name: "Planning Organisation" } });
    const otherOrg = await prisma.organization.create({ data: { name: "Other Planning Organisation" } });
    organizationId = org.id; otherOrganizationId = otherOrg.id;
    await prisma.userOrganization.create({ data: { userId: owner.id, organizationId, role: "ADVISOR" } });
    await prisma.userOrganization.create({ data: { userId: outsider.id, organizationId: otherOrganizationId, role: "CLIENT_EXECUTIVE" } });
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.user.deleteMany({ where: { email: { in: [currentEmail, "planning-outsider@test.com"] } } });
    await prisma.$disconnect();
  });

  it("creates and lists an organisation-scoped planning item", async () => {
    const response = await POST(request({ type: "REQUIREMENT", title: "Document the onboarding requirement", description: "Capture the client requirement.", ownerEmail: currentEmail, targetDate: "2030-01-01" }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ type: "REQUIREMENT", ownerEmail: currentEmail, lifecycleStatus: "DRAFT", humanApprovalState: "NOT_REQUIRED", createdBy: currentEmail });
    const list = await GET(new Request("http://localhost") as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect((await list.json()).some((item: { id: string }) => item.id === body.id)).toBe(true);
  });

  it("rejects an owner from another organisation", async () => {
    const response = await POST(request({ type: "GOAL", title: "Cross tenant goal", description: "Should not save.", ownerEmail: "planning-outsider@test.com" }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(400);
  });

  it("rejects a parent planning item from another organisation", async () => {
    const foreign = await prisma.planningItem.create({ data: { organizationId: otherOrganizationId, type: "OBJECTIVE", title: "Foreign", description: "Foreign" } });
    const response = await POST(request({ type: "OBJECTIVE", title: "Child", description: "No cross tenant parent", parentId: foreign.id }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(400);
  });

  it("requires review permission to approve and records approval provenance", async () => {
    const created = await prisma.planningItem.create({ data: { organizationId, type: "SPECIFICATION", title: "Review me", description: "Await approval", humanApprovalState: "PENDING" } });
    const response = await PATCH(request({ planningItemId: created.id, humanApprovalState: "APPROVED" }, "PATCH") as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ humanApprovalState: "APPROVED", approvedBy: currentEmail });
  });

  it("keeps planning items separate from assessment tasks and growth actions", async () => {
    const item = await prisma.planningItem.findFirstOrThrow({ where: { organizationId } });
    expect(item).not.toHaveProperty("assigneeId");
    expect(item).not.toHaveProperty("insightId");
  });
});

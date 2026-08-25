import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

const currentEmail = "task-advisor@test.com";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: currentEmail } } }) } }) }));

import { POST } from "@/app/api/clients/[id]/tasks/route";

function request(body: unknown) { return new Request("http://localhost/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

describe("assessment task organization authorization", () => {
  let organizationId = ""; let otherUserId = "";
  beforeAll(async () => {
    const owner = await prisma.user.upsert({ where: { email: currentEmail }, update: { role: "ADVISOR" }, create: { email: currentEmail, role: "ADVISOR" } });
    const other = await prisma.user.upsert({ where: { email: "other-org@test.com" }, update: {}, create: { email: "other-org@test.com", role: "CLIENT_EXECUTIVE" } });
    const org = await prisma.organization.create({ data: { name: "Task Test Organisation" } });
    organizationId = org.id; otherUserId = other.id;
    await prisma.userOrganization.create({ data: { userId: owner.id, organizationId, role: "ADVISOR" } });
  });
  afterAll(async () => { await prisma.organization.deleteMany({ where: { id: organizationId } }); await prisma.user.deleteMany({ where: { email: { in: [currentEmail, "other-org@test.com"] } } }); });
  it("rejects an assignee outside the organisation", async () => { const response = await POST(request({ type: "INTERVIEW", title: "Interview", description: "Interview owner", dueDate: "2030-01-01", assigneeId: otherUserId }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) }); expect(response.status).toBe(400); });
  it("creates an operational task for an organisation member", async () => { const response = await POST(request({ type: "EVIDENCE_REQUEST", title: "Request evidence", description: "Ask for latest KPI pack", dueDate: "2030-01-01" }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) }); expect(response.status).toBe(201); const body = await response.json(); expect(body.type).toBe("EVIDENCE_REQUEST"); expect(body.status).toBe("OPEN"); });
});

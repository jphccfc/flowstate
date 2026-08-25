import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }) }));
import { POST } from "@/app/api/approved-insights/[id]/actions/route";
import { PATCH } from "@/app/api/growth-actions/[id]/route";

describe("growth actions", () => {
  let organizationId = "";
  let insightId = "";
  let actionId = "";
  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("creates an owned, dated action traceable to an approved insight", async () => {
    const organization = await createTestOrganization({ name: "Growth Action Organisation" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId: capability.id, status: "SIGNED_OFF", score: 2 } });
    const insight = await prisma.approvedInsight.create({ data: { capabilityId: capability.id, decisionId: decision.id, type: "MATURITY_GAP", title: "Planning gap", description: "Manual planning" } }); insightId = insight.id;
    const owner = await prisma.user.upsert({ where: { email: "owner@example.com" }, update: {}, create: { email: "owner@example.com", role: "ADVISOR" } });
    await prisma.userOrganization.create({ data: { userId: owner.id, organizationId, role: "ADVISOR" } });
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ title: "Document planning process", description: "Create and adopt a documented planning workflow.", ownerEmail: "owner@example.com", dueDate: "2026-10-01", priority: 8 }) }) as never, { params: Promise.resolve({ id: insightId }) });
    expect(response.status).toBe(201); const body = await response.json(); actionId = body.id;
    expect(body).toMatchObject({ insightId, ownerEmail: "owner@example.com", status: "PLANNED", priority: 8 });
  });

  it("requires an owner and due date", async () => {
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ title: "Missing assignment", description: "Must be rejected" }) }) as never, { params: Promise.resolve({ id: insightId }) });
    expect(response.status).toBe(400);
  });

  it("rejects assigning an owner outside the organisation", async () => {
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ title: "External owner", description: "Must be rejected", ownerEmail: "external@example.com", dueDate: "2026-10-01" }) }) as never, { params: Promise.resolve({ id: insightId }) });
    expect(response.status).toBe(400);
  });

  it("allows an authorised member to update action status without losing provenance", async () => {
    const response = await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) }) as never, { params: Promise.resolve({ id: actionId }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ id: actionId, status: "IN_PROGRESS", insightId });
  });
});

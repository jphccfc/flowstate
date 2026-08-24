import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }) }));
import { POST } from "@/app/api/recommendations/route";

describe("growth action recommendations", () => {
  let organizationId = "";
  let actionId = "";

  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("creates a recommendation traceable to an owned, dated growth action", async () => {
    const organization = await createTestOrganization({ name: "Recommendation Organisation" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId: capability.id, status: "SIGNED_OFF", score: 2 } });
    const insight = await prisma.approvedInsight.create({ data: { capabilityId: capability.id, decisionId: decision.id, type: "MATURITY_GAP", title: "Planning gap", description: "Manual planning" } });
    const action = await prisma.growthAction.create({ data: { insightId: insight.id, title: "Document planning", description: "Create workflow", ownerEmail: "owner@example.com", dueDate: new Date("2026-10-01") } }); actionId = action.id;

    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ growthActionId: actionId }) }) as never);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ sourceGrowthActionId: actionId, status: "DRAFT", organizationId });
  });

  it("rejects a growth action without an owner or due date", async () => {
    const action = await prisma.growthAction.update({ where: { id: actionId }, data: { ownerEmail: null, dueDate: null } });
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ growthActionId: action.id }) }) as never);
    expect(response.status).toBe(400);
  });
});

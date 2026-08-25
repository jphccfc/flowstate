import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }),
}));

import { GET, POST } from "../../app/api/capabilities/[id]/insights/route";

describe("approved capability insights", () => {
  let organizationId = "";
  let capabilityId = "";
  let decisionId = "";

  afterAll(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    await prisma.$disconnect();
  });

  it("creates an insight only from a signed-off decision and preserves traceability", async () => {
    const organization = await createTestOrganization({ name: "Insight Test Organisation" });
    organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Planning" } });
    capabilityId = capability.id;
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId, status: "SIGNED_OFF", score: 2, rationale: "Repeated manual work", sourcePerspectiveIds: ["perspective-1"] } });
    decisionId = decision.id;

    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ decisionId, type: "MATURITY_GAP", title: "Manual process gap", description: "The capability is repeatable only in parts of the organisation.", priority: 8 }) }) as never, { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.decisionId).toBe(decisionId);
    expect(body.sourcePerspectiveIds).toEqual(["perspective-1"]);
  });

  it("rejects insights sourced from provisional decisions", async () => {
    const provisional = await prisma.assessmentDecision.create({ data: { capabilityId, status: "APPROVED", score: 1 } });
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ decisionId: provisional.id, type: "MATURITY_GAP", title: "Not allowed", description: "Must not be created" }) }) as never, { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(409);
    await prisma.assessmentDecision.delete({ where: { id: provisional.id } });
  });

  it("rejects insight creation by a member without assessment approval permission", async () => {
    const membership = await prisma.userOrganization.findFirst({ where: { organizationId, user: { email: "advisor@test.com" } } });
    expect(membership).not.toBeNull();
    await prisma.userOrganization.update({ where: { id: membership!.id }, data: { role: "CLIENT_STAKEHOLDER" } });
    const response = await POST(new Request("http://test", { method: "POST", body: JSON.stringify({ decisionId, type: "MATURITY_GAP", title: "Denied", description: "Must not be created" }) }) as never, { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(403);
    await prisma.userOrganization.update({ where: { id: membership!.id }, data: { role: "ADVISOR" } });
  });

  it("lists only insights for an authorised capability", async () => {
    const response = await GET(new Request("http://test") as never, { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].decisionId).toBe(decisionId);
  });
});

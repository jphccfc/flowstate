import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { email: "advisor@test.com" } } }) } }),
}));

import { GET, POST } from "../../app/api/capabilities/[id]/decisions/route";
import { PATCH } from "../../app/api/maturity-decisions/[id]/route";

const request = (body: unknown, method = "POST") => new Request("http://localhost", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}) as never;

describe("assessment decisions", () => {
  let organizationId = "";
  let capabilityId = "";
  let decisionId = "";

  beforeAll(async () => { await prisma.user.updateMany({ where: { email: "advisor@test.com" }, data: { role: "ADVISOR" } }); });

  afterAll(async () => { if (organizationId) await cleanupOrganization(organizationId); await prisma.$disconnect(); });

  it("creates an append-only human assessment decision", async () => {
    const organization = await createTestOrganization({ name: "Decision Test Organisation" }); organizationId = organization.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId, name: "Operations", order: 0 } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Decision control", order: 0 } }); capabilityId = capability.id;
    const response = await POST(request({ status: "APPROVED", score: 3, rationale: "Evidence supports a defined and monitored practice.", sourceEvidenceIds: ["evidence-1"], sourcePerspectiveIds: ["perspective-1"] }), { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(201); const body = await response.json(); decisionId = body.id; expect(body.status).toBe("APPROVED"); expect(body.score).toBe(3); expect(body.decidedBy).toBe("advisor@test.com");
  });

  it("rejects a duplicate approval while the latest decision is already approved", async () => {
    const response = await POST(request({ status: "APPROVED", score: 4, rationale: "Duplicate approval attempt." }), { params: Promise.resolve({ id: capabilityId }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "assessment already has an approved decision; reopen it before approving again" });
  });

  it("records a new decision version instead of mutating the prior decision", async () => {
    const response = await PATCH(request({ action: "REOPEN", rationale: "New evidence requires review." }, "PATCH"), { params: Promise.resolve({ id: decisionId }) });
    expect(response.status).toBe(200); const body = await response.json(); expect(body.status).toBe("REOPENED"); expect(body.supersedesId).toBe(decisionId); expect(body.id).not.toBe(decisionId);
  });

  it("rejects access to a capability in another organisation", async () => {
    const outsider = await prisma.organization.create({ data: { name: "Decision Outsider Organisation" } }); const domain = await prisma.businessDomain.create({ data: { organizationId: outsider.id, name: "Operations", order: 0 } }); const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Private decision", order: 0 } });
    const response = await POST(request({ status: "APPROVED", score: 2 }), { params: Promise.resolve({ id: capability.id }) }); expect(response.status).toBe(403); await cleanupOrganization(outsider.id);
  });

  it("lists the decision history for an authorised organisation", async () => {
    const response = await GET(new Request("http://localhost") as never, { params: Promise.resolve({ id: capabilityId }) }); expect(response.status).toBe(200); const body = await response.json(); expect(body).toHaveLength(2); expect(body.map((item: { status: string }) => item.status)).toEqual(["REOPENED", "APPROVED"]);
  });
});

import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET, POST } from "../../app/api/capabilities/[id]/perspectives/route";

function request(body?: unknown) {
  return new Request("http://localhost/api/capabilities/cap/perspectives", body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

async function fixture(name: string) {
  const organization = await createTestOrganization({ name });
  const domain = await prisma.businessDomain.create({ data: { organizationId: organization.id, name: "Operations" } });
  const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Production planning" } });
  return { organization, capability };
}

describe("multi-perspective capability assessments", () => {
  let organizationId: string | undefined;

  afterAll(async () => {
    if (organizationId) await cleanupOrganization(organizationId);
    await prisma.$disconnect();
  });

  it("preserves employee and analyst perspectives with fractional scores", async () => {
    const { organization, capability } = await fixture("Perspective Test Org");
    organizationId = organization.id;

    const employee = await POST(request({
      capabilityId: capability.id,
      stakeholderType: "employee",
      assessorRole: "Production coordinator",
      score: 1,
      originalStatement: "We have a process, but it relies on three spreadsheets.",
      rationale: "The work happens every week but is manual.",
      confidence: 0.9,
    }), { params: Promise.resolve({ id: capability.id }) });
    const analyst = await POST(request({
      capabilityId: capability.id,
      stakeholderType: "expert_analyst",
      assessorRole: "External advisor",
      score: 0.5,
      originalStatement: "The activity exists, but there is no defined organisational capability.",
      rationale: "The practice is not documented or consistently governed.",
      confidence: 0.85,
    }), { params: Promise.resolve({ id: capability.id }) });

    expect(employee.status).toBe(201);
    expect(analyst.status).toBe(201);
    const employeeBody = await employee.json();
    const analystBody = await analyst.json();
    expect(employeeBody.score).toBe(1);
    expect(analystBody.score).toBe(0.5);
    expect(analystBody.originalStatement).toContain("no defined");

    const rows = await prisma.maturityPerspective.findMany({ where: { capabilityId: capability.id } });
    expect(rows).toHaveLength(2);
  });

  it("returns perspective balance without replacing the approved assessment history", async () => {
    const { organization, capability } = await fixture("Perspective Balance Org");
    organizationId = organization.id;
    await prisma.maturityPerspective.createMany({ data: [
      { capabilityId: capability.id, assessorEmail: "employee@example.com", stakeholderType: "employee", assessorRole: "Operator", score: 1, originalStatement: "Manual work", confidence: 0.8 },
      { capabilityId: capability.id, assessorEmail: "analyst@example.com", stakeholderType: "expert_analyst", assessorRole: "Advisor", score: 0.5, originalStatement: "Not defined", confidence: 0.9 },
    ] });

    const response = await GET(new Request("http://localhost/api/capabilities/x/perspectives") as never, { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.perspectives).toHaveLength(2);
    expect(body.summary).toMatchObject({ count: 2, minimum: 0.5, maximum: 1, spread: 0.5 });
    expect(body.summary).toMatchObject({ materialVariance: false, evidenceCoverage: 0, pendingReview: 2, reviewState: "PENDING_REVIEW" });
    expect(body.summary.stakeholderTypes).toEqual(expect.arrayContaining(["employee", "expert_analyst"]));
  });

  it("rejects invalid scores and missing stakeholder type", async () => {
    const { organization, capability } = await fixture("Perspective Validation Org");
    organizationId = organization.id;
    const response = await POST(request({ capabilityId: capability.id, score: 5.5 }), { params: Promise.resolve({ id: capability.id }) });
    expect(response.status).toBe(400);
  });
});

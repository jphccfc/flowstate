import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { POST as createAssessment } from "../../app/api/maturity-assessments/route";
import { POST as createTarget } from "../../app/api/target-maturities/route";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/maturity-assessments", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates an as-is entry and reads it back", async () => {
    const org = await createTestOrganization({ name: "Maturity Create Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(
      jsonRequest({ capabilityId: capability.id, locationTag: "Brampton", score: 3, evidence: "Manual logs" })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.score).toBe(3);
    expect(created.locationTag).toBe("Brampton");
    expect(created.assessedBy).toBe("advisor@test.com");

    const found = await prisma.maturityAssessment.findUnique({ where: { id: created.id } });
    expect(found?.evidence).toBe("Manual logs");
  });

  it("rejects a non-integer score with 400", async () => {
    const org = await createTestOrganization({ name: "Maturity Reject Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(jsonRequest({ capabilityId: capability.id, score: 3.5 }));
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-range score with 400", async () => {
    const org = await createTestOrganization({ name: "Maturity Range Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createAssessment(jsonRequest({ capabilityId: capability.id, score: 9 }));
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await createAssessment(jsonRequest({ capabilityId: "does-not-exist", score: 3 }));
    expect(res.status).toBe(404);
  });

  it("rejects a capability from an organization without membership", async () => {
    const outsider = await prisma.organization.create({ data: { name: "Other Assessment Org" } });
    try {
      const domain = await prisma.businessDomain.create({ data: { organizationId: outsider.id, name: "Operations" } });
      const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Private Capability" } });
      const res = await createAssessment(jsonRequest({ capabilityId: capability.id, score: 3 }));
      expect(res.status).toBe(403);
    } finally {
      await cleanupOrganization(outsider.id);
    }
  });
});

describe("POST /api/target-maturities", () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("creates a to-be entry with rationale and committedBy", async () => {
    const org = await createTestOrganization({ name: "Target Create Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createTarget(
      jsonRequest({
        capabilityId: capability.id,
        score: 4,
        rationale: "Deal terms require 4 by close",
        committedBy: "CFO",
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.score).toBe(4);
    expect(created.rationale).toBe("Deal terms require 4 by close");
    expect(created.committedBy).toBe("CFO");
    expect(created.source).toBe("manual");
  });

  it("rejects a non-integer score with 400", async () => {
    const org = await createTestOrganization({ name: "Target Reject Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const res = await createTarget(jsonRequest({ capabilityId: capability.id, score: 2.5 }));
    expect(res.status).toBe(400);
  });

  it("404s for a nonexistent capability", async () => {
    const res = await createTarget(jsonRequest({ capabilityId: "does-not-exist", score: 3 }));
    expect(res.status).toBe(404);
  });
});

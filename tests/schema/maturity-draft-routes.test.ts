import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { POST as draftAsIs } from "../../app/api/capabilities/[id]/draft-as-is/route";
import { POST as draftToBe } from "../../app/api/capabilities/[id]/draft-to-be/route";

describe("draft routes", () => {
  let orgId: string;

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    await prisma.$disconnect();
  });

  it("draft-as-is gathers approved tag evidence for the capability and returns a draft", async () => {
    const org = await createTestOrganization({ name: "Draft AsIs Test Org" });
    orgId = org.id;
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "Night shift scheduling is a mess.", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });
    await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.9, status: "AUTO_APPROVED" },
    });
    // A PENDING_REVIEW tag on the same capability should be excluded
    const segment2 = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 1, text: "Unreviewed claim." },
    });
    await prisma.tag.create({
      data: { segmentId: segment2.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.4, status: "PENDING_REVIEW" },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 2, evidence: "Ad hoc scheduling." }) } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftAsIs(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-as-is", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }) as never, { params: Promise.resolve({ id: capability.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 2, evidence: "Ad hoc scheduling." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[1].content).toContain("Night shift scheduling is a mess.");
    expect(promptBody.messages[1].content).not.toContain("Unreviewed claim.");
  });

  it("draft-to-be includes engagementMotive and KPI targets from the capability's relations", async () => {
    const org = await createTestOrganization({ name: "Draft ToBe Test Org" });
    orgId = org.id;
    await prisma.organization.update({ where: { id: org.id }, data: { engagementMotive: "Acquisition Recovery" } });
    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const kpi = await prisma.kPI.create({ data: { organizationId: org.id, name: "On-time delivery", targetValue: "95%" } });
    await prisma.capabilityKPI.create({ data: { capabilityId: capability.id, kpiId: kpi.id } });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: 4, rationale: "Deal-driven target." }) } }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const res = await draftToBe(new Request("http://localhost/api/capabilities/" + capability.id + "/draft-to-be", { method: "POST" }) as never, {
      params: Promise.resolve({ id: capability.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ score: 4, rationale: "Deal-driven target." });

    const promptBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(promptBody.messages[1].content).toContain("Acquisition Recovery");
    expect(promptBody.messages[1].content).toContain("On-time delivery: 95%");
  });

  it("404s for a nonexistent capability on both routes", async () => {
    const resA = await draftAsIs(new Request("http://localhost/x", { method: "POST", body: "{}" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resA.status).toBe(404);

    const resB = await draftToBe(new Request("http://localhost/x", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(resB.status).toBe(404);
  });
});

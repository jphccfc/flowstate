import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanupOrganization, createTestOrganization, prisma } from "../helpers/db";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "test-user", email: "advisor@test.com" } } }) },
  }),
}));

import { GET as listTags } from "../../app/api/tags/route";
import { PATCH as patchTag } from "../../app/api/tags/[id]/route";

describe("tags routes", () => {
  let orgId: string;
  const additionalOrgIds: string[] = [];

  afterAll(async () => {
    if (orgId) await cleanupOrganization(orgId);
    for (const id of additionalOrgIds) await cleanupOrganization(id);
    await prisma.$disconnect();
  });

  it("lists pending-review tags with resolved names and same-type reassign candidates, then approves one", async () => {
    const org = await createTestOrganization({ name: "Tags Route Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capA = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const capB = await prisma.capability.create({ data: { domainId: domain.id, name: "Quality Management" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "text", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Night shift scheduling is a mess." },
    });
    const tag = await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capA.id, confidence: 0.6, status: "PENDING_REVIEW" },
    });

    const listReq = new Request(`http://localhost/api/tags?organizationId=${org.id}`) as never;
    const listRes = await listTags(listReq);
    const list = await listRes.json();
    expect(list).toHaveLength(1);
    expect(list[0].targetName).toBe("Shift Scheduling");
    expect(list[0].provenance).toEqual(expect.objectContaining({
      sourceType: "TEXT_NOTE",
      sourceRef: null,
      segmentId: segment.id,
      capturedInputId: input.id,
    }));
    expect(list[0].provenance.segmentText).toBe("Night shift scheduling is a mess.");
    expect(list[0].provenance.aiConfidence).toBe(0.6);
    expect(list[0].decision).toEqual({ status: "PENDING_REVIEW", reviewedBy: null, reviewedAt: null });
    expect(list[0].candidates.map((c: { id: string }) => c.id).sort()).toEqual([capA.id, capB.id].sort());

    const approveRes = await patchTag(
      new Request("http://localhost/api/tags/" + tag.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "approve" }),
      }) as never,
      { params: Promise.resolve({ id: tag.id }) }
    );
    expect(approveRes.status).toBe(200);
    const approved = await approveRes.json();
    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedBy).toBe("advisor@test.com");
  });

  it("reassigns a tag to a different targetId of the same type", async () => {
    const org = await createTestOrganization({ name: "Tags Reassign Test Org" });
    orgId = org.id;

    const domain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const capA = await prisma.capability.create({ data: { domainId: domain.id, name: "Shift Scheduling" } });
    const capB = await prisma.capability.create({ data: { domainId: domain.id, name: "Quality Management" } });

    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "text", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Quality issue on the line." },
    });
    const tag = await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capA.id, confidence: 0.5, status: "PENDING_REVIEW" },
    });

    const res = await patchTag(
      new Request("http://localhost/api/tags/" + tag.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "reassign", targetId: capB.id }),
      }) as never,
      { params: Promise.resolve({ id: tag.id }) }
    );
    const updated = await res.json();
    expect(updated.status).toBe("REASSIGNED");
    expect(updated.targetId).toBe(capB.id);
  });

  it("denies reassigning an evidence tag to a target in another organization", async () => {
    const org = await createTestOrganization({ name: "Tags Authorization Test Org" });
    orgId = org.id;
    const otherOrg = await createTestOrganization({ name: "Other Tags Authorization Org" });
    additionalOrgIds.push(otherOrg.id);

    const localDomain = await prisma.businessDomain.create({ data: { organizationId: org.id, name: "Operations" } });
    const localCapability = await prisma.capability.create({ data: { domainId: localDomain.id, name: "Local Capability" } });
    const foreignDomain = await prisma.businessDomain.create({ data: { organizationId: otherOrg.id, name: "Other Operations" } });
    const foreignCapability = await prisma.capability.create({ data: { domainId: foreignDomain.id, name: "Foreign Capability" } });
    const input = await prisma.capturedInput.create({
      data: { organizationId: org.id, type: "TEXT_NOTE", rawText: "text", status: "TAGGED" },
    });
    const segment = await prisma.capturedSegment.create({
      data: { capturedInputId: input.id, order: 0, text: "Evidence." },
    });
    const tag = await prisma.tag.create({
      data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: localCapability.id, confidence: 0.5, status: "PENDING_REVIEW" },
    });

    const res = await patchTag(
      new Request("http://localhost/api/tags/" + tag.id, {
        method: "PATCH",
        body: JSON.stringify({ action: "reassign", targetId: foreignCapability.id }),
      }) as never,
      { params: Promise.resolve({ id: tag.id }) }
    );

    expect(res.status).toBe(403);
    expect(await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).toMatchObject({
      targetId: localCapability.id,
      status: "PENDING_REVIEW",
      reviewedBy: null,
      reviewedAt: null,
    });
  });
});

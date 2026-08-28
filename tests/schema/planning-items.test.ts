import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

let currentEmail = "planning-advisor@test.com";
const adminEmail = "planning-system-admin@test.com";
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
    await prisma.user.upsert({ where: { email: adminEmail }, update: { role: "SYSTEM_ADMIN" }, create: { email: adminEmail, role: "SYSTEM_ADMIN" } });
    const outsider = await prisma.user.upsert({ where: { email: "planning-outsider@test.com" }, update: {}, create: { email: "planning-outsider@test.com", role: "CLIENT_EXECUTIVE" } });
    const org = await prisma.organization.create({ data: { name: "Planning Organisation" } });
    const otherOrg = await prisma.organization.create({ data: { name: "Other Planning Organisation" } });
    organizationId = org.id; otherOrganizationId = otherOrg.id;
    await prisma.userOrganization.create({ data: { userId: owner.id, organizationId, role: "ADVISOR" } });
    await prisma.userOrganization.create({ data: { userId: outsider.id, organizationId: otherOrganizationId, role: "CLIENT_EXECUTIVE" } });
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.user.deleteMany({ where: { email: { in: [currentEmail, adminEmail, "planning-outsider@test.com"] } } });
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

  it("allows a system admin without membership to list and create for an accessible organisation", async () => {
    currentEmail = adminEmail;
    const list = await GET(new Request("http://localhost") as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(list.status).toBe(200);
    const missingOwner = await POST(request({ type: "GOAL", title: "Unsafe owner", description: "Must require a member owner." }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(missingOwner.status).toBe(400);
    const response = await POST(request({ type: "GOAL", title: "Admin-created goal", description: "Owned by an organisation member.", ownerEmail: "planning-advisor@test.com" }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(201);
    expect((await response.json()).createdBy).toBe(adminEmail);
  });

  it("denies a member access to another organisation", async () => {
    currentEmail = "planning-advisor@test.com";
    const denied = await GET(new Request("http://localhost") as unknown as NextRequest, { params: Promise.resolve({ id: otherOrganizationId }) });
    expect(denied.status).toBe(403);
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

  it("rejects a PATCH approved insight from another organisation", async () => {
    currentEmail = "planning-advisor@test.com";
    const foreignDomain = await prisma.businessDomain.create({ data: { organizationId: otherOrganizationId, name: "Foreign provenance domain" } });
    const foreignCapability = await prisma.capability.create({ data: { domainId: foreignDomain.id, name: "Foreign provenance capability" } });
    const foreignDecision = await prisma.assessmentDecision.create({ data: { capabilityId: foreignCapability.id, status: "SIGNED_OFF" } });
    const foreignInsight = await prisma.approvedInsight.create({ data: { capability: { connect: { id: foreignCapability.id } }, decision: { connect: { id: foreignDecision.id } }, type: "MATURITY_GAP", title: "Foreign approved gap", description: "Should not link" } });
    const item = await prisma.planningItem.create({ data: { organizationId, type: "OBJECTIVE", title: "Provenance boundary", description: "Must remain local" } });
    const response = await PATCH(request({ planningItemId: item.id, approvedInsightId: foreignInsight.id }, "PATCH") as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(400);
  });

  it("keeps planning items separate from assessment tasks and growth actions", async () => {
    const item = await prisma.planningItem.findFirstOrThrow({ where: { organizationId } });
    expect(item).not.toHaveProperty("assigneeId");
    expect(item).not.toHaveProperty("insightId");
  });

  it("links a planning item to an approved insight and returns its decision provenance", async () => {
    const domain = await prisma.businessDomain.create({ data: { organizationId, name: "Provenance domain" } });
    const capability = await prisma.capability.create({ data: { domainId: domain.id, name: "Provenance capability" } });
    const input = await prisma.capturedInput.create({ data: { organizationId, type: "DOCUMENT", sourceRef: "assessment.pdf", rawText: "Assessment source", capturedAt: new Date() } });
    const segment = await prisma.capturedSegment.create({ data: { capturedInputId: input.id, order: 0, text: "The team has a documented planning process." } });
    const evidence = await prisma.tag.create({ data: { segmentId: segment.id, targetType: "CAPABILITY", targetId: capability.id, confidence: 0.99, status: "APPROVED", reviewedBy: currentEmail, reviewedAt: new Date() } });
    const perspective = await prisma.maturityPerspective.create({ data: { capabilityId: capability.id, stakeholderType: "operations_leader", score: 2, originalStatement: "We have a process, but it is inconsistently followed.", sourceEvidenceIds: [evidence.id] } });
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId: capability.id, status: "SIGNED_OFF", score: 2, rationale: "Supported by reviewed evidence and stakeholder perspective.", sourceEvidenceIds: [evidence.id], sourcePerspectiveIds: [perspective.id] } });
    const insight = await prisma.approvedInsight.create({ data: { capabilityId: capability.id, decisionId: decision.id, type: "MATURITY_GAP", title: "Approved gap", description: "Evidence-backed gap", sourceEvidenceIds: decision.sourceEvidenceIds, sourcePerspectiveIds: decision.sourcePerspectiveIds } });
    const response = await POST(request({ type: "OBJECTIVE", title: "Address approved gap", description: "Create a measurable objective.", ownerEmail: "planning-advisor@test.com", approvedInsightId: insight.id }) as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ approvedInsightId: insight.id, approvedInsight: { id: insight.id, decisionId: decision.id, sourceEvidenceIds: [evidence.id], sourcePerspectiveIds: [perspective.id], decision: { id: decision.id, status: "SIGNED_OFF", score: 2, rationale: decision.rationale }, sourceEvidence: [{ id: evidence.id, segmentText: segment.text, sourceType: "DOCUMENT", sourceRef: "assessment.pdf" }], sourcePerspectives: [{ id: perspective.id, stakeholderType: "operations_leader", statement: perspective.originalStatement }] } });
  });
  it("does not resolve foreign evidence or perspectives in local insight provenance", async () => {
    const localDomain = await prisma.businessDomain.create({ data: { organizationId, name: "Local provenance boundary" } });
    const localCapability = await prisma.capability.create({ data: { domainId: localDomain.id, name: "Local capability" } });
    const foreignInput = await prisma.capturedInput.create({ data: { organizationId: otherOrganizationId, type: "TEXT_NOTE", sourceRef: "private.txt", rawText: "Private source" } });
    const foreignSegment = await prisma.capturedSegment.create({ data: { capturedInputId: foreignInput.id, order: 0, text: "Private segment" } });
    const foreignDomain = await prisma.businessDomain.create({ data: { organizationId: otherOrganizationId, name: "Foreign provenance boundary" } });
    const foreignCapability = await prisma.capability.create({ data: { domainId: foreignDomain.id, name: "Foreign capability" } });
    const foreignEvidence = await prisma.tag.create({ data: { segmentId: foreignSegment.id, targetType: "CAPABILITY", targetId: foreignCapability.id, confidence: 1, status: "APPROVED" } });
    const foreignPerspective = await prisma.maturityPerspective.create({ data: { capabilityId: foreignCapability.id, stakeholderType: "private_stakeholder", score: 1, originalStatement: "Private statement" } });
    const decision = await prisma.assessmentDecision.create({ data: { capabilityId: localCapability.id, status: "SIGNED_OFF", sourceEvidenceIds: [foreignEvidence.id], sourcePerspectiveIds: [foreignPerspective.id] } });
    const insight = await prisma.approvedInsight.create({ data: { capabilityId: localCapability.id, decisionId: decision.id, type: "MATURITY_GAP", title: "Local insight", description: "Local description", sourceEvidenceIds: decision.sourceEvidenceIds, sourcePerspectiveIds: decision.sourcePerspectiveIds } });
    const item = await prisma.planningItem.create({ data: { organizationId, type: "GOAL", title: "Local goal", description: "Local description", approvedInsightId: insight.id } });
    const response = await GET(new Request("http://localhost") as unknown as NextRequest, { params: Promise.resolve({ id: organizationId }) });
    const returned = (await response.json()).find((entry: { id: string }) => entry.id === item.id);
    expect(returned.approvedInsight.sourceEvidence).toEqual([]);
    expect(returned.approvedInsight.sourcePerspectives).toEqual([]);
  });

});

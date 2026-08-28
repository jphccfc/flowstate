import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationMembership, hasOrganizationPermission } from "@/lib/auth/organization";

const types = ["REQUIREMENT", "SPECIFICATION", "GOAL", "OBJECTIVE"] as const;
const statuses = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
const approvals = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"] as const;
const valid = (value: unknown, values: readonly string[]): value is string => typeof value === "string" && values.includes(value);
const approvedInsightSelect = { id: true, title: true, decisionId: true, sourceEvidenceIds: true, sourcePerspectiveIds: true, capabilityId: true, decision: { select: { id: true, status: true, score: true, rationale: true, decidedBy: true, decidedAt: true } } } as const;
type InsightWithDecision = { id: string; title: string; decisionId: string; capabilityId: string; sourceEvidenceIds: string[]; sourcePerspectiveIds: string[]; decision: { id: string; status: string; score: number | null; rationale: string | null; decidedBy: string | null; decidedAt: Date } };
async function addReadableProvenance<T extends { approvedInsight: InsightWithDecision | null }>(item: T, organizationId: string): Promise<T> {
  if (!item.approvedInsight) return item;
  const insight = item.approvedInsight;
  const [sourceEvidence, sourcePerspectives] = await Promise.all([
    prisma.tag.findMany({ where: { id: { in: insight.sourceEvidenceIds }, status: "APPROVED", targetType: "CAPABILITY", targetId: insight.capabilityId, segment: { capturedInput: { organizationId } } }, select: { id: true, segment: { select: { text: true, capturedInput: { select: { id: true, type: true, sourceRef: true } } } } } }),
    prisma.maturityPerspective.findMany({ where: { id: { in: insight.sourcePerspectiveIds }, capabilityId: insight.capabilityId, capability: { domain: { organizationId } } }, select: { id: true, stakeholderType: true, originalStatement: true } }),
  ]);
  return { ...item, approvedInsight: { ...insight, sourceEvidence: sourceEvidence.map((e) => ({ id: e.id, capturedInputId: e.segment.capturedInput.id, segmentText: e.segment.text, sourceType: e.segment.capturedInput.type, sourceRef: e.segment.capturedInput.sourceRef })), sourcePerspectives: sourcePerspectives.map((perspective) => ({ id: perspective.id, stakeholderType: perspective.stakeholderType, statement: perspective.originalStatement })) } };
}
async function user() { return (await (await createClient()).auth.getUser()).data.user; }
async function approvedInsightBelongsToOrganization(approvedInsightId: unknown, organizationId: string) {
  if (typeof approvedInsightId !== "string") return false;
  return Boolean(await prisma.approvedInsight.findFirst({ where: { id: approvedInsightId, status: "APPROVED", capability: { domain: { organizationId } } }, select: { id: true } }));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const items = await prisma.planningItem.findMany({ where: { organizationId: id }, orderBy: [{ lifecycleStatus: "asc" }, { targetDate: "asc" }, { createdAt: "desc" }], include: { approvedInsight: { select: approvedInsightSelect } } });
  return NextResponse.json(await Promise.all(items.map((item) => addReadableProvenance(item, id))));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!valid(body.type, types) || !title || !description) return NextResponse.json({ error: "Type, title and description are required" }, { status: 400 });
  const ownerEmail = typeof body.ownerEmail === "string" && body.ownerEmail.trim() ? body.ownerEmail.trim() : current.email;
  if (!(await getOrganizationMembership(ownerEmail, id))) return NextResponse.json({ error: "ownerEmail must belong to an organisation member" }, { status: 400 });
  let targetDate: Date | null = null; if (body.targetDate !== undefined) { targetDate = new Date(body.targetDate); if (Number.isNaN(targetDate.getTime())) return NextResponse.json({ error: "targetDate must be a valid date" }, { status: 400 }); }
  if (body.parentId !== undefined && !(await prisma.planningItem.findFirst({ where: { id: body.parentId, organizationId: id }, select: { id: true } }))) return NextResponse.json({ error: "parentId must belong to this organisation" }, { status: 400 });
  if (body.approvedInsightId !== undefined && !(await approvedInsightBelongsToOrganization(body.approvedInsightId, id))) return NextResponse.json({ error: "approvedInsightId must belong to this organisation" }, { status: 400 });
  const item = await prisma.planningItem.create({ data: { organizationId: id, type: body.type, title, description, ownerEmail, targetDate, createdBy: current.email, parentId: typeof body.parentId === "string" ? body.parentId : null, approvedInsightId: typeof body.approvedInsightId === "string" ? body.approvedInsightId : null }, include: { approvedInsight: { select: approvedInsightSelect } } });
  return NextResponse.json(await addReadableProvenance(item, id), { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const current = await user(); const { id } = await params; const body = await req.json();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (typeof body.planningItemId !== "string") return NextResponse.json({ error: "planningItemId is required" }, { status: 400 });
  const existing = await prisma.planningItem.findFirst({ where: { id: body.planningItemId, organizationId: id } }); if (!existing) return NextResponse.json({ error: "Planning item not found" }, { status: 404 });
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim();
  if (typeof body.ownerEmail === "string" && body.ownerEmail.trim()) { if (!(await getOrganizationMembership(body.ownerEmail.trim(), id))) return NextResponse.json({ error: "ownerEmail must belong to an organisation member" }, { status: 400 }); data.ownerEmail = body.ownerEmail.trim(); }
  if (typeof body.targetDate === "string") { const targetDate = new Date(body.targetDate); if (Number.isNaN(targetDate.getTime())) return NextResponse.json({ error: "targetDate must be a valid date" }, { status: 400 }); data.targetDate = targetDate; }
  if (valid(body.lifecycleStatus, statuses)) data.lifecycleStatus = body.lifecycleStatus;
  if (body.approvedInsightId !== undefined) {
    if (body.approvedInsightId === null) data.approvedInsightId = null;
    else if (!(await approvedInsightBelongsToOrganization(body.approvedInsightId, id))) return NextResponse.json({ error: "approvedInsightId must belong to this organisation" }, { status: 400 });
    else data.approvedInsightId = body.approvedInsightId;
  }
  if (valid(body.humanApprovalState, approvals)) { if (!(await hasOrganizationPermission(current.email, id, "assessment.review"))) return NextResponse.json({ error: "Human review permission required" }, { status: 403 }); data.humanApprovalState = body.humanApprovalState; if (body.humanApprovalState === "APPROVED") { data.approvedBy = current.email; data.approvedAt = new Date(); } }
  if (!Object.keys(data).length) return NextResponse.json({ error: "A valid update is required" }, { status: 400 });
  const updated = await prisma.planningItem.update({ where: { id: existing.id }, data, include: { approvedInsight: { select: approvedInsightSelect } } });
  return NextResponse.json(await addReadableProvenance(updated, id));
}

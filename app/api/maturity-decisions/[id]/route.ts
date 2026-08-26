import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const actionStatuses: Record<string, string> = { REJECT: "REJECTED", AMEND: "AMENDED", REQUEST_EVIDENCE: "EVIDENCE_REQUESTED", REOPEN: "REOPENED", SIGN_OFF: "SIGNED_OFF", REVOKE: "REVOKED" };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.assessmentDecision.findUnique({ where: { id }, include: { capability: { include: { domain: { select: { organizationId: true } } } } } });
  if (!existing) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, existing.capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const status = actionStatuses[body.action];
  if (!status) return NextResponse.json({ error: "action must be REJECT, AMEND, REQUEST_EVIDENCE, REOPEN, SIGN_OFF, or REVOKE" }, { status: 400 });
  if (body.action === "SIGN_OFF" && existing.status !== "APPROVED") return NextResponse.json({ error: "only an approved decision can be signed off" }, { status: 409 });
  if (body.action === "REVOKE" && !["APPROVED", "SIGNED_OFF"].includes(existing.status)) return NextResponse.json({ error: "only an approved or signed-off decision can be revoked" }, { status: 409 });
  if (body.score !== undefined && (typeof body.score !== "number" || body.score < 0 || body.score > 5)) return NextResponse.json({ error: "score must be between 0 and 5" }, { status: 400 });
  const decision = await prisma.assessmentDecision.create({ data: {
    capabilityId: existing.capabilityId, status,
    score: typeof body.score === "number" ? body.score : existing.score,
    scoreRangeMin: typeof body.scoreRangeMin === "number" ? body.scoreRangeMin : existing.scoreRangeMin,
    scoreRangeMax: typeof body.scoreRangeMax === "number" ? body.scoreRangeMax : existing.scoreRangeMax,
    rationale: typeof body.rationale === "string" ? body.rationale : existing.rationale,
    rubricVersion: existing.rubricVersion,
    sourceEvidenceIds: existing.sourceEvidenceIds,
    sourcePerspectiveIds: existing.sourcePerspectiveIds,
    decidedBy: user.email,
    supersedesId: existing.id,
  } });
  return NextResponse.json(decision);
}


export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.assessmentDecision.findUnique({
    where: { id },
    include: {
      capability: { include: { domain: { select: { organizationId: true } } } },
      _count: { select: { approvedInsights: true, communicationPacks: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, existing.capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (existing.decidedBy !== user.email) return NextResponse.json({ error: "you can only delete your own decision" }, { status: 403 });
  if (existing._count.approvedInsights > 0 || existing._count.communicationPacks > 0) return NextResponse.json({ error: "decision is used by an approved output and cannot be deleted" }, { status: 409 });
  const deleted = await prisma.assessmentDecision.create({ data: {
    capabilityId: existing.capabilityId, status: "DELETED", score: existing.score,
    scoreRangeMin: existing.scoreRangeMin, scoreRangeMax: existing.scoreRangeMax,
    rationale: `Decision deleted by ${user.email}.`, rubricVersion: existing.rubricVersion,
    sourceEvidenceIds: existing.sourceEvidenceIds, sourcePerspectiveIds: existing.sourcePerspectiveIds,
    decidedBy: user.email, supersedesId: existing.id,
  } });
  return NextResponse.json(deleted);
}

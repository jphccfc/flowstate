import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const actions = new Set(["approve", "reject", "edit"]);
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const body = await req.json().catch(() => ({}));
  if (!actions.has(body.action)) return NextResponse.json({ error: "action must be approve, reject, or edit" }, { status: 400 });
  const proposal = await prisma.maturityProposal.findUnique({ where: { id }, include: { capability: { include: { domain: { select: { organizationId: true } } } } } });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const permission = body.action === "approve" ? "assessment.approve" : "assessment.review";
  if (!(await hasOrganizationPermission(user.email, proposal.capability.domain.organizationId, permission))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (proposal.status !== "PENDING_REVIEW") return NextResponse.json({ error: "Proposal has already been reviewed" }, { status: 409 });
  const status = body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : "EDITED";
  const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim() : "";
  const update = { status, reviewedBy: user.email, reviewNotes: reviewNotes || null, reviewedAt: new Date(), ...(body.action === "edit" && typeof body.interpretation === "string" ? { interpretation: body.interpretation } : {}), ...(body.action === "edit" && typeof body.suggestedScore === "number" ? { suggestedScore: Math.max(0, Math.min(5, body.suggestedScore)) } : {}) };
  if (body.action !== "approve") return NextResponse.json(await prisma.maturityProposal.update({ where: { id }, data: update }));

  const approved = await prisma.$transaction(async (tx) => {
    const latestDecision = await tx.assessmentDecision.findFirst({ where: { capabilityId: proposal.capabilityId }, orderBy: { createdAt: "desc" }, select: { status: true } });
    if (latestDecision && ["APPROVED", "SIGNED_OFF"].includes(latestDecision.status)) throw new Error("assessment already has an approved decision; reopen it before approving again");
    const sourcePerspectiveIds = [...new Set(proposal.sourcePerspectiveIds)];
    if (sourcePerspectiveIds.length > 0) {
      const approvedPerspectiveCount = await tx.maturityPerspective.count({ where: { id: { in: sourcePerspectiveIds }, capabilityId: proposal.capabilityId, status: "APPROVED" } });
      if (approvedPerspectiveCount !== sourcePerspectiveIds.length) throw new Error("proposal cites perspectives that are no longer approved");
    }
    const reviewedProposal = await tx.maturityProposal.update({ where: { id }, data: update });
    await tx.assessmentDecision.create({ data: {
      capabilityId: proposal.capabilityId, status: "APPROVED", score: proposal.suggestedScore,
      scoreRangeMin: proposal.scoreRangeMin, scoreRangeMax: proposal.scoreRangeMax,
      rationale: proposal.interpretation, rubricVersion: null,
      sourceEvidenceIds: proposal.sourceEvidenceIds, sourcePerspectiveIds: proposal.sourcePerspectiveIds,
      decidedBy: user.email,
    } });
    return reviewedProposal;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message.includes("approved decision")) return null;
    if (error instanceof Error && error.message.includes("no longer approved")) return "STALE_PROVENANCE" as const;
    throw error;
  });
  if (approved === "STALE_PROVENANCE") return NextResponse.json({ error: "proposal cites perspectives that are no longer approved" }, { status: 409 });
  if (!approved) return NextResponse.json({ error: "assessment already has an approved decision; reopen it before approving again" }, { status: 409 });
  return NextResponse.json(approved);
}

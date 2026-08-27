import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";
import { draftMaturityProposal } from "@/lib/ai/maturity-draft";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const capability = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, capability.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.maturityProposal.findMany({ where: { capabilityId: id }, orderBy: { createdAt: "desc" } }));
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const capability = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, capability.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tags = await prisma.tag.findMany({ where: { targetType: "CAPABILITY", targetId: id, status: { in: ["AUTO_APPROVED", "APPROVED"] } }, include: { segment: true } });
  const perspectives = await prisma.maturityPerspective.findMany({ where: { capabilityId: id, status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  const draft = await draftMaturityProposal(capability.name, tags.map((tag) => tag.segment.text), perspectives.map((perspective) => `${perspective.stakeholderType}: ${perspective.originalStatement}`));
  if (!draft.interpretation) return NextResponse.json({ error: "AI proposal did not contain an interpretation" }, { status: 502 });
  const proposal = await prisma.maturityProposal.create({ data: { capabilityId: id, proposalType: "MATURITY_RATING", interpretation: draft.interpretation, suggestedScore: draft.suggestedScore, scoreRangeMin: draft.scoreRangeMin, scoreRangeMax: draft.scoreRangeMax, confidence: draft.confidence, missingEvidence: draft.missingEvidence, conflictingEvidence: draft.conflictingEvidence, sourceEvidenceIds: tags.map((tag) => tag.id), sourcePerspectiveIds: perspectives.map((perspective) => perspective.id), status: "PENDING_REVIEW" } });
  return NextResponse.json(proposal, { status: 201 });
}

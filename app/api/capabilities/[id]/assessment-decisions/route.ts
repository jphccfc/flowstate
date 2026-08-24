import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

const actionStatuses: Record<string, string> = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  AMEND: "AMENDED",
  REQUEST_EVIDENCE: "EVIDENCE_REQUESTED",
  REOPEN: "REOPENED",
  SIGN_OFF: "SIGNED_OFF",
};

async function authorisedCapability(id: string, email: string) {
  const capability = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!capability) return { capability: null, allowed: false };
  return { capability, allowed: await isOrganizationMember(email, capability.domain.organizationId) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { capability, allowed } = await authorisedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const decisions = await prisma.maturityDecision.findMany({ where: { capabilityId: id }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ decisions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id } = await params;
  const { capability, allowed } = await authorisedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const action = typeof body.action === "string" ? body.action.toUpperCase() : "";
  if (!actionStatuses[action]) return NextResponse.json({ error: "action must be APPROVE, REJECT, AMEND, REQUEST_EVIDENCE, REOPEN, or SIGN_OFF" }, { status: 400 });
  if (typeof body.rationale !== "string" || !body.rationale.trim()) return NextResponse.json({ error: "rationale is required" }, { status: 400 });
  for (const field of ["approvedScore", "scoreRangeMin", "scoreRangeMax"]) {
    if (body[field] !== undefined && (typeof body[field] !== "number" || body[field] < 0 || body[field] > 5)) return NextResponse.json({ error: `${field} must be between 0 and 5` }, { status: 400 });
  }
  const decision = await prisma.maturityDecision.create({
    data: {
      capabilityId: id,
      locationTag: typeof body.locationTag === "string" ? body.locationTag : undefined,
      action,
      status: actionStatuses[action],
      approvedScore: typeof body.approvedScore === "number" ? body.approvedScore : undefined,
      scoreRangeMin: typeof body.scoreRangeMin === "number" ? body.scoreRangeMin : undefined,
      scoreRangeMax: typeof body.scoreRangeMax === "number" ? body.scoreRangeMax : undefined,
      rationale: body.rationale.trim(),
      supportingPerspectiveIds: Array.isArray(body.supportingPerspectiveIds) ? body.supportingPerspectiveIds.filter((v: unknown): v is string => typeof v === "string") : [],
      conflictingPerspectiveIds: Array.isArray(body.conflictingPerspectiveIds) ? body.conflictingPerspectiveIds.filter((v: unknown): v is string => typeof v === "string") : [],
      supportingEvidenceIds: Array.isArray(body.supportingEvidenceIds) ? body.supportingEvidenceIds.filter((v: unknown): v is string => typeof v === "string") : [],
      reviewerEmail: user.email,
      approverEmail: typeof body.approverEmail === "string" ? body.approverEmail : undefined,
      supersedesDecisionId: typeof body.supersedesDecisionId === "string" ? body.supersedesDecisionId : undefined,
      followUpOwner: typeof body.followUpOwner === "string" ? body.followUpOwner : undefined,
      followUpDueAt: typeof body.followUpDueAt === "string" ? new Date(body.followUpDueAt) : undefined,
    },
  });
  return NextResponse.json(decision, { status: 201 });
}

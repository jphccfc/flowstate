import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

async function currentUser() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

async function capabilityOrganisation(id: string) {
  return prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const capability = await capabilityOrganisation(id);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.assessmentDecision.findMany({ where: { capabilityId: id }, orderBy: { createdAt: "desc" } }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const capability = await capabilityOrganisation(id);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "PENDING_REVIEW";
  if (!["APPROVED", "REJECTED", "EVIDENCE_REQUESTED"].includes(status)) return NextResponse.json({ error: "Invalid decision status" }, { status: 400 });
  if (body.score !== undefined && (typeof body.score !== "number" || body.score < 0 || body.score > 5)) return NextResponse.json({ error: "score must be between 0 and 5" }, { status: 400 });
  const decision = await prisma.assessmentDecision.create({ data: {
    capabilityId: id, status, score: typeof body.score === "number" ? body.score : null,
    scoreRangeMin: typeof body.scoreRangeMin === "number" ? body.scoreRangeMin : null,
    scoreRangeMax: typeof body.scoreRangeMax === "number" ? body.scoreRangeMax : null,
    rationale: typeof body.rationale === "string" ? body.rationale : null,
    rubricVersion: typeof body.rubricVersion === "number" ? body.rubricVersion : null,
    sourceEvidenceIds: Array.isArray(body.sourceEvidenceIds) ? body.sourceEvidenceIds.filter((value: unknown): value is string => typeof value === "string") : [],
    sourcePerspectiveIds: Array.isArray(body.sourcePerspectiveIds) ? body.sourcePerspectiveIds.filter((value: unknown): value is string => typeof value === "string") : [],
    decidedBy: user.email,
  } });
  return NextResponse.json(decision, { status: 201 });
}

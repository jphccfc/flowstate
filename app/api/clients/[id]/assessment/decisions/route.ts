import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "assessment.review"))) return NextResponse.json({ error: "Reviewer permission required" }, { status: 403 });
  const body = await request.json();
  const capabilityId = typeof body.capabilityId === "string" ? body.capabilityId.trim() : "";
  const score = typeof body.score === "number" ? body.score : Number(body.score);
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  const rubricVersion = Number(body.rubricVersion ?? 1);
  const sourceEvidenceIds = Array.isArray(body.sourceEvidenceIds) ? body.sourceEvidenceIds.filter((value: unknown): value is string => typeof value === "string") : [];
  if (!capabilityId || !Number.isFinite(score) || score < 0 || score > 5 || !rationale || !Number.isInteger(rubricVersion) || rubricVersion < 1) return NextResponse.json({ error: "Capability, score (0-5), rationale and rubricVersion are required" }, { status: 400 });
  const capability = await prisma.capability.findFirst({ where: { id: capabilityId, domain: { organizationId: id } }, select: { id: true } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  const validEvidence = await prisma.documentFinding.findMany({ where: { id: { in: sourceEvidenceIds }, organizationId: id, capabilityId, status: "APPROVED", capturedInput: { is: { versionStatus: "CURRENT" } } }, select: { id: true } });
  if (validEvidence.length !== sourceEvidenceIds.length) return NextResponse.json({ error: "sourceEvidenceIds must reference approved current evidence for this capability" }, { status: 400 });
  const previous = await prisma.assessmentDecision.findFirst({ where: { capabilityId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const decision = await prisma.assessmentDecision.create({ data: { capabilityId, status: "CONFIRMED", score, scoreRangeMin: 0, scoreRangeMax: 5, rationale, rubricVersion, sourceEvidenceIds, decidedBy: user.email, supersedesId: previous?.id ?? null } });
  return NextResponse.json(decision, { status: 201 });
}

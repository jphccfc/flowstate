import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";
import { DEFAULT_MATURITY_RUBRIC, summarisePerspectiveScores } from "@/lib/maturity/rubric";

const perspectiveTypes = new Set(["employee", "manager", "expert_analyst", "stakeholder", "ai"]);

async function getAuthorizedCapability(id: string, email: string) {
  const capability = await prisma.capability.findUnique({
    where: { id },
    include: { domain: { select: { organizationId: true } } },
  });
  if (!capability) return { capability: null, allowed: false };
  return { capability, allowed: await isOrganizationMember(email, capability.domain.organizationId) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { capability, allowed } = await getAuthorizedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const perspectives = await prisma.maturityPerspective.findMany({
    where: { capabilityId: id },
    orderBy: { createdAt: "asc" },
  });
  const scores = perspectives.map((perspective) => perspective.score);
  const stakeholderTypes = [...new Set(perspectives.map((perspective) => perspective.stakeholderType))];
  const summary = summarisePerspectiveScores(scores);
  const evidenceBackedCount = perspectives.filter((perspective) => perspective.sourceEvidenceIds.length > 0).length;
  const pendingReview = perspectives.filter((perspective) => perspective.status === "SUBMITTED").length;
  const materialVariance = summary.spread !== null && summary.spread >= 1;
  const reviewState = perspectives.length === 0 ? "NO_PERSPECTIVES" : pendingReview > 0 ? "PENDING_REVIEW" : "REVIEWED";

  return NextResponse.json({
    perspectives,
    summary: {
      ...summary,
      stakeholderTypes,
      materialVariance,
      evidenceCoverage: perspectives.length === 0 ? 0 : evidenceBackedCount / perspectives.length,
      pendingReview,
      reviewState,
    },
    rubric: DEFAULT_MATURITY_RUBRIC,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id } = await params;
  const { capability, allowed } = await getAuthorizedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { stakeholderType, score, originalStatement } = body;
  if (!perspectiveTypes.has(stakeholderType) || typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 5 || typeof originalStatement !== "string" || !originalStatement.trim()) {
    return NextResponse.json({ error: "stakeholderType, score (0-5), and originalStatement are required" }, { status: 400 });
  }
  if (body.confidence !== undefined && (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1)) {
    return NextResponse.json({ error: "confidence must be between 0 and 1" }, { status: 400 });
  }

  const perspective = await prisma.maturityPerspective.create({
    data: {
      capabilityId: id,
      stakeholderId: typeof body.stakeholderId === "string" ? body.stakeholderId : undefined,
      assessorEmail: typeof body.assessorEmail === "string" ? body.assessorEmail : user.email,
      stakeholderType,
      assessorRole: typeof body.assessorRole === "string" ? body.assessorRole : undefined,
      locationTag: typeof body.locationTag === "string" ? body.locationTag : undefined,
      score,
      scoreRangeMin: typeof body.scoreRangeMin === "number" ? body.scoreRangeMin : undefined,
      scoreRangeMax: typeof body.scoreRangeMax === "number" ? body.scoreRangeMax : undefined,
      originalStatement: originalStatement.trim(),
      rationale: typeof body.rationale === "string" ? body.rationale : undefined,
      confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      sourceEvidenceIds: Array.isArray(body.sourceEvidenceIds) ? body.sourceEvidenceIds.filter((value: unknown): value is string => typeof value === "string") : [],
      rubricVersion: typeof body.rubricVersion === "number" ? body.rubricVersion : undefined,
      status: "SUBMITTED",
    },
  });

  return NextResponse.json(perspective, { status: 201 });
}

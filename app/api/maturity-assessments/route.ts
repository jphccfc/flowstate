import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { capabilityId, locationTag, score, evidence, sourceSegmentIds } = body;

  if (!capabilityId || typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
    return NextResponse.json({ error: "capabilityId and an integer score (0-5) are required" }, { status: 400 });
  }

  const capability = await prisma.capability.findUnique({
    where: { id: capabilityId },
    include: { domain: { select: { organizationId: true } } },
  });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, capability.domain.organizationId, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assessment = await prisma.maturityAssessment.create({
    data: {
      capabilityId,
      locationTag: locationTag ?? null,
      score,
      evidence: evidence ?? null,
      sourceSegmentIds: sourceSegmentIds ?? [],
      assessedBy: user.email ?? undefined,
    },
  });

  return NextResponse.json(assessment, { status: 201 });
}

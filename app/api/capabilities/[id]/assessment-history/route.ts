import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";
import { getCurrentMaturity } from "@/lib/maturity/current";
import { getCurrentTargetMaturity } from "@/lib/maturity/target";
import { calculateGap } from "@/lib/scoring/engine";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const capability = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, capability.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [currentAsIs, currentToBe, asIsHistory, toBeHistory] = await Promise.all([
    getCurrentMaturity(id),
    getCurrentTargetMaturity(id),
    prisma.maturityAssessment.findMany({ where: { capabilityId: id }, orderBy: { assessedAt: "desc" } }),
    prisma.targetMaturity.findMany({ where: { capabilityId: id }, orderBy: { setAt: "desc" } }),
  ]);

  return NextResponse.json({ currentAsIs, currentToBe, gap: calculateGap(currentAsIs, currentToBe), asIsHistory, toBeHistory });
}

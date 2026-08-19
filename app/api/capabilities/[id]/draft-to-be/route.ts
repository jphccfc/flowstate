import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftToBeScore } from "@/lib/ai/maturity-draft";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const capability = await prisma.capability.findUnique({
    where: { id },
    include: { domain: { include: { organization: true } }, kpis: { include: { kpi: true } } },
  });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const kpiTargets = capability.kpis
    .map((ck) => ck.kpi)
    .filter((kpi) => kpi.targetValue)
    .map((kpi) => `${kpi.name}: ${kpi.targetValue}`);

  const draft = await draftToBeScore(capability.name, capability.domain.organization.engagementMotive, kpiTargets);

  return NextResponse.json(draft);
}

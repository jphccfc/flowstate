import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

type CandidateType = "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!(await isOrganizationMember(user.email, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [tags, domains, kpis, stakeholders] = await Promise.all([
    prisma.tag.findMany({
      where: { status: "PENDING_REVIEW", segment: { capturedInput: { organizationId } } },
      include: { segment: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.businessDomain.findMany({ where: { organizationId }, include: { capabilities: true } }),
    prisma.kPI.findMany({ where: { organizationId } }),
    prisma.stakeholder.findMany({ where: { organizationId } }),
  ]);

  const nameById = new Map<string, string>();
  const candidatesByType: Record<CandidateType, { id: string; name: string }[]> = {
    DOMAIN: [],
    CAPABILITY: [],
    KPI: [],
    STAKEHOLDER: [],
  };
  for (const domain of domains) {
    nameById.set(domain.id, domain.name);
    candidatesByType.DOMAIN.push({ id: domain.id, name: domain.name });
    for (const capability of domain.capabilities) {
      nameById.set(capability.id, capability.name);
      candidatesByType.CAPABILITY.push({ id: capability.id, name: capability.name });
    }
  }
  for (const kpi of kpis) {
    nameById.set(kpi.id, kpi.name);
    candidatesByType.KPI.push({ id: kpi.id, name: kpi.name });
  }
  for (const stakeholder of stakeholders) {
    nameById.set(stakeholder.id, stakeholder.name);
    candidatesByType.STAKEHOLDER.push({ id: stakeholder.id, name: stakeholder.name });
  }

  const result = tags.map((tag) => ({
    id: tag.id,
    targetType: tag.targetType,
    targetId: tag.targetId,
    targetName: nameById.get(tag.targetId) ?? "(unknown)",
    confidence: tag.confidence,
    segment: { text: tag.segment.text },
    candidates: candidatesByType[tag.targetType as CandidateType] ?? [],
  }));

  return NextResponse.json(result);
}

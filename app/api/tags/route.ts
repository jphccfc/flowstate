import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";
import { InputType } from "@/app/generated/prisma/enums";

type CandidateType = "DOMAIN" | "CAPABILITY" | "KPI" | "STAKEHOLDER";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = new URL(req.url).searchParams;
  const organizationId = searchParams.get("organizationId");
  const query = searchParams.get("q")?.trim() ?? "";
  const sourceType = searchParams.get("sourceType")?.trim() ?? "";
  const sourceTypeFilter = Object.values(InputType).includes(sourceType as InputType) ? sourceType as InputType : undefined;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!(await isOrganizationMember(user.email, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [tags, domains, kpis, stakeholders] = await Promise.all([
    prisma.tag.findMany({
      where: { status: "PENDING_REVIEW", segment: { capturedInput: { organizationId, ...(sourceTypeFilter ? { type: sourceTypeFilter } : {}) } } },
      include: {
        segment: {
          include: {
            capturedInput: {
              include: {
                hashtagAttachments: {
                  where: { status: "APPROVED" },
                  include: { tagDefinition: { select: { normalizedName: true, displayName: true, aliases: true } } },
                },
              },
            },
          },
        },
      },
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

  type TagWithContext = { id: string; targetType: CandidateType; targetId: string; confidence: number; status: string; reviewedBy: string | null; reviewedAt: Date | null; createdAt: Date; segment: { id: string; text: string; capturedInput: { id: string; type: string; subject: string | null; sourceRef: string | null; locationTag: string | null; capturedAt: Date; hashtagAttachments: { tagDefinition: { normalizedName: string; displayName: string; aliases: string[] } }[] } } };
  const result = (tags as unknown as TagWithContext[]).map((tag) => ({
    searchText: [tag.segment.text, tag.segment.capturedInput.subject, tag.segment.capturedInput.sourceRef, tag.segment.capturedInput.locationTag, nameById.get(tag.targetId), ...tag.segment.capturedInput.hashtagAttachments.flatMap((attachment) => [attachment.tagDefinition.normalizedName, attachment.tagDefinition.displayName, ...attachment.tagDefinition.aliases])].filter(Boolean).join(" ").toLocaleLowerCase(),
    targetType: tag.targetType,
    targetId: tag.targetId,
    targetName: nameById.get(tag.targetId) ?? "(unknown)",
    confidence: tag.confidence,
    segment: { text: tag.segment.text },
    provenance: {
      sourceType: tag.segment.capturedInput.type,
      sourceRef: tag.segment.capturedInput.sourceRef,
      locationTag: tag.segment.capturedInput.locationTag,
      capturedAt: tag.segment.capturedInput.capturedAt,
      capturedInputId: tag.segment.capturedInput.id,
      segmentId: tag.segment.id,
      segmentText: tag.segment.text,
      aiConfidence: tag.confidence,
      generatedAt: tag.createdAt,
    },
    decision: {
      status: tag.status,
      reviewedBy: tag.reviewedBy,
      reviewedAt: tag.reviewedAt,
    },
    candidates: candidatesByType[tag.targetType as CandidateType] ?? [],
  })).filter((tag) => !query || tag.searchText.includes(query.toLocaleLowerCase())).map(({ searchText: _searchText, ...tag }) => tag);

  return NextResponse.json(result);
}

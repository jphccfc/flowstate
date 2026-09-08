import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, hasOrganizationPermission } from "@/lib/auth/organization";
import { getCurrentMaturityForOrganization } from "@/lib/maturity/current";
import { getCurrentTargetMaturityForOrganization } from "@/lib/maturity/target";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      domains: {
        orderBy: { order: "asc" },
        include: {
          capabilities: {
            orderBy: { order: "asc" },
            include: {
              approvedInsights: {
                where: { status: "APPROVED" },
                orderBy: { priority: "desc" },
                include: {
                  decision: { select: { id: true, status: true, score: true, rationale: true, decidedAt: true } },
                  growthActions: {
                    orderBy: { createdAt: "desc" },
                    include: { recommendation: { select: { id: true, title: true, status: true } } },
                  },
                },
              },
            },
          },
        },
      },
      stakeholders: { orderBy: { name: "asc" } },
      kpis: { orderBy: { name: "asc" } },
      achievements: { orderBy: { priority: "desc" } },
      sessions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessClient(user.email, org.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [currentAsIs, currentToBe] = await Promise.all([
    getCurrentMaturityForOrganization(id),
    getCurrentTargetMaturityForOrganization(id),
  ]);

  const asIsByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentAsIs) {
    const list = asIsByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    asIsByCapability.set(row.capabilityId, list);
  }
  const toBeByCapability = new Map<string, { locationTag: string | null; score: number }[]>();
  for (const row of currentToBe) {
    const list = toBeByCapability.get(row.capabilityId) ?? [];
    list.push({ locationTag: row.locationTag, score: row.score });
    toBeByCapability.set(row.capabilityId, list);
  }

  const insightEvidenceIds = org.domains.flatMap((domain) => domain.capabilities.flatMap((capability) => capability.approvedInsights.flatMap((insight) => insight.sourceEvidenceIds)));
  const evidenceTags = insightEvidenceIds.length === 0 ? [] : await prisma.tag.findMany({
    where: {
      id: { in: Array.from(new Set(insightEvidenceIds)) },
      status: "APPROVED",
      targetType: "CAPABILITY",
      segment: { capturedInput: { organizationId: id } },
    },
    select: {
      id: true,
      targetId: true,
      segment: { select: { text: true, capturedInput: { select: { type: true, sourceRef: true } } } },
    },
  });
  const evidenceById = new Map(evidenceTags.map((tag) => [tag.id, {
    id: tag.id,
    capabilityId: tag.targetId,
    segmentText: tag.segment.text,
    sourceType: tag.segment.capturedInput.type,
    sourceRef: tag.segment.capturedInput.sourceRef,
  }]));

  const enriched = {
    ...org,
    domains: org.domains.map((domain) => ({
      ...domain,
      capabilities: domain.capabilities.map((cap) => ({
        ...cap,
        currentAsIs: asIsByCapability.get(cap.id) ?? [],
        currentToBe: toBeByCapability.get(cap.id) ?? [],
        approvedInsights: cap.approvedInsights.map((insight) => ({
          ...insight,
          sourceEvidence: insight.sourceEvidenceIds
            .map((evidenceId) => evidenceById.get(evidenceId))
            .filter((evidence): evidence is NonNullable<typeof evidence> => evidence !== undefined && evidence.capabilityId === cap.id)
            .map((evidence) => ({
              id: evidence.id,
              segmentText: evidence.segmentText,
              sourceType: evidence.sourceType,
              sourceRef: evidence.sourceRef,
            })),
        })),
      })),
    })),
  };

  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, existing.id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.update({
    where: { id },
    data: {
      name: body.name,
      industry: body.industry,
      size: body.size,
      notes: body.notes,
      engagementMotive: body.engagementMotive,
    },
  });

  return NextResponse.json(org);
}

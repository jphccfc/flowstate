import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

const RECOMMENDATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "EDITED",
] as const;

type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

function isRecommendationStatus(value: string): value is RecommendationStatus {
  return RECOMMENDATION_STATUSES.includes(value as RecommendationStatus);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  let organizationId = body.organizationId as string | undefined;
  let title = body.title as string | undefined;
  let description = body.description as string | undefined;
  let sourceGrowthActionId: string | undefined;
  let relatedCapabilityIds = Array.isArray(body.relatedCapabilityIds) ? body.relatedCapabilityIds : [];

  if (typeof body.growthActionId === "string" && body.growthActionId) {
    const action = await prisma.growthAction.findUnique({ where: { id: body.growthActionId }, include: { insight: { include: { capability: { include: { domain: true } } } } } });
    if (!action) return NextResponse.json({ error: "Growth action not found" }, { status: 404 });
    if (!action.ownerEmail || !action.dueDate) return NextResponse.json({ error: "Growth action must have an owner and due date before it can become a recommendation" }, { status: 400 });
    organizationId = action.insight.capability.domain.organizationId;
    title = action.title;
    description = action.description;
    sourceGrowthActionId = action.id;
    relatedCapabilityIds = [action.insight.capabilityId];
  }

  if (typeof organizationId !== "string" || !organizationId || typeof title !== "string" || !title.trim() || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "organizationId, title, and description are required" }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recommendation = await prisma.recommendation.create({
    data: { organizationId, title: title.trim(), description: description.trim(), sourceGrowthActionId, relatedCapabilityIds, relatedKPIIds: Array.isArray(body.relatedKPIIds) ? body.relatedKPIIds : [], estimatedValue: body.estimatedValue ?? null, priorityScore: body.priorityScore ?? null, reviewNotes: body.reviewNotes ?? null, status: "DRAFT" },
  });

  return NextResponse.json(recommendation, { status: 201 });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");
  const status = searchParams.get("status");

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (!(await isOrganizationMember(user.email, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (status && !isRecommendationStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const statusFilter = status && isRecommendationStatus(status) ? status : undefined;
  const recommendations = await prisma.recommendation.findMany({
    where: {
      organizationId,
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      feedback: {
        orderBy: { actedAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(recommendations);
}

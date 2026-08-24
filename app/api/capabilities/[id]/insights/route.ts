import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

async function authorizedCapability(id: string, email: string) {
  const capability = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!capability) return { capability: null, allowed: false };
  return { capability, allowed: await isOrganizationMember(email, capability.domain.organizationId) };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { capability, allowed } = await authorizedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.approvedInsight.findMany({ where: { capabilityId: id }, orderBy: { createdAt: "desc" } }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { id } = await params;
  const { capability, allowed } = await authorizedCapability(id, user.email);
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (typeof body.decisionId !== "string" || typeof body.type !== "string" || typeof body.title !== "string" || typeof body.description !== "string" || !body.title.trim() || !body.description.trim()) return NextResponse.json({ error: "decisionId, type, title, and description are required" }, { status: 400 });
  const decision = await prisma.assessmentDecision.findUnique({ where: { id: body.decisionId } });
  if (!decision || decision.capabilityId !== id) return NextResponse.json({ error: "Decision not found for capability" }, { status: 404 });
  if (decision.status !== "SIGNED_OFF") return NextResponse.json({ error: "Insights require a signed-off assessment decision" }, { status: 409 });
  const insight = await prisma.approvedInsight.create({ data: { capabilityId: id, decisionId: decision.id, type: body.type.trim(), title: body.title.trim(), description: body.description.trim(), priority: typeof body.priority === "number" ? body.priority : undefined, sourceEvidenceIds: decision.sourceEvidenceIds, sourcePerspectiveIds: decision.sourcePerspectiveIds, createdBy: user.email } });
  return NextResponse.json(insight, { status: 201 });
}

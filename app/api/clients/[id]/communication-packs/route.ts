import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

async function currentUser() { return (await (await createClient()).auth.getUser()).data.user; }
async function approvedSources(organizationId: string) {
  const [decisions, insights] = await Promise.all([
    prisma.assessmentDecision.findMany({ where: { capability: { domain: { organizationId } }, status: { in: ["APPROVED", "SIGNED_OFF"] } }, select: { id: true, status: true, rationale: true } }),
    prisma.approvedInsight.findMany({ where: { capability: { domain: { organizationId } }, status: "APPROVED" }, select: { id: true, title: true, status: true } }),
  ]);
  return { decisions, insights };
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status")?.toUpperCase();
  const recipient = (searchParams.get("recipient") ?? "").trim().toLowerCase();
  const stakeholder = (searchParams.get("stakeholder") ?? "").trim().toLowerCase();
  const packs = await prisma.communicationPack.findMany({ where: { organizationId: id, ...(status ? { status: status as never } : {}) }, include: { acknowledgements: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  const filtered = packs.filter((pack) => {
    const recipientText = JSON.stringify(pack.recipientContext).toLowerCase();
    const stakeholderText = JSON.stringify(pack.stakeholderContext).toLowerCase();
    return (!recipient || recipientText.includes(recipient)) && (!stakeholder || stakeholderText.includes(stakeholder));
  });
  const summary = packs.reduce<Record<string, number>>((counts, pack) => ({ ...counts, [pack.status]: (counts[pack.status] ?? 0) + 1 }), {});
  return NextResponse.json({ packs: filtered, sources: await approvedSources(id), summary });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); const { id } = await params;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json(); const title = typeof body.title === "string" ? body.title.trim() : ""; const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!title || !content || !body.recipientContext || !body.stakeholderContext) return NextResponse.json({ error: "required fields missing" }, { status: 400 });
  let decisionId: string | null = null; let insightId: string | null = null;
  if (body.decisionId) { const decision = await prisma.assessmentDecision.findFirst({ where: { id: body.decisionId, capability: { domain: { organizationId: id } } } }); if (!decision) return NextResponse.json({ error: "source organisation mismatch" }, { status: 400 }); if (!["APPROVED", "SIGNED_OFF"].includes(decision.status)) return NextResponse.json({ error: "source must be approved" }, { status: 409 }); decisionId = decision.id; }
  if (body.insightId) { const insight = await prisma.approvedInsight.findFirst({ where: { id: body.insightId, capability: { domain: { organizationId: id } } } }); if (!insight) return NextResponse.json({ error: "source organisation mismatch" }, { status: 400 }); if (insight.status !== "APPROVED") return NextResponse.json({ error: "source must be approved" }, { status: 409 }); insightId = insight.id; }
  if (!decisionId && !insightId) return NextResponse.json({ error: "approved source required" }, { status: 400 });
  const pack = await prisma.communicationPack.create({ data: { organizationId: id, decisionId, insightId, recipientContext: body.recipientContext, stakeholderContext: body.stakeholderContext, title, content, createdBy: user.email }, include: { acknowledgements: true } });
  return NextResponse.json(pack, { status: 201 });
}

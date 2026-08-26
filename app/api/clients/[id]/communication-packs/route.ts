import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

async function user() { return (await (await createClient()).auth.getUser()).data.user; }
async function sources(organizationId: string) {
  const [decisions, insights] = await Promise.all([
    prisma.assessmentDecision.findMany({ where: { capability: { domain: { organizationId } }, status: { in: ["APPROVED", "SIGNED_OFF"] } }, select: { id: true, status: true, rationale: true } }),
    prisma.approvedInsight.findMany({ where: { capability: { domain: { organizationId } }, status: "APPROVED" }, select: { id: true, title: true, status: true } }),
  ]);
  return { decisions, insights };
}
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const x = await user(); const { id } = await params;
  if (!x?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(x.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const packs = await prisma.communicationPack.findMany({ where: { organizationId: id }, include: { acknowledgements: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ packs, sources: await sources(id) });
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const x = await user(); const { id } = await params;
  if (!x?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(x.email, id, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json(); const title = typeof body.title === "string" ? body.title.trim() : ""; const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!title || !content || !body.recipientContext || !body.stakeholderContext) return NextResponse.json({ error: "required fields missing" }, { status: 400 });
  let decisionId: string | null = null; let insightId: string | null = null;
  if (body.decisionId) { const d = await prisma.assessmentDecision.findFirst({ where: { id: body.decisionId, capability: { domain: { organizationId: id } } } }); if (!d) return NextResponse.json({ error: "source organisation mismatch" }, { status: 400 }); if (!["APPROVED", "SIGNED_OFF"].includes(d.status)) return NextResponse.json({ error: "source must be approved" }, { status: 409 }); decisionId = d.id; }
  if (body.insightId) { const i = await prisma.approvedInsight.findFirst({ where: { id: body.insightId, capability: { domain: { organizationId: id } } } }); if (!i) return NextResponse.json({ error: "source organisation mismatch" }, { status: 400 }); if (i.status !== "APPROVED") return NextResponse.json({ error: "source must be approved" }, { status: 409 }); insightId = i.id; }
  if (!decisionId && !insightId) return NextResponse.json({ error: "approved source required" }, { status: 400 });
  const pack = await prisma.communicationPack.create({ data: { organizationId: id, decisionId, insightId, recipientContext: body.recipientContext, stakeholderContext: body.stakeholderContext, title, content, createdBy: x.email }, include: { acknowledgements: true } });
  return NextResponse.json(pack, { status: 201 });
}

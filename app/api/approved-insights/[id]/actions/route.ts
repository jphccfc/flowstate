import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission, isOrganizationMember } from "@/lib/auth/organization";

async function getInsight(id: string, email: string) {
  const insight = await prisma.approvedInsight.findUnique({ where: { id }, include: { capability: { include: { domain: { select: { organizationId: true } } } } } });
  if (!insight) return { insight: null, allowed: false };
  return { insight, allowed: await isOrganizationMember(email, insight.capability.domain.organizationId) };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { insight, allowed } = await getInsight(id, user.email);
  if (!insight) return NextResponse.json({ error: "Approved insight not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await hasOrganizationPermission(user.email, insight.capability.domain.organizationId, "recommendation.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.title !== "string" || !body.title.trim() || typeof body.description !== "string" || !body.description.trim()) return NextResponse.json({ error: "title and description are required" }, { status: 400 });
  if (typeof body.ownerEmail !== "string" || !body.ownerEmail.trim() || typeof body.dueDate !== "string" || !body.dueDate.trim() || Number.isNaN(new Date(body.dueDate).getTime())) return NextResponse.json({ error: "ownerEmail and a valid dueDate are required" }, { status: 400 });
  if (!(await isOrganizationMember(body.ownerEmail.trim(), insight.capability.domain.organizationId))) return NextResponse.json({ error: "ownerEmail must belong to an organisation member" }, { status: 400 });
  const action = await prisma.growthAction.create({ data: { insightId: id, title: body.title.trim(), description: body.description.trim(), ownerEmail: body.ownerEmail.trim(), dueDate: new Date(body.dueDate), priority: typeof body.priority === "number" ? body.priority : undefined, createdBy: user.email } });
  return NextResponse.json(action, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { insight, allowed } = await getInsight(id, user.email);
  if (!insight) return NextResponse.json({ error: "Approved insight not found" }, { status: 404 });
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.growthAction.findMany({ where: { insightId: id }, orderBy: [{ status: "asc" }, { priority: "desc" }] }));
}

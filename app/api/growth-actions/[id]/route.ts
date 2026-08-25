import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const statuses = new Set(["PLANNED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const action = await prisma.growthAction.findUnique({ where: { id }, include: { insight: { include: { capability: { include: { domain: { select: { organizationId: true } } } } } } } });
  if (!action) return NextResponse.json({ error: "Growth action not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, action.insight.capability.domain.organizationId, "recommendation.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.status !== "string" || !statuses.has(body.status)) return NextResponse.json({ error: "Invalid growth action status" }, { status: 400 });
  return NextResponse.json(await prisma.growthAction.update({ where: { id }, data: { status: body.status } }));
}

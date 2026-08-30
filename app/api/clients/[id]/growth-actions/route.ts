import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actions = await prisma.growthAction.findMany({ where: { insight: { capability: { domain: { organizationId: id } } } }, include: { insight: { select: { title: true, capability: { select: { name: true } } } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json(actions);
}

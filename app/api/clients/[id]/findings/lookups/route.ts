import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = (await (await createClient()).auth.getUser()).data.user;
  const { id } = await params;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessClient(user.email, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [domains, capabilities] = await Promise.all([
    prisma.businessDomain.findMany({ where: { organizationId: id }, select: { id: true, name: true }, orderBy: [{ order: "asc" }, { name: "asc" }] }),
    prisma.capability.findMany({ where: { domain: { organizationId: id } }, select: { id: true, name: true, domainId: true }, orderBy: [{ domain: { order: "asc" } }, { order: "asc" }, { name: "asc" }] }),
  ]);
  return NextResponse.json({ domains, capabilities });
}

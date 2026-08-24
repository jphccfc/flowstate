import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isSystemAdmin } from "@/lib/auth/organization";

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSystemAdmin(user.email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [users, organizations] = await Promise.all([
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true, name: true, role: true, createdAt: true, organizations: { select: { role: true, organization: { select: { id: true, name: true } } } } } }),
    prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, industry: true, createdAt: true, _count: { select: { users: true, domains: true, sessions: true } } } }),
  ]);
  return NextResponse.json({ users, organizations });
}


const roles = ["SYSTEM_ADMIN", "ADVISOR", "CLIENT_EXECUTIVE", "CLIENT_STAKEHOLDER", "INVESTOR"] as const;

export async function PATCH(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSystemAdmin(user.email))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (typeof body.userId !== "string" || !roles.includes(body.role)) return NextResponse.json({ error: "userId and a valid platform role are required" }, { status: 400 });
  if (body.userId === user.id && body.role !== "SYSTEM_ADMIN") return NextResponse.json({ error: "You cannot remove your own system administrator access" }, { status: 409 });
  const updated = await prisma.user.update({ where: { id: body.userId }, data: { role: body.role }, select: { id: true, email: true, name: true, role: true } });
  return NextResponse.json(updated);
}

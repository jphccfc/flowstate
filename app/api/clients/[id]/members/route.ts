import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission, permissionsForRole, type OrganizationRole } from "@/lib/auth/organization";

const assignableRoles = ["ADVISOR", "CLIENT_EXECUTIVE", "CLIENT_STAKEHOLDER", "INVESTOR"] as const;
type AssignableRole = (typeof assignableRoles)[number];

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (assignableRoles as readonly string[]).includes(value);
}

async function authenticatedUser() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "members.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.userOrganization.findMany({
    where: { organizationId: id },
    orderBy: { user: { email: "asc" } },
    select: { id: true, userId: true, role: true, user: { select: { email: true, name: true } } },
  });
  return NextResponse.json(members.map((member) => ({
    ...member, email: member.user.email, name: member.user.name, permissions: permissionsForRole(member.role as OrganizationRole),
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "members.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  if (!isAssignableRole(body.role)) return NextResponse.json({ error: "A valid client role is required" }, { status: 400 });

  const member = await prisma.$transaction(async (tx) => {
    const dbUser = await tx.user.upsert({
      where: { email },
      update: name ? { name } : {},
      create: { email, name, role: body.role },
    });
    return tx.userOrganization.upsert({
      where: { userId_organizationId: { userId: dbUser.id, organizationId: id } },
      update: { role: body.role },
      create: { userId: dbUser.id, organizationId: id, role: body.role },
      select: { id: true, userId: true, role: true, user: { select: { email: true, name: true } } },
    });
  });

  return NextResponse.json({ ...member, email: member.user.email, name: member.user.name, permissions: permissionsForRole(member.role as OrganizationRole) }, { status: 201 });
}


export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "members.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (typeof body.userId !== "string" || !isAssignableRole(body.role)) return NextResponse.json({ error: "userId and a valid client role are required" }, { status: 400 });
  const membership = await prisma.userOrganization.updateMany({ where: { userId: body.userId, organizationId: id }, data: { role: body.role } });
  if (membership.count !== 1) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  const updated = await prisma.userOrganization.findFirstOrThrow({ where: { userId: body.userId, organizationId: id }, select: { id: true, userId: true, role: true, user: { select: { email: true, name: true } } } });
  return NextResponse.json({ ...updated, email: updated.user.email, name: updated.user.name, permissions: permissionsForRole(updated.role as OrganizationRole) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "members.manage"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (typeof body.userId !== "string") return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const target = await prisma.userOrganization.findFirst({ where: { userId: body.userId, organizationId: id }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  await prisma.userOrganization.delete({ where: { id: target.id } });
  return new NextResponse(null, { status: 204 });
}

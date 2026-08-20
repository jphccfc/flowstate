import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const existing = await prisma.businessDomain.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const domain = await prisma.businessDomain.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      color: body.color,
      order: body.order,
    },
  });

  return NextResponse.json(domain);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.businessDomain.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.businessDomain.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

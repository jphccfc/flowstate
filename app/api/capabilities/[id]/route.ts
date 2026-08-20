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
  const existing = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, existing.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const capability = await prisma.capability.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      aliases: body.aliases,
      dimensions: body.dimensions,
      metrics: body.metrics,
      tags: body.tags,
      importanceScore: body.importanceScore,
      order: body.order,
    },
  });

  return NextResponse.json(capability);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.capability.findUnique({ where: { id }, include: { domain: { select: { organizationId: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, existing.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.capability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

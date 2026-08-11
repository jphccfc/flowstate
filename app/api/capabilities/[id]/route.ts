import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

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
  await prisma.capability.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

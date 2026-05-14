import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const kpi = await prisma.kPI.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      targetValue: body.targetValue,
      currentValue: body.currentValue,
      measurementFrequency: body.measurementFrequency,
      dataSource: body.dataSource,
    },
  });

  return NextResponse.json(kpi);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.kPI.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

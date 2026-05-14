import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { calculateGap } from "@/lib/scoring/engine";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const gapScore = calculateGap(
    body.asIsScore ?? null,
    body.toBeScore ?? null
  );

  const capability = await prisma.capability.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      aliases: body.aliases,
      dimensions: body.dimensions,
      metrics: body.metrics,
      asIsState: body.asIsState,
      asIsScore: body.asIsScore,
      asIsNotes: body.asIsNotes,
      importanceScore: body.importanceScore,
      toBeState: body.toBeState,
      toBeScore: body.toBeScore,
      opportunities: body.opportunities,
      weaknesses: body.weaknesses,
      order: body.order,
      gapScore,
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

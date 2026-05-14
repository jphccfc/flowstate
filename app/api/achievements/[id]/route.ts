import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const achievement = await prisma.achievement.update({
    where: { id },
    data: {
      description: body.description,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      priority: body.priority,
      successMetrics: body.successMetrics,
      status: body.status,
    },
  });

  return NextResponse.json(achievement);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.achievement.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

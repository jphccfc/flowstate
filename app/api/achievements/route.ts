import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, description, targetDate, priority, successMetrics } = body;

  const achievement = await prisma.achievement.create({
    data: {
      organizationId,
      description,
      targetDate: targetDate ? new Date(targetDate) : null,
      priority: priority ?? 5,
      successMetrics,
    },
  });

  return NextResponse.json(achievement, { status: 201 });
}

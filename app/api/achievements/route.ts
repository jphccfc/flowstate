import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, description, targetDate, priority, successMetrics } = body;
  if (!(await isOrganizationMember(user.email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

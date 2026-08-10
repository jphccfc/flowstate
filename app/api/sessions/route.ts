import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId } = body;
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const dbUser = await prisma.user.upsert({
    where: { email: user.email! },
    update: {},
    create: { email: user.email!, name: user.user_metadata?.name, role: "ADVISOR" },
  });

  const session = await prisma.assessmentSession.create({
    data: {
      organizationId,
      advisorId: dbUser.id,
      status: "active",
    },
  });

  return NextResponse.json(session, { status: 201 });
}

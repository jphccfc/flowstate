import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { organizationId, name, role, email, phone } = body;

  const stakeholder = await prisma.stakeholder.create({
    data: { organizationId, name, role, email, phone },
  });

  return NextResponse.json(stakeholder, { status: 201 });
}

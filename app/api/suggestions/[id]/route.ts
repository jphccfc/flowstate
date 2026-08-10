import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const STATUS_BY_ACTION = {
  ask: "ASKED",
  dismiss: "DISMISSED",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action } = body as { action: keyof typeof STATUS_BY_ACTION };

  if (!(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const suggestion = await prisma.followUpSuggestion.update({
    where: { id },
    data: { status: STATUS_BY_ACTION[action] },
  });

  return NextResponse.json(suggestion);
}

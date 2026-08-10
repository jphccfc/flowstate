import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const STATUS_BY_ACTION = {
  approve: "APPROVED",
  reject: "REJECTED",
  reassign: "REASSIGNED",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, targetId } = body as { action: keyof typeof STATUS_BY_ACTION; targetId?: string };

  if (!(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "reassign" && !targetId) {
    return NextResponse.json({ error: "targetId is required for reassign" }, { status: 400 });
  }

  const tag = await prisma.tag.update({
    where: { id },
    data: {
      status: STATUS_BY_ACTION[action],
      reviewedBy: user.email ?? user.id,
      reviewedAt: new Date(),
      ...(action === "reassign" ? { targetId } : {}),
    },
  });

  return NextResponse.json(tag);
}

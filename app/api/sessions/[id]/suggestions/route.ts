import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const suggestions = await prisma.followUpSuggestion.findMany({
    where: { sessionId: id, status: "SHOWN" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}

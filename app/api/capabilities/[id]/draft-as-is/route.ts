import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { draftAsIsScore } from "@/lib/ai/maturity-draft";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const locationTag: string | null = body.locationTag ?? null;

  const capability = await prisma.capability.findUnique({ where: { id } });
  if (!capability) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tags = await prisma.tag.findMany({
    where: {
      targetType: "CAPABILITY",
      targetId: id,
      status: { in: ["AUTO_APPROVED", "APPROVED"] },
      ...(locationTag ? { segment: { capturedInput: { locationTag } } } : {}),
    },
    include: { segment: true },
  });

  const evidenceTexts = tags.map((t) => t.segment.text);
  const draft = await draftAsIsScore(capability.name, evidenceTexts);

  return NextResponse.json(draft);
}

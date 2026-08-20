import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const session = await prisma.assessmentSession.findUnique({ where: { id }, select: { organizationId: true } });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, session.organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const suggestions = await prisma.followUpSuggestion.findMany({
    where: { sessionId: id, status: "SHOWN" },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(suggestions);
}

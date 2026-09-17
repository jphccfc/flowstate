import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { organizationId?: string; capturedInputId?: string; action?: "approve" | "reject" } | null;
  if (!body?.organizationId || !body.capturedInputId || (body.action !== "approve" && body.action !== "reject")) return NextResponse.json({ error: "organizationId, capturedInputId and a valid action are required" }, { status: 400 });
  if (!(await isOrganizationMember(user.email, body.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await prisma.tag.updateMany({
    where: { status: "PENDING_REVIEW", segment: { capturedInputId: body.capturedInputId, capturedInput: { organizationId: body.organizationId } } },
    data: { status: body.action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: user.email ?? user.id, reviewedAt: new Date() },
  });
  return NextResponse.json({ capturedInputId: body.capturedInputId, action: body.action, updated: result.count });
}

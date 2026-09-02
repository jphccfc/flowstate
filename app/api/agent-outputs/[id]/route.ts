import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const statuses = new Set(["APPROVED", "REJECTED", "AMENDED"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const output = await prisma.agentOutput.findUnique({ where: { id }, select: { id: true, status: true, run: { select: { organizationId: true } } } });
  if (!output) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, output.run.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (output.status !== "PROVISIONAL") return NextResponse.json({ error: "Output has already been reviewed" }, { status: 409 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.status !== "string" || !statuses.has(body.status) || typeof body.reviewNotes !== "string" || !body.reviewNotes.trim()) return NextResponse.json({ error: "status and non-empty reviewNotes are required" }, { status: 400 });
  const reviewed = await prisma.agentOutput.updateMany({ where: { id, status: "PROVISIONAL" }, data: { status: body.status as "APPROVED" | "REJECTED" | "AMENDED" | "AMENDED", reviewNotes: body.reviewNotes.trim(), reviewedBy: user.email, reviewedAt: new Date() } });
  if (reviewed.count !== 1) return NextResponse.json({ error: "Output has already been reviewed" }, { status: 409 });
  const saved = await prisma.agentOutput.findUniqueOrThrow({ where: { id } });
  return NextResponse.json({ output: saved });
}

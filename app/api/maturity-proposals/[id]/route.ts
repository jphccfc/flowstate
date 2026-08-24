import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const actions = new Set(["approve", "reject", "edit"]);
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const body = await req.json().catch(() => ({}));
  if (!actions.has(body.action)) return NextResponse.json({ error: "action must be approve, reject, or edit" }, { status: 400 });
  const proposal = await prisma.maturityProposal.findUnique({ where: { id }, include: { capability: { include: { domain: { select: { organizationId: true } } } } } });
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, proposal.capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = body.action === "approve" ? "APPROVED" : body.action === "reject" ? "REJECTED" : "EDITED";
  const update = { status, reviewedBy: user.email, reviewNotes: typeof body.reviewNotes === "string" ? body.reviewNotes : undefined, reviewedAt: new Date(), ...(body.action === "edit" && typeof body.interpretation === "string" ? { interpretation: body.interpretation } : {}), ...(body.action === "edit" && typeof body.suggestedScore === "number" ? { suggestedScore: Math.max(0, Math.min(5, body.suggestedScore)) } : {}) };
  return NextResponse.json(await prisma.maturityProposal.update({ where: { id }, data: update }));
}

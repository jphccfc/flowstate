import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { displayLabel } from "@/lib/ui/display-label";

async function auth(id: string) { const user = (await (await createClient()).auth.getUser()).data.user; if (!user?.email) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }; if (!(await hasOrganizationPermission(user.email, id, "assessment.review"))) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }; return { email: user.email }; }
async function findPack(id: string, packId: string) { return prisma.communicationPack.findFirst({ where: { id: packId, organizationId: id }, include: { acknowledgements: { orderBy: { createdAt: "asc" } }, decision: true, insight: true } }); }
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; packId: string }> }) { const { id, packId } = await params; const result = await auth(id); if (result.response) return result.response; const pack = await findPack(id, packId); if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 }); return NextResponse.json({ ...pack, statusLabel: displayLabel(pack.status) }); }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; packId: string }> }) {
  const { id, packId } = await params; const result = await auth(id); if (result.response) return result.response; const pack = await findPack(id, packId); if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json(); const action = typeof body.action === "string" ? body.action : ""; const note = typeof body.note === "string" ? body.note.trim() : "";
  const nextStatus = action === "SUBMIT" && ["DRAFT", "CHANGES_REQUESTED"].includes(pack.status) ? "READY_FOR_REVIEW" : action === "ACKNOWLEDGE" && pack.status === "READY_FOR_REVIEW" ? "ACKNOWLEDGED" : action === "REQUEST_CHANGES" && pack.status === "READY_FOR_REVIEW" ? "CHANGES_REQUESTED" : null;
  if (!nextStatus && action) return NextResponse.json({ error: `Invalid transition from ${displayLabel(pack.status)}` }, { status: 409 });
  if (action === "REQUEST_CHANGES" && note.length < 10) return NextResponse.json({ error: "A meaningful comment is required when requesting changes" }, { status: 400 });
  const updated = await prisma.$transaction(async (tx) => { const saved = await tx.communicationPack.update({ where: { id: pack.id }, data: { ...(action ? { status: nextStatus, reviewedBy: result.email, reviewedAt: new Date() } : {}), ...(pack.status === "DRAFT" || pack.status === "CHANGES_REQUESTED" ? { ...(typeof body.title === "string" ? { title: body.title.trim() } : {}), ...(typeof body.content === "string" ? { content: body.content.trim() } : {}), ...(body.recipientContext ? { recipientContext: body.recipientContext } : {}), ...(body.stakeholderContext ? { stakeholderContext: body.stakeholderContext } : {}) } : {}) } as unknown as Parameters<typeof prisma.communicationPack.update>[0]["data"] }); if (action) await tx.communicationPackAcknowledgement.create({ data: { communicationPackId: pack.id, action: action === "SUBMIT" ? "SUBMITTED" : action === "ACKNOWLEDGE" ? "ACKNOWLEDGED" : "REQUEST_CHANGES", note: note || null, actedBy: result.email! } }); return saved; });
  return NextResponse.json(await findPack(id, updated.id));
}

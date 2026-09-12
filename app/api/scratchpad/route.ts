import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, hasOrganizationPermission } from "@/lib/auth/organization";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { sanitizeRichText } from "@/lib/scratchpad/rich-text";
import { apiError } from "@/lib/api/errors";
async function access(email: string | null | undefined, org: string) { return canAccessClient(email, org); }
async function actorFor(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { name: true, email: true } });
  return { senderName: user?.name?.trim() || email, senderEmail: user?.email || email };
}
export async function GET(req: NextRequest) {
  try {
  const params = new URL(req.url).searchParams;
  const org = params.get("organizationId"); if (!org) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const sessionId = params.get("sessionId");
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, org))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (sessionId && !(await prisma.assessmentSession.findFirst({ where: { id: sessionId, organizationId: org }, select: { id: true } }))) return NextResponse.json({ error: "Live session not found" }, { status: 404 });
  return NextResponse.json(await prisma.capturedInput.findMany({ where: { organizationId: org, type: "TEXT_NOTE", ...(sessionId ? { sessionId } : {}) }, orderBy: { updatedAt: "desc" }, include: { meetingContext: true } }));
  } catch (error) {
    return apiError(error, "Unable to load Scratch Pad");
  }
}
export async function POST(req: NextRequest) {
  try {
  const body = await req.json().catch(() => ({})); const org = body.organizationId;
  if (typeof org !== "string" || !org) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, org))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await actorFor(user.email);
  const contextId = typeof body.contextId === "string" ? body.contextId : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (sessionId) {
    const session = await prisma.assessmentSession.findFirst({ where: { id: sessionId, organizationId: org }, select: { id: true, status: true } });
    if (!session) return NextResponse.json({ error: "Live session not found" }, { status: 404 });
    if (session.status !== "active") return NextResponse.json({ error: "Live session is not active" }, { status: 400 });
  }
  if (contextId && !(await prisma.meetingContext.findFirst({ where: { id: contextId, organizationId: org }, select: { id: true } }))) return NextResponse.json({ error: "Meeting context not found" }, { status: 404 });
  const note = await prisma.capturedInput.create({ data: { organizationId: org, type: "TEXT_NOTE", rawText: sanitizeRichText(typeof body.text === "string" ? body.text : ""), status: "TRANSCRIBED", sessionId, meetingContextId: contextId, senderName: actor.senderName, senderEmail: actor.senderEmail } });
  after(() => processCapturedInput(note.id));
  return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return apiError(error, "Unable to save Scratch Pad note");
  }
}
export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const existing = await prisma.capturedInput.findUnique({ where: { id }, select: { organizationId: true, type: true } });
    if (!existing || existing.type !== "TEXT_NOTE") return NextResponse.json({ error: "Note not found" }, { status: 404 });
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await access(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.capturedInput.delete({ where: { id } });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiError(error, "Unable to delete Scratch Pad note");
  }
}
export async function PATCH(req: NextRequest) {
  try {
  const body = await req.json().catch(() => ({})); const id = body.id; if (typeof id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await prisma.capturedInput.findUnique({ where: { id }, select: { organizationId: true, revision: true, reviewStatus: true } }); if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const action = body.action;
  const canReview = await hasOrganizationPermission(user.email, existing.organizationId, "assessment.review");
  if (action === "approve" || action === "reject") {
    if (!canReview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const actor = await actorFor(user.email);
    if (existing.reviewStatus !== "PENDING_REVIEW") return NextResponse.json({ error: "Note has already been reviewed" }, { status: 409 });
    const updated = await prisma.capturedInput.update({ where: { id }, data: { reviewStatus: action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: actor.senderEmail, reviewedAt: new Date() } });
    return NextResponse.json(updated);
  }
  if (action !== undefined) return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  if (!(await access(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const revision = Number(body.revision);
  const actor = await actorFor(user.email); if (!Number.isInteger(revision) || revision !== existing.revision) return NextResponse.json({ error: "Revision conflict", revision: existing.revision }, { status: 409 });
  const contextId = typeof body.contextId === "string" ? body.contextId : null;
  if (contextId && !(await prisma.meetingContext.findFirst({ where: { id: contextId, organizationId: existing.organizationId }, select: { id: true } }))) return NextResponse.json({ error: "Meeting context not found" }, { status: 404 });
  if (typeof body.text !== "string") return NextResponse.json({ error: "text is required" }, { status: 400 });
  const updated = await prisma.capturedInput.updateMany({ where: { id, organizationId: existing.organizationId, revision }, data: { rawText: sanitizeRichText(body.text), meetingContextId: contextId, senderName: actor.senderName, senderEmail: actor.senderEmail, revision: { increment: 1 }, reviewStatus: "PENDING_REVIEW", reviewedBy: null, reviewedAt: null } });
  if (!updated.count) return NextResponse.json({ error: "Revision conflict" }, { status: 409 }); return NextResponse.json(await prisma.capturedInput.findUnique({ where: { id } }));
  } catch (error) {
    return apiError(error, "Unable to update Scratch Pad note");
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
import { sanitizeRichText } from "@/lib/scratchpad/rich-text";
async function access(email: string | null | undefined, org: string) { return canAccessClient(email, org); }
async function actorFor(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { name: true, email: true } });
  return { senderName: user?.name?.trim() || email, senderEmail: user?.email || email };
}
export async function GET(req: NextRequest) {
  const org = new URL(req.url).searchParams.get("organizationId"); if (!org) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, org))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await prisma.capturedInput.findMany({ where: { organizationId: org, type: "TEXT_NOTE" }, orderBy: { updatedAt: "desc" }, include: { meetingContext: true } }));
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})); const org = body.organizationId;
  if (typeof org !== "string" || !org) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, org))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await actorFor(user.email);
  const contextId = typeof body.contextId === "string" ? body.contextId : null;
  if (contextId && !(await prisma.meetingContext.findFirst({ where: { id: contextId, organizationId: org }, select: { id: true } }))) return NextResponse.json({ error: "Meeting context not found" }, { status: 404 });
  const note = await prisma.capturedInput.create({ data: { organizationId: org, type: "TEXT_NOTE", rawText: sanitizeRichText(typeof body.text === "string" ? body.text : ""), status: "TRANSCRIBED", meetingContextId: contextId, senderName: actor.senderName, senderEmail: actor.senderEmail } });
  return NextResponse.json(note, { status: 201 });
}
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})); const id = body.id; if (typeof id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await prisma.capturedInput.findUnique({ where: { id }, select: { organizationId: true, revision: true } }); if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actor = await actorFor(user.email);
  const revision = Number(body.revision); if (!Number.isInteger(revision) || revision !== existing.revision) return NextResponse.json({ error: "Revision conflict", revision: existing.revision }, { status: 409 });
  const contextId = typeof body.contextId === "string" ? body.contextId : null;
  if (contextId && !(await prisma.meetingContext.findFirst({ where: { id: contextId, organizationId: existing.organizationId }, select: { id: true } }))) return NextResponse.json({ error: "Meeting context not found" }, { status: 404 });
  const updated = await prisma.capturedInput.updateMany({ where: { id, organizationId: existing.organizationId, revision }, data: { rawText: sanitizeRichText(typeof body.text === "string" ? body.text : ""), meetingContextId: contextId, senderName: actor.senderName, senderEmail: actor.senderEmail, revision: { increment: 1 } } });
  if (!updated.count) return NextResponse.json({ error: "Revision conflict" }, { status: 409 }); return NextResponse.json(await prisma.capturedInput.findUnique({ where: { id } }));
}

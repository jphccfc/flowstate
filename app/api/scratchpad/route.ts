import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
async function access(email: string | null | undefined, org: string) { return canAccessClient(email, org); }
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
  const note = await prisma.capturedInput.create({ data: { organizationId: org, type: "TEXT_NOTE", rawText: typeof body.text === "string" ? body.text : "", status: "TRANSCRIBED", meetingContextId: typeof body.contextId === "string" ? body.contextId : null } });
  return NextResponse.json(note, { status: 201 });
}
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({})); const id = body.id; if (typeof id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await prisma.capturedInput.findUnique({ where: { id }, select: { organizationId: true, revision: true } }); if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  const { data: { user } } = await (await createClient()).auth.getUser(); if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await access(user.email, existing.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const revision = Number(body.revision); if (!Number.isInteger(revision) || revision !== existing.revision) return NextResponse.json({ error: "Revision conflict", revision: existing.revision }, { status: 409 });
  const updated = await prisma.capturedInput.updateMany({ where: { id, organizationId: existing.organizationId, revision }, data: { rawText: typeof body.text === "string" ? body.text : "", meetingContextId: typeof body.contextId === "string" ? body.contextId : null, revision: { increment: 1 } } });
  if (!updated.count) return NextResponse.json({ error: "Revision conflict" }, { status: 409 }); return NextResponse.json(await prisma.capturedInput.findUnique({ where: { id } }));
}

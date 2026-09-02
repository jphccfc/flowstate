import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, hasOrganizationPermission } from "@/lib/auth/organization";

async function actor() { return (await (await createClient()).auth.getUser()).data.user; }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await actor(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params;
  if (!(await canAccessClient(user.email, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const runs = await prisma.agentRun.findMany({ where: { organizationId: id }, orderBy: { createdAt: "desc" }, include: { capturedInput: { select: { id: true, type: true, sourceRef: true, subject: true, capturedAt: true } }, agentDefinition: { select: { id: true, key: true, name: true } }, promptVersion: { select: { id: true, version: true } }, output: true } });
  return NextResponse.json({ runs });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await actor(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params;
  if (!(await hasOrganizationPermission(user.email, id, "assessment.submit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null; if (!body || typeof body.capturedInputId !== "string" || typeof body.agentDefinitionId !== "string") return NextResponse.json({ error: "capturedInputId and agentDefinitionId are required" }, { status: 400 });
  const input = await prisma.capturedInput.findFirst({ where: { id: body.capturedInputId, organizationId: id }, select: { id: true } });
  const agent = await prisma.agentDefinition.findFirst({ where: { id: body.agentDefinitionId, publishedPromptVersionId: { not: null } }, select: { id: true, publishedPromptVersionId: true } });
  if (!input || !agent?.publishedPromptVersionId) return NextResponse.json({ error: "Captured input or published agent not found" }, { status: 404 });
  const run = await prisma.agentRun.create({ data: { organizationId: id, capturedInputId: input.id, agentDefinitionId: agent.id, promptVersionId: agent.publishedPromptVersionId }, include: { output: true, capturedInput: true, agentDefinition: true, promptVersion: true } });
  return NextResponse.json({ run }, { status: 201 });
}

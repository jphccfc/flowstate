import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/organization";
import type { Prisma } from "@/app/generated/prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = (await (await createClient()).auth.getUser()).data.user; if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { id } = await params;
  const run = await prisma.agentRun.findUnique({ where: { id }, select: { id: true, organizationId: true } }); if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessClient(user.email, run.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null; if (!body || typeof body.provisionalOutput !== "object" || body.provisionalOutput === null || Array.isArray(body.provisionalOutput)) return NextResponse.json({ error: "provisionalOutput object is required" }, { status: 400 });
  const provisionalOutput = body.provisionalOutput as Prisma.InputJsonValue;
  const output = await prisma.$transaction(async (tx) => { const created = await tx.agentOutput.upsert({ where: { runId: id }, create: { runId: id, provisionalOutput, provider: typeof body.provider === "string" ? body.provider : null, model: typeof body.model === "string" ? body.model : null }, update: { provisionalOutput, provider: typeof body.provider === "string" ? body.provider : null, model: typeof body.model === "string" ? body.model : null, status: "PROVISIONAL", reviewedBy: null, reviewedAt: null, reviewNotes: null } }); await tx.agentRun.update({ where: { id }, data: { status: "OUTPUT_READY", provider: created.provider, model: created.model, error: null } }); return created; });
  return NextResponse.json({ output }, { status: 201 });
}

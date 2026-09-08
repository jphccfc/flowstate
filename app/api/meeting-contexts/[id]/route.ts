import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

async function actor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await actor();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.meetingContext.findUnique({ where: { id }, select: { organizationId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(email, existing.organizationId, "evidence.create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim()))) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
  const data: { title?: string; startsAt?: Date | null; dateTime?: Date | null; stakeholderName?: string | null; stakeholders?: string[]; domainName?: string | null; domain?: string | null; objectives?: string | null; agendaItems?: string[]; desiredOutcome?: string | null } = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.dateTime !== undefined) data.dateTime = typeof body.dateTime === "string" && body.dateTime ? new Date(body.dateTime) : null;
  if (body.stakeholders !== undefined) data.stakeholders = Array.isArray(body.stakeholders) ? body.stakeholders.filter((item: unknown): item is string => typeof item === "string" && !!item.trim()) : [];
  if (body.domain !== undefined) data.domain = typeof body.domain === "string" ? body.domain || null : null;
  for (const field of ["stakeholderName", "domainName", "objectives", "desiredOutcome"] as const) if (body[field] !== undefined) data[field] = typeof body[field] === "string" ? body[field] || null : null;
  if (body.startsAt !== undefined) data.startsAt = typeof body.startsAt === "string" && body.startsAt ? new Date(body.startsAt) : null;
  if (body.agendaItems !== undefined) data.agendaItems = Array.isArray(body.agendaItems) ? body.agendaItems.filter((item: unknown): item is string => typeof item === "string") : [];
  return NextResponse.json(await prisma.meetingContext.update({ where: { id }, data }));
}

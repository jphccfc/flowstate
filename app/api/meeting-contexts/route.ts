import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, hasOrganizationPermission } from "@/lib/auth/organization";

async function actor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export async function GET(req: NextRequest) {
  const email = await actor();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const organizationId = new URL(req.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  if (!(await canAccessClient(email, organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contexts = await prisma.meetingContext.findMany({
    where: { organizationId }, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { capturedInputs: true } } },
  });
  return NextResponse.json(contexts);
}

export async function POST(req: NextRequest) {
  const email = await actor();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.organizationId !== "string" || !body.organizationId || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "organizationId and title are required" }, { status: 400 });
  }
  if (!(await hasOrganizationPermission(email, body.organizationId, "evidence.create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await prisma.meetingContext.create({ data: {
    organizationId: body.organizationId, title: body.title.trim(),
    startsAt: typeof body.startsAt === "string" && body.startsAt ? new Date(body.startsAt) : undefined,
    dateTime: typeof body.dateTime === "string" && body.dateTime ? new Date(body.dateTime) : undefined,
    stakeholderName: typeof body.stakeholderName === "string" ? body.stakeholderName || null : null,
    stakeholders: Array.isArray(body.stakeholders) ? body.stakeholders.filter((item: unknown): item is string => typeof item === "string" && !!item.trim()) : [],
    domainName: typeof body.domainName === "string" ? body.domainName || null : null,
    domain: typeof body.domain === "string" ? body.domain || null : null,
    objectives: typeof body.objectives === "string" ? body.objectives || null : null,
    agendaItems: Array.isArray(body.agendaItems) ? body.agendaItems.filter((item: unknown): item is string => typeof item === "string") : [],
    desiredOutcome: typeof body.desiredOutcome === "string" ? body.desiredOutcome || null : null,
  } });
  return NextResponse.json(context, { status: 201 });
}

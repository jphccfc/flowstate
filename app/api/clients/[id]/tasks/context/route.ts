import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = (await (await createClient()).auth.getUser()).data.user;
  const { id } = await params;
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(current.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [evidence, capabilities, decisions] = await Promise.all([
    prisma.tag.findMany({ where: { status: { in: ["AUTO_APPROVED", "APPROVED"] }, segment: { capturedInput: { organizationId: id } } }, select: { id: true, segment: { select: { text: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.capability.findMany({ where: { domain: { organizationId: id } }, select: { id: true, name: true, domain: { select: { name: true } } }, orderBy: [{ domain: { order: "asc" } }, { order: "asc" }] }),
    prisma.assessmentDecision.findMany({ where: { capability: { domain: { organizationId: id } } }, select: { id: true, status: true, capability: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return NextResponse.json({ evidence: evidence.map((item) => ({ id: item.id, label: item.segment.text.slice(0, 120) })), capabilities: capabilities.map((item) => ({ id: item.id, label: `${item.domain.name} · ${item.name}` })), decisions: decisions.map((item) => ({ id: item.id, label: `${item.capability.name} · ${item.status}` })) });
}

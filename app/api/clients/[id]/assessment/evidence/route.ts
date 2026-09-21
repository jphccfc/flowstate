import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const capabilityId = request.nextUrl.searchParams.get("capabilityId")?.trim();
  if (!capabilityId) return NextResponse.json({ error: "capabilityId is required" }, { status: 400 });
  const capability = await prisma.capability.findFirst({ where: { id: capabilityId, domain: { organizationId: id } }, select: { id: true, name: true, domain: { select: { name: true } } } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  const findings = await prisma.documentFinding.findMany({
    where: { organizationId: id, capabilityId, AND: [{ status: "APPROVED" }, { status: { notIn: ["STALE", "SOURCE_REMOVED", "SUPERSEDED", "REJECTED"] } }], capturedInput: { is: { versionStatus: "CURRENT" } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, summary: true, evidenceDemonstrated: true, strength: true, confidence: true, citedExcerpts: true, sourceHash: true, reviewedBy: true, reviewedAt: true, capturedInput: { select: { id: true, sourceRef: true, sourcePath: true, versionLabel: true, versionStatus: true, attachments: { select: { filename: true }, take: 1 } } } },
  });
  return NextResponse.json({ capability, evidence: findings });
}

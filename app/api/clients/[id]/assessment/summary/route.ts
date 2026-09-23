import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await (await createClient()).auth.getUser()).data.user;
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const capabilities = await prisma.capability.findMany({ where: { domain: { organizationId: id } }, orderBy: [{ domain: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, domain: { select: { id: true, name: true } } } });
  const items = await Promise.all(capabilities.map(async (capability) => {
    const [decision, history, evidenceCount] = await Promise.all([
      prisma.assessmentDecision.findFirst({ where: { capabilityId: capability.id, status: "CONFIRMED" }, orderBy: { createdAt: "desc" }, select: { id: true, score: true, rationale: true, rubricVersion: true, decidedBy: true, decidedAt: true, sourceEvidenceIds: true } }),
      prisma.assessmentDecision.findMany({ where: { capabilityId: capability.id, status: "CONFIRMED" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, score: true, decidedAt: true, rubricVersion: true, decidedBy: true } }),
      prisma.documentFinding.count({ where: { organizationId: id, capabilityId: capability.id, status: "APPROVED", capturedInput: { is: { versionStatus: "CURRENT" } } } }),
    ]);
    return { capabilityId: capability.id, capabilityName: capability.name, domainId: capability.domain.id, domainName: capability.domain.name, confirmedScore: decision, scoreHistory: history, evidenceCount, evidenceGap: evidenceCount === 0 };
  }));
  const domains = [...new Set(items.map((item) => item.domainId))].map((domainId) => {
    const domainItems = items.filter((item) => item.domainId === domainId);
    const scored = domainItems.filter((item) => item.confirmedScore?.score !== null && item.confirmedScore?.score !== undefined);
    return { domainId, domainName: domainItems[0]?.domainName ?? "", capabilityCount: domainItems.length, scoredCount: scored.length, evidenceGapCount: domainItems.filter((item) => item.evidenceGap).length, domainAverage: scored.length ? Math.round((scored.reduce((sum, item) => sum + (item.confirmedScore?.score ?? 0), 0) / scored.length) * 100) / 100 : null };
  });
  return NextResponse.json({ domains, capabilities: items, scoredCapabilities: items.filter((item) => item.confirmedScore), evidenceGaps: items.filter((item) => item.evidenceGap) });
}

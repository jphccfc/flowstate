import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";
import { processCapturedInput } from "@/lib/ingestion/pipeline";

/**
 * Re-runs one pending document finding with the current domain-first classifier.
 *
 * The old finding is retained as STALE and linked from the replacement. Only a
 * pending AI proposal may be re-analysed through this endpoint; approved and
 * rejected human decisions require an explicit future reopen workflow.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { findingId?: string } | null;
  const findingId = body?.findingId?.trim();
  if (!findingId) return NextResponse.json({ error: "findingId is required" }, { status: 400 });

  const finding = await prisma.documentFinding.findFirst({
    where: { id: findingId, organizationId: id },
    select: { id: true, capturedInputId: true, status: true },
  });
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  if (finding.status !== "PENDING_REVIEW") {
    return NextResponse.json({ error: "Only pending findings can be re-analysed. Human decisions are preserved." }, { status: 409 });
  }

  await prisma.documentFinding.update({ where: { id: finding.id }, data: { status: "STALE" } });
  after(async () => {
    try {
      await processCapturedInput(finding.capturedInputId);
      const replacement = await prisma.documentFinding.findFirst({
        where: { capturedInputId: finding.capturedInputId, status: "PENDING_REVIEW", id: { not: finding.id } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (replacement) await prisma.documentFinding.update({ where: { id: replacement.id }, data: { reanalysisOfId: finding.id } });
    } catch {
      // The old finding is intentionally retained as STALE; the operator can retry.
    }
  });
  return NextResponse.json({ accepted: true, findingId: finding.id, status: "REANALYSIS_QUEUED" }, { status: 202 });
}

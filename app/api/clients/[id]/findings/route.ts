import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

/**
 * Document findings awaiting human judgement.
 *
 * A finding is a claim about what a document proves. Nothing here is an
 * assessment input until a person approves it — the platform proposes, the
 * consultant decides, and the decision is recorded with who made it.
 *
 * Organisation-scoped: findings are read and resolved through the route's
 * organisation id, so a caller cannot approve another client's evidence.
 */
async function authorize(id: string, permission: "client.read" | "client.configure") {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasOrganizationPermission(user.email, id, permission))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await authorize(id, "client.read");
  if (guard.error) return guard.error;

  const status = request.nextUrl.searchParams.get("status");
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const domainId = request.nextUrl.searchParams.get("domainId")?.trim();
  const allowed = ["PENDING_REVIEW", "APPROVED", "REJECTED", "STALE", "SOURCE_REMOVED"] as const;
  const where = {
    organizationId: id,
    ...(status && (allowed as readonly string[]).includes(status)
      ? { status: status as (typeof allowed)[number] }
      : { status: "PENDING_REVIEW" as const }),
    ...(domainId ? { domainId } : {}),
    ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" as const } }, { summary: { contains: query, mode: "insensitive" as const } }, { capabilityName: { contains: query, mode: "insensitive" as const } }] } : {}),
  };

  try {
    const findings = await prisma.documentFinding.findMany({
      where,
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        capturedInput: {
          select: {
            sourceRef: true,
            attachments: { select: { filename: true }, take: 1 },
          },
        },
      },
    });

    const counts = await prisma.documentFinding.groupBy({
      by: ["status"],
      where: { organizationId: id },
      _count: { _all: true },
    });

    return NextResponse.json({
      findings: findings.map((finding) => ({
        id: finding.id,
        documentType: finding.documentType,
        title: finding.title,
        summary: finding.summary,
        capabilityId: finding.capabilityId,
        capabilityName: finding.capabilityName,
        domainId: finding.domainId,
        domainName: finding.domainName,
        evidenceDemonstrated: finding.evidenceDemonstrated,
        strength: finding.strength,
        confidence: finding.confidence,
        citedExcerpts: finding.citedExcerpts,
        citedCount: finding.citedSegmentIds.length,
        status: finding.status,
        reviewedBy: finding.reviewedBy,
        reviewedAt: finding.reviewedAt,
        filename: finding.capturedInput.attachments[0]?.filename ?? null,
        sourceRef: finding.capturedInput.sourceRef,
      })),
      counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    });
  } catch {
    return NextResponse.json({ error: "Findings could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await authorize(id, "client.configure");
  if (guard.error) return guard.error;

  const body = await request.json().catch(() => null) as { findingId?: string; action?: string } | null;
  const findingId = body?.findingId?.trim();
  const action = body?.action;
  if (!findingId) return NextResponse.json({ error: "findingId is required" }, { status: 400 });
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
  }

  // Scoped by organisation as well as id, so an id from another tenant cannot be
  // acted on even if it is guessed.
  const existing = await prisma.documentFinding.findFirst({ where: { id: findingId, organizationId: id } });
  if (!existing) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  if (existing.status === "STALE") {
    return NextResponse.json({ error: "This finding is stale: the source document has changed since it was analysed." }, { status: 409 });
  }

  const updated = await prisma.documentFinding.update({
    where: { id: findingId },
    data: {
      status: action === "approve" ? "APPROVED" : "REJECTED",
      reviewedBy: guard.user?.email ?? null,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({
    finding: { id: updated.id, status: updated.status, reviewedBy: updated.reviewedBy, reviewedAt: updated.reviewedAt },
  });
}

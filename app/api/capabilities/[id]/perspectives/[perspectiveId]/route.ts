import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

const actions = new Set(["approve", "reject"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; perspectiveId: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, perspectiveId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!actions.has(body.action)) return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });

  const perspective = await prisma.maturityPerspective.findUnique({
    where: { id: perspectiveId },
    include: { capability: { include: { domain: { select: { organizationId: true } } } } },
  });
  if (!perspective || perspective.capabilityId !== id) return NextResponse.json({ error: "Perspective not found" }, { status: 404 });
  if (!(await hasOrganizationPermission(user.email, perspective.capability.domain.organizationId, "assessment.review"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (perspective.status !== "SUBMITTED") return NextResponse.json({ error: "Perspective has already been reviewed" }, { status: 409 });

  const reviewNotes = typeof body.reviewNotes === "string" ? body.reviewNotes.trim() : "";
  const updated = await prisma.maturityPerspective.update({
    where: { id: perspective.id },
    data: { status: body.action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: user.email, reviewNotes: reviewNotes || null, reviewedAt: new Date() },
  });
  return NextResponse.json(updated);
}

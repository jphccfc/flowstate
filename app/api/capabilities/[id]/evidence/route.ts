import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const capability = await prisma.capability.findUnique({ where: { id }, select: { domain: { select: { organizationId: true } } } });
  if (!capability) return NextResponse.json({ error: "Capability not found" }, { status: 404 });
  if (!(await isOrganizationMember(user.email, capability.domain.organizationId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tags = await prisma.tag.findMany({
    where: { targetType: "CAPABILITY", targetId: id, status: "APPROVED", segment: { capturedInput: { organizationId: capability.domain.organizationId } } },
    include: { segment: { include: { capturedInput: { select: { id: true, type: true, sourceRef: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(tags.map((tag) => ({ id: tag.id, segmentText: tag.segment.text, sourceType: tag.segment.capturedInput.type, sourceRef: tag.segment.capturedInput.sourceRef, capturedInputId: tag.segment.capturedInput.id, segmentId: tag.segment.id })));
}

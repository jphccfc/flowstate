import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { isOrganizationMember } from "@/lib/auth/organization";

const STATUS_BY_ACTION = {
  approve: "APPROVED",
  reject: "REJECTED",
  reassign: "REASSIGNED",
} as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, targetId } = body as { action: keyof typeof STATUS_BY_ACTION; targetId?: string };

  if (!(action in STATUS_BY_ACTION)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (action === "reassign" && !targetId) {
    return NextResponse.json({ error: "targetId is required for reassign" }, { status: 400 });
  }

  const existingTag = await prisma.tag.findUnique({
    where: { id },
    select: {
      targetType: true,
      segment: { select: { capturedInput: { select: { organizationId: true } } } },
    },
  });
  if (!existingTag) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const organizationId = existingTag.segment.capturedInput.organizationId;
  if (!(await isOrganizationMember(user.email, organizationId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (action === "reassign") {
    const targetOrganizationId = await getTargetOrganizationId(existingTag.targetType, targetId!);
    if (!targetOrganizationId) {
      return NextResponse.json({ error: "Invalid targetId for tag type" }, { status: 400 });
    }
    if (targetOrganizationId !== organizationId) {
      return NextResponse.json({ error: "Target belongs to another organization" }, { status: 403 });
    }
  }

  const tag = await prisma.tag.update({
    where: { id },
    data: {
      status: STATUS_BY_ACTION[action],
      reviewedBy: user.email ?? user.id,
      reviewedAt: new Date(),
      ...(action === "reassign" ? { targetId } : {}),
    },
  });

  return NextResponse.json(tag);
}


async function getTargetOrganizationId(targetType: string, targetId: string): Promise<string | null> {
  switch (targetType) {
    case "DOMAIN": {
      const target = await prisma.businessDomain.findUnique({ where: { id: targetId }, select: { organizationId: true } });
      return target?.organizationId ?? null;
    }
    case "CAPABILITY": {
      const target = await prisma.capability.findUnique({
        where: { id: targetId },
        select: { domain: { select: { organizationId: true } } },
      });
      return target?.domain.organizationId ?? null;
    }
    case "KPI": {
      const target = await prisma.kPI.findUnique({ where: { id: targetId }, select: { organizationId: true } });
      return target?.organizationId ?? null;
    }
    case "STAKEHOLDER": {
      const target = await prisma.stakeholder.findUnique({ where: { id: targetId }, select: { organizationId: true } });
      return target?.organizationId ?? null;
    }
    default:
      return null;
  }
}

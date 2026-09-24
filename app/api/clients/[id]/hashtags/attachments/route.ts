import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const capturedInputId = new URL(req.url).searchParams.get("capturedInputId");
  if (!capturedInputId) return NextResponse.json({ error: "capturedInputId is required" }, { status: 400 });

  const attachments = await prisma.tagAttachment.findMany({
    where: { organizationId, capturedInputId, status: "APPROVED" },
    include: { tagDefinition: { select: { id: true, displayName: true, normalizedName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(attachments);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "evidence.create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { tagDefinitionId?: unknown; capturedInputId?: unknown; segmentId?: unknown; rationale?: unknown } | null;
  if (typeof body?.tagDefinitionId !== "string" || typeof body.capturedInputId !== "string") return NextResponse.json({ error: "tagDefinitionId and capturedInputId are required" }, { status: 400 });
  if (body.segmentId !== undefined && typeof body.segmentId !== "string") return NextResponse.json({ error: "segmentId must be a string" }, { status: 400 });

  const [tag, input, segment] = await Promise.all([
    prisma.tagDefinition.findFirst({ where: { id: body.tagDefinitionId, organizationId, active: true }, select: { id: true } }),
    prisma.capturedInput.findFirst({ where: { id: body.capturedInputId, organizationId }, select: { id: true } }),
    typeof body.segmentId === "string" ? prisma.capturedSegment.findFirst({ where: { id: body.segmentId, capturedInputId: body.capturedInputId }, select: { id: true } }) : null,
  ]);
  if (!tag || !input || (typeof body.segmentId === "string" && !segment)) return NextResponse.json({ error: "Tag or evidence source is not available in this client workspace." }, { status: 400 });

  const targetKey = segment ? `segment:${segment.id}` : `input:${input.id}`;
  try {
    const attachment = await prisma.tagAttachment.create({
      data: {
        organizationId,
        tagDefinitionId: tag.id,
        capturedInputId: input.id,
        segmentId: segment?.id ?? null,
        targetKey,
        source: "MANUAL",
        status: "APPROVED",
        rationale: typeof body.rationale === "string" ? body.rationale.trim() || null : null,
        reviewedBy: user.email ?? user.id,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("TagAttachment_tagDefinitionId_targetKey_key")) return NextResponse.json({ error: "This tag is already attached to this source." }, { status: 409 });
    return NextResponse.json({ error: "Unable to attach tag." }, { status: 500 });
  }
}

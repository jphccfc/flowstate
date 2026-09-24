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
  const existing = await prisma.tagAttachment.findUnique({ where: { tagDefinitionId_targetKey: { tagDefinitionId: tag.id, targetKey } } });
  if (existing) return NextResponse.json(existing);

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
  } catch {
    // A simultaneous attach can win between lookup and insert; preserve idempotency.
    const racedAttachment = await prisma.tagAttachment.findUnique({ where: { tagDefinitionId_targetKey: { tagDefinitionId: tag.id, targetKey } } });
    if (racedAttachment) return NextResponse.json(racedAttachment);
    return NextResponse.json({ error: "Unable to attach this hashtag. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "evidence.create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const attachmentId = new URL(req.url).searchParams.get("attachmentId");
  if (!attachmentId) return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });
  const attachment = await prisma.tagAttachment.findFirst({ where: { id: attachmentId, organizationId }, select: { id: true } });
  if (!attachment) return NextResponse.json({ error: "Hashtag attachment not found." }, { status: 404 });

  await prisma.tagAttachment.delete({ where: { id: attachment.id } });
  return new NextResponse(null, { status: 204 });
}

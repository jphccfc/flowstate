import { NextRequest, NextResponse } from "next/server";
import { InputType } from "@/app/generated/prisma/enums";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { normalizeHashtag } from "@/lib/tags/hashtags";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  if (!rawQuery) return NextResponse.json({ error: "A hashtag query is required." }, { status: 400 });

  let query: string;
  try {
    query = normalizeHashtag(rawQuery);
  } catch {
    return NextResponse.json({ error: "Enter a hashtag containing letters or numbers." }, { status: 400 });
  }

  const sourceType = url.searchParams.get("sourceType")?.trim() ?? "";
  const sourceTypeFilter = Object.values(InputType).includes(sourceType as InputType) ? sourceType as InputType : undefined;

  const attachments = await prisma.tagAttachment.findMany({
    where: {
      organizationId,
      status: "APPROVED",
      tagDefinition: { active: true },
      ...(sourceTypeFilter ? { capturedInput: { type: sourceTypeFilter } } : {}),
    },
    include: {
      tagDefinition: { select: { normalizedName: true, displayName: true, aliases: true } },
      capturedInput: { select: { id: true, type: true, subject: true, sourceRef: true, sourcePath: true, capturedAt: true } },
      segment: { select: { id: true, text: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const results = attachments
    .filter((attachment) => [attachment.tagDefinition.normalizedName, attachment.tagDefinition.displayName, ...attachment.tagDefinition.aliases]
      .map((name) => name.toLocaleLowerCase())
      .some((name) => name.includes(query)))
    .map((attachment) => ({
      id: attachment.id,
      tag: attachment.tagDefinition,
      source: attachment.capturedInput,
      excerpt: attachment.segment?.text ?? null,
      rationale: attachment.rationale,
      attachment: { source: attachment.source, status: attachment.status, confidence: attachment.confidence, reviewedAt: attachment.reviewedAt },
    }));

  return NextResponse.json({ query, results });
}

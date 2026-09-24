import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { normalizeHashtag } from "@/lib/tags/hashtags";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "client.read"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const normalizedQuery = query ? normalizeHashtag(query) : "";
  const tags = await prisma.tagDefinition.findMany({
    where: {
      organizationId,
      active: true,
      ...(normalizedQuery ? { OR: [{ normalizedName: { contains: normalizedQuery } }, { aliases: { has: normalizedQuery } }] } : {}),
    },
    orderBy: [{ normalizedName: "asc" }],
    take: 30,
  });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: organizationId } = await params;
  if (!(await hasOrganizationPermission(user.email, organizationId, "evidence.create"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { displayName?: unknown; description?: unknown; category?: unknown; aliases?: unknown } | null;
  if (typeof body?.displayName !== "string") return NextResponse.json({ error: "displayName is required" }, { status: 400 });

  try {
    const normalizedName = normalizeHashtag(body.displayName);
    const aliases = Array.isArray(body.aliases)
      ? [...new Set(body.aliases.filter((alias): alias is string => typeof alias === "string").map(normalizeHashtag).filter((alias) => alias !== normalizedName))]
      : [];
    const tag = await prisma.tagDefinition.create({
      data: {
        organizationId,
        displayName: body.displayName.trim().replace(/^#+/, ""),
        normalizedName,
        aliases,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        category: typeof body.category === "string" ? body.category.trim() || null : null,
        createdBy: user.email ?? user.id,
      },
    });
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("TagDefinition_organizationId_normalizedName_key")) return NextResponse.json({ error: "This tag already exists in the client workspace." }, { status: 409 });
    if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Unable to create tag." }, { status: 500 });
  }
}

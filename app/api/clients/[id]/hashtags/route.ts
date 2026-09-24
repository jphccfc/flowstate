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

  let normalizedName = "";
  try {
    normalizedName = normalizeHashtag(body.displayName);
    const aliases = Array.isArray(body.aliases)
      ? [...new Set(body.aliases.filter((alias): alias is string => typeof alias === "string").map(normalizeHashtag).filter((alias) => alias !== normalizedName))]
      : [];
    const existing = await prisma.tagDefinition.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
    });
    if (existing) return NextResponse.json(existing);

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
  } catch {
    if (!normalizedName) return NextResponse.json({ error: "Enter a hashtag containing letters or numbers." }, { status: 400 });
    // A simultaneous create can still win between lookup and insert. Re-read once
    // and make this endpoint idempotent rather than leaking a database error.
    const existing = await prisma.tagDefinition.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
    });
    if (existing) return NextResponse.json(existing);
    return NextResponse.json({ error: "Unable to create this hashtag. Please try again." }, { status: 500 });
  }
}

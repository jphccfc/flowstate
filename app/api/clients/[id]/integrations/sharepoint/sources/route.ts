import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";

async function authorize(id: string, permission: "client.read" | "client.configure") {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasOrganizationPermission(user.email, id, permission))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

/** Returns persisted source scopes and sync health, never delta URLs. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await authorize(id, "client.read");
  if (guard.error) return guard.error;
  const sources = await prisma.integrationSource.findMany({
    where: { organizationId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, provider: true, siteId: true, siteName: true, driveId: true,
      driveName: true, folderItemId: true, folderPath: true, enabled: true,
      syncStatus: true, lastSyncedAt: true, lastError: true, createdAt: true,
    },
  });
  return NextResponse.json({ sources });
}

/** Saves exactly which client folder is permitted to be monitored. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await authorize(id, "client.configure");
  if (guard.error) return guard.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const strings = ["siteId", "driveId", "folderItemId"] as const;
  if (!strings.every((key) => typeof body?.[key] === "string" && (body[key] as string).trim())) {
    return NextResponse.json({ error: "siteId, driveId, and folderItemId are required" }, { status: 400 });
  }
  const siteId = (body?.siteId as string).trim();
  const driveId = (body?.driveId as string).trim();
  const folderItemId = (body?.folderItemId as string).trim();
  const source = await prisma.integrationSource.upsert({
    where: { organizationId_provider_driveId_folderItemId: { organizationId: id, provider: "microsoft-365", driveId, folderItemId } },
    create: {
      organizationId: id, provider: "microsoft-365", siteId, driveId, folderItemId,
      siteName: typeof body?.siteName === "string" ? body.siteName.trim() : null,
      driveName: typeof body?.driveName === "string" ? body.driveName.trim() : null,
      folderPath: typeof body?.folderPath === "string" ? body.folderPath.trim() : null,
      createdBy: guard.user?.email ?? null,
    },
    update: {
      siteId,
      siteName: typeof body?.siteName === "string" ? body.siteName.trim() : null,
      driveName: typeof body?.driveName === "string" ? body.driveName.trim() : null,
      folderPath: typeof body?.folderPath === "string" ? body.folderPath.trim() : null,
      enabled: true,
      syncStatus: "PENDING",
      lastError: null,
    },
    select: { id: true, siteId: true, siteName: true, driveId: true, driveName: true, folderItemId: true, folderPath: true, enabled: true, syncStatus: true },
  });
  return NextResponse.json({ source }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await authorize(id, "client.configure");
  if (guard.error) return guard.error;
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  if (!sourceId) return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  const deleted = await prisma.integrationSource.deleteMany({ where: { id: sourceId, organizationId: id } });
  if (!deleted.count) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  return NextResponse.json({ removed: true });
}

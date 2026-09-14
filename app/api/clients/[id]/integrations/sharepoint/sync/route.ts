import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { prisma } from "@/lib/db";
import { syncIntegrationSource } from "@/lib/integrations/sharepoint-sync";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  if (!sourceId) return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  const source = await prisma.integrationSource.findFirst({ where: { id: sourceId, organizationId: id, enabled: true } });
  if (!source) return NextResponse.json({ error: "Enabled source not found" }, { status: 404 });

  // Mark running before dispatch; a later status read makes progress visible.
  await prisma.integrationSource.update({ where: { id: source.id }, data: { syncStatus: "RUNNING", lastError: null } });
  after(async () => {
    try {
      await syncIntegrationSource(prisma, source);
    } catch (error) {
      await prisma.integrationSource.update({ where: { id: source.id }, data: { syncStatus: "ERROR", lastError: error instanceof Error ? error.message : "Sync failed" } });
    }
  });
  return NextResponse.json({ accepted: true, sourceId: source.id, syncStatus: "RUNNING" }, { status: 202 });
}

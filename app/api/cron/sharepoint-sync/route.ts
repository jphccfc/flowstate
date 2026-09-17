import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncIntegrationSource } from "@/lib/integrations/sharepoint-sync";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sources = await prisma.integrationSource.findMany({ where: { enabled: true, provider: "microsoft-365" }, take: 50 });
  const results: Array<{ sourceId: string; status: string }> = [];
  for (const source of sources) {
    try {
      await syncIntegrationSource(prisma, source);
      results.push({ sourceId: source.id, status: "synced" });
    } catch (error) {
      await prisma.integrationSource.update({ where: { id: source.id }, data: { syncStatus: "ERROR", lastError: error instanceof Error ? error.message : "Scheduled sync failed" } });
      results.push({ sourceId: source.id, status: "error" });
    }
  }
  return NextResponse.json({ checked: sources.length, results });
}

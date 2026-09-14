import type { PrismaClient } from "@/app/generated/prisma/client";
import { getAccessToken } from "@/lib/integrations/connection-store";
import { getDriveDelta, type GraphDeltaItem } from "@/lib/integrations/graph";
import { importDriveItem } from "@/lib/integrations/sharepoint-import";
import { processCapturedInput } from "@/lib/ingestion/pipeline";

export const MAX_DELTA_PAGES = 20;

export type SyncResult = {
  sourceId: string;
  pages: number;
  discovered: number;
  imported: number;
  duplicates: number;
  skipped: number;
  removed: number;
  failed: number;
  nextDeltaLink: string | null;
};

/**
 * Polls one persisted source using Microsoft Graph delta.
 *
 * The cursor is committed only after the complete bounded page set succeeds.
 * New and changed files are sent through the normal text extraction + findings
 * pipeline; deleted items mark all prior findings SOURCE_REMOVED without deleting
 * the evidence history. The delta URL never leaves the server.
 */
export async function syncIntegrationSource(
  client: PrismaClient,
  source: {
    id: string;
    organizationId: string;
    driveId: string;
    folderItemId: string;
    deltaLink: string | null;
  },
  options: { maxPages?: number; fetchImpl?: typeof fetch } = {},
): Promise<SyncResult> {
  const connection = await getAccessToken(client, source.organizationId);
  if (!connection) throw new Error("SharePoint is not connected for this client");

  const maxPages = options.maxPages ?? MAX_DELTA_PAGES;
  let cursor = source.deltaLink;
  let pages = 0;
  const changed: GraphDeltaItem[] = [];
  const removed: GraphDeltaItem[] = [];
  let nextDeltaLink: string | null = null;

  while (pages < maxPages) {
    const page = await getDriveDelta(connection.accessToken, source.driveId, source.folderItemId, {
      deltaLink: cursor,
      fetchImpl: options.fetchImpl,
    });
    pages += 1;
    for (const item of page.items) (item.deleted ? removed : changed).push(item);
    if (page.nextLink) {
      cursor = page.nextLink;
      continue;
    }
    nextDeltaLink = page.deltaLink;
    break;
  }

  if (!nextDeltaLink && pages >= maxPages) {
    throw new Error(`SharePoint delta exceeded the ${maxPages}-page safety limit; cursor not advanced`);
  }

  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let failed = 0;
  for (const item of changed) {
    if (item.isFolder) continue;
    try {
      const outcome = await importDriveItem({
        organizationId: source.organizationId,
        driveId: source.driveId,
        itemId: item.id,
        accessToken: connection.accessToken,
        client,
      });
      if (outcome.status === "imported") {
        imported += 1;
        try { await processCapturedInput(outcome.capturedInputId); } catch { /* leave it retryable */ }
      } else if (outcome.status === "duplicate") duplicates += 1;
      else skipped += 1;
    } catch {
      failed += 1;
    }
  }

  let removedCount = 0;
  for (const item of removed) {
    const inputs = await client.capturedInput.findMany({
      where: { organizationId: source.organizationId, sourceDriveId: source.driveId, sourceItemId: item.id },
      select: { id: true },
    });
    if (!inputs.length) continue;
    const result = await client.documentFinding.updateMany({
      where: { capturedInputId: { in: inputs.map((input) => input.id) } },
      data: { status: "SOURCE_REMOVED" },
    });
    removedCount += result.count;
  }

  if (nextDeltaLink) {
    await client.integrationSource.update({
      where: { id: source.id },
      data: { deltaLink: nextDeltaLink, syncStatus: failed ? "PARTIAL" : "READY", lastSyncedAt: new Date(), lastError: failed ? `${failed} item(s) failed` : null },
    });
  }

  return { sourceId: source.id, pages, discovered: changed.length + removed.length, imported, duplicates, skipped, removed: removedCount, failed, nextDeltaLink };
}

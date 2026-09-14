import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { getAccessToken } from "@/lib/integrations/connection-store";
import { DRIVE_WALK_MAX_ITEMS, walkDriveFolder } from "@/lib/integrations/graph";
import { importDriveItem, isSupportedDocument, type ImportOutcome } from "@/lib/integrations/sharepoint-import";
import { processCapturedInput } from "@/lib/ingestion/pipeline";
import { prisma } from "@/lib/db";

/** Bounds so one request cannot fan out into an unbounded Graph workload. */
const MAX_ITEMS_PER_REQUEST = 50;
/** Documents imported per request when walking a folder. Kept below the ceiling
 *  above because each imported document is an extraction, not just a read. */
const MAX_IMPORT_PER_REQUEST = 5;

type ImportBody = {
  driveId?: string;
  itemIds?: string[];
  /** Recursive folder import: the folder to walk, everything beneath it. */
  itemId?: string;
  recursive?: boolean;
  /** How far into the folder's supported files to resume. Lets a large folder be
   *  imported in batches that each finish inside a request timeout. */
  offset?: number;
};

async function requireUser(id: string) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

async function requireConnection(id: string) {
  try {
    const connection = await getAccessToken(prisma, id);
    if (!connection) return { error: NextResponse.json({ error: "SharePoint is not connected for this client" }, { status: 409 }) };
    return { connection };
  } catch {
    return { error: NextResponse.json({ error: "Stored SharePoint credentials could not be read" }, { status: 500 }) };
  }
}

/**
 * Previews a recursive import without importing anything.
 *
 * Reports how many files the walk found, how many of those this importer can
 * actually read, the total size, and whether the walk hit its bound. A reviewer
 * should never commit to an import without seeing the size of it first — and the
 * supported count must be honest, not the raw file count.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireUser(id);
  if (guard.error) return guard.error;
  const linked = await requireConnection(id);
  if (linked.error) return linked.error;
  const connection = linked.connection as NonNullable<Awaited<ReturnType<typeof getAccessToken>>>;

  const driveId = request.nextUrl.searchParams.get("driveId")?.trim();
  if (!driveId) return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  const itemId = request.nextUrl.searchParams.get("itemId")?.trim() || "root";

  try {
    const walk = await walkDriveFolder(connection.accessToken, driveId, itemId);
    const supported = walk.files.filter((file) => isSupportedDocument(file.name));
    const unsupported = walk.files.filter((file) => !isSupportedDocument(file.name));
    return NextResponse.json({
      driveId,
      itemId,
      files: walk.files.length,
      supported: supported.length,
      unsupported: unsupported.length,
      totalBytes: walk.totalBytes,
      foldersScanned: walk.foldersScanned,
      truncated: walk.truncated,
      maxItems: DRIVE_WALK_MAX_ITEMS,
      sample: supported.slice(0, 10).map((file) => ({ name: file.name, path: file.path })),
      unsupportedSample: [...new Set(unsupported.map((file) => (file.name.split(".").pop() ?? "").toLowerCase()))].slice(0, 10),
      skipped: walk.skipped.slice(0, 20),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Microsoft Graph request failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}

/**
 * Imports SharePoint files into the evidence model as text.
 *
 * Two modes, both organisation-scoped so a caller cannot import from another
 * tenant's SharePoint:
 *   - `itemIds`: an explicit list, at most MAX_ITEMS_PER_REQUEST.
 *   - `itemId` + `recursive`: walk that folder and everything beneath it, then
 *     import up to MAX_IMPORT_PER_REQUEST files, reporting how many remain so
 *     the caller can continue. A folder of several hundred documents cannot be
 *     imported in one HTTP request, and pretending otherwise would time out and
 *     read as a failure.
 *
 * Items are processed independently — one failure is reported against that item
 * and does not abort the batch, and nothing is imported for an unconnected
 * client. Imported evidence always lands in `PENDING_REVIEW`; it cannot bypass
 * Review. Re-running is safe: the importer is idempotent per drive item and
 * content hash.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireUser(id);
  if (guard.error) return guard.error;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const driveId = body.driveId?.trim();
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((v) => typeof v === "string" && v.trim()) : [];
  const recursive = body.recursive === true;
  const folderItemId = body.itemId?.trim();

  if (!driveId) return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  if (!recursive && itemIds.length === 0) return NextResponse.json({ error: "itemIds is required" }, { status: 400 });
  if (!recursive && itemIds.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_ITEMS_PER_REQUEST} items per request` }, { status: 400 });
  }
  if (recursive && !folderItemId) return NextResponse.json({ error: "itemId is required for a recursive import" }, { status: 400 });

  const linked = await requireConnection(id);
  if (linked.error) return linked.error;
  const connection = linked.connection as NonNullable<Awaited<ReturnType<typeof getAccessToken>>>;

  let targets: string[] = itemIds;
  let walkSummary: Record<string, unknown> | null = null;
  const offset = Number.isFinite(body.offset) && (body.offset as number) > 0 ? Math.floor(body.offset as number) : 0;
  if (recursive) {
    try {
      const walk = await walkDriveFolder(connection.accessToken, driveId, folderItemId as string);
      const supported = walk.files.filter((file) => isSupportedDocument(file.name));
      targets = supported.slice(offset, offset + MAX_IMPORT_PER_REQUEST).map((file) => file.id);
      const nextOffset = offset + targets.length;
      walkSummary = {
        files: walk.files.length,
        supported: supported.length,
        unsupported: walk.files.length - supported.length,
        totalBytes: walk.totalBytes,
        truncated: walk.truncated,
        batchSize: MAX_IMPORT_PER_REQUEST,
        offset,
        nextOffset,
        remaining: Math.max(0, supported.length - nextOffset),
        skipped: walk.skipped.slice(0, 20),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Microsoft Graph request failed";
      return NextResponse.json({ error: detail }, { status: 502 });
    }
  }

  const results: Array<{ itemId: string; outcome: ImportOutcome | { status: "failed"; error: string } }> = [];
  for (const itemId of targets) {
    try {
      const outcome = await importDriveItem({
        organizationId: id,
        driveId,
        itemId,
        accessToken: connection.accessToken,
        client: prisma,
      });
      results.push({ itemId, outcome });
    } catch (error) {
      // Isolate per-item failures; report them without provider detail leaking tokens.
      results.push({ itemId, outcome: { status: "failed", error: error instanceof Error ? error.message : "import failed" } });
    }
  }

  const summary = {
    imported: results.filter((r) => r.outcome.status === "imported").length,
    duplicate: results.filter((r) => r.outcome.status === "duplicate").length,
    skipped: results.filter((r) => r.outcome.status === "skipped").length,
    failed: results.filter((r) => r.outcome.status === "failed").length,
  };

  /*
   * Analyse what was imported.
   *
   * Without this the import stops at stored text: no segments, no capability
   * tags, no suggestions, and therefore nothing for a human to approve or reject.
   * Scratch Pad, captured inputs and inbound email all run the pipeline already;
   * SharePoint evidence was the one intake that did not, so documents arrived
   * inert.
   *
   * Runs after the response so a slow model call cannot hold the request open,
   * and isolates failures: one document that cannot be analysed must not stop
   * the rest of the batch from being catalogued.
   */
  const analysisTargets = results
    .map((r) => (r.outcome.status === "imported" ? r.outcome.capturedInputId : null))
    .filter((value): value is string => Boolean(value));
  if (analysisTargets.length > 0) {
    after(async () => {
      for (const capturedInputId of analysisTargets) {
        try {
          await processCapturedInput(capturedInputId);
        } catch {
          // Leave the input for a later pass rather than failing the import.
        }
      }
    });
  }

  return NextResponse.json({ summary, results, walk: walkSummary, queuedForAnalysis: analysisTargets.length });
}

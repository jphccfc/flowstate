import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { getAccessToken } from "@/lib/integrations/connection-store";
import { importDriveItem, type ImportOutcome } from "@/lib/integrations/sharepoint-import";
import { prisma } from "@/lib/db";

/** Bounded so one request cannot fan out into an unbounded Graph workload. */
const MAX_ITEMS_PER_REQUEST = 50;

type ImportBody = { driveId?: string; itemIds?: string[] };

/**
 * Imports one or more SharePoint items into the evidence model as text.
 *
 * Organisation-scoped: the connection is resolved from the route's organisation
 * id, so a caller cannot import from another tenant's SharePoint. Items are
 * processed independently — one failure is reported against that item and does
 * not abort the batch, and nothing is imported for an unconnected client.
 *
 * Imported evidence always lands in `PENDING_REVIEW`; it cannot bypass Review.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const driveId = body.driveId?.trim();
  const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((v) => typeof v === "string" && v.trim()) : [];
  if (!driveId) return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  if (itemIds.length === 0) return NextResponse.json({ error: "itemIds is required" }, { status: 400 });
  if (itemIds.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_ITEMS_PER_REQUEST} items per request` }, { status: 400 });
  }

  let connection;
  try {
    connection = await getAccessToken(prisma, id);
  } catch {
    return NextResponse.json({ error: "Stored SharePoint credentials could not be read" }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ error: "SharePoint is not connected for this client" }, { status: 409 });
  }

  const results: Array<{ itemId: string; outcome: ImportOutcome | { status: "failed"; error: string } }> = [];
  for (const itemId of itemIds) {
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

  return NextResponse.json({ summary, results });
}

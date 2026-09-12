import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrganizationPermission } from "@/lib/auth/organization";
import { getAccessToken } from "@/lib/integrations/connection-store";
import { listDocumentLibraries, listDriveChildren, listSharePointSites } from "@/lib/integrations/graph";
import { prisma } from "@/lib/db";

/**
 * Lists SharePoint sites, document libraries and folder contents for a client
 * using the organisation's stored connection.
 *
 * Read-only and organisation-scoped: the connection is looked up by the route's
 * organisation id, so a caller cannot browse another tenant's SharePoint even
 * with a valid session. The access token never leaves this process.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasOrganizationPermission(user.email, id, "client.configure"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const resource = request.nextUrl.searchParams.get("resource") ?? "sites";
  try {
    if (resource === "sites") {
      const sites = await listSharePointSites(connection.accessToken, {
        search: request.nextUrl.searchParams.get("search") ?? undefined,
      });
      return NextResponse.json({ resource, sites });
    }
    if (resource === "libraries") {
      const siteId = request.nextUrl.searchParams.get("siteId");
      if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
      const libraries = await listDocumentLibraries(connection.accessToken, siteId);
      return NextResponse.json({ resource, libraries });
    }
    if (resource === "items") {
      const driveId = request.nextUrl.searchParams.get("driveId");
      if (!driveId) return NextResponse.json({ error: "driveId is required" }, { status: 400 });
      const items = await listDriveChildren(
        connection.accessToken,
        driveId,
        request.nextUrl.searchParams.get("itemId") ?? "root",
      );
      return NextResponse.json({ resource, items });
    }
    return NextResponse.json({ error: "Unsupported resource" }, { status: 400 });
  } catch (error) {
    // The Graph client already keeps tokens out of messages; keep the reply generic anyway.
    const detail = error instanceof Error ? error.message : "Microsoft Graph request failed";
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}

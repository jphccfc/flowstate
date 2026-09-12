/**
 * Read-only Microsoft Graph access for SharePoint evidence discovery.
 *
 * Deliberately narrow: this module lists sites, document libraries and folder
 * contents. It never writes to the customer's tenant, never requests write
 * scopes, and never places the access token in an error message (a thrown error
 * often ends up in logs, which is exactly where a token must not appear).
 */

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type GraphSite = { id: string; name: string; webUrl: string };
export type GraphLibrary = { id: string; name: string; webUrl: string };
export type GraphDriveItem = {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
  lastModifiedDateTime: string | null;
  webUrl: string | null;
};

type FetchImpl = typeof fetch;

async function graphGet<T>(
  accessToken: string,
  path: string,
  fetchImpl: FetchImpl = fetch,
): Promise<T> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Microsoft Graph requires an access token");
  }

  const response = await fetchImpl(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  const payload = (await response.json().catch(() => ({}))) as {
    value?: T;
    error?: { code?: string; message?: string };
  };

  if (!response.ok) {
    // Surface the provider's code for diagnosis, never the credential.
    const code = payload.error?.code ?? `HTTP ${response.status}`;
    const detail = payload.error?.message ? `: ${payload.error.message}` : "";
    throw new Error(`Microsoft Graph request failed (${code})${detail}`);
  }
  if (payload.value === undefined) {
    throw new Error("Microsoft Graph response was not a collection");
  }
  return payload.value;
}

export async function listSharePointSites(
  accessToken: string,
  options: { search?: string; fetchImpl?: FetchImpl } = {},
): Promise<GraphSite[]> {
  const params = new URLSearchParams({ $select: "id,displayName,name,webUrl" });
  if (options.search?.trim()) params.set("search", options.search.trim());
  const sites = await graphGet<Array<{ id: string; displayName?: string; name?: string; webUrl?: string }>>(
    accessToken,
    `/sites?${params.toString()}`,
    options.fetchImpl,
  );
  return sites.map((site) => ({ id: site.id, name: site.displayName || site.name || "(unnamed site)", webUrl: site.webUrl ?? "" }));
}

export async function listDocumentLibraries(
  accessToken: string,
  siteId: string,
  options: { fetchImpl?: FetchImpl } = {},
): Promise<GraphLibrary[]> {
  if (!siteId?.trim()) throw new Error("A SharePoint site id is required");
  const drives = await graphGet<Array<{ id: string; name?: string; webUrl?: string }>>(
    accessToken,
    `/sites/${encodeURIComponent(siteId)}/drives`,
    options.fetchImpl,
  );
  return drives.map((drive) => ({ id: drive.id, name: drive.name ?? "(unnamed library)", webUrl: drive.webUrl ?? "" }));
}

export async function listDriveChildren(
  accessToken: string,
  driveId: string,
  itemId: string = "root",
  options: { fetchImpl?: FetchImpl } = {},
): Promise<GraphDriveItem[]> {
  if (!driveId?.trim()) throw new Error("A document library id is required");
  const items = await graphGet<Array<{
    id: string;
    name?: string;
    folder?: unknown;
    size?: number;
    lastModifiedDateTime?: string;
    webUrl?: string;
  }>>(
    accessToken,
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?$select=id,name,folder,file,size,lastModifiedDateTime,webUrl&$top=200`,
    options.fetchImpl,
  );
  return items.map((item) => ({
    id: item.id,
    name: item.name ?? "(unnamed item)",
    isFolder: Boolean(item.folder),
    size: typeof item.size === "number" ? item.size : 0,
    lastModifiedDateTime: item.lastModifiedDateTime ?? null,
    webUrl: item.webUrl ?? null,
  }));
}

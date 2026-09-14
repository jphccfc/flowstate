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
  // Microsoft Graph returns an EMPTY collection when /sites is called without a
  // search term — verified against the live tenant: no search returned 0 sites,
  // search=* returned 11. A site picker built on no search therefore shows
  // nothing to select, which looks like a permissions failure but is not.
  params.set("search", options.search?.trim() || "*");
  const sites = await graphGet<Array<{ id: string; displayName?: string; name?: string; webUrl?: string }>>(
    accessToken,
    `/sites?${params.toString()}`,
    options.fetchImpl,
  );
  return sites.map((site) => ({ id: site.id, name: site.displayName || site.name || "(unnamed site)", webUrl: site.webUrl ?? "" }));
}

/** SharePoint system libraries that are never useful evidence sources. */
const SYSTEM_LIBRARY_NAMES = new Set(["form templates", "site assets", "site pages", "style library", "preservation hold library", "app catalog", "_catalogs"]);

/**
 * SharePoint system folders. Exported so the picker and the recursive walk share
 * one list — two copies would drift and one would start admitting Forms.
 */
export const SYSTEM_FOLDER_NAMES = new Set(["forms", "siteassets", "sitepages", "style library", "_catalogs", "_private", "preservationholdlibrary", "appcatalog", "app catalog", "contenttypes", "workflowtasks", "images"]);

export function isSelectableLibrary(name: string): boolean {
  return !SYSTEM_LIBRARY_NAMES.has(name.trim().toLowerCase());
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

export type DriveWalk = {
  files: Array<GraphDriveItem & { path: string }>;
  foldersScanned: number;
  totalBytes: number;
  truncated: boolean;
  skipped: Array<{ name: string; reason: string }>;
};

/** Bounds so one click cannot fan out into an unbounded Graph workload. */
export const DRIVE_WALK_MAX_ITEMS = 500;
export const DRIVE_WALK_MAX_DEPTH = 8;

/**
 * Walks a folder and everything beneath it, breadth-first.
 *
 * The walk is bounded twice — by item count and by depth — and always reports
 * whether it truncated. An unbounded recursive read is the cheapest way to take
 * down an integration against a client's tenant: a synced library can hold tens
 * of thousands of files, and Graph will happily paginate all of them while the
 * request times out and the connection looks broken.
 *
 * System containers are skipped with a stated reason rather than silently
 * dropped, so a surprising import can always be explained.
 */
export async function walkDriveFolder(
  accessToken: string,
  driveId: string,
  itemId: string = "root",
  options: { maxItems?: number; maxDepth?: number; fetchImpl?: FetchImpl; path?: string } = {},
): Promise<DriveWalk> {
  if (!driveId?.trim()) throw new Error("A document library id is required");
  const maxItems = options.maxItems ?? DRIVE_WALK_MAX_ITEMS;
  const maxDepth = options.maxDepth ?? DRIVE_WALK_MAX_DEPTH;

  const files: Array<GraphDriveItem & { path: string }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  const queue: Array<{ id: string; path: string; depth: number }> = [
    { id: itemId, path: options.path ?? "", depth: 0 },
  ];
  let foldersScanned = 0;
  let totalBytes = 0;
  let truncated = false;

  while (queue.length > 0) {
    if (files.length >= maxItems) {
      truncated = true;
      break;
    }
    const current = queue.shift() as { id: string; path: string; depth: number };
    foldersScanned += 1;
    const children = await listDriveChildren(accessToken, driveId, current.id, { fetchImpl: options.fetchImpl });

    for (const child of children) {
      if (child.isFolder) {
        const reason = SYSTEM_FOLDER_NAMES.has(child.name.trim().toLowerCase())
          ? "SharePoint system folder"
          : current.depth + 1 > maxDepth
            ? "depth limit reached"
            : null;
        if (reason) {
          skipped.push({ name: `${current.path}${child.name}`, reason });
          continue;
        }
        queue.push({ id: child.id, path: `${current.path}${child.name}/`, depth: current.depth + 1 });
        continue;
      }
      if (files.length >= maxItems) {
        truncated = true;
        break;
      }
      files.push({ ...child, path: `${current.path}${child.name}` });
      totalBytes += child.size ?? 0;
    }
  }

  if (queue.length > 0) truncated = true;

  return { files, foldersScanned, totalBytes, truncated, skipped };
}

export type GraphSignedInUser = {
  id: string;
  displayName: string | null;
  userPrincipalName: string | null;
  mail: string | null;
};

/**
 * Identifies which Microsoft account a connection belongs to.
 *
 * Used so a client can see *whose* Microsoft 365 the evidence is coming from,
 * rather than the Flowstate user who happened to click Connect. Requires only
 * the User.Read delegated scope.
 */
export async function getSignedInUser(
  accessToken: string,
  options: { fetchImpl?: FetchImpl } = {},
): Promise<GraphSignedInUser> {
  if (!accessToken?.trim()) throw new Error("Microsoft Graph requires an access token");
  const response = await (options.fetchImpl ?? fetch)(
    `${GRAPH_BASE}/me?$select=id,displayName,userPrincipalName,mail`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
    error?: { code?: string };
  };
  if (!response.ok || !payload.id) {
    throw new Error(`Microsoft Graph request failed (${payload.error?.code ?? `HTTP ${response.status}`})`);
  }
  return {
    id: payload.id,
    displayName: payload.displayName ?? null,
    userPrincipalName: payload.userPrincipalName ?? null,
    mail: payload.mail ?? null,
  };
}


export type GraphDeltaItem = {
  id: string;
  name: string;
  isFolder: boolean;
  size: number;
  lastModifiedDateTime: string | null;
  webUrl: string | null;
  deleted: boolean;
  hash: string | null;
  version: string | null;
};

export type GraphDeltaPage = {
  items: GraphDeltaItem[];
  nextLink: string | null;
  deltaLink: string | null;
};

/**
 * Reads one page of a drive delta query. The caller persists deltaLink only
 * after the final page, so a failed sync can safely retry from the prior cursor.
 * A delta URL is provider-issued state and must remain server-side.
 */
export async function getDriveDelta(
  accessToken: string,
  driveId: string,
  folderItemId: string = "root",
  options: { deltaLink?: string | null; fetchImpl?: FetchImpl } = {},
): Promise<GraphDeltaPage> {
  if (!driveId?.trim()) throw new Error("A document library id is required");
  const path = options.deltaLink ?? `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderItemId)}/delta`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(path, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    value?: Array<{ id: string; name?: string; size?: number; webUrl?: string; lastModifiedDateTime?: string; file?: { hashes?: { quickXorHash?: string; sha256Hash?: string } }; folder?: unknown; deleted?: unknown; }>; 
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const code = payload.error?.code ?? `HTTP ${response.status}`;
    throw new Error(`Microsoft Graph delta request failed (${code})`);
  }
  return {
    items: (payload.value ?? []).map((item) => ({
      id: item.id,
      name: item.name ?? "(unnamed item)",
      isFolder: Boolean(item.folder),
      size: item.size ?? 0,
      lastModifiedDateTime: item.lastModifiedDateTime ?? null,
      webUrl: item.webUrl ?? null,
      deleted: Boolean(item.deleted),
      hash: item.file?.hashes?.quickXorHash ?? item.file?.hashes?.sha256Hash ?? null,
      version: item.lastModifiedDateTime ?? null,
    })),
    nextLink: payload["@odata.nextLink"] ?? null,
    deltaLink: payload["@odata.deltaLink"] ?? null,
  };
}

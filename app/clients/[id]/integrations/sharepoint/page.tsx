"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Selection = { site: string; library: string; folder: string };
type ConnectionState = "NotConfigured" | "Ready" | "ConnectionFailed";
type ImportPreview = {
  files: number;
  supported: number;
  unsupported: number;
  totalBytes: number;
  truncated: boolean;
  maxItems: number;
  sample: Array<{ name: string; path: string }>;
  unsupportedSample: string[];
};
type ImportSummary = { imported: number; duplicate: number; skipped: number; failed: number };
type Readiness = { connectionState: ConnectionState; syncEnabled: false; missingConfiguration?: string[] };
type Connection = {
  provider: string;
  connectionState: "Connected" | "NotConnected";
  accountEmail: string | null;
  externalTenantId: string | null;
  scope: string | null;
  expiresAt: string | null;
  lastSyncedAt: string | null;
};
type Site = { id: string; name: string; webUrl: string };
type Library = { id: string; name: string; webUrl: string };
type DriveItem = { id: string; name: string; isFolder: boolean };
type PathSegment = { id: string; name: string };

const fieldLabels = { site: "Site", library: "Library", folder: "Folder" } as const;

/** SharePoint system folders that are platform assets, not client evidence. */
const SYSTEM_FOLDERS = new Set(["forms", "siteassets", "sitepages", "style library", "_catalogs", "_private", "preservationholdlibrary"]);

const isSelectableFolder = (item: DriveItem) => item.isFolder && !SYSTEM_FOLDERS.has(item.name.trim().toLowerCase());

/** Turns a callback error code into something a client can act on. */
const callbackMessages: Record<string, string> = {
  connected: "Microsoft 365 connected. Choose a site, library and folder below.",
  consent_denied: "Microsoft consent was declined, so no connection was made.",
  state_invalid: "The sign-in attempt expired. Please try connecting again.",
  state_mismatch: "The sign-in attempt did not match the one that was started. Please try again.",
  organization_mismatch: "That sign-in was started for a different client.",
  code_missing: "Microsoft did not return an authorization code.",
  exchange_failed: "Microsoft rejected the sign-in. Check the client secret and the granted permissions, then try again.",
  persist_failed: "The connection could not be saved. Nothing was granted access.",
  not_configured: "Microsoft 365 is not configured for this environment.",
};

function describeCallback(value: string): string {
  if (callbackMessages[value]) return callbackMessages[value];
  if (value.startsWith("invalid_configuration:")) {
    return `Configuration problem with ${value.split(":")[1]}. Ask an administrator to check that setting, then redeploy.`;
  }
  return `The connection attempt did not complete (${value}).`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export default function SharePointIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [selection, setSelection] = useState<Selection>({ site: "", library: "", folder: "" });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("NotConfigured");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [folders, setFolders] = useState<DriveItem[]>([]);
  const [path, setPath] = useState<PathSegment[]>([{ id: "root", name: "Root" }]);

  const api = `/api/clients/${organizationId}/integrations/sharepoint`;

  const loadCurrent = useCallback(async () => {
    const response = await fetch(api);
    if (response.ok) {
      const data = await response.json();
      setSelection(data.sourceSelection);
      setReadiness(data);
      setConnection(data.connection ?? null);
      setConnectionState(data.connectionState);
    }
  }, [api]);

  useEffect(() => { loadCurrent().catch(() => setError("Integration status could not be loaded.")); }, [loadCurrent]);

  // The callback returns with ?sharepoint=<result>. Show it once, then clear the
  // query string so a refresh does not repeat a stale message.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("sharepoint");
    if (!result) return;
    setNotice(describeCallback(result));
    if (!callbackMessages[result]) setError(describeCallback(result));
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const isConnected = connection?.connectionState === "Connected";

  async function browse(params: string, label: string) {
    setBusy(label);
    setBrowseError(null);
    try {
      const response = await fetch(`${api}/browse?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "SharePoint could not be read.");
      return data;
    } catch (cause) {
      setBrowseError(cause instanceof Error ? cause.message : "SharePoint could not be read.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  // Sites are only loadable once a connection exists: Graph needs a token.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    (async () => {
      const data = await browse("resource=sites", "sites");
      if (!cancelled && data?.sites) {
        setSites(data.sites);
        if (data.sites.length === 0) setBrowseError("No SharePoint sites were returned for this account. Check that the signed-in user can access at least one site.");
      }
    })();
    return () => { cancelled = true; };
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseSite(siteId: string) {
    const site = sites.find((s) => s.id === siteId);
    setLibraries([]); setFolders([]); setPath([{ id: "root", name: "Root" }]);
    setSelection((prev) => ({ ...prev, site: site?.name ?? "", library: "", folder: "" }));
    if (!siteId) return;
    const data = await browse(`resource=libraries&siteId=${encodeURIComponent(siteId)}`, "libraries");
    if (data?.libraries) setLibraries(data.libraries);
  }

  async function chooseLibrary(driveId: string) {
    const library = libraries.find((l) => l.id === driveId);
    setFolders([]); setPath([{ id: "root", name: "Root" }]);
    setSelection((prev) => ({ ...prev, library: library?.name ?? "", folder: "" }));
    if (!driveId) return;
    await openFolder(driveId, "root", [{ id: "root", name: "Root" }]);
  }

  async function openFolder(driveId: string, itemId: string, nextPath: PathSegment[]) {
    const data = await browse(`resource=items&driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(itemId)}`, "items");
    if (!data?.items) return;
    setFolders(data.items.filter(isSelectableFolder));
    setPath(nextPath);
    setSelection((prev) => ({ ...prev, folder: nextPath.map((segment) => segment.name).join(" / ") }));
  }

  /**
   * Starts the Microsoft authorization-code flow. This must be a full-page
   * navigation: the route answers with a redirect to Microsoft, and a fetch
   * would never carry the browser to the consent screen.
   */
  function connectMicrosoft365() {
    setError(null);
    setNotice(null);
    window.location.assign(`${api}/authorize`);
  }

  async function disconnectMicrosoft365() {
    setError(null);
    setNotice(null);
    const response = await fetch(api, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "The connection could not be removed."); return; }
    setConnection(null); setSites([]); setLibraries([]); setFolders([]);
    setPath([{ id: "root", name: "Root" }]);
    setSelection({ site: "", library: "", folder: "" });
    setNotice("Microsoft 365 disconnected. Tokens have been removed.");
  }

  async function previewImport(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedLibrary) { setError("Choose a site and a document library first."); return; }
    setError(null); setPreview(null); setImportResult(null); setBusy("preview");
    try {
      const response = await fetch(`${api}/import?driveId=${encodeURIComponent(selectedLibrary.id)}&itemId=${encodeURIComponent(currentPath.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Preview could not be created.");
      setPreview(data as ImportPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview could not be created.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Imports the selected folder and everything beneath it.
   *
   * Batched: the server imports a bounded number per request and reports how far
   * it got, so a folder of several hundred documents completes without any single
   * request running long enough to time out. Re-running is safe — the importer is
   * idempotent per drive item and content hash, so an interrupted import resumes
   * without duplicating evidence.
   */
  async function runImport() {
    if (!selectedLibrary) { setError("Choose a site and a document library first."); return; }
    setError(null); setImportResult(null); setImporting(true);
    const total: ImportSummary = { imported: 0, duplicate: 0, skipped: 0, failed: 0 };
    try {
      let offset = 0;
      for (let round = 0; round < 60; round += 1) {
        const response = await fetch(`${api}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveId: selectedLibrary.id, itemId: currentPath.id, recursive: true, offset }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "The import failed.");
        total.imported += data.summary.imported;
        total.duplicate += data.summary.duplicate;
        total.skipped += data.summary.skipped;
        total.failed += data.summary.failed;
        setImportResult({ ...total });
        const next = data.walk?.nextOffset ?? offset;
        const remaining = data.walk?.remaining ?? 0;
        if (remaining <= 0 || next <= offset) break;
        offset = next;
      }
      setNotice("Import complete. New evidence is waiting in the Review queue.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import failed.");
    } finally {
      setImporting(false);
    }
  }

  const selectedSite = sites.find((s) => s.name === selection.site);
  const selectedLibrary = libraries.find((l) => l.name === selection.library);
  const currentPath = path[path.length - 1];

  const statusLabel = isConnected
    ? `Connected${connection?.accountEmail ? ` as ${connection.accountEmail}` : ""}`
    : connectionState === "Ready" ? "Ready to connect" : connectionState === "ConnectionFailed" ? "Connection setup failed" : "Microsoft 365 settings are not configured";
  const statusMessage = isConnected
    ? "Evidence imported from Microsoft 365 is stored as text with its source reference. Source documents stay in SharePoint."
    : connectionState === "Ready" ? "Required Microsoft Entra settings are present. Connecting opens Microsoft to grant read-only access." : connectionState === "ConnectionFailed" ? "Connection setup failed. No Microsoft 365 connection was established." : "Microsoft 365 connection setup is not available. No Microsoft Graph or SharePoint connection is configured.";

  return <main className="mx-auto w-full max-w-3xl p-4 sm:p-6"><Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">&larr; Back to client</Link><div className="mb-6 mt-4"><div className="workspace-eyebrow mb-2">Integrations</div><h1 className="workspace-heading text-3xl font-bold">SharePoint</h1><p className="mt-2 text-sm text-[var(--muted)]">Choose an import source for reviewed, traceable evidence.</p></div><section className="workspace-card mb-6 p-4" aria-labelledby="connection-status"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="connection-status" className="font-semibold">Microsoft 365 connection</h2><p className="mt-1 text-sm text-[var(--muted)]">{statusLabel}</p></div><div className="flex flex-wrap gap-2">{isConnected ? <button type="button" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]" onClick={disconnectMicrosoft365}>Disconnect</button> : <button type="button" className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white" onClick={connectMicrosoft365}>Connect Microsoft 365</button>}</div></div><p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p>{readiness?.missingConfiguration?.length ? <p className="mt-2 text-xs text-[var(--muted)]">Missing configuration: {readiness.missingConfiguration.join(", ")}</p> : null}{isConnected && connection?.externalTenantId ? <p className="mt-2 text-xs text-[var(--muted)]">Microsoft tenant: {connection.externalTenantId}</p> : null}{isConnected && connection?.scope ? <p className="mt-1 text-xs text-[var(--muted)]">Granted scopes: {connection.scope}</p> : null}{notice && <p role="status" className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-2 text-sm text-[var(--foreground)]">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<p className="mt-3 text-xs text-[var(--muted)]">Source documents are never copied into Flowstate. Only extracted text, its source reference and a content hash are stored.</p></section><form onSubmit={previewImport} className="workspace-card p-4" aria-labelledby="source-selection"><h2 id="source-selection" className="font-semibold">SharePoint source selection</h2><p className="mt-1 text-sm text-[var(--muted)]">{isConnected ? "Choose the site, document library and folder to import from." : "Record the intended site, library, and folder before a provider is connected."}</p>

    {isConnected ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium">{fieldLabels.site}
        <select aria-label="SharePoint site" value={selectedSite?.id ?? ""} onChange={(event) => chooseSite(event.target.value)} disabled={!sites.length} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)] disabled:opacity-60">
          <option value="">{busy === "sites" ? "Loading sites…" : sites.length ? "Select a site" : "No sites available"}</option>
          {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">{fieldLabels.library}
        <select aria-label="Document library" value={selectedLibrary?.id ?? ""} onChange={(event) => chooseLibrary(event.target.value)} disabled={!libraries.length} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)] disabled:opacity-60">
          <option value="">{busy === "libraries" ? "Loading libraries…" : libraries.length ? "Select a library" : "Choose a site first"}</option>
          {libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}
        </select>
      </label>
    </div> : <div className="mt-4 grid gap-4 sm:grid-cols-3"> {(["site", "library", "folder"] as const).map((field) => <label key={field} className="text-sm font-medium capitalize">{fieldLabels[field]}<input value={selection[field]} onChange={(event) => setSelection({ ...selection, [field]: event.target.value })} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)]" placeholder={`SharePoint ${field}`} /></label>)}</div>}

    {isConnected ? <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{fieldLabels.folder}</span>
        <span className="text-xs text-[var(--muted)]">{selection.library ? path.map((segment) => segment.name).join(" / ") : "Choose a library first"}</span>
      </div>
      {selectedLibrary ? <div className="mt-2 rounded border border-[var(--card-border)] p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={path.length < 2} onClick={() => openFolder(selectedLibrary.id, path[path.length - 2].id, path.slice(0, -1))} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs font-medium disabled:opacity-40">↑ Up</button>
          <button type="button" onClick={() => openFolder(selectedLibrary.id, "root", [{ id: "root", name: "Root" }])} className="rounded border border-[var(--card-border)] px-2 py-1 text-xs font-medium">Whole library</button>
          {currentPath.id === "root" ? <span className="text-xs text-[var(--muted)]">Root selected — importing will include the whole library.</span> : null}
        </div>
        {busy === "items" ? <p className="mt-2 text-xs text-[var(--muted)]">Loading folders…</p> : folders.length ? <ul className="mt-2 divide-y divide-[var(--card-border)]">{folders.map((folder) => <li key={folder.id} className="flex items-center justify-between gap-2 py-1"><button type="button" className="text-left text-sm text-[var(--foreground)] underline decoration-dotted" onClick={() => openFolder(selectedLibrary.id, folder.id, [...path, { id: folder.id, name: folder.name }])}>{folder.name}</button><span className="text-xs text-[var(--muted)]">open</span></li>)}</ul> : <p className="mt-2 text-xs text-[var(--muted)]">No subfolders here. This folder can be imported directly.</p>}
      </div> : null}
    </div> : null}

    {browseError && <p role="alert" className="mt-3 text-sm text-red-700">{browseError}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><button type="submit" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]">{busy === "preview" ? "Counting…" : "Preview import"}</button><button type="button" onClick={runImport} disabled={!isConnected || !selectedLibrary || importing} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{importing ? "Importing…" : "Import folder"}</button></div>

    {preview && <div role="status" className="mt-4 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm">
      <strong>{preview.supported.toLocaleString()} document{preview.supported === 1 ? "" : "s"} to import</strong>
      <p className="mt-1 text-[var(--muted)]">{formatBytes(preview.totalBytes)} across {preview.files.toLocaleString()} file{preview.files === 1 ? "" : "s"} in this folder and everything beneath it.{preview.unsupported > 0 ? ` ${preview.unsupported.toLocaleString()} file${preview.unsupported === 1 ? "" : "s"} will be skipped (${preview.unsupportedSample.join(", ") || "unsupported type"}).` : ""}</p>
      {preview.truncated ? <p className="mt-1 text-[var(--muted)]">This folder is larger than the {preview.maxItems.toLocaleString()}-file scan limit, so the count above is a minimum.</p> : null}
      {preview.sample.length ? <ul className="mt-2 space-y-0.5 text-[var(--muted)]">{preview.sample.map((file) => <li key={file.path}>· {file.path}</li>)}</ul> : null}
    </div>}

    {importResult && <div role="status" className="mt-4 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm">
      <strong>{importing ? "Importing…" : "Import finished"}</strong>
      <p className="mt-1 text-[var(--muted)]">{importResult.imported} imported · {importResult.duplicate} already present · {importResult.skipped} skipped · {importResult.failed} failed</p>
      {importResult.imported > 0 ? <p className="mt-1">Imported evidence is waiting in the <Link href={`/clients/${organizationId}/review`} className="underline decoration-dotted">Review queue</Link>.</p> : null}
    </div>}</form></main>;
}

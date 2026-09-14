"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Selection = { site: string; library: string; folder: string };
type ConnectionState = "NotConfigured" | "Ready" | "ConnectionFailed";
type Preview = { connectionState: string; message: string; itemCount: number };
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

const fieldLabels = { site: "Site", library: "Library", folder: "Folder" } as const;

/** Turns a callback error code into something a client can act on. */
const callbackMessages: Record<string, string> = {
  connected: "Microsoft 365 connected. You can now browse sites and import evidence.",
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

export default function SharePointIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [selection, setSelection] = useState<Selection>({ site: "", library: "", folder: "" });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("NotConfigured");

  useEffect(() => {
    fetch(`/api/clients/${organizationId}/integrations/sharepoint`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("status")))
      .then((data) => { setSelection(data.sourceSelection); setReadiness(data); setConnection(data.connection ?? null); setConnectionState(data.connectionState); })
      .catch(() => setError("Integration status could not be loaded."));
  }, [organizationId]);

  // The callback returns with ?sharepoint=<result>. Show it once, then clear the
  // query string so a refresh does not repeat a stale message.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("sharepoint");
    if (!result) return;
    setNotice(describeCallback(result));
    if (!callbackMessages[result]) setError(describeCallback(result));
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  /**
   * Starts the Microsoft authorization-code flow. This must be a full-page
   * navigation: the route answers with a redirect to Microsoft, and a fetch
   * would never carry the browser to the consent screen.
   */
  function connectMicrosoft365() {
    setError(null);
    setNotice(null);
    window.location.assign(`/api/clients/${organizationId}/integrations/sharepoint/authorize`);
  }

  async function disconnectMicrosoft365() {
    setError(null);
    setNotice(null);
    const response = await fetch(`/api/clients/${organizationId}/integrations/sharepoint`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.error ?? "The connection could not be removed."); return; }
    setConnection(null);
    setNotice("Microsoft 365 disconnected. Tokens have been removed.");
  }

  async function previewImport(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const response = await fetch(`/api/clients/${organizationId}/integrations/sharepoint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSelection: selection }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Preview could not be created."); return; }
    setPreview(data);
  }

  const isConnected = connection?.connectionState === "Connected";
  const statusLabel = isConnected
    ? `Connected${connection?.accountEmail ? ` as ${connection.accountEmail}` : ""}`
    : connectionState === "Ready" ? "Ready to connect" : connectionState === "ConnectionFailed" ? "Connection setup failed" : "Microsoft 365 settings are not configured";
  const statusMessage = isConnected
    ? "Evidence imported from Microsoft 365 is stored as text with its source reference. Source documents stay in SharePoint."
    : connectionState === "Ready" ? "Required Microsoft Entra settings are present. Connecting opens Microsoft to grant read-only access." : connectionState === "ConnectionFailed" ? "Connection setup failed. No Microsoft 365 connection was established." : "Microsoft 365 connection setup is not available. No Microsoft Graph or SharePoint connection is configured.";

  return <main className="mx-auto w-full max-w-3xl p-4 sm:p-6"><Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">&larr; Back to client</Link><div className="mb-6 mt-4"><div className="workspace-eyebrow mb-2">Integrations</div><h1 className="workspace-heading text-3xl font-bold">SharePoint</h1><p className="mt-2 text-sm text-[var(--muted)]">Choose an import source for reviewed, traceable evidence.</p></div><section className="workspace-card mb-6 p-4" aria-labelledby="connection-status"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="connection-status" className="font-semibold">Microsoft 365 connection</h2><p className="mt-1 text-sm text-[var(--muted)]">{statusLabel}</p></div><div className="flex flex-wrap gap-2">{isConnected ? <button type="button" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]" onClick={disconnectMicrosoft365}>Disconnect</button> : <button type="button" className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white" onClick={connectMicrosoft365}>Connect Microsoft 365</button>}</div></div><p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p>{readiness?.missingConfiguration?.length ? <p className="mt-2 text-xs text-[var(--muted)]">Missing configuration: {readiness.missingConfiguration.join(", ")}</p> : null}{isConnected && connection?.externalTenantId ? <p className="mt-2 text-xs text-[var(--muted)]">Microsoft tenant: {connection.externalTenantId}</p> : null}{isConnected && connection?.scope ? <p className="mt-1 text-xs text-[var(--muted)]">Granted scopes: {connection.scope}</p> : null}{notice && <p role="status" className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-2 text-sm text-[var(--foreground)]">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<p className="mt-3 text-xs text-[var(--muted)]">Source documents are never copied into Flowstate. Only extracted text, its source reference and a content hash are stored.</p></section><form onSubmit={previewImport} className="workspace-card p-4" aria-labelledby="source-selection"><h2 id="source-selection" className="font-semibold">SharePoint source selection</h2><p className="mt-1 text-sm text-[var(--muted)]">{isConnected ? "Record the intended site, library, and folder before import." : "Record the intended site, library, and folder before a provider is connected."}</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{(["site", "library", "folder"] as const).map((field) => <label key={field} className="text-sm font-medium capitalize">{fieldLabels[field]}<input value={selection[field]} onChange={(event) => setSelection({ ...selection, [field]: event.target.value })} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)]" placeholder={`SharePoint ${field}`} /></label>)}</div><div className="mt-4 flex flex-wrap gap-3"><button type="submit" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]">Preview import</button><button type="button" disabled={!isConnected} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Sync now</button></div>{preview && <div role="status" className="mt-4 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm"><strong>{preview.connectionState === "NotConnected" ? "Not connected" : "Preview"}</strong><p className="mt-1 text-[var(--muted)]">{preview.message} Items available: {preview.itemCount}.</p></div>}</form></main>;
}

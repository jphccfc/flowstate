"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Selection = { site: string; library: string; folder: string };
type ConnectionState = "NotConfigured" | "Ready" | "ConnectionFailed";
type Preview = { connectionState: string; message: string; itemCount: number };
type Readiness = { connectionState: ConnectionState; syncEnabled: false; missingConfiguration?: string[] };

const fieldLabels = { site: "Site", library: "Library", folder: "Folder" } as const;

export default function SharePointIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [selection, setSelection] = useState<Selection>({ site: "", library: "", folder: "" });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("NotConfigured");

  useEffect(() => {
    fetch(`/api/clients/${organizationId}/integrations/sharepoint`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("status")))
      .then((data) => { setSelection(data.sourceSelection); setReadiness(data); setConnectionState(data.connectionState); })
      .catch(() => setError("Integration status could not be loaded."));
  }, [organizationId]);

  async function connectMicrosoft365() {
    setError(null);
    try {
      const response = await fetch(`/api/clients/${organizationId}/integrations/sharepoint/connect`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Connection setup failed.");
      setReadiness(data);
      setConnectionState(data.connectionState);
    } catch (cause) {
      setConnectionState("ConnectionFailed");
      setError(cause instanceof Error ? cause.message : "Connection setup failed.");
    }
  }

  async function previewImport(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const response = await fetch(`/api/clients/${organizationId}/integrations/sharepoint`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceSelection: selection }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Preview could not be created."); return; }
    setPreview(data);
  }

  const statusLabel = connectionState === "Ready" ? "Ready to connect" : connectionState === "ConnectionFailed" ? "Connection setup failed" : "Microsoft 365 settings are not configured";
  const statusMessage = connectionState === "Ready" ? "Required Microsoft Entra settings are present. OAuth initiation remains disabled until its state and callback flow are reviewed." : connectionState === "ConnectionFailed" ? "Connection setup failed. No Microsoft 365 connection was established." : "Microsoft 365 connection setup is not available in this foundation. No Microsoft Graph or SharePoint connection is configured.";

  return <main className="mx-auto w-full max-w-3xl p-4 sm:p-6"><Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">&larr; Back to client</Link><div className="mb-6 mt-4"><div className="workspace-eyebrow mb-2">Integrations</div><h1 className="workspace-heading text-3xl font-bold">SharePoint</h1><p className="mt-2 text-sm text-[var(--muted)]">Choose an import source for reviewed, traceable evidence. This readiness boundary does not connect to Microsoft Graph.</p></div><section className="workspace-card mb-6 p-4" aria-labelledby="connection-status"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="connection-status" className="font-semibold">Microsoft 365 connection</h2><p className="mt-1 text-sm text-[var(--muted)]">{statusLabel}</p></div><button type="button" className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white" onClick={connectMicrosoft365}>Connect Microsoft 365</button></div><p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--muted)]">{statusMessage}</p><span className="sr-only">Microsoft 365 connection setup is not available in this foundation. No Microsoft Graph or SharePoint connection is configured.</span>{readiness?.missingConfiguration?.length ? <p className="mt-2 text-xs text-[var(--muted)]">Missing configuration: {readiness.missingConfiguration.join(", ")}</p> : null}<p className="mt-3 text-xs text-[var(--muted)]">No tokens are returned or stored. Sync remains disabled until a verified connection exists.</p></section><form onSubmit={previewImport} className="workspace-card p-4" aria-labelledby="source-selection"><h2 id="source-selection" className="font-semibold">SharePoint source selection</h2><p className="mt-1 text-sm text-[var(--muted)]">Record the intended site, library, and folder before a provider is connected.</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{(["site", "library", "folder"] as const).map((field) => <label key={field} className="text-sm font-medium capitalize">{fieldLabels[field]}<input value={selection[field]} onChange={(event) => setSelection({ ...selection, [field]: event.target.value })} className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--foreground)]" placeholder={`SharePoint ${field}`} /></label>)}</div><div className="mt-4 flex flex-wrap gap-3"><button type="submit" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]">Preview import</button><button type="button" disabled={true} className="flowstate-accent-button rounded px-3 py-2 text-sm font-medium text-white opacity-50">Sync now</button></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{preview && <div role="status" className="mt-4 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm"><strong>{preview.connectionState === "NotConnected" ? "Not connected" : "Preview"}</strong><p className="mt-1 text-[var(--muted)]">{preview.message} Items available: {preview.itemCount}.</p></div>}</form></main>;
}

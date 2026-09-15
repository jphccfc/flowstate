"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Finding = {
  id: string;
  documentType: string | null;
  title: string;
  summary: string;
  capabilityName: string | null;
  domainName: string | null;
  evidenceDemonstrated: string | null;
  strength: "NONE" | "WEAK" | "MODERATE" | "STRONG";
  confidence: number;
  citedExcerpts: string[];
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "STALE" | "SOURCE_REMOVED";
  reviewedBy: string | null;
  filename: string | null;
  sourceRef: string | null;
};

const strengthTone: Record<Finding["strength"], string> = {
  STRONG: "text-emerald-700",
  MODERATE: "text-amber-700",
  WEAK: "text-[var(--muted)]",
  NONE: "text-[var(--muted)]",
};

const tabs = ["PENDING_REVIEW", "APPROVED", "REJECTED", "STALE", "SOURCE_REMOVED"] as const;
const tabLabels: Record<(typeof tabs)[number], string> = {
  PENDING_REVIEW: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  STALE: "Stale",
  SOURCE_REMOVED: "Source removed",
};

export default function DocumentFindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [tab, setTab] = useState<(typeof tabs)[number]>("PENDING_REVIEW");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const api = `/api/clients/${organizationId}/findings`;

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`${api}?status=${tab}${appliedQuery ? `&q=${encodeURIComponent(appliedQuery)}` : ""}`);
    if (!response.ok) { setError("Findings could not be loaded."); return; }
    const data = await response.json();
    setFindings(data.findings ?? []);
    setCounts(data.counts ?? {});
  }, [api, tab, appliedQuery]);

  // This effect synchronizes the remote findings query into local UI state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load().catch(() => setError("Findings could not be loaded.")); }, [load]);

  async function reanalyze(findingId: string) {
    setBusy(findingId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${api}/reanalyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The finding could not be queued for re-analysis.");
      setNotice("Re-analysis queued. The old finding is preserved as stale; refresh shortly for the new result.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The finding could not be re-analysed.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(findingId: string, action: "approve" | "reject") {
    setBusy(findingId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(api, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The decision could not be saved.");
      setNotice(action === "approve" ? "Finding approved." : "Finding rejected.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The decision could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  return <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
    <Link href={`/clients/${organizationId}/integrations/sharepoint`} className="text-sm text-[var(--muted)]">&larr; Back to SharePoint import</Link>
    <div className="mb-6 mt-4">
      <div className="workspace-eyebrow mb-2">Evidence</div>
      <h1 className="workspace-heading text-3xl font-bold">Document findings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">What each document is, and what it proves. Nothing here feeds the assessment until a person approves it.</p>
    </div>

    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded border px-3 py-1.5 text-sm font-medium ${tab === value ? "border-[var(--card-border)] bg-[var(--muted-bg)] text-[var(--foreground)]" : "border-transparent text-[var(--muted)]"}`}>{tabLabels[value]}{counts[value] ? ` (${counts[value]})` : ""}</button>)}
    </div>
    <form className="mb-5 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }}>
      <label className="sr-only" htmlFor="finding-search">Search document findings</label>
      <input id="finding-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents, summaries or capabilities" className="min-w-0 flex-1 rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]" />
      <button type="submit" className="rounded border border-[var(--card-border)] px-3 py-2 text-sm font-medium text-[var(--foreground)]">Search</button>
      {appliedQuery ? <button type="button" onClick={() => { setQuery(""); setAppliedQuery(""); }} className="rounded px-3 py-2 text-sm text-[var(--muted)]">Clear</button> : null}
    </form>

    {notice && <p role="status" className="mb-3 text-sm text-[var(--muted)]">{notice}</p>}
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}

    {findings.length === 0 ? <p className="workspace-card p-4 text-sm text-[var(--muted)]">
      {tab === "PENDING_REVIEW" ? "No findings are waiting. Import a SharePoint folder to generate them." : "Nothing in this state."}
    </p> : <ul className="space-y-4">
      {findings.map((finding) => <li key={finding.id} className="workspace-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{finding.title}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {finding.documentType ? `${finding.documentType} · ` : ""}{finding.filename ?? "document"}
            </p>
          </div>
          <span className={`text-xs font-medium ${strengthTone[finding.strength]}`}>
            {finding.strength !== "NONE" ? finding.strength : "no capability"}{finding.confidence ? ` · ${Math.round(finding.confidence * 100)}%` : ""}
          </span>
        </div>

        <p className="mt-3 text-sm text-[var(--foreground)]">{finding.summary}</p>

        {finding.domainName ? <p className="mt-3 text-sm">
          <span className="text-[var(--muted)]">Domain: </span><strong>{finding.domainName}</strong>
        </p> : null}
        {finding.capabilityName ? <p className="mt-1 text-sm">
          <span className="text-[var(--muted)]">Capability: </span><strong>{finding.capabilityName}</strong>
        </p> : <p className="mt-1 text-sm text-[var(--muted)]">No capability evidenced.</p>}

        {finding.evidenceDemonstrated ? <p className="mt-1 text-sm"><span className="text-[var(--muted)]">Evidence demonstrated: </span>{finding.evidenceDemonstrated}</p> : null}

        {finding.citedExcerpts.length > 0 ? <div className="mt-3 rounded border border-[var(--card-border)] bg-[var(--muted-bg)] p-3">
          <p className="text-xs font-medium text-[var(--muted)]">Cited from the document ({finding.citedExcerpts.length})</p>
          <ul className="mt-2 space-y-2">
            {finding.citedExcerpts.map((excerpt) => <li key={excerpt} className="border-l-2 border-[var(--card-border)] pl-3 text-sm italic text-[var(--foreground)]">{excerpt}</li>)}
          </ul>
        </div> : null}

        {finding.status === "PENDING_REVIEW" ? <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy === finding.id} onClick={() => reanalyze(finding.id)} className="rounded border border-[var(--card-border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] disabled:opacity-50">Re-analyse</button>
          <button type="button" disabled={busy === finding.id} onClick={() => decide(finding.id, "approve")} className="flowstate-accent-button rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Approve</button>
          <button type="button" disabled={busy === finding.id} onClick={() => decide(finding.id, "reject")} className="rounded border border-[var(--card-border)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)] disabled:opacity-50">Reject</button>
        </div> : <p className="mt-3 text-xs text-[var(--muted)]">
          {finding.status === "STALE" ? "The source document changed after this was analysed — re-import to refresh." : finding.status === "SOURCE_REMOVED" ? "The source document was removed from SharePoint. Historical evidence is retained, but it is not current." : `${finding.status === "APPROVED" ? "Approved" : "Rejected"}${finding.reviewedBy ? ` by ${finding.reviewedBy}` : ""}.`}
        </p>}
      </li>)}
    </ul>}
  </main>;
}

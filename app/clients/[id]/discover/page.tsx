"use client";

import Link from "next/link";
import { FormEvent, use, useState } from "react";

type DiscoveryResult = {
  id: string;
  tag: { normalizedName: string; displayName: string; aliases: string[] };
  source: { id: string; type: string; subject: string | null; sourceRef: string | null; sourcePath: string | null; capturedAt: string };
  excerpt: string | null;
  rationale: string | null;
  attachment: { source: string; status: string; confidence: number | null; reviewedAt: string | null };
};

const sourceTypes = [
  ["", "All source types"],
  ["DOCUMENT", "Documents"],
  ["TEXT_NOTE", "Meeting and text notes"],
  ["EMAIL", "Email"],
  ["AUDIO", "Audio and transcripts"],
] as const;

export default function HashtagDiscoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [query, setQuery] = useState("#");
  const [sourceType, setSourceType] = useState("");
  const [results, setResults] = useState<DiscoveryResult[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${organizationId}/hashtags/discovery?q=${encodeURIComponent(query)}${sourceType ? `&sourceType=${encodeURIComponent(sourceType)}` : ""}`);
      const body = await response.json().catch(() => ({})) as { error?: string; query?: string; results?: DiscoveryResult[] };
      if (!response.ok) throw new Error(body.error ?? "Unable to search discovery hashtags.");
      setResults(body.results ?? []);
      setSearchedFor(body.query ?? query.replace(/^#/, ""));
    } catch (cause) {
      setResults(null);
      setError(cause instanceof Error ? cause.message : "Unable to search discovery hashtags.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">← Back to client</Link>
      <header className="mt-4 mb-6">
        <div className="workspace-eyebrow">Cross-source evidence</div>
        <h1 className="text-2xl font-bold">Hashtag discovery</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Find related approved evidence across documents, notes, email and transcripts. Discovery hashtags do not change assessment evidence or scores.</p>
      </header>

      <form onSubmit={search} className="mb-6 grid gap-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4 sm:grid-cols-[1fr_14rem_auto]">
        <label className="text-sm font-medium" htmlFor="hashtag-query">Hashtag<input id="hashtag-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="#project-falcon" className="mt-1 block w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm" /></label>
        <label className="text-sm font-medium" htmlFor="source-type">Source type<select id="source-type" value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="mt-1 block w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm">{sourceTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" disabled={loading} className="self-end rounded px-4 py-2 text-sm font-medium text-white flowstate-accent-button disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
      </form>

      {error && <p role="alert" className="mb-4 rounded border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</p>}
      {results !== null && <section aria-live="polite"><h2 className="mb-3 text-lg font-semibold">{results.length} result{results.length === 1 ? "" : "s"} for #{searchedFor}</h2>{results.length === 0 ? <p className="text-sm text-[var(--muted)]">No approved evidence is currently linked to this hashtag.</p> : <div className="space-y-3">{results.map((result) => <article key={result.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full border border-[var(--card-border)] px-2 py-1 text-xs">{result.source.type.replaceAll("_", " ")}</span><h3 className="mt-2 font-semibold">{result.source.subject ?? result.source.sourceRef ?? "Untitled evidence"}</h3><p className="mt-1 text-xs text-[var(--muted)]">#{result.tag.normalizedName} · linked {result.attachment.source.replaceAll("_", " ").toLowerCase()} · captured {new Date(result.source.capturedAt).toLocaleString()}</p></div><Link href={`/clients/${organizationId}/documents/${result.source.id}`} className="rounded border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium">View source</Link></div>{result.excerpt && <blockquote className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-sm">{result.excerpt}</blockquote>}{result.rationale && <p className="mt-3 text-xs text-[var(--muted)]">Why linked: {result.rationale}</p>}{result.source.sourcePath && <p className="mt-2 truncate text-xs text-[var(--muted)]" title={result.source.sourcePath}>{result.source.sourcePath}</p>}</article>)}</div>}</section>}
    </main>
  );
}

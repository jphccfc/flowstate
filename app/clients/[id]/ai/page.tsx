"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { renderAnswerWithCitations } from "@/lib/ai/citations";

type Source = { id: string; kind: string; title: string; date: string; excerpt: string; href?: string };
type Result = { answer: string; sources: Source[]; limitation?: string; error?: string };

export default function AIHubPage({ params }: { params: Promise<{ id: string }> }) {
  const [organizationId, setOrganizationId] = useState<string>();
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { params.then(({ id }) => setOrganizationId(id)); }, [params]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!organizationId || !question.trim()) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/clients/${organizationId}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const data = await response.json() as Result;
      if (!response.ok) throw new Error(data.error || "FlowCoach could not answer that question.");
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "FlowCoach could not answer that question.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-6"><div className="workspace-eyebrow mb-2">Client workspace</div><h1 className="workspace-heading text-3xl font-bold">FlowCoach</h1><p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Ask FlowCoach about this workspace’s authorized documents, captured inputs, meeting agendas, and client records. Answers are provisional and include source excerpts for review.</p></div>
      <form onSubmit={ask} className="workspace-card p-4 sm:p-6" aria-label="Ask FlowCoach">
        <label htmlFor="ai-question" className="block text-sm font-semibold text-[var(--foreground)]">Your question</label>
        <textarea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={5} maxLength={1000} required placeholder="Where is the request for the data room export?" className="mt-2 w-full resize-y rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={busy || !question.trim()} className="flowstate-accent-button rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Searching…" : "Ask FlowCoach"}</button><span className="text-xs text-[var(--muted)]">Read-only · human review required</span></div>
      </form>
      {error && <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      {result && <section className="mt-6 space-y-4" aria-live="polite"><div className="workspace-card p-4 sm:p-6"><div className="workspace-eyebrow mb-2">Provisional answer</div><p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{renderAnswerWithCitations(result.answer, result.sources, organizationId ?? "")}</p></div><div className="workspace-card p-4 sm:p-6"><h2 className="font-semibold text-[var(--foreground)]">Sources ({result.sources.length})</h2>{result.sources.length === 0 ? <p className="mt-2 text-sm text-[var(--muted)]">No matching authorized workspace sources were found.</p> : <div className="mt-3 space-y-3">{result.sources.map((source, index) => <article key={source.id} className="rounded-lg border border-[var(--card-border)] p-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-medium text-[var(--foreground)]">[{index + 1}] {source.href ? <Link href={source.href}>{source.title}</Link> : source.title}</h3><span className="text-xs text-[var(--muted)]">{source.kind} · {new Date(source.date).toLocaleDateString()}</span></div><p className="mt-2 text-sm text-[var(--muted)]">{source.excerpt}</p></article>)}</div>}<p className="mt-4 text-xs text-[var(--muted)]">{result.limitation}</p></div></section>}
    </main>
  );
}

"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type Candidate = { id: string; name: string };

type AgentOutput = {
  id: string;
  provisionalOutput: unknown;
  provider: string | null;
  model: string | null;
  createdAt: string;
  run: {
    capturedInput: { id: string; type: string; rawText: string | null; sourceRef: string | null; subject: string | null; capturedAt: string | null };
    agentDefinition: { name: string; key: string };
    promptVersion: { version: number; prompt: string };
  };
};

type PendingTag = {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  confidence: number;
  segment: { text: string };
  provenance: {
    sourceType: string;
    sourceRef: string | null;
    locationTag: string | null;
    capturedAt: string;
    capturedInputId: string;
    segmentId: string;
    segmentText: string;
    aiConfidence: number;
    generatedAt: string;
  };
  decision: { status: string; reviewedBy: string | null; reviewedAt: string | null };
  candidates: Candidate[];
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [tags, setTags] = useState<PendingTag[]>([]);
  const [outputs, setOutputs] = useState<AgentOutput[]>([]);
  const [outputNotes, setOutputNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [reassignChoice, setReassignChoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadTags = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/tags?organizationId=${organizationId}`);
      if (!res.ok) throw new Error("Tags could not be loaded.");
      setTags(await res.json());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tags could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadOutputs = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${organizationId}/agent-outputs`);
      if (!res.ok) throw new Error("Agent outputs could not be loaded.");
      setOutputs((await res.json()).outputs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent outputs could not be loaded.");
    }
  }, [organizationId]);

  useEffect(() => {
    // These calls intentionally synchronize the page with the remote review APIs.

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTags();
    loadOutputs();
  }, [loadTags, loadOutputs]);

  async function reviewOutput(outputId: string, status: "APPROVED" | "REJECTED" | "AMENDED") {
    const reviewNotes = outputNotes[outputId]?.trim();
    if (!reviewNotes) { setError("Review notes are required for agent outputs."); return; }
    setActionId(outputId); setError(null);
    try {
      const res = await fetch(`/api/agent-outputs/${outputId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNotes }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The agent output could not be reviewed.");
      setOutputs((prev) => prev.filter((output) => output.id !== outputId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent output could not be reviewed.");
    } finally { setActionId(null); }
  }

  async function act(tagId: string, action: "approve" | "reject") {
    setActionId(tagId);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("The tag could not be updated.");
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The tag could not be updated.");
    } finally {
      setActionId(null);
    }
  }

  async function reassign(tagId: string) {
    const targetId = reassignChoice[tagId];
    if (!targetId) return;
    setActionId(tagId);
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reassign", targetId }),
      });
      if (!res.ok) throw new Error("The tag could not be reassigned.");
      setTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The tag could not be reassigned.");
    } finally {
      setActionId(null);
    }
  }

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Review queue</h1>
      <section aria-labelledby="agent-output-review-heading" className="mb-8">
        <h2 id="agent-output-review-heading" className="text-xl font-semibold mb-2">Provisional agent outputs</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">Human review is required. Approved outputs remain separate from assessments, insights, recommendations, and growth actions.</p>
        {outputs.length === 0 ? <p className="text-sm text-[var(--muted)]">No provisional agent outputs pending review.</p> : <div className="space-y-3">{outputs.map((output) => <article key={output.id} className="workspace-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{output.run.agentDefinition.name}</h3><p className="text-xs text-[var(--muted)]">Created {new Date(output.createdAt).toLocaleString()} · {output.provider ?? "Provider unavailable"} / {output.model ?? "Model unavailable"}</p></div><span className="rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">Provisional</span></div>
          <div className="mt-3 rounded-md bg-[var(--surface-muted)] p-3 text-sm"><p><strong>Source {output.run.capturedInput.type.replaceAll("_", " ")}:</strong> {output.run.capturedInput.rawText ?? output.run.capturedInput.subject ?? "No text available"}</p><p className="mt-2"><strong>Prompt version:</strong> v{output.run.promptVersion.version} · <span className="whitespace-pre-wrap">{output.run.promptVersion.prompt}</span></p><p className="mt-2"><strong>Provisional output:</strong> <code className="break-words">{JSON.stringify(output.provisionalOutput)}</code></p></div>
          <label className="mt-3 block text-sm font-medium" htmlFor={`agent-output-notes-${output.id}`}>Review notes<span className="text-[var(--destructive)]"> *</span></label><textarea id={`agent-output-notes-${output.id}`} value={outputNotes[output.id] ?? ""} onChange={(event) => setOutputNotes((prev) => ({ ...prev, [output.id]: event.target.value }))} rows={3} required className="mt-1 w-full rounded border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm" placeholder="Explain your approval, rejection, or amendment" />
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => reviewOutput(output.id, "APPROVED")} disabled={actionId !== null} className="rounded px-3 py-2 text-xs font-medium flowstate-success-button text-white">Approve</button><button onClick={() => reviewOutput(output.id, "REJECTED")} disabled={actionId !== null} className="rounded px-3 py-2 text-xs font-medium bg-[var(--destructive)] text-white">Reject</button><button onClick={() => reviewOutput(output.id, "AMENDED")} disabled={actionId !== null} className="rounded px-3 py-2 text-xs font-medium flowstate-accent-button text-white">Mark amended</button></div>
        </article>)}</div>}
      </section>
      {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}

      {tags.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing pending review.</p>}

      <div className="space-y-3">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-sm">&ldquo;{tag.provenance.segmentText}&rdquo;</p>
              <span className="shrink-0 rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">AI suggestion</span>
            </div>
            <div className="mb-3 rounded-md bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted)]">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Source: {tag.provenance.sourceType.replaceAll("_", " ")}</span>
                <span>Confidence: {Math.round(tag.provenance.aiConfidence * 100)}%</span>
                <span>Captured: {new Date(tag.provenance.capturedAt).toLocaleString()}</span>
              </div>
              {tag.provenance.locationTag && <div className="mt-1">Location: {tag.provenance.locationTag}</div>}
              {tag.provenance.sourceRef && (
                <a href={tag.provenance.sourceRef} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[var(--accent)] underline">
                  Open original source
                </a>
              )}
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[var(--muted)]">
                {tag.targetType}: {tag.targetName} &middot; {Math.round(tag.confidence * 100)}% confidence
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => act(tag.id, "approve")}
                  disabled={actionId !== null}
                  className="text-xs font-medium px-3 py-1 rounded flowstate-success-button text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => act(tag.id, "reject")}
                  disabled={actionId !== null}
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--destructive)] text-white"
                >
                  Reject
                </button>
              </div>
            </div>
            {tag.candidates.length > 1 && (
              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]">
                <select
                  value={reassignChoice[tag.id] ?? ""}
                  onChange={(e) => setReassignChoice((prev) => ({ ...prev, [tag.id]: e.target.value }))}
                  className="border border-[var(--card-border)] rounded px-2 py-1 text-xs flex-1"
                >
                  <option value="">Reassign to…</option>
                  {tag.candidates
                    .filter((c) => c.id !== tag.targetId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => reassign(tag.id)}
                  disabled={!reassignChoice[tag.id] || actionId !== null}
                  className="text-xs font-medium px-3 py-1 rounded flowstate-accent-button text-white disabled:opacity-50"
                >
                  Reassign
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

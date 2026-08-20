"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type Candidate = { id: string; name: string };

type PendingTag = {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  confidence: number;
  segment: { text: string };
  candidates: Candidate[];
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [tags, setTags] = useState<PendingTag[]>([]);
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

  useEffect(() => {
    // This call intentionally synchronizes the page with the remote tag API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTags();
  }, [loadTags]);

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
      <h1 className="text-2xl font-bold mb-6">Tag Review</h1>
      {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}

      {tags.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing pending review.</p>}

      <div className="space-y-3">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm mb-3">&ldquo;{tag.segment.text}&rdquo;</p>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[var(--muted)]">
                {tag.targetType}: {tag.targetName} &middot; {Math.round(tag.confidence * 100)}% confidence
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => act(tag.id, "approve")}
                  disabled={actionId !== null}
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--success)] text-white"
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
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
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

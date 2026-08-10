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

  const loadTags = useCallback(async () => {
    const res = await fetch(`/api/tags?organizationId=${organizationId}`);
    if (res.ok) setTags(await res.json());
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  async function act(tagId: string, action: "approve" | "reject") {
    await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  }

  async function reassign(tagId: string) {
    const targetId = reassignChoice[tagId];
    if (!targetId) return;
    await fetch(`/api/tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reassign", targetId }),
    });
    setTags((prev) => prev.filter((t) => t.id !== tagId));
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
                  className="text-xs font-medium px-3 py-1 rounded bg-[var(--success)] text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => act(tag.id, "reject")}
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
                  disabled={!reassignChoice[tag.id]}
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

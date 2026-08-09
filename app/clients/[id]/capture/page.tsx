"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type CapturedInput = {
  id: string;
  type: string;
  status: string;
  error: string | null;
  createdAt: string;
};

export default function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [type, setType] = useState<"TEXT_NOTE" | "EMAIL">("TEXT_NOTE");
  const [rawText, setRawText] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inputs, setInputs] = useState<CapturedInput[]>([]);

  const loadInputs = useCallback(async () => {
    const res = await fetch(`/api/captured-inputs?organizationId=${organizationId}`);
    if (res.ok) setInputs(await res.json());
  }, [organizationId]);

  useEffect(() => {
    loadInputs();
    const interval = setInterval(loadInputs, 3000);
    return () => clearInterval(interval);
  }, [loadInputs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rawText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/captured-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, type, rawText, locationTag: locationTag || undefined }),
      });
      if (res.ok) {
        setRawText("");
        loadInputs();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4">
        <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">
          &larr; Back to client
        </Link>
      </div>
      <h1 className="text-2xl font-bold mb-6">Capture</h1>

      <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 mb-8">
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "TEXT_NOTE" | "EMAIL")}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm"
          >
            <option value="TEXT_NOTE">Text Note</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">Location (optional)</label>
          <input
            type="text"
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="e.g. Alexandria, Brampton"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs font-medium text-[var(--muted)] mb-1">
            {type === "EMAIL" ? "Email content (sender, subject, body)" : "Note"}
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !rawText.trim()}
          className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Capture"}
        </button>
      </form>

      <h2 className="text-lg font-semibold mb-3">Recent captures</h2>
      <div className="space-y-2">
        {inputs.map((input) => (
          <div
            key={input.id}
            className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
          >
            <span>{input.type}</span>
            <span className="text-[var(--muted)]">{new Date(input.createdAt).toLocaleString()}</span>
            <StatusPill status={input.status} error={input.error} />
          </div>
        ))}
        {inputs.length === 0 && <p className="text-sm text-[var(--muted)]">No captures yet.</p>}
      </div>
    </div>
  );
}

function StatusPill({ status, error }: { status: string; error: string | null }) {
  const background = status === "TAGGED" ? "#bbf7d0" : status === "FAILED" ? "#fee2e2" : "#fef9c3";
  const color = status === "TAGGED" ? "#14532d" : status === "FAILED" ? "#991b1b" : "#854d0e";
  return (
    <span className="score-pill text-xs font-bold" style={{ background, color }} title={error ?? undefined}>
      {status}
    </span>
  );
}

"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";

type Tag = { id: string; targetType: string; targetId: string; status: string };
type Segment = { id: string; text: string; tags: Tag[] };
type CapturedInput = { id: string; rawText: string | null; status: string; segments: Segment[]; createdAt: string };
type Session = { id: string; status: string; organizationId: string; capturedInputs: CapturedInput[] };
type Suggestion = { id: string; suggestedQuestion: string };

export default function SessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id: organizationId, sessionId } = use(params);
  const [session, setSession] = useState<Session | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadSession = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) setSession(await res.json());
  }, [sessionId]);

  const loadSuggestions = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/suggestions`);
    if (res.ok) setSuggestions(await res.json());
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadSuggestions();
    const interval = setInterval(() => {
      loadSession();
      loadSuggestions();
    }, 3000);
    return () => clearInterval(interval);
  }, [loadSession, loadSuggestions]);

  const isActive = session?.status === "active";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("organizationId", organizationId);
      formData.append("type", "TEXT_NOTE");
      formData.append("rawText", noteText);
      formData.append("sessionId", sessionId);

      const res = await fetch("/api/captured-inputs", { method: "POST", body: formData });
      if (res.ok) {
        setNoteText("");
        loadSession();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function endSession() {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    loadSession();
  }

  async function actOnSuggestion(id: string, action: "ask" | "dismiss") {
    await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }

  if (!session) return <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/clients/${organizationId}/capture`} className="text-sm text-[var(--muted)]">
          &larr; Back to capture
        </Link>
        {isActive && (
          <button
            onClick={endSession}
            className="text-xs font-medium px-3 py-1 rounded bg-[var(--destructive)] text-white"
          >
            End Session
          </button>
        )}
      </div>
      <h1 className="text-2xl font-bold mb-2">Live Session</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Status: {session.status}
      </p>

      {suggestions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Suggested follow-ups</h2>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-[var(--card)] border border-[var(--card-border)] rounded px-3 py-2 text-sm"
              >
                <span>{s.suggestedQuestion}</span>
                {isActive && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => actOnSuggestion(s.id, "ask")}
                      className="text-xs font-medium px-2 py-1 rounded bg-[var(--accent)] text-white"
                    >
                      Ask
                    </button>
                    <button
                      onClick={() => actOnSuggestion(s.id, "dismiss")}
                      className="text-xs font-medium px-2 py-1 rounded bg-[var(--muted-bg)] text-[var(--muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {session.capturedInputs.map((input) => (
          <div key={input.id} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
            <p className="text-sm mb-2">{input.rawText}</p>
            <div className="flex flex-wrap gap-1">
              {input.segments.flatMap((seg) =>
                seg.tags.map((tag) => (
                  <span key={tag.id} className="score-pill text-xs" style={{ background: "#f1f5f9", color: "#64748b" }}>
                    {tag.targetType}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
        {session.capturedInputs.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No notes captured yet.</p>
        )}
      </div>

      {isActive && (
        <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="Type what's being discussed…"
            className="border border-[var(--card-border)] rounded px-2 py-1 text-sm w-full mb-3"
          />
          <button
            type="submit"
            disabled={submitting || !noteText.trim()}
            className="bg-[var(--accent)] text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit note"}
          </button>
        </form>
      )}
    </div>
  );
}

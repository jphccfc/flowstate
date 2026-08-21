"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { calculateGap, getGapSeverity, getGapColor, type MaturitySnapshot } from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
};

type Domain = {
  id: string;
  name: string;
  color: string | null;
  capabilities: Capability[];
};

type Org = { id: string; name: string; domains: Domain[] };

type HistoryEntry = { locationTag: string | null; score: number; evidence?: string | null; rationale?: string | null; assessedAt?: string; setAt?: string };
type HistoryData = {
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
  asIsHistory: HistoryEntry[];
  toBeHistory: HistoryEntry[];
};

function ScorePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Maturity score from 0 to 5">
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`Score ${n} of 5`}
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-lg text-sm font-bold border transition-colors ${
            value === n
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--accent)]"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function EntryForm({
  kind,
  onSubmit,
  onDraft,
}: {
  kind: "asIs" | "toBe";
  onSubmit: (data: { locationTag: string | null; score: number; text: string; committedBy?: string }) => Promise<void>;
  onDraft: () => Promise<{ score: number; text: string }>;
}) {
  const [locationTag, setLocationTag] = useState("");
  const [score, setScore] = useState(0);
  const [text, setText] = useState("");
  const [committedBy, setCommittedBy] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const draft = await onDraft();
      setScore(draft.score);
      setText(draft.text);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to generate draft. Please try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ locationTag: locationTag.trim() || null, score, text, committedBy: committedBy.trim() || undefined });
      setLocationTag("");
      setText("");
      setCommittedBy("");
      setScore(0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-[var(--muted)] block mb-1">Location (blank = org-wide)</label>
          <input
            value={locationTag}
            onChange={(e) => setLocationTag(e.target.value)}
            placeholder="e.g. Alexandria, Brampton"
            className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm"
          />
        </div>
        {kind === "toBe" && (
          <div className="flex-1">
            <label className="text-xs text-[var(--muted)] block mb-1">Committed by</label>
            <input
              value={committedBy}
              onChange={(e) => setCommittedBy(e.target.value)}
              placeholder="e.g. CFO, advisor (provisional)"
              className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm"
            />
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] block mb-1">Score (0-5)</label>
        <ScorePicker value={score} onChange={setScore} />
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] block mb-1">{kind === "asIs" ? "Evidence" : "Rationale"}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="px-3 py-1.5 bg-[var(--accent)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={handleDraft}
          disabled={drafting}
          className="px-3 py-1.5 bg-[var(--muted-bg)] text-[var(--muted)] rounded-lg text-sm disabled:opacity-50"
        >
          {drafting ? "Drafting..." : "Draft with AI"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [showAsIsHistory, setShowAsIsHistory] = useState(false);
  const [showToBeHistory, setShowToBeHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    setOrgError(null);
    const res = await fetch(`/api/clients/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.domains)) {
      const message = typeof data.error === "string" ? data.error : `Unable to load organisation (${res.status}).`;
      setOrg(null);
      setOrgError(message);
      setLoading(false);
      return null;
    }
    setOrg(data as Org);
    setLoading(false);
    return data as Org;
  }, [id]);

  useEffect(() => {
    // Remote assessment bootstrap intentionally updates state after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrg().then((data) => {
      if (data?.domains?.[0]?.capabilities?.[0]) {
        setSelectedCapId(data.domains[0].capabilities[0].id);
      }
    });
  }, [loadOrg]);

  const loadHistory = useCallback(async (capId: string) => {
    setHistoryError(null);
    const res = await fetch(`/api/capabilities/${capId}/assessment-history`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setHistory(null);
      setHistoryError(typeof data.error === "string" ? data.error : "Unable to load this capability.");
      return;
    }
    setHistory(data);
  }, []);

  useEffect(() => {
    if (selectedCapId) {
      // Remote history refresh intentionally updates state after the fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadHistory(selectedCapId);
    }
  }, [selectedCapId, loadHistory]);

  async function saveAsIs(data: { locationTag: string | null; score: number; text: string }) {
    if (!selectedCapId) return;
    const res = await fetch("/api/maturity-assessments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilityId: selectedCapId, locationTag: data.locationTag, score: data.score, evidence: data.text }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : `Save failed (${res.status}).`);
    }
    await loadHistory(selectedCapId);
    await loadOrg();
  }

  async function saveToBe(data: { locationTag: string | null; score: number; text: string; committedBy?: string }) {
    if (!selectedCapId) return;
    const res = await fetch("/api/target-maturities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capabilityId: selectedCapId,
        locationTag: data.locationTag,
        score: data.score,
        rationale: data.text,
        committedBy: data.committedBy,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : `Save failed (${res.status}).`);
    }
    await loadHistory(selectedCapId);
    await loadOrg();
  }

  async function draftAsIs(): Promise<{ score: number; text: string }> {
    const res = await fetch(`/api/capabilities/${selectedCapId}/draft-as-is`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : `AI draft failed (${res.status}).`);
    }
    const draft = await res.json();
    return { score: draft.score, text: draft.evidence };
  }

  async function draftToBe(): Promise<{ score: number; text: string }> {
    const res = await fetch(`/api/capabilities/${selectedCapId}/draft-to-be`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : `AI draft failed (${res.status}).`);
    }
    const draft = await res.json();
    return { score: draft.score, text: draft.rationale };
  }

  const selectedCap = org?.domains.flatMap((d) => d.capabilities).find((c) => c.id === selectedCapId);
  const selectedDomain = org?.domains.find((d) => d.capabilities.some((c) => c.id === selectedCapId));

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;

  if (orgError) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-4">
        <h2 className="font-semibold text-[var(--foreground)]">Assessment could not load</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm">{orgError}</p>
        <Link href="/dashboard" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium">
          Return to dashboard
        </Link>
      </div>
    );
  }

  if (!org || org.domains.length === 0 || !org.domains.some((domain) => domain.capabilities.length > 0)) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-4">
        <div className="text-4xl">⚙️</div>
        <h2 className="font-semibold text-[var(--foreground)]">No capabilities configured</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          Configure at least one business capability before starting the assessment
        </p>
        <Link href={`/clients/${id}/configure`} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium">
          Go to Configure
        </Link>
      </div>
    );
  }

  return (
    <div className="assessment-workspace">
      <header className="assessment-heading workspace-card">
        <div>
          <div className="workspace-eyebrow">Assessment workspace</div>
          <h1 className="workspace-heading text-xl font-bold text-[var(--foreground)]">Capability assessment</h1>
          <p className="text-sm text-[var(--muted)]">Select a capability, record the current state, and set a target state.</p>
        </div>
      </header>
      <div className="assessment-layout">
      <aside className="assessment-panel workspace-card">
        <div className="p-3 border-b border-[var(--card-border)]">
          <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Assessment navigator</div>
          <div className="text-xs text-[var(--muted)] mt-1">Choose a capability to assess</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {org.domains.map((domain) => (
            <div key={domain.id}>
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--muted-bg)] sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">{domain.name}</span>
              </div>
              {domain.capabilities.map((cap) => {
                const gap = calculateGap(cap.currentAsIs, cap.currentToBe);
                const severity = getGapSeverity(gap);
                const isSelected = cap.id === selectedCapId;
                return (
                  <button
                    type="button"
                    key={cap.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedCapId(cap.id);
                      setHistory(null);
                    }}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                      isSelected ? "bg-[var(--accent)]/10 border-r-2 border-[var(--accent)]" : "hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate ${isSelected ? "font-semibold text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                        {cap.name}
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: getGapColor(severity) }} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      <main className="assessment-content">
        {!selectedCap || !history ? (
          <div className="flex items-center justify-center h-full text-[var(--muted)]">
            {historyError ? (
              <div className="max-w-sm px-6 text-center">
                <p className="font-medium text-[var(--foreground)]">Capability could not be loaded</p>
                <p className="mt-1 text-sm">{historyError}</p>
              </div>
            ) : "Select a capability to begin"}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6">
            <div className="mb-6">
              {selectedDomain && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: selectedDomain.color ?? "#94a3b8" }}>
                  {selectedDomain.name}
                </span>
              )}
              <h2 className="text-xl font-bold text-[var(--foreground)] mt-1">{selectedCap.name}</h2>
              {selectedCap.description && <p className="text-sm text-[var(--muted)] mt-0.5">{selectedCap.description}</p>}
              {selectedCap.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedCap.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Current State (As-Is)</h3>
              <div className="space-y-2 mb-4">
                {history.currentAsIs.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">Not yet assessed.</p>
                ) : (
                  history.currentAsIs.map((entry) => (
                    <div key={entry.locationTag ?? "org-wide"} className="flex items-center gap-2 text-sm">
                      <span className="score-pill text-xs font-bold">{entry.score}</span>
                      <span className="text-[var(--muted)]">{entry.locationTag ?? "Org-wide"}</span>
                    </div>
                  ))
                )}
              </div>
              <EntryForm key={`${selectedCapId}-asIs`} kind="asIs" onSubmit={saveAsIs} onDraft={draftAsIs} />
              {history.asIsHistory.length > 0 && (
                <button onClick={() => setShowAsIsHistory((v) => !v)} className="text-xs text-[var(--accent)] mt-3">
                  {showAsIsHistory ? "Hide" : "Show"} history ({history.asIsHistory.length})
                </button>
              )}
              {showAsIsHistory && (
                <div className="mt-2 space-y-1 border-t border-[var(--card-border)] pt-2">
                  {history.asIsHistory.map((h, i) => (
                    <div key={i} className="text-xs text-[var(--muted)]">
                      <strong>{h.score}</strong> · {h.locationTag ?? "Org-wide"} · {h.assessedAt ? new Date(h.assessedAt).toLocaleDateString() : ""} — {h.evidence}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Target State (To-Be)</h3>
              <div className="space-y-2 mb-4">
                {history.currentToBe.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No target set yet.</p>
                ) : (
                  history.currentToBe.map((entry) => (
                    <div key={entry.locationTag ?? "org-wide"} className="flex items-center gap-2 text-sm">
                      <span className="score-pill text-xs font-bold" style={{ background: "#dcfce7", color: "#14532d" }}>{entry.score}</span>
                      <span className="text-[var(--muted)]">{entry.locationTag ?? "Org-wide"}</span>
                    </div>
                  ))
                )}
              </div>
              <EntryForm key={`${selectedCapId}-toBe`} kind="toBe" onSubmit={saveToBe} onDraft={draftToBe} />
              {history.toBeHistory.length > 0 && (
                <button onClick={() => setShowToBeHistory((v) => !v)} className="text-xs text-[var(--accent)] mt-3">
                  {showToBeHistory ? "Hide" : "Show"} history ({history.toBeHistory.length})
                </button>
              )}
              {showToBeHistory && (
                <div className="mt-2 space-y-1 border-t border-[var(--card-border)] pt-2">
                  {history.toBeHistory.map((h, i) => (
                    <div key={i} className="text-xs text-[var(--muted)]">
                      <strong>{h.score}</strong> · {h.locationTag ?? "Org-wide"} · {h.setAt ? new Date(h.setAt).toLocaleDateString() : ""} — {h.rationale}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-8 shadow-sm text-center">
              <span className="text-xs text-[var(--muted)]">Gap: </span>
              <span className="text-sm font-bold" style={{ color: getGapColor(getGapSeverity(calculateGap(history.currentAsIs, history.currentToBe))) }}>
                {calculateGap(history.currentAsIs, history.currentToBe)?.toFixed(1) ?? "—"}
              </span>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

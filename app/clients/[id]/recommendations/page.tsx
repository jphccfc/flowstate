"use client";

import { FormEvent, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Status = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "EDITED";
type Feedback = { id: string; action: string; reason: string | null; actedBy: string | null; actedAt: string };
type Recommendation = {
  id: string;
  title: string;
  description: string;
  estimatedValue: number | null;
  priorityScore: number | null;
  status: Status;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
  feedback: Feedback[];
};
type FormValues = { title: string; description: string; estimatedValue: string; priorityScore: string };

const EMPTY_FORM: FormValues = { title: "", description: "", estimatedValue: "", priorityScore: "" };
const statuses: Array<"ALL" | Status> = ["ALL", "DRAFT", "PENDING_REVIEW", "EDITED", "APPROVED", "REJECTED"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function statusClass(status: Status) {
  if (status === "APPROVED") return "bg-[var(--success)] text-white";
  if (status === "REJECTED") return "bg-[var(--destructive)] text-white";
  if (status === "DRAFT") return "bg-[var(--muted-bg)] text-[var(--muted)]";
  return "bg-[var(--accent)] text-white";
}

export default function RecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizationId } = use(params);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [status, setStatus] = useState<(typeof statuses)[number]>("ALL");
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const query = status === "ALL" ? "" : `&status=${status}`;
    const response = await fetch(`/api/recommendations?organizationId=${organizationId}${query}`);
    if (!response.ok) {
      setError("Recommendations could not be loaded.");
      setLoading(false);
      return;
    }
    setRecommendations(await response.json());
    setLoading(false);
  }, [organizationId, status]);

  // This effect intentionally synchronizes the page with the remote recommendation API.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadRecommendations(); }, [loadRecommendations]);

  function setField(field: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(recommendation: Recommendation) {
    setEditingId(recommendation.id);
    setActionId(null);
    setForm({
      title: recommendation.title,
      description: recommendation.description,
      estimatedValue: recommendation.estimatedValue?.toString() ?? "",
      priorityScore: recommendation.priorityScore?.toString() ?? "",
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      description: form.description,
      ...(form.estimatedValue ? { estimatedValue: Number(form.estimatedValue) } : {}),
      ...(form.priorityScore ? { priorityScore: Number(form.priorityScore) } : {}),
    };
    const response = await fetch(editingId ? `/api/recommendations/${editingId}` : "/api/recommendations", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? payload : { ...payload, organizationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Recommendation could not be saved.");
      setSaving(false);
      return;
    }
    resetForm();
    await loadRecommendations();
    setSaving(false);
  }

  async function review(id: string, action: "approve" | "reject") {
    if (action === "reject" && !reason.trim()) {
      setError("Add a reason before rejecting a recommendation.");
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    });
    if (!response.ok) {
      setError("The recommendation could not be updated.");
      setSaving(false);
      return;
    }
    setActionId(null);
    setReason("");
    await loadRecommendations();
    setSaving(false);
  }

  return (
    <main className="max-w-5xl mx-auto w-full px-4 py-8">
      <Link href={`/clients/${organizationId}`} className="text-sm text-[var(--muted)]">&larr; Back to client</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Recommendations</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Create and review manual improvement recommendations.</p>
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])} className="border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm bg-white">
          {statuses.map((value) => <option key={value} value={value}>{value === "ALL" ? "All statuses" : value.replace("_", " ")}</option>)}
        </select>
      </div>

      <form onSubmit={save} className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-6">
        <h2 className="font-semibold mb-4">{editingId ? "Edit recommendation" : "New recommendation"}</h2>
        <div className="grid gap-3">
          <input required value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="Recommendation title" className="border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm" />
          <textarea required value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Describe the proposed improvement" rows={3} className="border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input type="number" value={form.estimatedValue} onChange={(event) => setField("estimatedValue", event.target.value)} placeholder="Estimated value" className="border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm" />
            <input type="number" min="0" max="100" value={form.priorityScore} onChange={(event) => setField("priorityScore", event.target.value)} placeholder="Priority score (0-100)" className="border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button disabled={saving} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : editingId ? "Save changes" : "Create draft"}</button>
            {editingId && <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm">Cancel</button>}
          </div>
        </div>
      </form>

      {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--destructive)] p-3 text-sm text-[var(--destructive)]">{error}</div>}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading recommendations...</p> : recommendations.length === 0 ? <div className="bg-white rounded-xl border border-[var(--card-border)] p-8 text-center text-sm text-[var(--muted)]">No recommendations match this filter.</div> : (
        <div className="space-y-4">
          {recommendations.map((recommendation) => (
            <article key={recommendation.id} className="bg-white rounded-xl border border-[var(--card-border)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-[var(--foreground)]">{recommendation.title}</h2><p className="text-xs text-[var(--muted)] mt-1">Created {formatDate(recommendation.createdAt)}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(recommendation.status)}`}>{recommendation.status.replace("_", " ")}</span>
              </div>
              <p className="text-sm text-[var(--foreground)] mt-4 whitespace-pre-wrap">{recommendation.description}</p>
              <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)] mt-4">
                {recommendation.estimatedValue !== null && <span>Estimated value: {recommendation.estimatedValue.toLocaleString()}</span>}
                {recommendation.priorityScore !== null && <span>Priority: {recommendation.priorityScore}</span>}
                {recommendation.reviewNotes && <span>Review notes: {recommendation.reviewNotes}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-5">
                {(recommendation.status === "DRAFT" || recommendation.status === "EDITED") && <button onClick={() => startEdit(recommendation)} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs font-medium">Edit</button>}
                {(recommendation.status === "DRAFT" || recommendation.status === "EDITED" || recommendation.status === "PENDING_REVIEW") && <button onClick={() => { setActionId(recommendation.id); setReason(""); }} className="px-3 py-1.5 rounded-lg bg-[var(--success)] text-white text-xs font-medium">Review</button>}
              </div>
              {actionId === recommendation.id && <div className="mt-4 p-3 rounded-lg bg-[var(--muted-bg)]"><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required for rejection)" rows={2} className="w-full border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm bg-white" /><div className="flex gap-2 mt-2"><button onClick={() => review(recommendation.id, "approve")} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--success)] text-white text-xs font-medium">Approve</button><button onClick={() => review(recommendation.id, "reject")} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--destructive)] text-white text-xs font-medium">Reject</button><button onClick={() => setActionId(null)} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs">Cancel</button></div></div>}
              {recommendation.feedback.length > 0 && <div className="border-t border-[var(--card-border)] mt-5 pt-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">Review history</h3><div className="space-y-2">{recommendation.feedback.map((item) => <div key={item.id} className="text-xs text-[var(--muted)]"><strong>{item.action}</strong> · {item.reason ?? "No reason provided"} · {item.actedBy ?? "Unknown reviewer"} · {formatDate(item.actedAt)}</div>)}</div></div>}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

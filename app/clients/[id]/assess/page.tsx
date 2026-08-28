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
  gap: number | null;
};
type Perspective = { id: string; stakeholderType: string; assessorRole: string | null; score: number; originalStatement: string; rationale: string | null; confidence: number | null; status: string; reviewedBy: string | null };
type ReviewedEvidence = { id: string; segmentText: string; sourceType: string; sourceRef: string | null; capturedInputId: string; segmentId: string };
type Proposal = { id: string; proposalType?: string; interpretation: string; suggestedScore: number | null; scoreRangeMin: number | null; scoreRangeMax: number | null; confidence: number | null; missingEvidence: string[]; conflictingEvidence: string[]; status: string; reviewNotes: string | null };
type Decision = { id: string; status: string; score: number | null; rationale: string | null; decidedBy: string | null; decidedAt: string; supersedesId: string | null; canDelete?: boolean };
type Insight = { id: string; decisionId: string; type: string; title: string; description: string; priority: number | null; sourcePerspectiveIds: string[] };
type GrowthAction = { id: string; insightId: string; title: string; description: string; outcomeScenario: string; expectedValue: number | null; valueAssumptions: string | null; ownerEmail: string | null; dueDate: string | null; priority: number | null; status: string };
type PerspectiveData = { perspectives: Perspective[]; summary: { count: number; minimum: number | null; maximum: number | null; spread: number | null; stakeholderTypes: string[]; materialVariance: boolean; evidenceCoverage: number; pendingReview: number; reviewState: string }; rubric: { version: number; anchors: Array<{ level: number; label: string; description: string }> } };

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
              ? "flowstate-accent-button text-white border-[var(--accent)]"
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
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
    try {
      await onSubmit({ locationTag: locationTag.trim() || null, score, text, committedBy: committedBy.trim() || undefined });
      setSaved(true);
      if (kind === "toBe") setScore(0);
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
          className="px-3 py-1.5 flowstate-accent-button text-white rounded-lg text-sm font-medium disabled:opacity-50"
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
      {saved && <p role="status" className="text-xs text-[var(--success)]">Assessment saved</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PerspectiveForm({ evidence, onSubmit }: { evidence: ReviewedEvidence[]; onSubmit: (data: { stakeholderType: string; score: number; originalStatement: string; rationale: string; confidence: number; sourceEvidenceIds: string[] }) => Promise<void> }) {
  const [stakeholderType, setStakeholderType] = useState("employee");
  const [score, setScore] = useState("0");
  const [originalStatement, setOriginalStatement] = useState("");
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState("0.8");
  const [sourceEvidenceIds, setSourceEvidenceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ stakeholderType, score: Number(score), originalStatement, rationale, confidence: Number(confidence), sourceEvidenceIds });
      setOriginalStatement("");
      setRationale("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save perspective.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-[var(--card-border)] pt-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Add perspective</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs text-[var(--muted)]">Perspective type
          <select name="stakeholderType" value={stakeholderType} onChange={(event) => setStakeholderType(event.target.value)} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]">
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="expert_analyst">Expert analyst</option>
            <option value="stakeholder">Other stakeholder</option>
          </select>
        </label>
        <label className="text-xs text-[var(--muted)]">Reported score
          <input name="score" type="number" min="0" max="5" step="0.5" value={score} onChange={(event) => setScore(event.target.value)} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" />
        </label>
        <label className="text-xs text-[var(--muted)]">Confidence
          <input name="confidence" type="number" min="0" max="1" step="0.1" value={confidence} onChange={(event) => setConfidence(event.target.value)} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" />
        </label>
      </div>
      <label className="block text-xs text-[var(--muted)]">Original statement
        <textarea name="originalStatement" required value={originalStatement} onChange={(event) => setOriginalStatement(event.target.value)} rows={3} placeholder="Record the stakeholder's words, not an AI summary" className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)] resize-y" />
      </label>
      <fieldset className="rounded-lg border border-[var(--card-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[var(--foreground)]">Reviewed evidence</legend>
        {evidence.length === 0 ? <p className="text-xs text-[var(--muted)]">No reviewed evidence is linked to this capability yet.</p> : <div className="space-y-2">{evidence.map((item) => <label key={item.id} className="flex gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={sourceEvidenceIds.includes(item.id)} onChange={(event) => setSourceEvidenceIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong className="text-[var(--foreground)]">Source segment:</strong> “{item.segmentText}”<span className="block">File/source: {item.sourceRef ?? item.sourceType.replaceAll("_", " ")}</span></span></label>)}</div>}
      </fieldset>
      <label className="block text-xs text-[var(--muted)]">Rationale (optional)
        <textarea name="rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} rows={2} placeholder="Why does this perspective support the score?" className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)] resize-y" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-3 py-1.5 flowstate-accent-button text-white rounded-lg text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : "Save perspective"}</button>
        <span className="text-xs text-[var(--muted)]">Scores can use half-points, such as 0.5 or 1.5.</span>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export default function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [perspectiveData, setPerspectiveData] = useState<PerspectiveData | null>(null);
  const [reviewedEvidence, setReviewedEvidence] = useState<ReviewedEvidence[]>([]);
  const [perspectiveError, setPerspectiveError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [pendingDeleteDecisionId, setPendingDeleteDecisionId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightBusy, setInsightBusy] = useState(false);
  const [growthActions, setGrowthActions] = useState<GrowthAction[]>([]);
  const [growthBusy, setGrowthBusy] = useState(false);
  const [recommendationBusy, setRecommendationBusy] = useState<string | null>(null);
  const [recommendationState, setRecommendationState] = useState<Record<string, "created" | "error">>({});
  const [growthOwner, setGrowthOwner] = useState("");
  const [growthDueDate, setGrowthDueDate] = useState("");
  const [growthOutcomeScenario, setGrowthOutcomeScenario] = useState("PROFIT_GROWTH");
  const [growthExpectedValue, setGrowthExpectedValue] = useState("");
  const [growthValueAssumptions, setGrowthValueAssumptions] = useState("");
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

  const loadPerspectives = useCallback(async (capId: string) => {
    setPerspectiveError(null);
    const res = await fetch(`/api/capabilities/${capId}/perspectives`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPerspectiveData(null);
      setPerspectiveError(typeof data.error === "string" ? data.error : `Perspective data could not load (${res.status}).`);
      return;
    }
    setPerspectiveData(data);
  }, []);

  useEffect(() => {
    if (selectedCapId) fetch(`/api/capabilities/${selectedCapId}/evidence`).then((res) => res.ok ? res.json() : []).then(setReviewedEvidence);
  }, [selectedCapId]);

  useEffect(() => {
    if (selectedCapId) {
      // Perspective refresh intentionally updates state after the fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPerspectives(selectedCapId);
    }
  }, [selectedCapId, loadPerspectives]);

  async function loadProposals(capId: string) {
    const res = await fetch(`/api/capabilities/${capId}/proposals`);
    if (res.ok) setProposals(await res.json());
  }

  useEffect(() => {
    if (selectedCapId) {
      // Proposal refresh intentionally updates state after the fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadProposals(selectedCapId);
    }
  }, [selectedCapId]);

  async function loadInsights(capId: string) {
    const res = await fetch(`/api/capabilities/${capId}/insights`);
    if (res.ok) { const data = await res.json(); setInsights(data); await loadGrowthActions(data); }
  }

  async function loadDecisions(capId: string) {
    const res = await fetch(`/api/capabilities/${capId}/decisions`);
    if (res.ok) setDecisions(await res.json());
  }

  useEffect(() => {
    if (selectedCapId) {
      // Decision refresh intentionally updates state after the fetch resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDecisions(selectedCapId);
      loadInsights(selectedCapId);
    }
    // Remote insight refresh intentionally updates state after the fetch resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCapId]);

  async function createDecision(status: "APPROVED" | "EVIDENCE_REQUESTED") {
    if (!selectedCapId) return;
    setDecisionBusy(true);
    const score = history?.currentAsIs?.[0]?.score;
    const res = await fetch(`/api/capabilities/${selectedCapId}/decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, score, rationale: status === "APPROVED" ? "Reviewed by authorised human reviewer." : "Additional evidence requested." }) });
    if (res.ok) { const decision = await res.json(); setDecisions((current) => [decision, ...current]); }
    setDecisionBusy(false);
  }

  async function loadGrowthActions(insightList: Insight[]) {
    const actionLists = await Promise.all(insightList.map(async (insight) => {
      const res = await fetch(`/api/approved-insights/${insight.id}/actions`);
      return res.ok ? await res.json() as GrowthAction[] : [];
    }));
    setGrowthActions(actionLists.flat());
  }

  async function createGrowthAction() {
    const insight = insights[0];
    if (!insight || !growthOwner.trim() || !growthDueDate) return;
    setGrowthBusy(true);
    const res = await fetch(`/api/approved-insights/${insight.id}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Document and adopt the capability workflow", description: "Complete the first improvement action linked to this approved insight.", ownerEmail: growthOwner.trim(), dueDate: growthDueDate, outcomeScenario: growthOutcomeScenario, expectedValue: growthExpectedValue || undefined, valueAssumptions: growthValueAssumptions.trim() || undefined, priority: insight.priority ?? 5 }) });
    if (res.ok) { const action = await res.json(); setGrowthActions((items) => [action, ...items]); }
    setGrowthBusy(false);
  }

  async function createRecommendation(actionId: string) {
    setRecommendationBusy(actionId);
    const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ growthActionId: actionId }) });
    setRecommendationState((current) => ({ ...current, [actionId]: res.ok ? "created" : "error" }));
    setRecommendationBusy(null);
  }

  async function createInsight() {
    const decision = decisions[0];
    if (!selectedCapId || decision?.status !== "SIGNED_OFF") return;
    setInsightBusy(true);
    const res = await fetch(`/api/capabilities/${selectedCapId}/insights`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decisionId: decision.id, type: "MATURITY_GAP", title: "Approved capability gap", description: decision.rationale ?? "Approved assessment identifies a capability gap requiring prioritisation.", priority: 7 }) });
    if (res.ok) { const insight = await res.json(); const nextInsights = [insight, ...insights]; setInsights(nextInsights); await loadGrowthActions(nextInsights); }
    setInsightBusy(false);
  }

  async function deleteDecision(decisionId: string) {
    setDecisionBusy(true);
    const res = await fetch(`/api/maturity-decisions/${decisionId}`, { method: "DELETE" });
    if (res.ok) {
      const deleted = await res.json();
      setDecisions((items) => [deleted, ...items.filter((item) => item.id !== decisionId)]);
      setSelectedDecisionId(null);
      setPendingDeleteDecisionId(null);
    }
    setDecisionBusy(false);
  }

  async function updateDecision(action: "REJECT" | "REOPEN" | "SIGN_OFF") {
    const current = decisions[0];
    if (!current) return;
    setDecisionBusy(true);
    const res = await fetch(`/api/maturity-decisions/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, rationale: `Decision marked ${action.toLowerCase().replaceAll("_", " ")}.` }) });
    if (res.ok) { const decision = await res.json(); setDecisions((items) => [decision, ...items]); }
    setDecisionBusy(false);
  }

  async function validateApprovedRating() {
    if (!selectedCapId) return;
    setProposalBusy(true);
    const res = await fetch(`/api/capabilities/${selectedCapId}/validation`, { method: "POST" });
    if (res.ok) { const proposal = await res.json(); setProposals((current) => [proposal, ...current]); }
    setProposalBusy(false);
  }

  async function generateProposal() {
    if (!selectedCapId) return;
    setProposalBusy(true);
    const res = await fetch(`/api/capabilities/${selectedCapId}/proposals`, { method: "POST" });
    if (res.ok) { const proposal = await res.json(); setProposals((current) => [proposal, ...current]); }
    setProposalBusy(false);
  }

  async function reviewProposal(proposalId: string, action: "approve" | "reject") {
    const res = await fetch(`/api/maturity-proposals/${proposalId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (res.ok) { const updated = await res.json(); setProposals((current) => current.map((proposal) => proposal.id === proposalId ? updated : proposal)); }
  }

  async function reviewPerspective(perspectiveId: string, action: "approve" | "reject") {
    if (!selectedCapId) return;
    const res = await fetch(`/api/capabilities/${selectedCapId}/perspectives/${perspectiveId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (!res.ok) { setPerspectiveError("Unable to review this perspective."); return; }
    const updated = await res.json();
    setPerspectiveData((current) => current ? { ...current, perspectives: current.perspectives.map((perspective) => perspective.id === perspectiveId ? updated : perspective), summary: { ...current.summary, pendingReview: current.perspectives.filter((perspective) => perspective.id === perspectiveId ? updated.status === "SUBMITTED" : perspective.status === "SUBMITTED").length, reviewState: current.perspectives.some((perspective) => perspective.id === perspectiveId ? updated.status === "SUBMITTED" : perspective.status === "SUBMITTED") ? "PENDING_REVIEW" : "REVIEWED" } } : current);
  }

  async function savePerspective(data: { stakeholderType: string; score: number; originalStatement: string; rationale: string; confidence: number; sourceEvidenceIds: string[] }) {
    if (!selectedCapId) return;
    const res = await fetch(`/api/capabilities/${selectedCapId}/perspectives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, rubricVersion: perspectiveData?.rubric.version ?? 1 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `Perspective save failed (${res.status}).`);
    await loadPerspectives(selectedCapId);
  }

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
    await Promise.all([loadHistory(selectedCapId), loadOrg(), loadPerspectives(selectedCapId)]);
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
    await Promise.all([loadHistory(selectedCapId), loadOrg(), loadPerspectives(selectedCapId)]);
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

  function selectCapability(capabilityId: string) {
    setSelectedCapId(capabilityId);
    setHistory(null);
    setPerspectiveData(null);
    setPerspectiveError(null);
  }

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
      <section className="assessment-selector workspace-card" aria-labelledby="assessment-selector-title">
        <div className="assessment-selector-heading">
          <div>
            <div id="assessment-selector-title" className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Assessment navigator</div>
            <div className="text-xs text-[var(--muted)] mt-1">Choose a capability to assess</div>
          </div>
          <div className="text-xs text-[var(--muted)]">{org.domains.reduce((count, domain) => count + domain.capabilities.length, 0)} capabilities</div>
        </div>
        <label className="assessment-selector-control">
          <span className="text-xs font-semibold text-[var(--foreground)]">Capability</span>
          <select
            aria-label="Capability to assess"
            value={selectedCapId ?? ""}
            onChange={(event) => selectCapability(event.target.value)}
            className="assessment-capability-select"
          >
            {org.domains.map((domain) => (
              <optgroup key={domain.id} label={domain.name}>
                {domain.capabilities.map((cap) => (
                  <option key={cap.id} value={cap.id}>{cap.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </section>

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


            <section className="workspace-card p-4 mb-4" aria-label="Overall capability gap">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="workspace-eyebrow">Saved assessment result</div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Overall capability gap</h3>
                  <p className="text-xs text-[var(--muted)]">Calculated from the saved current and target scores.</p>
                </div>
                {history.gap == null ? (
                  <span className="text-xs text-[var(--muted)]">Enter both scores</span>
                ) : (
                  <span className="text-2xl font-bold" style={{ color: getGapColor(getGapSeverity(history.gap)) }}>{history.gap.toFixed(1)}</span>
                )}
              </div>
            </section>

            {selectedCapId && <section className="workspace-card p-5 mb-4" aria-labelledby="decision-title">
              <div className="flex items-start justify-between gap-4 mb-3"><div><div className="workspace-eyebrow">Human control</div><h3 id="decision-title" className="text-sm font-semibold text-[var(--foreground)]">Assessment decision and sign-off</h3></div><span className="text-xs text-[var(--muted)]">Append-only history</span></div>
              {decisions.length === 0 ? <p className="text-sm text-[var(--muted)]">No human decision recorded yet. AI proposals remain provisional.</p> : <div className="space-y-2">{decisions.slice(0, 3).map((decision) => <div key={decision.id} role="button" tabIndex={0} aria-pressed={selectedDecisionId === decision.id} onClick={() => setSelectedDecisionId(decision.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedDecisionId(decision.id); }} className={`rounded-lg border p-3 text-xs cursor-pointer ${selectedDecisionId === decision.id ? "border-[var(--accent)] bg-[var(--muted-bg)]" : "border-[var(--card-border)]"}`}><div className="flex items-center justify-between gap-3"><strong className="text-[var(--foreground)]">{decision.status.replaceAll("_", " ")}</strong><span className="text-[var(--muted)]">{decision.score ?? "No score"}</span></div><div className="mt-1 text-[var(--muted)]">{decision.decidedBy ?? "Unknown reviewer"} · {new Date(decision.decidedAt).toLocaleString()}</div>{decision.rationale && <p className="mt-1 text-[var(--muted)]">{decision.rationale}</p>}{selectedDecisionId === decision.id && decision.canDelete && <div className="mt-3 flex flex-wrap gap-2">{pendingDeleteDecisionId === decision.id ? <><span className="text-[var(--destructive)]">Delete this decision?</span><button type="button" onClick={(event) => { event.stopPropagation(); deleteDecision(decision.id); }} disabled={decisionBusy} className="px-2 py-1 rounded border border-[var(--destructive)] text-[var(--destructive)]">Confirm delete</button><button type="button" onClick={(event) => { event.stopPropagation(); setPendingDeleteDecisionId(null); }} className="px-2 py-1 rounded border border-[var(--card-border)]">Cancel</button></> : <button type="button" onClick={(event) => { event.stopPropagation(); setPendingDeleteDecisionId(decision.id); }} className="px-2 py-1 rounded border border-[var(--card-border)] text-[var(--destructive)]">Delete my decision</button>}</div>}</div>)}</div>}
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => createDecision("APPROVED")} disabled={decisionBusy || ["APPROVED", "SIGNED_OFF"].includes(decisions[0]?.status ?? "")} className="px-3 py-1.5 rounded-lg flowstate-success-button text-white text-xs disabled:opacity-50">{["APPROVED", "SIGNED_OFF"].includes(decisions[0]?.status ?? "") ? "Assessment already approved — Reopen to amend" : "Approve assessment"}</button><button type="button" onClick={() => createDecision("EVIDENCE_REQUESTED")} disabled={decisionBusy} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs disabled:opacity-50">Request evidence</button>{decisions[0] && <><button type="button" onClick={() => updateDecision("REOPEN")} disabled={decisionBusy} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs disabled:opacity-50">Reopen</button><button type="button" onClick={() => updateDecision("SIGN_OFF")} disabled={decisionBusy || decisions[0]?.status !== "APPROVED"} className="px-3 py-1.5 rounded-lg flowstate-accent-button text-white text-xs disabled:opacity-50">Sign off</button></>}</div>
            </section>}

            {decisions[0]?.status === "SIGNED_OFF" && <section className="workspace-card p-5 mb-4" aria-labelledby="insights-title"><div className="flex items-start justify-between gap-4 mb-3"><div><div className="workspace-eyebrow">Approved output</div><h3 id="insights-title" className="text-sm font-semibold text-[var(--foreground)]">Approved insights and priorities</h3></div><button type="button" onClick={createInsight} disabled={insightBusy} className="px-3 py-1.5 rounded-lg flowstate-accent-button text-white text-xs disabled:opacity-50">{insightBusy ? "Creating…" : "Create insight"}</button></div>{insights.length === 0 ? <p className="text-sm text-[var(--muted)]">No approved insight has been created from this signed-off decision.</p> : <div className="space-y-2">{insights.map((insight) => <div key={insight.id} className="rounded-lg border border-[var(--card-border)] p-3 text-sm"><div className="flex items-center justify-between gap-3"><strong>{insight.title}</strong><span className="text-xs text-[var(--muted)]">Priority {insight.priority ?? "—"}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{insight.description}</p><div className="mt-1 text-[10px] text-[var(--muted)]">Traceable to signed-off decision · {insight.sourcePerspectiveIds.length} perspective sources</div></div>)}</div>}</section>}

            {decisions[0]?.status === "SIGNED_OFF" && insights.length > 0 && <div className="mt-4 border-t border-[var(--card-border)] pt-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold text-[var(--foreground)]">Growth actions</div><div className="text-xs text-[var(--muted)]">Assign an owner and due date before creating the action.</div></div><button type="button" onClick={createGrowthAction} disabled={growthBusy || insights.length === 0 || !growthOwner.trim() || !growthDueDate} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-xs disabled:opacity-50">{growthBusy ? "Creating…" : "Add growth action"}</button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><label className="text-xs text-[var(--muted)]">Action owner<input required type="email" value={growthOwner} onChange={(event) => setGrowthOwner(event.target.value)} placeholder="owner@example.com" className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" /></label><label className="text-xs text-[var(--muted)]">Due date<input required type="date" value={growthDueDate} onChange={(event) => setGrowthDueDate(event.target.value)} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" /></label><label className="text-xs text-[var(--muted)]">Outcome scenario<select value={growthOutcomeScenario} onChange={(event) => setGrowthOutcomeScenario(event.target.value)} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]"><option value="PROFIT_GROWTH">Profit / growth</option><option value="SALE_READINESS">Sale readiness</option><option value="RESTRUCTURING">Restructuring</option><option value="MULTIPLIER_IMPROVEMENT">Multiplier improvement</option></select></label><label className="text-xs text-[var(--muted)]">Expected value<input type="number" min="0" value={growthExpectedValue} onChange={(event) => setGrowthExpectedValue(event.target.value)} placeholder="Optional value" className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" /></label><label className="text-xs text-[var(--muted)] sm:col-span-2">Value assumptions<textarea value={growthValueAssumptions} onChange={(event) => setGrowthValueAssumptions(event.target.value)} placeholder="Basis, confidence or dependencies behind the expected value" rows={2} className="mt-1 w-full px-2 py-1.5 border border-[var(--card-border)] rounded-lg text-sm text-[var(--foreground)] bg-[var(--card)]" /></label></div>{growthActions.length > 0 && <div className="mt-3 space-y-2">{growthActions.map((action) => <div key={action.id} className="rounded-lg bg-[var(--muted-bg)] p-3 text-xs"><div className="flex items-center justify-between gap-3"><strong>{action.title}</strong><span>{action.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-[var(--muted)]">{action.description}</p><div className="mt-1 text-[var(--muted)]">Owner: {action.ownerEmail ?? "Unassigned"}</div>{action.dueDate && <div className="mt-1 text-[var(--muted)]">Due {new Date(action.dueDate).toLocaleDateString()}</div>}<button type="button" onClick={() => createRecommendation(action.id)} disabled={recommendationBusy === action.id || !action.ownerEmail || !action.dueDate} className="mt-2 px-2 py-1 rounded border border-[var(--card-border)] text-[var(--accent)] disabled:opacity-50">{recommendationBusy === action.id ? "Creating…" : recommendationState[action.id] === "created" ? "Recommendation created" : "Create recommendation"}</button>{recommendationState[action.id] === "error" && <div className="mt-1 text-[var(--destructive)]">Recommendation could not be created.</div>}</div>)}</div>}</div>}

            {(perspectiveData || perspectiveError) && (
              <section className="workspace-card p-5 mb-4" aria-labelledby="perspective-balance-title">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div><div className="workspace-eyebrow">Evidence-led assessment</div><h3 id="perspective-balance-title" className="text-sm font-semibold text-[var(--foreground)]">Perspective balance</h3></div>
                  <span className="text-xs text-[var(--muted)]">Rubric v{perspectiveData?.rubric.version ?? "—"}</span>
                </div>
                {perspectiveError ? (
                  <div className="rounded-lg border border-[var(--card-border)] bg-[var(--muted-bg)] p-3 text-sm">
                    <div className="font-medium text-[var(--foreground)]">Perspective data could not load</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{perspectiveError}</div>
                  </div>
                ) : !perspectiveData ? (
                  <p className="text-sm text-[var(--muted)]">Loading perspective data...</p>
                ) : perspectiveData.perspectives.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No employee or expert perspectives have been recorded yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4"><div className="p-3 rounded-lg bg-[var(--muted-bg)]"><div className="text-xs text-[var(--muted)]">Employee perspectives</div><div className="text-lg font-bold text-[var(--foreground)]">{perspectiveData.perspectives.filter((p) => p.stakeholderType === "employee").length}</div></div><div className="p-3 rounded-lg bg-[var(--muted-bg)]"><div className="text-xs text-[var(--muted)]">Expert perspectives</div><div className="text-lg font-bold text-[var(--foreground)]">{perspectiveData.perspectives.filter((p) => p.stakeholderType === "expert_analyst").length}</div></div></div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs"><div className="p-2 rounded-lg bg-[var(--muted-bg)]"><div className="text-[var(--muted)]">Evidence coverage</div><strong className="text-[var(--foreground)]">{Math.round(perspectiveData.summary.evidenceCoverage * 100)}%</strong></div><div className="p-2 rounded-lg bg-[var(--muted-bg)]"><div className="text-[var(--muted)]">Review state</div><strong className="text-[var(--foreground)]">{perspectiveData.summary.reviewState === "PENDING_REVIEW" ? "Pending review" : "Reviewed"}</strong></div><div className="p-2 rounded-lg bg-[var(--muted-bg)]"><div className="text-[var(--muted)]">Pending</div><strong className="text-[var(--foreground)]">{perspectiveData.summary.pendingReview}</strong></div><div className="p-2 rounded-lg bg-[var(--muted-bg)]"><div className="text-[var(--muted)]">Variance</div><strong className="text-[var(--foreground)]">{perspectiveData.summary.materialVariance ? "Material" : "Within range"}</strong></div></div><div className="flex items-center justify-between text-xs text-[var(--muted)] mb-3"><span>Reported range: <strong className="text-[var(--foreground)]">{perspectiveData.summary.minimum}–{perspectiveData.summary.maximum}</strong></span><span>Spread: <strong className="text-[var(--foreground)]">{perspectiveData.summary.spread}</strong></span></div>
                    <div className="space-y-2">{perspectiveData.perspectives.map((perspective) => <div key={perspective.id} className="border-t border-[var(--card-border)] pt-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-medium text-[var(--foreground)]">{perspective.stakeholderType === "expert_analyst" ? "Expert analyst" : perspective.stakeholderType}</span><span className="font-bold text-[var(--accent)]">{perspective.score}</span></div><p className="mt-1 text-xs text-[var(--muted)]">“{perspective.originalStatement}”</p><div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-[var(--muted)]">{perspective.status === "SUBMITTED" ? "Pending human review" : perspective.status === "APPROVED" ? `Reviewed by ${perspective.reviewedBy ?? "reviewer"}` : "Rejected"}</span>{perspective.status === "SUBMITTED" && <span className="flex gap-2"><button type="button" onClick={() => reviewPerspective(perspective.id, "approve")} className="px-2 py-1 rounded flowstate-success-button text-white">Approve</button><button type="button" onClick={() => reviewPerspective(perspective.id, "reject")} className="px-2 py-1 rounded bg-[var(--destructive)] text-white">Reject</button></span>}</div></div>)}</div>
                  </>
                )}
                {perspectiveData && <details className="mt-4 text-xs text-[var(--muted)]"><summary className="cursor-pointer text-[var(--accent)]">Current maturity rubric</summary><div className="mt-2 space-y-1">{perspectiveData.rubric.anchors.map((anchor) => <div key={anchor.level}><strong className="text-[var(--foreground)]">{anchor.level} — {anchor.label}:</strong> {anchor.description}</div>)}</div></details>}

                {perspectiveData && <div className="mt-4 border-t border-[var(--card-border)] pt-4">
                  <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold text-[var(--foreground)]">AI evidence proposal</div><div className="text-xs text-[var(--muted)]">Provisional only; it cannot change the saved assessment.</div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={generateProposal} disabled={proposalBusy} className="px-3 py-1.5 rounded-lg flowstate-accent-button text-white text-xs disabled:opacity-50">{proposalBusy ? "Generating…" : "Generate proposal"}</button><button type="button" onClick={validateApprovedRating} disabled={proposalBusy || !decisions.some((decision) => ["APPROVED", "SIGNED_OFF"].includes(decision.status))} className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--foreground)] text-xs disabled:opacity-50">Validate approved rating</button></div></div>
                  {proposals.slice(0, 1).map((proposal) => <div key={proposal.id} className="mt-3 rounded-lg border border-[var(--card-border)] p-3 text-xs"><div className="flex items-center justify-between gap-3"><strong className="text-[var(--foreground)]">{proposal.status === "PENDING_REVIEW" ? "Pending human review" : proposal.status}</strong>{proposal.suggestedScore !== null && <span className="font-bold text-[var(--accent)]">Suggested {proposal.suggestedScore}</span>}</div><p className="mt-2 text-[var(--muted)]">{proposal.interpretation}</p>{proposal.missingEvidence.length > 0 && <p className="mt-2 text-[var(--muted)]">Missing evidence: {proposal.missingEvidence.join(", ")}</p>}{proposal.status === "PENDING_REVIEW" && <div className="mt-3 flex gap-2"><button type="button" onClick={() => reviewProposal(proposal.id, "approve")} className="px-2 py-1 rounded flowstate-success-button text-white">Approve proposal</button><button type="button" onClick={() => reviewProposal(proposal.id, "reject")} className="px-2 py-1 rounded bg-[var(--destructive)] text-white">Reject proposal</button></div>}</div>)}
                </div>}
                {perspectiveData && <PerspectiveForm evidence={reviewedEvidence} onSubmit={savePerspective} />}
              </section>
            )}

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

            {(() => {
              const gap = history.gap ?? calculateGap(history.currentAsIs, history.currentToBe);
              return (
                <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-8 shadow-sm text-center">
                  <span className="text-xs text-[var(--muted)]">Gap: </span>
                  {gap == null ? (
                    <span className="text-xs text-[var(--muted)]">Set both current and target scores to calculate the gap.</span>
                  ) : (
                    <span className="text-sm font-bold" style={{ color: getGapColor(getGapSeverity(gap)) }}>{gap.toFixed(1)}</span>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}

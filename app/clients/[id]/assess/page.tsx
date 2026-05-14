"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { calculateGap, getGapSeverity } from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  description: string | null;
  aliases: string[];
  dimensions: string[];
  metrics: string[];
  asIsState: string | null;
  asIsScore: number | null;
  asIsNotes: string | null;
  importanceScore: number | null;
  toBeState: string | null;
  toBeScore: number | null;
  opportunities: string[];
  weaknesses: string[];
  gapScore: number | null;
  order: number;
};

type Domain = {
  id: string;
  name: string;
  color: string | null;
  capabilities: Capability[];
};

type Org = {
  id: string;
  name: string;
  domains: Domain[];
};

function ScoreSlider({ value, onChange, label, color }: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  color?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-[var(--muted)]">{label}</label>
        <span
          className="score-pill text-xs font-bold"
          style={{
            background: value == null ? "#f1f5f9" : value >= 7 ? "#bbf7d0" : value >= 5 ? "#fef9c3" : "#fee2e2",
            color: value == null ? "#94a3b8" : value >= 7 ? "#14532d" : value >= 5 ? "#854d0e" : "#991b1b",
          }}
        >
          {value ?? "—"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)] cursor-pointer"
        style={{ accentColor: color ?? "var(--accent)" }}
      />
      <div className="flex justify-between text-[10px] text-[var(--muted)] mt-0.5">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

function TagInput({ value, onChange, placeholder }: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInput("");
    }
  }

  function remove(item: string) {
    onChange(value.filter((v) => v !== item));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-xs"
          >
            {item}
            <button onClick={() => remove(item)} className="hover:text-[var(--destructive)] font-bold leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-1.5 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          onClick={add}
          className="px-3 py-1.5 bg-[var(--muted-bg)] text-[var(--muted)] rounded-lg text-sm hover:bg-[var(--card-border)] transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function AssessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [localData, setLocalData] = useState<Record<string, Partial<Capability>>>({});
  const [saveStatus, setSaveStatus] = useState<Record<string, "saved" | "saving" | "unsaved">>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then((data: Org) => {
        setOrg(data);
        if (data.domains?.[0]?.capabilities?.[0]) {
          setSelectedCapId(data.domains[0].capabilities[0].id);
        }
        setLoading(false);
      });
  }, [id]);

  const saveCapability = useCallback(
    async (capId: string, changes: Partial<Capability>) => {
      setSaveStatus((prev) => ({ ...prev, [capId]: "saving" }));
      const cap = org?.domains.flatMap((d) => d.capabilities).find((c) => c.id === capId);
      if (!cap) return;
      const payload = { ...cap, ...localData[capId], ...changes };
      await fetch(`/api/capabilities/${capId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setOrg((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          domains: prev.domains.map((d) => ({
            ...d,
            capabilities: d.capabilities.map((c) =>
              c.id === capId ? { ...c, ...payload, gapScore: calculateGap(payload.asIsScore ?? null, payload.toBeScore ?? null) } : c
            ),
          })),
        };
      });
      setSaveStatus((prev) => ({ ...prev, [capId]: "saved" }));
    },
    [org, localData]
  );

  function updateLocal(capId: string, field: string, value: unknown) {
    setLocalData((prev) => ({ ...prev, [capId]: { ...prev[capId], [field]: value } }));
    setSaveStatus((prev) => ({ ...prev, [capId]: "unsaved" }));
  }

  useEffect(() => {
    if (!selectedCapId) return;
    const data = localData[selectedCapId];
    if (!data || Object.keys(data).length === 0) return;
    const timer = setTimeout(() => {
      saveCapability(selectedCapId, data);
    }, 800);
    return () => clearTimeout(timer);
  }, [localData, selectedCapId, saveCapability]);

  const selectedCap = (() => {
    const base = org?.domains.flatMap((d) => d.capabilities).find((c) => c.id === selectedCapId);
    if (!base) return null;
    return { ...base, ...localData[selectedCapId ?? ""] };
  })();

  const selectedDomain = org?.domains.find((d) =>
    d.capabilities.some((c) => c.id === selectedCapId)
  );

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;

  if (!org || org.domains.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-4">
        <div className="text-4xl">⚙️</div>
        <h2 className="font-semibold text-[var(--foreground)]">No domains configured</h2>
        <p className="text-sm text-[var(--muted)] max-w-sm">
          Configure business domains and capabilities before starting the assessment
        </p>
        <Link
          href={`/clients/${id}/configure`}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors"
        >
          Go to Configure
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 3.5rem)" }}>
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-[var(--card-border)] flex flex-col overflow-hidden shrink-0">
        <div className="p-3 border-b border-[var(--card-border)]">
          <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Capabilities</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {org.domains.map((domain) => (
            <div key={domain.id}>
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--muted-bg)] sticky top-0 z-10">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">{domain.name}</span>
              </div>
              {domain.capabilities.map((cap) => {
                const gap = calculateGap(cap.asIsScore, cap.toBeScore);
                const severity = getGapSeverity(gap);
                const isSelected = cap.id === selectedCapId;
                return (
                  <button
                    key={cap.id}
                    onClick={() => setSelectedCapId(cap.id)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                      isSelected
                        ? "bg-[var(--accent)]/10 border-r-2 border-[var(--accent)]"
                        : "hover:bg-[var(--muted-bg)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs truncate ${isSelected ? "font-semibold text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
                        {cap.name}
                      </div>
                    </div>
                    {cap.asIsScore != null && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-[var(--muted)]">{cap.asIsScore}</span>
                        {gap != null && gap > 0 && (
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              background: severity === "critical" || severity === "high" ? "#f87171" :
                                severity === "medium" ? "#fbbf24" : "#86efac",
                            }}
                          />
                        )}
                      </div>
                    )}
                    {cap.asIsScore == null && (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--card-border)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {/* Main form */}
      <main className="flex-1 overflow-y-auto">
        {!selectedCap ? (
          <div className="flex items-center justify-center h-full text-[var(--muted)]">
            Select a capability to begin
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {selectedDomain && (
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: selectedDomain.color ?? "#94a3b8" }}
                    >
                      {selectedDomain.name}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-[var(--foreground)]">{selectedCap.name}</h2>
                {selectedCap.description && (
                  <p className="text-sm text-[var(--muted)] mt-0.5">{selectedCap.description}</p>
                )}
              </div>
              <div className="text-xs text-[var(--muted)] shrink-0 mt-1">
                {saveStatus[selectedCapId ?? ""] === "saving" && "Saving..."}
                {saveStatus[selectedCapId ?? ""] === "saved" && "✓ Saved"}
                {saveStatus[selectedCapId ?? ""] === "unsaved" && "Unsaved changes"}
              </div>
            </div>

            {/* Score panel */}
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Scoring</h3>
              <div className="grid grid-cols-3 gap-6">
                <ScoreSlider
                  label="As-Is Score (current)"
                  value={selectedCap.asIsScore}
                  onChange={(v) => updateLocal(selectedCapId!, "asIsScore", v)}
                  color={selectedDomain?.color ?? undefined}
                />
                <ScoreSlider
                  label="To-Be Score (target)"
                  value={selectedCap.toBeScore}
                  onChange={(v) => updateLocal(selectedCapId!, "toBeScore", v)}
                  color="#16a34a"
                />
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Importance (1–10)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={selectedCap.importanceScore ?? 5}
                    onChange={(e) => updateLocal(selectedCapId!, "importanceScore", parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-center font-bold"
                  />
                  {selectedCap.asIsScore != null && selectedCap.toBeScore != null && (
                    <div className="mt-2 text-center">
                      <span className="text-xs text-[var(--muted)]">Gap: </span>
                      <span className={`text-sm font-bold ${
                        (calculateGap(selectedCap.asIsScore, selectedCap.toBeScore) ?? 0) > 3
                          ? "text-[var(--destructive)]"
                          : (calculateGap(selectedCap.asIsScore, selectedCap.toBeScore) ?? 0) > 1
                          ? "text-amber-600"
                          : "text-[var(--success)]"
                      }`}>
                        {calculateGap(selectedCap.asIsScore, selectedCap.toBeScore)?.toFixed(1) ?? "—"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* As-Is State */}
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Current State (As-Is)</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">State description</label>
                  <textarea
                    value={selectedCap.asIsState ?? ""}
                    onChange={(e) => updateLocal(selectedCapId!, "asIsState", e.target.value)}
                    placeholder="Describe the current state of this capability..."
                    rows={3}
                    className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">Notes & observations</label>
                  <textarea
                    value={selectedCap.asIsNotes ?? ""}
                    onChange={(e) => updateLocal(selectedCapId!, "asIsNotes", e.target.value)}
                    placeholder="Additional notes from the interview..."
                    rows={2}
                    className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                  />
                </div>
              </div>
            </div>

            {/* To-Be State */}
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Target State (To-Be)</h3>
              <textarea
                value={selectedCap.toBeState ?? ""}
                onChange={(e) => updateLocal(selectedCapId!, "toBeState", e.target.value)}
                placeholder="Describe the desired future state..."
                rows={3}
                className="w-full px-3 py-2 border border-[var(--card-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
              />
            </div>

            {/* Opportunities & Weaknesses */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[var(--success)] mb-3">Opportunities</h3>
                <TagInput
                  value={selectedCap.opportunities ?? []}
                  onChange={(v) => updateLocal(selectedCapId!, "opportunities", v)}
                  placeholder="Add opportunity..."
                />
              </div>
              <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[var(--destructive)] mb-3">Weaknesses / Gaps</h3>
                <TagInput
                  value={selectedCap.weaknesses ?? []}
                  onChange={(v) => updateLocal(selectedCapId!, "weaknesses", v)}
                  placeholder="Add weakness..."
                />
              </div>
            </div>

            {/* Aliases / alternative names */}
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                Aliases <span className="font-normal text-[var(--muted)]">— what this organisation calls this capability</span>
              </h3>
              <TagInput
                value={selectedCap.aliases ?? []}
                onChange={(v) => updateLocal(selectedCapId!, "aliases", v)}
                placeholder="Add alias..."
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between pt-2 pb-8">
              {(() => {
                const allCaps = org.domains.flatMap((d) => d.capabilities);
                const idx = allCaps.findIndex((c) => c.id === selectedCapId);
                const prev = idx > 0 ? allCaps[idx - 1] : null;
                const next = idx < allCaps.length - 1 ? allCaps[idx + 1] : null;
                return (
                  <>
                    {prev ? (
                      <button
                        onClick={() => setSelectedCapId(prev.id)}
                        className="px-4 py-2 border border-[var(--card-border)] rounded-lg text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                      >
                        ← {prev.name}
                      </button>
                    ) : <div />}
                    {next ? (
                      <button
                        onClick={() => setSelectedCapId(next.id)}
                        className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors"
                      >
                        {next.name} →
                      </button>
                    ) : (
                      <Link
                        href={`/clients/${id}/analysis`}
                        className="px-4 py-2 bg-[var(--success)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        View Analysis →
                      </Link>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

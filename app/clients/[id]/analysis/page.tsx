"use client";

import { useState, useEffect, use } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  buildRadarData,
  calculateDomainScore,
  getGapSeverity,
  getOverallMaturity,
  type DomainScore,
} from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  asIsScore: number | null;
  toBeScore: number | null;
  importanceScore: number | null;
  gapScore: number | null;
};

type Domain = {
  id: string;
  name: string;
  color: string | null;
  capabilities: Capability[];
};

type Org = { id: string; name: string; domains: Domain[] };

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then(setOrg)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;
  if (!org) return null;

  const domainScores: DomainScore[] = org.domains.map((d) => {
    const caps = d.capabilities.map((c) => ({
      id: c.id,
      name: c.name,
      asIsScore: c.asIsScore,
      toBeScore: c.toBeScore,
      importanceScore: c.importanceScore,
      gapScore: c.gapScore,
    }));
    const { averageAsIs, averageToBe, averageGap } = calculateDomainScore(caps);
    return { id: d.id, name: d.name, color: d.color, averageAsIs, averageToBe, averageGap, capabilities: caps };
  });

  const radarData = buildRadarData(domainScores);
  const overallMaturity = getOverallMaturity(domainScores);

  const allCaps = org.domains.flatMap((d) =>
    d.capabilities.map((c) => ({
      ...c,
      domainName: d.name,
      domainColor: d.color,
    }))
  );

  const sortedByGap = [...allCaps]
    .filter((c) => c.gapScore != null)
    .sort((a, b) => (b.gapScore ?? 0) - (a.gapScore ?? 0));

  const hasData = domainScores.some((d) => d.averageAsIs > 0);

  return (
    <div className="max-w-6xl mx-auto w-full px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Gap Analysis</h1>
        <p className="text-sm text-[var(--muted)]">Capability maturity and growth opportunity overview</p>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-[var(--card-border)] p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="font-semibold text-[var(--foreground)] mb-1">No assessment data yet</h3>
          <p className="text-sm text-[var(--muted)]">
            Complete some capability assessments to see your gap analysis
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--primary)]">{overallMaturity}/10</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Overall Maturity</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--destructive)]">
                {sortedByGap[0]?.gapScore?.toFixed(1) ?? "—"}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Largest Gap</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-amber-600">
                {allCaps.filter((c) => (c.gapScore ?? 0) > 3).length}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Critical Gaps (&gt;3)</div>
            </div>
            <div className="bg-white rounded-xl border border-[var(--card-border)] p-4">
              <div className="text-2xl font-bold text-[var(--success)]">
                {allCaps.filter((c) => c.asIsScore != null).length}/{allCaps.length}
              </div>
              <div className="text-xs text-[var(--muted)] mt-0.5">Capabilities Assessed</div>
            </div>
          </div>

          {/* Radar Chart */}
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Domain Radar — As-Is vs To-Be</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="domain"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 10]}
                    tick={{ fontSize: 9, fill: "#94a3b8" }}
                    tickCount={6}
                  />
                  <Radar
                    name="To-Be"
                    dataKey="To-Be"
                    stroke="#16a34a"
                    fill="#16a34a"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                  <Radar
                    name="As-Is"
                    dataKey="As-Is"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      typeof value === "number" ? value.toFixed(1) : value,
                      name,
                    ]}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Domain score bars */}
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Domain Scores</h2>
            <div className="space-y-4">
              {domainScores.map((d) => (
                <div key={d.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color ?? "#94a3b8" }} />
                      <span className="text-sm font-medium text-[var(--foreground)]">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-[var(--muted)]">As-Is: <strong className="text-[var(--foreground)]">{d.averageAsIs}</strong></span>
                      <span className="text-[var(--muted)]">To-Be: <strong className="text-[var(--foreground)]">{d.averageToBe}</strong></span>
                      <span className={`font-semibold ${d.averageGap > 3 ? "text-[var(--destructive)]" : d.averageGap > 1 ? "text-amber-600" : "text-[var(--success)]"}`}>
                        Gap: {d.averageGap.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-3 bg-[var(--muted-bg)] rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full opacity-30"
                      style={{ width: `${(d.averageToBe / 10) * 100}%`, background: d.color ?? "#94a3b8" }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${(d.averageAsIs / 10) * 100}%`, background: d.color ?? "#94a3b8" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Capability heatmap */}
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 mb-6 shadow-sm overflow-x-auto">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Capability Heatmap</h2>
            <div className="min-w-[600px]">
              {org.domains.map((domain) => (
                <div key={domain.id} className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: domain.color ?? "#94a3b8" }} />
                    <span className="text-xs font-semibold text-[var(--muted)]">{domain.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {domain.capabilities.map((cap) => {
                      const severity = getGapSeverity(cap.gapScore);
                      const assessed = cap.asIsScore != null;
                      return (
                        <div
                          key={cap.id}
                          className={`px-3 py-2 rounded-lg text-xs border transition-all ${assessed ? "border-transparent" : "border-[var(--card-border)] border-dashed"}`}
                          style={{
                            background: assessed
                              ? (severity === "critical" ? "#fca5a5" : severity === "high" ? "#fca5a5" : severity === "medium" ? "#fef08a" : severity === "low" ? "#bbf7d0" : "#f1f5f9")
                              : "#f8fafc",
                          }}
                          title={`As-Is: ${cap.asIsScore ?? "—"} | To-Be: ${cap.toBeScore ?? "—"} | Gap: ${cap.gapScore?.toFixed(1) ?? "—"}`}
                        >
                          <div className={`font-medium mb-0.5 ${assessed ? "text-gray-800" : "text-[var(--muted)]"}`}>
                            {cap.name}
                          </div>
                          <div className="text-gray-600">
                            {assessed ? `${cap.asIsScore} → ${cap.toBeScore ?? "?"}` : "Not assessed"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--card-border)]">
              <span className="text-xs text-[var(--muted)]">Gap legend:</span>
              {[
                { label: "Low (≤1)", color: "#bbf7d0" },
                { label: "Medium (≤2)", color: "#fef08a" },
                { label: "High (≤3)", color: "#fca5a5" },
                { label: "Critical (>3)", color: "#f87171" },
                { label: "Not assessed", color: "#f8fafc", border: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ background: item.color, border: item.border ? "1px dashed #cbd5e1" : "none" }}
                  />
                  <span className="text-xs text-[var(--muted)]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gap table */}
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Priority Gaps</h2>
            {sortedByGap.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-4">No gaps calculated yet</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--card-border)]">
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Capability</th>
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Domain</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">As-Is</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">To-Be</th>
                    <th className="text-center text-xs text-[var(--muted)] font-medium pb-2">Gap</th>
                    <th className="text-left text-xs text-[var(--muted)] font-medium pb-2">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedByGap.map((cap) => {
                    const severity = getGapSeverity(cap.gapScore);
                    return (
                      <tr key={cap.id} className="border-b border-[var(--card-border)] last:border-0">
                        <td className="py-2.5 font-medium text-[var(--foreground)]">{cap.name}</td>
                        <td className="py-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cap.domainColor ?? "#94a3b8" }} />
                            <span className="text-[var(--muted)]">{cap.domainName}</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-center font-mono">{cap.asIsScore ?? "—"}</td>
                        <td className="py-2.5 text-center font-mono">{cap.toBeScore ?? "—"}</td>
                        <td className="py-2.5 text-center">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-bold"
                            style={{
                              background: severity === "critical" || severity === "high" ? "#fee2e2" : severity === "medium" ? "#fef9c3" : "#dcfce7",
                              color: severity === "critical" || severity === "high" ? "#991b1b" : severity === "medium" ? "#854d0e" : "#14532d",
                            }}
                          >
                            {cap.gapScore?.toFixed(1) ?? "—"}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium ${
                            severity === "critical" ? "text-[var(--destructive)]" :
                            severity === "high" ? "text-red-500" :
                            severity === "medium" ? "text-amber-600" :
                            "text-[var(--success)]"
                          }`}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

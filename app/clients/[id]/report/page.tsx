"use client";

import { useState, useEffect, use } from "react";
import {
  calculateDomainScore,
  getGapSeverity,
  getOverallMaturity,
  type DomainScore,
  type MaturitySnapshot,
} from "@/lib/scoring/engine";

type Capability = {
  id: string;
  name: string;
  importanceScore: number | null;
  tags: string[];
  currentAsIs: MaturitySnapshot[];
  currentToBe: MaturitySnapshot[];
};

type Domain = { id: string; name: string; color: string | null; capabilities: Capability[] };

type KPI = { id: string; name: string; currentValue: string | null; targetValue: string | null };
type Achievement = { id: string; description: string; priority: number | null; targetDate: string | null; status: string };

type Org = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
  engagementMotive: string | null;
  domains: Domain[];
  kpis: KPI[];
  achievements: Achievement[];
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${id}`).then((r) => r.json()).then(setOrg).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-[var(--muted)]">Loading...</div>;
  if (!org) return null;

  const domainScores: DomainScore[] = org.domains.map((d) => {
    const result = calculateDomainScore(
      d.capabilities.map((c) => ({ id: c.id, name: c.name, importanceScore: c.importanceScore, asIs: c.currentAsIs, toBe: c.currentToBe }))
    );
    return { id: d.id, name: d.name, color: d.color, ...result };
  });

  const overallMaturity = getOverallMaturity(domainScores);
  const allCaps = domainScores.flatMap((d) => d.capabilities.map((c) => ({ ...c, domainName: d.name })));
  const topGaps = [...allCaps].filter((c) => c.gapScore != null && c.gapScore > 0).sort((a, b) => (b.gapScore ?? 0) - (a.gapScore ?? 0)).slice(0, 5);

  const allTags = org.domains.flatMap((d) => d.capabilities.flatMap((c) => c.tags ?? [])).filter(Boolean);
  const tagCounts = new Map<string, number>();
  for (const tag of allTags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const topTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">Executive Report</h1>
          <p className="text-sm text-[var(--muted)]">Generated {today}</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[#1a3352] transition-colors">
          Print / Export PDF
        </button>
      </div>

      <div className="space-y-6 print:space-y-4" id="report">
        <div className="bg-[var(--primary)] text-white rounded-xl p-8 print:rounded-none">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-2">Capability Assessment Report</div>
          <h2 className="text-3xl font-bold mb-1">{org.name}</h2>
          {org.industry && <div className="text-white/70 text-sm">{org.industry}</div>}
          {org.engagementMotive && <div className="text-white/70 text-sm">Engagement motive: {org.engagementMotive}</div>}
          <div className="mt-6 flex items-center gap-6">
            <div>
              <div className="text-3xl font-bold">{overallMaturity}/5</div>
              <div className="text-sm text-white/70">Overall Maturity</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{org.domains.length}</div>
              <div className="text-sm text-white/70">Business Domains</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{allCaps.filter((c) => c.asIsScore != null).length}</div>
              <div className="text-sm text-white/70">Capabilities Assessed</div>
            </div>
          </div>
          <div className="text-xs text-white/40 mt-6">{today} · Prepared by Flow State Partners</div>
        </div>

        <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
          <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Executive Summary</h3>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {domainScores.map((d) => (
              <div key={d.id} className="p-3 bg-[var(--muted-bg)] rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color ?? "#94a3b8" }} />
                  <span className="text-xs font-semibold text-[var(--foreground)] truncate">{d.name}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-xl font-bold text-[var(--foreground)]">{d.averageAsIs}</span>
                    <span className="text-xs text-[var(--muted)]">/5</span>
                  </div>
                  <span className={`text-xs font-medium ${d.averageGap > 3 ? "text-[var(--destructive)]" : d.averageGap > 1 ? "text-amber-600" : "text-[var(--success)]"}`}>
                    Gap: {d.averageGap.toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {org.notes && <p className="text-sm text-[var(--muted)] italic border-l-4 border-[var(--accent)] pl-4">{org.notes}</p>}
        </div>

        {topGaps.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Top Priority Gaps</h3>
            <div className="space-y-3">
              {topGaps.map((cap, i) => {
                const severity = getGapSeverity(cap.gapScore);
                return (
                  <div key={cap.id} className="flex items-start gap-4 p-4 rounded-lg bg-[var(--muted-bg)]">
                    <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-[var(--foreground)]">{cap.name}</div>
                      <div className="text-xs text-[var(--muted)] mb-1">{cap.domainName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-[var(--foreground)]">
                        {cap.asIsScore} <span className="text-xs text-[var(--muted)] font-normal">→</span> {cap.toBeScore}
                      </div>
                      <div className={`text-xs font-semibold ${severity === "critical" ? "text-[var(--destructive)]" : severity === "high" ? "text-red-500" : severity === "medium" ? "text-amber-600" : "text-[var(--success)]"}`}>
                        Gap: {cap.gapScore?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {topTags.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Recurring Themes</h3>
            <div className="flex flex-wrap gap-2">
              {topTags.map(([tag, count]) => (
                <span key={tag} className="text-sm px-3 py-1 bg-[var(--muted-bg)] text-[var(--foreground)] rounded-full">
                  {tag} <span className="text-[var(--muted)]">({count})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {org.domains.map((domain, di) => {
          const caps = domainScores[di].capabilities.filter((c) => c.asIsScore != null);
          if (caps.length === 0) return null;
          return (
            <div key={domain.id} className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--card-border)]">
                <div className="w-3 h-3 rounded-full" style={{ background: domain.color ?? "#94a3b8" }} />
                <h3 className="font-bold text-[var(--foreground)] text-lg">{domain.name}</h3>
              </div>
              <div className="space-y-3">
                {caps.map((cap) => (
                  <div key={cap.id} className="border border-[var(--card-border)] rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-[var(--foreground)]">{cap.name}</div>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <div className="text-lg font-bold text-[var(--foreground)]">{cap.asIsScore} → {cap.toBeScore ?? "?"}</div>
                        {cap.gapScore != null && (
                          <div className="text-xs text-[var(--muted)]">Gap: <strong>{cap.gapScore.toFixed(1)}</strong></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {org.achievements.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Target Achievements</h3>
            <div className="space-y-2">
              {org.achievements.map((ach) => (
                <div key={ach.id} className="flex items-center gap-4 p-3 bg-[var(--muted-bg)] rounded-lg">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${ach.status === "achieved" ? "bg-[var(--success)]" : "bg-[var(--muted)]"}`} />
                  <div className="flex-1 text-sm text-[var(--foreground)]">{ach.description}</div>
                  {ach.targetDate && <div className="text-xs text-[var(--muted)] shrink-0">{new Date(ach.targetDate).toLocaleDateString()}</div>}
                  <div className="text-xs font-medium text-[var(--muted)] shrink-0">Priority: {ach.priority}/10</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {org.kpis.length > 0 && (
          <div className="bg-white rounded-xl border border-[var(--card-border)] p-6 shadow-sm">
            <h3 className="font-bold text-[var(--foreground)] text-lg mb-4 pb-3 border-b border-[var(--card-border)]">Key Performance Indicators</h3>
            <div className="grid grid-cols-2 gap-3">
              {org.kpis.map((kpi) => (
                <div key={kpi.id} className="p-3 border border-[var(--card-border)] rounded-lg">
                  <div className="font-medium text-sm text-[var(--foreground)]">{kpi.name}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--muted)]">
                    {kpi.currentValue && <span>Current: <strong>{kpi.currentValue}</strong></span>}
                    {kpi.targetValue && <span>Target: <strong>{kpi.targetValue}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-xs text-[var(--muted)] py-4">Prepared by Flow State Partners · {today}</div>
      </div>
    </div>
  );
}

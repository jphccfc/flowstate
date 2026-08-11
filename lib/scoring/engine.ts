export type MaturitySnapshot = {
  locationTag: string | null;
  score: number;
};

export type CapabilityMaturity = {
  id: string;
  name: string;
  importanceScore: number | null;
  asIs: MaturitySnapshot[];
  toBe: MaturitySnapshot[];
};

export type CapabilityScore = {
  id: string;
  name: string;
  asIsScore: number | null;
  toBeScore: number | null;
  importanceScore: number | null;
  gapScore: number | null;
};

export type DomainScore = {
  id: string;
  name: string;
  color: string | null;
  averageAsIs: number;
  averageToBe: number;
  averageGap: number;
  capabilities: CapabilityScore[];
};

export function averageScore(snapshots: MaturitySnapshot[]): number | null {
  if (snapshots.length === 0) return null;
  const sum = snapshots.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / snapshots.length) * 10) / 10;
}

export function calculateGap(asIs: MaturitySnapshot[], toBe: MaturitySnapshot[]): number | null {
  if (asIs.length === 0 || toBe.length === 0) return null;

  const toBeByLocation = new Map(toBe.map((t) => [t.locationTag, t.score]));
  const orgWideToBe = toBeByLocation.get(null);

  // Match each as-is location's target: same location first, else org-wide fallback.
  const matchedToBeScores: number[] = [];
  for (const a of asIs) {
    const matched = toBeByLocation.has(a.locationTag) ? toBeByLocation.get(a.locationTag)! : orgWideToBe;
    if (matched != null) matchedToBeScores.push(matched);
  }

  const asIsAvg = averageScore(asIs);
  const toBeAvg =
    matchedToBeScores.length > 0
      ? matchedToBeScores.reduce((a, b) => a + b, 0) / matchedToBeScores.length
      : averageScore(toBe);

  if (asIsAvg == null || toBeAvg == null) return null;
  return Math.max(0, Math.round((toBeAvg - asIsAvg) * 10) / 10);
}

export function calculateDomainScore(capabilities: CapabilityMaturity[]): {
  averageAsIs: number;
  averageToBe: number;
  averageGap: number;
  capabilities: CapabilityScore[];
} {
  const scores: CapabilityScore[] = capabilities.map((c) => ({
    id: c.id,
    name: c.name,
    importanceScore: c.importanceScore,
    asIsScore: averageScore(c.asIs),
    toBeScore: averageScore(c.toBe),
    gapScore: calculateGap(c.asIs, c.toBe),
  }));

  const scored = scores.filter((c) => c.asIsScore != null && c.toBeScore != null);
  if (scored.length === 0) {
    return { averageAsIs: 0, averageToBe: 0, averageGap: 0, capabilities: scores };
  }

  const totalImportance = scored.reduce((sum, c) => sum + (c.importanceScore ?? 5), 0);
  const weightedAsIs = scored.reduce((sum, c) => sum + (c.asIsScore ?? 0) * (c.importanceScore ?? 5), 0);
  const weightedToBe = scored.reduce((sum, c) => sum + (c.toBeScore ?? 0) * (c.importanceScore ?? 5), 0);

  const averageAsIs = totalImportance > 0 ? weightedAsIs / totalImportance : 0;
  const averageToBe = totalImportance > 0 ? weightedToBe / totalImportance : 0;
  const averageGap = Math.max(0, averageToBe - averageAsIs);

  return {
    averageAsIs: Math.round(averageAsIs * 10) / 10,
    averageToBe: Math.round(averageToBe * 10) / 10,
    averageGap: Math.round(averageGap * 10) / 10,
    capabilities: scores,
  };
}

export function buildRadarData(domains: DomainScore[]) {
  return domains.map((d) => ({
    domain: d.name,
    "As-Is": d.averageAsIs,
    "To-Be": d.averageToBe,
    gap: d.averageGap,
  }));
}

export function getGapSeverity(gap: number | null): "none" | "low" | "medium" | "high" | "critical" {
  if (gap == null) return "none";
  if (gap <= 1) return "low";
  if (gap <= 2) return "medium";
  if (gap <= 3) return "high";
  return "critical";
}

export function getGapColor(severity: ReturnType<typeof getGapSeverity>): string {
  const colors = {
    none: "#e5e7eb",
    low: "#bbf7d0",
    medium: "#fef08a",
    high: "#fca5a5",
    critical: "#f87171",
  };
  return colors[severity];
}

export function getOverallMaturity(domains: DomainScore[]): number {
  const scored = domains.filter((d) => d.averageAsIs > 0);
  if (scored.length === 0) return 0;
  const avg = scored.reduce((sum, d) => sum + d.averageAsIs, 0) / scored.length;
  return Math.round(avg * 10) / 10;
}
